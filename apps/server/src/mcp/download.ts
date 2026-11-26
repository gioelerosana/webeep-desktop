/*
 * Download di un file di WeBeep per `read_file`.
 *
 * Il trasporto è `fetchWebeepFile` di moodle-api: redirect a mano, solo verso webeep.polimi.it, token
 * solo sui file protetti. Qui restano il limite di 10 MiB sullo stream, il timeout e la traduzione
 * degli errori in testi per il modello.
 */
import {
  fetchWebeepFile,
  InvalidWebeepUrlError,
  isWebeepUrl,
  MoodleNetworkError,
  UnsafeRedirectError,
  WebeepFileTooLargeError,
} from '@webeep/moodle-api';
import { FILE_TOO_LARGE_TEXT, INVALID_FILE_URL_TEXT, REDIRECT_OUT_OF_WEBEEP_TEXT, ToolFailure } from './errors.js';

/** Limite del file: 10 MiB, controllato sul Content-Length e durante la lettura. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TIMEOUT_MS = 30_000;
const PLUGINFILE_SEGMENT = 'pluginfile.php';
const TOKEN_PARAMS: readonly string[] = ['token', 'wstoken'];
const CONTENT_TYPE_HEADER = 'content-type';
const CONTENT_DISPOSITION_HEADER = 'content-disposition';
const PATH_SEPARATOR = '/';
const MIME_SEPARATOR = ';';

export type WebeepDownload = {
  readonly bytes: Uint8Array;
  /** Tipo senza parametri, in minuscolo (`image/png`). */
  readonly contentType: string;
  readonly contentDisposition: string | null;
  /** URL richiesto dal modello, senza token. */
  readonly requestedUrl: string;
};

/**
 * URL del file richiesto dal modello: https su webeep.polimi.it, percorso con `pluginfile.php`
 * seguito da almeno un altro segmento, senza parametri di token. Altrimenti errore del tool.
 */
export const parseFileUrl = (text: string): URL => {
  if (!isWebeepUrl(text)) throw new ToolFailure(INVALID_FILE_URL_TEXT);
  const url = new URL(text);
  const segments = url.pathname.split(PATH_SEPARATOR).filter((segment) => segment.length > 0);
  const marker = segments.indexOf(PLUGINFILE_SEGMENT);
  const hasPluginfile = marker !== -1 && marker < segments.length - 1;
  const hasToken = TOKEN_PARAMS.some((param) => url.searchParams.has(param));
  if (!hasPluginfile || hasToken) throw new ToolFailure(INVALID_FILE_URL_TEXT);
  return url;
};

type ReadProgress = { readonly chunks: readonly Uint8Array[]; readonly total: number };

const joinChunks = (progress: ReadProgress): Uint8Array => {
  const joined = new Uint8Array(progress.total);
  progress.chunks.reduce((offset, chunk) => {
    joined.set(chunk, offset);
    return offset + chunk.byteLength;
  }, 0);
  return joined;
};

/** Legge il corpo a blocchi; oltre il limite interrompe lo stream e restituisce `null`. */
const readLimited = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  progress: ReadProgress,
): Promise<Uint8Array | null> => {
  const result = await reader.read();
  if (result.done) return joinChunks(progress);
  const total = progress.total + result.value.byteLength;
  if (total > MAX_FILE_BYTES) {
    await reader.cancel();
    return null;
  }
  return readLimited(reader, { chunks: [...progress.chunks, result.value], total });
};

const readBody = async (response: Response): Promise<Uint8Array> => {
  if (response.body === null) return new Uint8Array(0);
  const bytes = await readLimited(response.body.getReader(), { chunks: [], total: 0 });
  if (bytes === null) throw new ToolFailure(FILE_TOO_LARGE_TEXT);
  return bytes;
};

const mimeTypeOf = (response: Response): string => {
  const header = response.headers.get(CONTENT_TYPE_HEADER) ?? '';
  return header.split(MIME_SEPARATOR)[0]?.trim().toLowerCase() ?? '';
};

/**
 * Traduce gli errori di `fetchWebeepFile` in errori per il tool. Il timeout diventa rete non
 * raggiungibile; gli altri errori già tipizzati di rete o di stato passano invariati.
 */
const toToolError = (error: unknown, timedOut: boolean): unknown => {
  if (timedOut) return new MoodleNetworkError('Impossibile contattare WeBeep', undefined);
  if (error instanceof UnsafeRedirectError) return new ToolFailure(REDIRECT_OUT_OF_WEBEEP_TEXT);
  if (error instanceof WebeepFileTooLargeError) return new ToolFailure(FILE_TOO_LARGE_TEXT);
  if (error instanceof InvalidWebeepUrlError) return new ToolFailure(INVALID_FILE_URL_TEXT);
  return error;
};

/** Scarica un file di WeBeep con il token del server. Errori: `ToolFailure` o `MoodleNetworkError`. */
export const downloadWebeepFile = async (url: URL, token: string): Promise<WebeepDownload> => {
  const timeout = AbortSignal.timeout(FILE_TIMEOUT_MS);
  try {
    const response = await fetchWebeepFile({
      fileUrl: url.toString(),
      token,
      signal: timeout,
      maxBytes: MAX_FILE_BYTES,
    });
    const bytes = await readBody(response);
    return {
      bytes,
      contentType: mimeTypeOf(response) || 'application/octet-stream',
      contentDisposition: response.headers.get(CONTENT_DISPOSITION_HEADER),
      requestedUrl: url.toString(),
    };
  } catch (error) {
    throw toToolError(error, timeout.aborted);
  }
};
