/*
 * Endpoint API della modalità web:
 * - `POST /api/ipc/<canale>`: lo stesso contratto IPC della finestra Electron;
 * - `GET /api/asset?url=`: immagini di WeBeep (come `webeep-asset://`);
 * - `GET /api/file?url=&name=&disposition=`: file di WeBeep in streaming.
 *
 * Il browser non vede mai il token: le chiamate passano da `runChannel` (come
 * `ipcMain`) o da `openWebeepFile`, che aggiunge il token nel main.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { WEBEEP_SITE_URL } from '@webeep/moodle-api';
import { z } from 'zod';
import { WEB_UNAVAILABLE_CHANNELS, type IpcArgs, type IpcChannel, type IpcResult } from '../shared/ipc.js';
import { openWebeepFile, sanitizeSegment } from './files.js';
import { isIpcChannel, runChannel } from './handlers.js';
import {
  fileHeaders,
  HTTP_FORBIDDEN,
  HTTP_METHOD_NOT_ALLOWED,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_PAYLOAD_TOO_LARGE,
  sendJson,
  sendText,
} from './web-http.js';

const API_IPC_PREFIX = '/api/ipc/';
const API_ASSET_PATH = '/api/asset';
const API_FILE_PATH = '/api/file';
const DISPOSITION_INLINE = 'inline';
const BYTES_PER_KIB = 1024;
const MAX_BODY_KIB = 64;
const MAX_BODY_BYTES = MAX_BODY_KIB * BYTES_PER_KIB;
const WEBEEP_ORIGIN = new URL(WEBEEP_SITE_URL).origin;

const IPC_BODY_SCHEMA = z.object({ args: z.array(z.unknown()) });

type BodyRead = { readonly kind: 'read'; readonly text: string } | { readonly kind: 'too-large' };

/** Il canale esiste nel contratto e in modalità web è consentito. */
const isWebChannel = (name: string): name is IpcChannel =>
  isIpcChannel(name) && !WEB_UNAVAILABLE_CHANNELS.some((channel) => channel === name);

const invalidInput = (message: string): IpcResult<never> => ({ ok: false, error: { kind: 'invalid-input', message } });

/** Legge il corpo fino al limite; oltre il limite si smette di accumularlo e si risponde 413. */
const readBody = (req: IncomingMessage): Promise<BodyRead> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      tooLarge = tooLarge || size > MAX_BODY_BYTES;
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () =>
      resolve(tooLarge ? { kind: 'too-large' } : { kind: 'read', text: Buffer.concat(chunks).toString('utf8') }),
    );
    req.on('error', reject);
  });

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    // Un JSON malformato è un input sbagliato del client: il chiamante risponde `invalid-input`.
    return undefined;
  }
};

const parseArgs = (text: string): readonly unknown[] | undefined => {
  const parsed = IPC_BODY_SCHEMA.safeParse(parseJson(text));
  return parsed.success ? parsed.data.args : undefined;
};

const handleIpc = async (req: IncomingMessage, res: ServerResponse, channel: string): Promise<void> => {
  if (req.method !== 'POST') return sendText(res, HTTP_METHOD_NOT_ALLOWED, 'Metodo non ammesso');
  if (!isWebChannel(channel)) {
    return sendJson(res, HTTP_OK, invalidInput('Canale non disponibile in modalità web'));
  }
  const body = await readBody(req);
  if (body.kind === 'too-large') return sendText(res, HTTP_PAYLOAD_TOO_LARGE, 'Richiesta troppo grande');
  const args = parseArgs(body.text);
  if (!args) return sendJson(res, HTTP_OK, invalidInput('Corpo della richiesta non valido'));
  // Gli argomenti arrivano come `unknown[]`, come da `ipcMain`: i gestori del contratto li trattano
  // per tipo, e un argomento sbagliato diventa un `IpcFailure` (vedi `toFailure` in handlers.ts).
  const result = await runChannel(channel, args as IpcArgs<IpcChannel>, { window: undefined });
  return sendJson(res, HTTP_OK, result);
};

/** Accetta solo URL del sito WeBeep: il server non deve diventare un proxy verso host arbitrari. */
const isWebeepFileUrl = (raw: string | null): raw is string =>
  raw !== null && URL.canParse(raw) && new URL(raw).origin === WEBEEP_ORIGIN;

const handleAsset = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
  if (req.method !== 'GET') return sendText(res, HTTP_METHOD_NOT_ALLOWED, 'Metodo non ammesso');
  const raw = url.searchParams.get('url');
  if (!isWebeepFileUrl(raw)) return sendText(res, HTTP_FORBIDDEN, 'URL non ammesso');
  const file = await openWebeepFile(raw);
  res.writeHead(HTTP_OK, fileHeaders(file.contentType));
  await pipeline(file.body, res);
};

// Caratteri che `encodeURIComponent` lascia passare ma RFC 5987 chiede di codificare: ! ' ( ) *
// Esempio che cambia: "a'b(c).pdf" → "a%27b%28c%29.pdf"; "dispensa.pdf" resta invariato.
// https://regex101.com/?regex=%5B!'()*%5D&testString=a'b(c).pdf%0Adispensa.pdf&flavor=javascript&flags=g
const RFC5987_EXTRA_CHARS = /[!'()*]/g;
const HEX_RADIX = 16;
// Caratteri fuori dall'ASCII stampabile, da sostituire nel nome "di riserva" di Content-Disposition.
// Esempio che cambia: "dispensa è.pdf" → "dispensa _.pdf"; "dispensa.pdf" resta invariato.
// https://regex101.com/?regex=%5B%5E%5Cx20-%5Cx7e%5D&testString=dispensa%20%C3%A8.pdf%0Adispensa.pdf&flavor=javascript&flags=g
const NON_PRINTABLE_ASCII = /[^\x20-\x7e]/g;

const encodeRfc5987 = (name: string): string =>
  encodeURIComponent(name).replace(RFC5987_EXTRA_CHARS, (char) => `%${char.charCodeAt(0).toString(HEX_RADIX).toUpperCase()}`);

const contentDisposition = (type: 'inline' | 'attachment', name: string): string => {
  const fallback = name.replace(NON_PRINTABLE_ASCII, '_');
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(name)}`;
};

const handleFile = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
  if (req.method !== 'GET') return sendText(res, HTTP_METHOD_NOT_ALLOWED, 'Metodo non ammesso');
  const raw = url.searchParams.get('url');
  if (!isWebeepFileUrl(raw)) return sendText(res, HTTP_FORBIDDEN, 'URL non ammesso');
  const type = url.searchParams.get('disposition') === DISPOSITION_INLINE ? 'inline' : 'attachment';
  const name = sanitizeSegment(url.searchParams.get('name') ?? '');
  const file = await openWebeepFile(raw);
  res.writeHead(HTTP_OK, { ...fileHeaders(file.contentType), 'Content-Disposition': contentDisposition(type, name) });
  await pipeline(file.body, res);
};

/** Smista `/api/*`. Le richieste arrivano qui solo con cookie o chiave valida (vedi web-server.ts). */
export const handleApiRequest = async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> => {
  if (url.pathname.startsWith(API_IPC_PREFIX)) return handleIpc(req, res, url.pathname.slice(API_IPC_PREFIX.length));
  if (url.pathname === API_ASSET_PATH) return handleAsset(req, res, url);
  if (url.pathname === API_FILE_PATH) return handleFile(req, res, url);
  return sendText(res, HTTP_NOT_FOUND, 'Non trovato');
};
