/*
 * Collegamento al server privato (`apps/server`), lato desktop. Contratto: docs/SERVER.md, sezione 4.4.
 *
 * Il main è l'unico che parla con il server: legge token e private token dalla
 * sessione WeBeep attiva e li invia con `POST /pair`. Il renderer manda solo URL
 * e chiave di accoppiamento, e nulla di ciò che riceve qui torna a lui oltre
 * all'esito e al nome utente.
 *
 * URL e chiave si salvano cifrati con `safeStorage`, come la sessione. Senza
 * cifratura restano in memoria per questa esecuzione: mai in chiaro su disco.
 */
import { WEBEEP_SITE_URL } from '@webeep/moodle-api';
import { app, safeStorage } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  SERVER_PAIRING_KEY_MAX_LENGTH,
  SERVER_PAIRING_KEY_MIN_LENGTH,
  type IpcErrorKind,
  type ServerLinkRequest,
  type ServerLinkState,
} from '../shared/ipc.js';
import { getActiveSessionSecrets } from './auth.js';
import { isMissingFile } from './fs-errors.js';

const LINK_FILE = 'server-link.bin';
const FILE_MODE_OWNER_ONLY = 0o600;
const PAIR_PATH = '/pair';
/** Il server risponde entro pochi secondi; oltre, lo si considera non raggiungibile. */
const SERVER_REQUEST_TIMEOUT_MS = 15_000;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTPS_PROTOCOL = 'https:';
const HTTP_PROTOCOL = 'http:';
/** `http://` è ammesso solo verso il proprio computer: la chiave non deve viaggiare in chiaro in rete. */
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

const SERVER_UNREACHABLE_MESSAGE = 'server non raggiungibile';
const UNEXPECTED_MESSAGE = 'errore imprevisto';
const UNEXPECTED_RESPONSE_MESSAGE = 'risposta del server non valida';
const INVALID_URL_MESSAGE = 'indirizzo del server non valido';
const URL_NOT_ORIGIN_MESSAGE = "l'indirizzo deve essere solo quello del server, senza percorso, query o frammento";
const URL_PROTOCOL_MESSAGE = 'il server deve usare https (http solo per localhost o 127.0.0.1)';
const KEY_TOO_SHORT_MESSAGE = `la chiave di accoppiamento deve avere almeno ${SERVER_PAIRING_KEY_MIN_LENGTH} caratteri`;
const KEY_TOO_LONG_MESSAGE = `la chiave di accoppiamento non può superare ${SERVER_PAIRING_KEY_MAX_LENGTH} caratteri`;

const storedLinkSchema = z.object({
  serverUrl: z.string(),
  pairingKey: z.string(),
});
type StoredServerLink = z.infer<typeof storedLinkSchema>;

/* Risposte del server: validate al confine, come le risposte Moodle. */
const pairSuccessSchema = z.object({ fullName: z.string() });
const pairStatusSchema = z.object({ paired: z.boolean(), fullName: z.string().optional() });

const UNLINKED: ServerLinkState = { serverUrl: null, paired: false };

/** Errore con un tipo di `IpcFailure` già scelto: il messaggio è sempre una frase fissa, senza URL né chiave. */
export class ServerLinkError extends Error {
  override readonly name = 'ServerLinkError';
  readonly kind: IpcErrorKind;

