/*
 * File di WeBeep: controllo dell'origine, riscrittura del percorso, nomi sicuri e richiesta HTTP.
 *
 * Niente Electron e niente disco: il token arriva come parametro e non esce mai in un messaggio
 * d'errore. Le parti che toccano il disco (cache, file `.part`, apertura) restano nell'app.
 */
import { authenticatedFileUrl } from './endpoints.js';
import { MoodleNetworkError } from './errors.js';
import { WEBEEP_SITE_URL } from './site.js';

const WEBEEP_ORIGIN = new URL(WEBEEP_SITE_URL).origin;
const HTTPS_PROTOCOL = 'https:';
// Segmento del percorso dei file protetti di Moodle: solo questi richiedono il token.
const PLUGINFILE_MARKER = 'pluginfile.php';
// Le copertine dei corsi e gli avatar arrivano come `/pluginfile.php/…`, che vuole la sessione del browser:
// con il token del web service il percorso giusto è `/webservice/pluginfile.php/…` (come i file dei moduli).
const PLUGINFILE_PATH_PREFIX = '/pluginfile.php/';
const WEBSERVICE_PLUGINFILE_PATH_PREFIX = '/webservice/pluginfile.php/';
const CONTENT_LENGTH_HEADER = 'content-length';
const LOCATION_HEADER = 'location';
// Redirect HTTP che indicano una nuova destinazione in `Location`.
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
// Redirect seguiti a mano: più di così è un loop o un comportamento anomalo, si interrompe.
const MAX_REDIRECTS = 5;
const MAX_SEGMENT_LENGTH = 120;
const FALLBACK_SEGMENT = 'senza-nome';

/** L'URL non è https://webeep.polimi.it: non si scarica nulla da altri host. Il messaggio non riporta l'URL. */
export class InvalidWebeepUrlError extends Error {
  override readonly name = 'InvalidWebeepUrlError';

  constructor() {
    super('Il file non proviene da WeBeep');
  }
}

/** Il file dichiara (Content-Length) più byte di quelli accettati dal chiamante. */
export class WebeepFileTooLargeError extends Error {
  override readonly name = 'WebeepFileTooLargeError';

  constructor(readonly maxBytes: number) {
    super(`Il file supera il limite di ${maxBytes} byte`);
  }
}

/**
 * Un redirect porta fuori da webeep.polimi.it, o la sua `Location` non è un URL valido: il download
 * si ferma senza contattare l'altro host. Il messaggio non riporta l'URL di destinazione.
 */
export class UnsafeRedirectError extends Error {
  override readonly name = 'UnsafeRedirectError';

  constructor() {
    super('Il file è stato reindirizzato fuori da WeBeep');
  }
}

/** Il testo non è un URL valido: per l'app non è un file di WeBeep, senza altri dettagli. */
const parseUrl = (text: string): URL | undefined => {
  try {
    return new URL(text);
  } catch {
    // Testo che il parser non accetta: si tratta come "non è di WeBeep", è un esito atteso e non un guasto.
    return undefined;
  }
};

/** L'URL come `URL` se è https su WeBeep, altrimenti `undefined`. */
const webeepUrlOf = (text: string): URL | undefined => {
  const url = parseUrl(text);
  return url?.protocol === HTTPS_PROTOCOL && url.origin === WEBEEP_ORIGIN ? url : undefined;
};

/** Vero se la stringa è un URL https di WeBeep: l'unico tipo di URL che l'app scarica. */
export const isWebeepUrl = (text: string): boolean => webeepUrlOf(text) !== undefined;

/** Il percorso è un file protetto di Moodle (`pluginfile.php`, anche in `/webservice/pluginfile.php/`). */
const isPluginfileUrl = (url: URL): boolean => url.pathname.includes(PLUGINFILE_MARKER);

/**
 * Copia dell'URL con `/pluginfile.php/…` riscritto in `/webservice/pluginfile.php/…`, il percorso
 * che accetta il token del web service. Gli altri percorsi restano invariati.
 */
export const toWebserviceUrl = (url: URL): URL => {
  const rewritten = new URL(url);
  if (url.pathname.startsWith(PLUGINFILE_PATH_PREFIX)) {
    rewritten.pathname = `${WEBSERVICE_PLUGINFILE_PATH_PREFIX}${url.pathname.slice(PLUGINFILE_PATH_PREFIX.length)}`;
  }
  return rewritten;
};

// Caratteri non ammessi nei nomi di file su Windows/Linux/macOS e caratteri di controllo:
// "Analisi 1: esercizi/parte?" → "Analisi 1_ esercizi_parte_"; "Fisica" resta invariato.
// https://regex101.com/?regex=%5B%3C%3E%3A%22%2F%5C%5C%7C%3F*%5Cx00-%5Cx1f%5D&testString=Analisi%201%3A%20esercizi%2Fparte%3F%0AFisica&flavor=javascript&flags=g
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;
// Punti e spazi finali, vietati su Windows: "slide. " → "slide"; "slide.pdf" resta invariato.
// https://regex101.com/?regex=%5B.%20%5D%2B%24&testString=slide.%20%0Aslide.pdf&flavor=javascript
const TRAILING_DOTS_AND_SPACES = /[. ]+$/;

