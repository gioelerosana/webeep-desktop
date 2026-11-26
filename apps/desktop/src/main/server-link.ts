/*
 * Collegamento al server privato (`apps/server`), lato desktop. Contratto: docs/SERVER.md, sezioni 4.1 e 4.4.
 *
 * Il main è l'unico che parla con il server. Il collegamento passa dal browser: il server
 * autentica l'utente con Authentik e rimanda un codice a un listener loopback di questo
 * processo (RFC 8252, con PKCE). Il codice si scambia con `POST /pair` insieme al
 * `code_verifier`, e la risposta contiene il deviceToken che identifica questo computer.
 *
 * Il renderer manda solo l'indirizzo del server e riceve solo lo stato. URL e deviceToken
 * si salvano cifrati con `safeStorage`, come la sessione. Senza cifratura restano in memoria
 * per questa esecuzione: mai in chiaro su disco. Token WeBeep, codici e deviceToken non
 * finiscono in log, errori o messaggi IPC.
 */
import { WEBEEP_SITE_URL } from '@webeep/moodle-api';
import { app, safeStorage, shell, type BrowserWindow } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  SERVER_LINK_CANCELLED_MESSAGE,
  type IpcErrorKind,
  type ServerLinkRequest,
  type ServerLinkState,
  type ServerUnlinkRequest,
} from '../shared/ipc.js';
import { getActiveSessionSecrets } from './auth.js';
import { isMissingFile } from './fs-errors.js';

const LINK_FILE = 'server-link.bin';
const FILE_MODE_OWNER_ONLY = 0o600;
const PAIR_PATH = '/pair';
const PAIR_START_PATH = '/pair/start';
const CALLBACK_PATH = '/callback';
const LOOPBACK_HOST = '127.0.0.1';
const LOOPBACK_ORIGIN = `http://${LOOPBACK_HOST}`;
const PKCE_METHOD = 'S256';
/** 32 byte in base64url fanno 43 caratteri: lunghezza che lo `state` e il `code_verifier` accettano. */
const RANDOM_TOKEN_BYTES = 32;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1_000;
/** Tempo massimo per completare l'accesso nel browser: allo scadere il collegamento fallisce. */
const LINK_TIMEOUT_MS = 5 * SECONDS_PER_MINUTE * MS_PER_SECOND;
/** Il server risponde entro pochi secondi; oltre, lo si considera non raggiungibile. */
const SERVER_REQUEST_TIMEOUT_MS = 15 * MS_PER_SECOND;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_UNAVAILABLE = 503;
const HTTPS_PROTOCOL = 'https:';
const HTTP_PROTOCOL = 'http:';
/** `http://` è ammesso solo verso il proprio computer: il deviceToken non deve viaggiare in chiaro in rete. */
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

const SERVER_UNREACHABLE_MESSAGE = 'server non raggiungibile';
const UNEXPECTED_MESSAGE = 'errore imprevisto';
const UNEXPECTED_RESPONSE_MESSAGE = 'risposta del server non valida';
const INVALID_REQUEST_MESSAGE = 'richiesta non valida';
const INVALID_URL_MESSAGE = 'indirizzo del server non valido';
const URL_NOT_ORIGIN_MESSAGE = "l'indirizzo deve essere solo quello del server, senza percorso, query o frammento";
const URL_PROTOCOL_MESSAGE = 'il server deve usare https (http solo per localhost o 127.0.0.1)';
const NOT_SIGNED_IN_MESSAGE = 'accedi a WeBeep prima di collegare il server';
const BROWSER_OPEN_FAILED_MESSAGE = 'impossibile aprire il browser';
const LISTEN_FAILED_MESSAGE = 'impossibile avviare il collegamento: riprova';
const LINK_INVALID_MESSAGE = 'collegamento non valido o scaduto: riprova';
const LINK_EXPIRED_MESSAGE = 'collegamento scaduto: riprova';
const SESSION_REJECTED_MESSAGE = "sessione WeBeep rifiutata: accedi di nuovo dall'app";
const TOO_MANY_ATTEMPTS_MESSAGE = 'troppi tentativi: riprova tra 15 minuti';

const PAGE_DONE_TEXT = 'collegamento completato, puoi chiudere questa scheda';
const PAGE_FAILED_TEXT = "collegamento non riuscito: torna all'app e riprova";

/*
 * Pagine del callback. Il testo è una costante di questo file, quindi nessun dato esterno
 * entra nell'HTML.
 */
