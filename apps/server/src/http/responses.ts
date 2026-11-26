/*
 * Costruttori delle risposte. Tutte portano `Cache-Control: no-store` (docs/SERVER.md §7).
 */

export type ExtraHeaders = Readonly<Record<string, string>>;

const NO_STORE_HEADERS: ExtraHeaders = { 'Cache-Control': 'no-store' };

export const jsonResponse = (status: number, body: unknown, headers: ExtraHeaders = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });

/** Errore nel formato `{ "error": "<codice>" }` degli endpoint non OAuth. */
export const errorResponse = (status: number, code: string, headers: ExtraHeaders = {}): Response =>
  jsonResponse(status, { error: code }, headers);

export const emptyResponse = (status: number, headers: ExtraHeaders = {}): Response =>
  new Response(null, { status, headers: { ...NO_STORE_HEADERS, ...headers } });

export const textResponse = (status: number, text: string): Response =>
  new Response(text, {
    status,
    headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' },
  });