/** Un segmento di percorso sicuro: niente separatori, niente `..`, lunghezza limitata. */
export const sanitizeSegment = (raw: string): string => {
  const cleaned = raw.replace(UNSAFE_FILENAME_CHARS, '_').replace(TRAILING_DOTS_AND_SPACES, '').trim();
  const safe = cleaned === '..' || cleaned === '.' ? '' : cleaned;
  return safe.slice(0, MAX_SEGMENT_LENGTH) || FALLBACK_SEGMENT;
};

export type FetchWebeepFileOptions = {
  /** URL del file su WeBeep (`https://webeep.polimi.it/…`): altri host sono rifiutati. */
  readonly fileUrl: string;
  /**
   * Token del web service. Va in query solo sui file protetti (`pluginfile.php`).
   * È una credenziale: non finisce in messaggi d'errore né in log.
   */
  readonly token: string;
  readonly signal?: AbortSignal;
  /** Dimensione massima accettata, confrontata con il Content-Length. Senza, nessun limite. */
  readonly maxBytes?: number;
};

/** URL con cui si richiede il file. Il token si aggiunge solo ai file protetti. */
const requestUrlOf = (url: URL, token: string): string =>
  isPluginfileUrl(url) ? authenticatedFileUrl(toWebserviceUrl(url).toString(), token) : url.toString();

/** Dimensione dichiarata dal server; senza l'intestazione vale 0 (nessun limite applicabile). */
const declaredLength = (response: Response): number => Number(response.headers.get(CONTENT_LENGTH_HEADER));

/**
 * Una richiesta con redirect manuali: la destinazione si controlla prima di essere seguita, così il
 * token non parte mai verso un altro host.
 */
const requestOnce = async (url: URL, token: string, signal: AbortSignal | undefined): Promise<Response> => {
  try {
    return await fetch(requestUrlOf(url, token), { redirect: 'manual', signal });
  } catch (cause) {
    // Un'interruzione voluta dal chiamante resta com'è; il resto è rete giù, senza URL nel messaggio.
    if (signal?.aborted) throw cause;
    throw new MoodleNetworkError('Impossibile contattare WeBeep', undefined, { cause });
  }
};

/** La `Location` risolta rispetto all'URL corrente, o `undefined` se non è un URL valido. */
const resolveLocation = (location: string, base: URL): URL | undefined =>
  URL.canParse(location, base) ? new URL(location, base) : undefined;

/**
 * Segue i redirect a mano, al massimo `MAX_REDIRECTS`. Ogni destinazione deve essere un URL di WeBeep;
 * il token si aggiunge solo se la destinazione è un file protetto. Un redirect fuori sito lancia
 * `UnsafeRedirectError` senza richiedere nulla all'altro host.
 */
const followRedirects = async (
  url: URL,
  token: string,
  signal: AbortSignal | undefined,
  redirectsLeft: number,
): Promise<Response> => {
  const response = await requestOnce(url, token, signal);
  const location = response.headers.get(LOCATION_HEADER);
  if (!REDIRECT_STATUSES.has(response.status) || location === null) return response;

  await response.body?.cancel();
  if (redirectsLeft === 0) throw new MoodleNetworkError('Troppi redirect', response.status);
  const next = resolveLocation(location, url);
  if (next === undefined || !isWebeepUrl(next.toString())) throw new UnsafeRedirectError();
  return followRedirects(next, token, signal, redirectsLeft - 1);
};

/**
 * Richiede un file di WeBeep e restituisce la risposta, con il corpo ancora da leggere.
 * Segue al massimo `MAX_REDIRECTS` redirect, solo verso WeBeep.
 * Errori tipizzati: `InvalidWebeepUrlError` (origine non valida), `UnsafeRedirectError` (redirect fuori
 * sito), `MoodleNetworkError` (rete, troppi redirect o stato non ok), `WebeepFileTooLargeError`
 * (Content-Length oltre `maxBytes`).
 */
export const fetchWebeepFile = async (options: FetchWebeepFileOptions): Promise<Response> => {
  const url = webeepUrlOf(options.fileUrl);
  if (!url) throw new InvalidWebeepUrlError();

  const response = await followRedirects(url, options.token, options.signal, MAX_REDIRECTS);

  if (!response.ok || !response.body) {
    throw new MoodleNetworkError(`Download non riuscito (HTTP ${response.status})`, response.status);
  }

  const limit = options.maxBytes;
  if (limit !== undefined && declaredLength(response) > limit) {
    await response.body.cancel();
    throw new WebeepFileTooLargeError(limit);
  }
  return response;
};
