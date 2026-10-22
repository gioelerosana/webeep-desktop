/*
 * Helper HTTP condivisi dalla modalità web: codici di stato, risposte testuali e JSON,
 * e le intestazioni di sicurezza per i contenuti di WeBeep.
 */
import type { ServerResponse } from 'node:http';

export const HTTP_OK = 200;
export const HTTP_FOUND = 302;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_METHOD_NOT_ALLOWED = 405;
export const HTTP_PAYLOAD_TOO_LARGE = 413;
export const HTTP_INTERNAL_ERROR = 500;
export const HTTP_BAD_GATEWAY = 502;

const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const NO_STORE = 'no-store';

/** Tipi che il browser può eseguire come documento attivo: su questi si applica la sandbox. */
const ACTIVE_CONTENT_TYPES: readonly string[] = ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml'];
const MIME_PARAMETERS_SEPARATOR = ';';

export const sendText = (res: ServerResponse, status: number, message: string): void => {
  res.writeHead(status, { 'Content-Type': TEXT_CONTENT_TYPE, 'Cache-Control': NO_STORE });
  res.end(message);
};

export const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'Content-Type': JSON_CONTENT_TYPE, 'Cache-Control': NO_STORE });
  res.end(JSON.stringify(body));
};

/**
 * Intestazioni per un file di WeBeep: il browser non deve indovinarne il tipo, e un
 * HTML o un SVG caricato da un corso non può eseguire script sull'origine del server.
 */
export const fileHeaders = (contentType: string | undefined): Record<string, string> => {
  const mime = (contentType ?? '').split(MIME_PARAMETERS_SEPARATOR)[0]?.trim().toLowerCase() ?? '';
  const isActive = ACTIVE_CONTENT_TYPES.includes(mime);
  return {
    'Content-Type': contentType ?? 'application/octet-stream',
    'Cache-Control': NO_STORE,
    'X-Content-Type-Options': 'nosniff',
    ...(isActive ? { 'Content-Security-Policy': 'sandbox' } : {}),
  };
};