  constructor(kind: IpcErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

type FailureDescription = { readonly kind: IpcErrorKind; readonly message: string };

/* Mappa dei codici di `/pair` (docs/SERVER.md, 4.2 e 4.3). Un codice non previsto ricade su `unknown`. */
const STATUS_FAILURES: Readonly<Partial<Record<number, FailureDescription>>> = {
  400: { kind: 'invalid-input', message: 'richiesta non valida' },
  401: { kind: 'invalid-input', message: 'chiave di accoppiamento errata' },
  422: { kind: 'auth', message: "sessione WeBeep rifiutata: accedi di nuovo dall'app" },
  429: { kind: 'invalid-input', message: 'troppi tentativi: riprova tra 15 minuti' },
  503: { kind: 'network', message: SERVER_UNREACHABLE_MESSAGE },
};
const UNKNOWN_FAILURE: FailureDescription = { kind: 'unknown', message: UNEXPECTED_MESSAGE };

const failureOf = (status: number): FailureDescription => STATUS_FAILURES[status] ?? UNKNOWN_FAILURE;

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

export const parsePairingKey = (raw: unknown): string => {
  const key = typeof raw === 'string' ? raw.trim() : '';
  if (key.length < SERVER_PAIRING_KEY_MIN_LENGTH) throw invalidInput(KEY_TOO_SHORT_MESSAGE);
  if (key.length > SERVER_PAIRING_KEY_MAX_LENGTH) throw invalidInput(KEY_TOO_LONG_MESSAGE);
  return key;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Gli argomenti arrivano dal renderer come `unknown`: si ricontrollano qui prima di usarli. */
export const parseServerLinkRequest = (raw: unknown): ServerLinkRequest => {
  if (!isRecord(raw)) throw invalidInput('richiesta non valida');
  return { serverUrl: parseServerUrl(raw.serverUrl), pairingKey: parsePairingKey(raw.pairingKey) };
};

/* Persistenza: un solo file cifrato, letto una volta e poi tenuto in memoria. */

const linkPath = (): string => join(app.getPath('userData'), LINK_FILE);

const canPersist = (): boolean => safeStorage.isEncryptionAvailable();

let cached: StoredServerLink | undefined;
let loaded = false;

const readStoredFile = async (): Promise<StoredServerLink | undefined> => {
  let encrypted: Buffer;
  try {
    encrypted = await readFile(linkPath());
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
  // Un file che non si decifra (chiave del sistema cambiata, file corrotto) non blocca l'app: si ricollega.
  try {
    const parsed = storedLinkSchema.safeParse(JSON.parse(safeStorage.decryptString(encrypted)));
    return parsed.success ? parsed.data : undefined;
  } catch {
    console.warn('[server] configurazione del server non leggibile: va collegato di nuovo');
    return undefined;
  }
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

const clearStored = async (): Promise<void> => {
  cached = undefined;
  loaded = true;
  await rm(linkPath(), { force: true });
};

/* Chiamate HTTP verso `<server>/pair`. */

type PairRequestBody = {
  readonly siteUrl: string;
  readonly token: string;
  readonly privateToken: string | undefined;
};

const callPair = async (
  serverUrl: string,
  method: 'GET' | 'POST' | 'DELETE',
  pairingKey: string,
  body?: PairRequestBody,
): Promise<Response> => {
  try {
    return await fetch(`${serverUrl}${PAIR_PATH}`, {
      method,
      headers: {
        Authorization: `Bearer ${pairingKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      // Nessun redirect: la chiave non deve seguire il server verso un altro indirizzo.
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
  const failure = failureOf(response.status);
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

/** Stato del server per `GET /pair`: 200 con `paired` e, se WeBeep risponde, `fullName`. */
const fetchPairStatus = async (link: StoredServerLink): Promise<ServerLinkState> => {
  const response = await callPair(link.serverUrl, 'GET', link.pairingKey);
  expectStatus(response, HTTP_OK);
  const status = parseBody(pairStatusSchema, await readJson(response));
  if (!status.paired) return { serverUrl: link.serverUrl, paired: false };
  return status.fullName === undefined
    ? { serverUrl: link.serverUrl, paired: true }
    : { serverUrl: link.serverUrl, paired: true, fullName: status.fullName };
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : UNEXPECTED_MESSAGE);

/**
 * Stato del collegamento per l'interfaccia. Se il server non risponde o rifiuta la
 * chiave, non è un errore della vista: si mostra "non collegato" con l'URL salvato.
 */
export const getServerLink = async (): Promise<ServerLinkState> => {
  const stored = await loadStored();
  if (!stored) return UNLINKED;
  try {
    return await fetchPairStatus(stored);
  } catch (error) {
    // Solo il messaggio fisso di `ServerLinkError`: mai URL, chiave o token.
    console.warn(`[server] stato del server non disponibile: ${describeError(error)}`);
    return { serverUrl: stored.serverUrl, paired: false };
  }
};

/** Invia la sessione WeBeep attiva al server e salva URL e chiave solo se il server la accetta. */
export const linkServer = async (request: ServerLinkRequest): Promise<ServerLinkState> => {
  const serverUrl = parseServerUrl(request.serverUrl);
  const pairingKey = parsePairingKey(request.pairingKey);
  const session = getActiveSessionSecrets();
  const response = await callPair(serverUrl, 'POST', pairingKey, {
    siteUrl: WEBEEP_SITE_URL,
    token: session.token,
    privateToken: session.privateToken,
  });
  expectStatus(response, HTTP_OK);
  const body = parseBody(pairSuccessSchema, await readJson(response));
  await saveStored({ serverUrl, pairingKey });
  return { serverUrl, paired: true, fullName: body.fullName };
};

/**
 * Revoca l'accoppiamento sul server. La configurazione locale si rimuove solo dopo
 * la conferma (204): se il server non risponde, URL e chiave restano e si riprova.
 */
export const unlinkServer = async (): Promise<null> => {
  const stored = await loadStored();
  if (!stored) return null;
  const response = await callPair(stored.serverUrl, 'DELETE', stored.pairingKey);
  expectStatus(response, HTTP_NO_CONTENT);
  await clearStored();
  return null;
};
