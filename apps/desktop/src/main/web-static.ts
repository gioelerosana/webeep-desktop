/*
 * Servizio dell'interfaccia (`out/renderer`) per la modalità web. Il path arriva dalla
 * richiesta: lo si risolve dentro la cartella del renderer e tutto ciò che ne esce
 * diventa la pagina principale. Ogni percorso non esistente ricade su `index.html`,
 * come serve a un'app a pagina singola.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { HTTP_BAD_REQUEST, HTTP_METHOD_NOT_ALLOWED, HTTP_OK, sendText } from './web-http.js';

const RENDERER_ROOT = join(__dirname, '../renderer');
const INDEX_PATH = join(RENDERER_ROOT, 'index.html');
const FALLBACK_MIME_TYPE = 'application/octet-stream';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const mimeTypeOf = (path: string): string => MIME_TYPES[extname(path).toLowerCase()] ?? FALLBACK_MIME_TYPE;

/** `%2e%2e` e simili vanno decodificati prima del controllo: una sequenza non valida è una richiesta sbagliata. */
const decodePath = (pathname: string): string | undefined => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    // Escape malformato (es. `%E0%A4%A`): non è un file, la richiesta viene rifiutata.
    return undefined;
  }
};

/** Il percorso risolto, solo se resta dentro la cartella del renderer. */
const insideRenderer = (relativePath: string): string | undefined => {
  const candidate = resolve(RENDERER_ROOT, `.${relativePath}`);
  return candidate.startsWith(`${RENDERER_ROOT}${sep}`) ? candidate : undefined;
};

const isFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    // Non esiste (o non si legge): la pagina ricade su index.html invece di mostrare un errore.
    return false;
  }
};

export const serveRenderer = async (req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, HTTP_METHOD_NOT_ALLOWED, 'Metodo non ammesso');
  const decoded = decodePath(pathname);
  if (decoded === undefined) return sendText(res, HTTP_BAD_REQUEST, 'Percorso non valido');
  const requested = insideRenderer(decoded);
  const file = requested !== undefined && (await isFile(requested)) ? requested : INDEX_PATH;
  res.writeHead(HTTP_OK, {
    'Content-Type': mimeTypeOf(file),
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  await pipeline(createReadStream(file), res);
};