const pageHtml = (text: string): string => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WeBeep Desktop</title>
<style>
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; background: #fafafa; color: #18181b; }
p { margin: 0; padding: 0 16px; font-size: 16px; text-align: center; }
@media (prefers-color-scheme: dark) { body { background: #18181b; color: #fafafa; } }
</style>
</head>
<body><p>${text}.</p></body>
</html>`;
const PAGE_DONE = pageHtml(PAGE_DONE_TEXT);
const PAGE_FAILED = pageHtml(PAGE_FAILED_TEXT);
const HTML_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' } as const;

const storedLinkSchema = z.object({
  serverUrl: z.string(),
  /** `null` se il server ha revocato il dispositivo o il collegamento è stato sciolto solo qui: si ricollega. */
  deviceToken: z.string().nullable(),
});
type StoredServerLink = z.infer<typeof storedLinkSchema>;

/* Risposte del server: validate al confine, come le risposte Moodle. */
const pairSuccessSchema = z.object({ fullName: z.string(), deviceToken: z.string().min(1) });
const pairStatusSchema = z.object({ paired: z.boolean(), fullName: z.string().optional() });

const UNLINKED: ServerLinkState = { serverUrl: null, paired: false };

/** Errore con un tipo di `IpcFailure` già scelto: il messaggio è sempre una frase fissa, senza URL né token. */
export class ServerLinkError extends Error {
  override readonly name = 'ServerLinkError';
  readonly kind: IpcErrorKind;

  constructor(kind: IpcErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

type FailureDescription = { readonly kind: IpcErrorKind; readonly message: string };

/*
 * Stati di `POST /pair` (docs/SERVER.md, 4.3). Il 401 di `GET` e `DELETE` è gestito a parte,
 * perché lì significa "dispositivo non riconosciuto" e non un codice scaduto.
 */
const PAIR_FAILURES: Readonly<Partial<Record<number, FailureDescription>>> = {
  [HTTP_BAD_REQUEST]: { kind: 'invalid-input', message: INVALID_REQUEST_MESSAGE },
  [HTTP_UNAUTHORIZED]: { kind: 'auth', message: LINK_EXPIRED_MESSAGE },
  [HTTP_UNPROCESSABLE]: { kind: 'auth', message: SESSION_REJECTED_MESSAGE },
  [HTTP_TOO_MANY_REQUESTS]: { kind: 'invalid-input', message: TOO_MANY_ATTEMPTS_MESSAGE },
  [HTTP_UNAVAILABLE]: { kind: 'network', message: SERVER_UNREACHABLE_MESSAGE },
};
const UNKNOWN_FAILURE: FailureDescription = { kind: 'unknown', message: UNEXPECTED_MESSAGE };

const invalidInput = (message: string): ServerLinkError => new ServerLinkError('invalid-input', message);

/** Accetta solo l'origine del server: `https://host[:porta]`, oppure `http://` verso localhost. */
export const parseServerUrl = (raw: unknown): string => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw invalidInput(INVALID_URL_MESSAGE);
  }
  if (url.username !== '' || url.password !== '') throw invalidInput(INVALID_URL_MESSAGE);
  const isHttps = url.protocol === HTTPS_PROTOCOL;
  const isLocalHttp = url.protocol === HTTP_PROTOCOL && LOCAL_HOSTS.includes(url.hostname);
  if (!isHttps && !isLocalHttp) throw invalidInput(URL_PROTOCOL_MESSAGE);
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') throw invalidInput(URL_NOT_ORIGIN_MESSAGE);
  return url.origin;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/* Gli argomenti arrivano dal renderer come `unknown`: si ricontrollano qui prima di usarli. */

export const parseServerLinkRequest = (raw: unknown): ServerLinkRequest => {
  if (!isRecord(raw)) throw invalidInput(INVALID_REQUEST_MESSAGE);
  return { serverUrl: parseServerUrl(raw.serverUrl) };
};

/** Senza argomento (o con `{}`) la revoca è completa; `localOnly` deve essere un booleano vero o assente. */
export const parseServerUnlinkRequest = (raw: unknown): ServerUnlinkRequest => {
  if (raw === undefined) return {};
  if (!isRecord(raw) || (raw.localOnly !== undefined && typeof raw.localOnly !== 'boolean')) {
    throw invalidInput(INVALID_REQUEST_MESSAGE);
  }
  return { localOnly: raw.localOnly === true };
};

/* Persistenza: un solo file cifrato, letto una volta e poi tenuto in memoria. */

const linkPath = (): string => join(app.getPath('userData'), LINK_FILE);

const canPersist = (): boolean => safeStorage.isEncryptionAvailable();

let cached: StoredServerLink | undefined;
let loaded = false;

/** Valida il contenuto decifrato. `undefined` se non è il formato attuale (per esempio quello con la chiave di accoppiamento). */
const parseStored = (plain: string): StoredServerLink | undefined => {
  let json: unknown;
  try {
    json = JSON.parse(plain);
  } catch {
    // Non è JSON: non è un formato valido, lo si tratta come assente. Il contenuto non va mostrato.
    return undefined;
  }
  const parsed = storedLinkSchema.safeParse(json);
  return parsed.success ? parsed.data : undefined;
};

const clearStored = async (): Promise<void> => {
  cached = undefined;
  loaded = true;
  await rm(linkPath(), { force: true });
};

const readStoredFile = async (): Promise<StoredServerLink | undefined> => {
  let encrypted: Buffer;
  try {
    encrypted = await readFile(linkPath());
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
  let plain: string;
  try {
    plain = safeStorage.decryptString(encrypted);
  } catch {
    // Chiave del sistema cambiata o file corrotto: non blocca l'app, si ricollega.
    console.warn('[server] configurazione del server non leggibile: va collegato di nuovo');
    return undefined;
  }
  const stored = parseStored(plain);
  if (stored) return stored;
  // Formato precedente (con la chiave di accoppiamento) o file non valido: si scarta, va ricollegato.
  console.warn('[server] configurazione del server in un formato non più supportato: va collegato di nuovo');
  await clearStored();
  return undefined;
};

const loadStored = async (): Promise<StoredServerLink | undefined> => {
  if (loaded) return cached;
  cached = canPersist() ? await readStoredFile() : undefined;
  loaded = true;
  return cached;
};

const saveStored = async (link: StoredServerLink): Promise<void> => {
  cached = link;
  loaded = true;
  if (!canPersist()) return;
  await writeFile(linkPath(), safeStorage.encryptString(JSON.stringify(link)), { mode: FILE_MODE_OWNER_ONLY });
};

/* Chiamate HTTP verso `<server>/pair`. */

type PairCall = {
  readonly method: 'GET' | 'POST' | 'DELETE';
  /** Bearer per `GET` e `DELETE`; `POST` non lo usa, il codice va nel corpo. */
  readonly deviceToken?: string;
  readonly body?: unknown;
};

const callPair = async (serverUrl: string, call: PairCall): Promise<Response> => {
  const headers: Record<string, string> = {};
  if (call.deviceToken !== undefined) headers.Authorization = `Bearer ${call.deviceToken}`;
  if (call.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(`${serverUrl}${PAIR_PATH}`, {
      method: call.method,
      headers,
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      // Nessun redirect: il deviceToken e il token WeBeep non devono seguire il server verso un altro indirizzo.
      redirect: 'error',
      signal: AbortSignal.timeout(SERVER_REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Errore di rete o timeout: il messaggio di fetch può contenere l'URL, quindi non lo si inoltra.
    throw new ServerLinkError('network', SERVER_UNREACHABLE_MESSAGE);
  }
};

const expectStatus = (response: Response, expected: number): void => {
  if (response.status === expected) return;
  const failure = PAIR_FAILURES[response.status] ?? UNKNOWN_FAILURE;
  throw new ServerLinkError(failure.kind, failure.message);
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new ServerLinkError('unknown', UNEXPECTED_RESPONSE_MESSAGE);
  }
};

const parseBody = <TData>(schema: z.ZodType<TData>, raw: unknown): TData => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ServerLinkError('unknown', UNEXPECTED_RESPONSE_MESSAGE);
  return parsed.data;
};

/* Sessione WeBeep attiva: serve a `server:link` per inviare token e private token. */

const readSession = (): { readonly token: string; readonly privateToken: string | undefined } => {
  try {
    return getActiveSessionSecrets();
  } catch {
    // Solo il messaggio fisso: il dettaglio dell'errore di sessione non serve all'interfaccia.
    throw new ServerLinkError('auth', NOT_SIGNED_IN_MESSAGE);
  }
};

/* Listener loopback del flusso: riceve il callback del browser una sola volta, poi si chiude. */

type Loopback = {
  /** Risolve con la porta quando il listener è pronto. */
  readonly listening: Promise<number>;
  /** Risolve con il codice del callback, dopo aver risposto con la pagina di esito. */
  readonly code: Promise<string>;
  /** Chiude il listener e rifiuta `code` con `ServerLinkError`. Senza effetto se il flusso è già concluso. */
  readonly cancel: () => void;
};

const callbackParams = (request: IncomingMessage): URLSearchParams | undefined => {
  if (request.method !== 'GET') return undefined;
  const url = new URL(request.url ?? '', LOOPBACK_ORIGIN);
  return url.pathname === CALLBACK_PATH ? url.searchParams : undefined;
};

/*
 * Ogni richiesta che non è `GET /callback` riceve 404 e non conclude il flusso. Il callback
 * con `state` diverso o senza codice conclude il flusso con errore, dopo la pagina di esito.
 */
const createLoopback = (expectedState: string): Loopback => {
  let settled = false;
  let resolveListening: (port: number) => void = () => undefined;
  let rejectListening: (error: Error) => void = () => undefined;
  const listening = new Promise<number>((resolve, reject) => {
    resolveListening = resolve;
    rejectListening = reject;
  });
  let resolveCode: (code: string) => void = () => undefined;
  let rejectCode: (error: Error) => void = () => undefined;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Il chiamante attende `listening` e `code`; se se ne va prima, il rifiuto non deve diventare non gestito.
  listening.catch(() => undefined);
  code.catch(() => undefined);

  const server = createServer();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const close = (): void => {
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
  };

  const fail = (error: ServerLinkError): void => {
    if (settled) return;
    settled = true;
    close();
    rejectListening(error);
    rejectCode(error);
  };

  /* Risponde con la pagina, poi chiude e conclude il flusso: il browser riceve la pagina prima che il listener si chiuda. */
  const respondAndSettle = (response: ServerResponse, page: string, settle: () => void): void => {
    settled = true;
    response.writeHead(HTTP_OK, HTML_HEADERS);
    response.end(page, () => {
      close();
      settle();
    });
  };

  const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
    const params = callbackParams(request);
    if (!params || settled) {
      response.writeHead(HTTP_NOT_FOUND, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
      response.end('pagina non trovata');
      return;
    }
    const callbackCode = params.get('code');
    const invalidCallback = params.get('state') !== expectedState || callbackCode === null || callbackCode === '';
    if (invalidCallback) {
      respondAndSettle(response, PAGE_FAILED, () => {
        rejectListening(new ServerLinkError('auth', LINK_INVALID_MESSAGE));
        rejectCode(new ServerLinkError('auth', LINK_INVALID_MESSAGE));
      });
      return;
    }
    respondAndSettle(response, PAGE_DONE, () => resolveCode(callbackCode));
  };

  server.on('request', handleRequest);
  server.once('error', () => fail(new ServerLinkError('unknown', LISTEN_FAILED_MESSAGE)));
  // Porta 0: il sistema sceglie una porta libera. Solo 127.0.0.1, mai altre interfacce.
  server.listen(0, LOOPBACK_HOST, () => {
    const address = server.address();
    if (settled) {
      // Annullato mentre il listener si avviava: non si arma nessun timeout.
      close();
      return;
    }
    if (address === null || typeof address === 'string') {
      fail(new ServerLinkError('unknown', LISTEN_FAILED_MESSAGE));
      return;
    }
    timer = setTimeout(() => fail(new ServerLinkError('auth', LINK_INVALID_MESSAGE)), LINK_TIMEOUT_MS);
    resolveListening(address.port);
  });

  return {
    listening,
    code,
    cancel: () => fail(new ServerLinkError('auth', SERVER_LINK_CANCELLED_MESSAGE)),
  };
};

/* Il collegamento in corso, se c'è: `server:link` ne avvia uno solo alla volta. */
let pending: Pick<Loopback, 'cancel'> | undefined;

/** Annulla il collegamento in corso. Senza effetto se non ce n'è uno. */
export const cancelServerLink = (): void => {
  pending?.cancel();
};

const randomToken = (): string => randomBytes(RANDOM_TOKEN_BYTES).toString('base64url');

const pairStartUrl = (serverUrl: string, redirectUri: string, state: string, codeChallenge: string): string => {
  const url = new URL(PAIR_START_PATH, serverUrl);
  url.search = new URLSearchParams({
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: PKCE_METHOD,
  }).toString();
  return url.toString();
};

const openBrowser = async (url: string): Promise<void> => {
  try {
    await shell.openExternal(url);
  } catch {
    // Il messaggio di Electron può contenere l'URL del collegamento: non lo si inoltra.
    throw new ServerLinkError('unknown', BROWSER_OPEN_FAILED_MESSAGE);
  }
};

/** Porta in primo piano la finestra dell'app, anche se è ridotta a icona. */
const focusWindow = (window: BrowserWindow | undefined): void => {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
};

const readJsonOk = async (response: Response): Promise<unknown> => {
  expectStatus(response, HTTP_OK);
  return readJson(response);
};

/* Stato del server per `GET /pair`. */

const fetchPairStatus = async (serverUrl: string, deviceToken: string): Promise<ServerLinkState> => {
  const response = await callPair(serverUrl, { method: 'GET', deviceToken });
  if (response.status === HTTP_UNAUTHORIZED) {
    // Dispositivo revocato o server reinstallato: si tiene l'URL per ricollegare, il deviceToken non serve più.
    await saveStored({ serverUrl, deviceToken: null });
    return { serverUrl, paired: false };
  }
  const status = parseBody(pairStatusSchema, await readJsonOk(response));
  if (!status.paired) return { serverUrl, paired: false };
  return status.fullName === undefined ? { serverUrl, paired: true } : { serverUrl, paired: true, fullName: status.fullName };
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : UNEXPECTED_MESSAGE);

/**
 * Stato del collegamento per l'interfaccia. Se il server non risponde, il dispositivo risulta
 * ancora collegato (senza nome): così chi scollega riceve l'errore e può rimuovere solo la
 * configurazione locale. Il messaggio di errore resta nel log, fisso e senza segreti.
 */
export const getServerLink = async (): Promise<ServerLinkState> => {
  const stored = await loadStored();
  if (!stored) return UNLINKED;
  if (stored.deviceToken === null) return { serverUrl: stored.serverUrl, paired: false };
  try {
    return await fetchPairStatus(stored.serverUrl, stored.deviceToken);
  } catch (error) {
    console.warn(`[server] stato del server non disponibile: ${describeError(error)}`);
    return { serverUrl: stored.serverUrl, paired: true };
  }
};

/**
 * Collega il server: apre il browser, attende il callback, invia la sessione WeBeep attiva e
 * salva URL e deviceToken solo se il server li accetta. Un solo collegamento alla volta: uno nuovo
 * annulla quello in corso.
 */
export const linkServer = async (request: ServerLinkRequest, window: BrowserWindow | undefined): Promise<ServerLinkState> => {
  const serverUrl = request.serverUrl;
  // Senza sessione WeBeep non si apre nemmeno il browser.
  readSession();
  cancelServerLink();
  const state = randomToken();
  const codeVerifier = randomToken();
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  // Il listener parte subito e diventa `pending` in modo sincrono: così un annullamento è sempre preso in carico.
  const loopback = createLoopback(state);
  pending = loopback;
  try {
    const port = await loopback.listening;
    const redirectUri = `${LOOPBACK_ORIGIN}:${port}${CALLBACK_PATH}`;
    await openBrowser(pairStartUrl(serverUrl, redirectUri, state, codeChallenge));
    const code = await loopback.code;
    const session = readSession();
    const response = await callPair(serverUrl, {
      method: 'POST',
      body: { code, codeVerifier, siteUrl: WEBEEP_SITE_URL, token: session.token, privateToken: session.privateToken },
    });
    expectStatus(response, HTTP_OK);
    const body = parseBody(pairSuccessSchema, await readJson(response));
    await saveStored({ serverUrl, deviceToken: body.deviceToken });
    return { serverUrl, paired: true, fullName: body.fullName };
  } finally {
    // Senza effetto se il flusso è già concluso: chiude il listener nei casi di errore e di apertura fallita.
    loopback.cancel();
    if (pending === loopback) pending = undefined;
    focusWindow(window);
  }
};

/**
 * Revoca l'accoppiamento sul server (`DELETE /pair`). La configurazione locale si rimuove solo
 * dopo 204, o 401 (il server non riconosce più il dispositivo). Con `localOnly` si rimuove solo
 * quella locale, senza rete: serve se il server non risponde.
 */
export const unlinkServer = async (request: ServerUnlinkRequest): Promise<null> => {
  const stored = await loadStored();
  // Senza deviceToken non c'è nulla da revocare sul server.
  if (request.localOnly === true || !stored || stored.deviceToken === null) {
    await clearStored();
    return null;
  }
  const response = await callPair(stored.serverUrl, { method: 'DELETE', deviceToken: stored.deviceToken });
  if (response.status !== HTTP_UNAUTHORIZED) expectStatus(response, HTTP_NO_CONTENT);
  await clearStored();
  return null;
};
