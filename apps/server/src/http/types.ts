/*
 * Tipi condivisi del nucleo HTTP. Il nucleo lavora solo con Request e Response Web.
 */

/** Dati che l'adattatore fornisce per ogni richiesta. `clientIp` serve ai rate limit. */
export type RequestContext = {
  readonly clientIp: string;
};

/** Firma del nucleo: `handle(request, ctx)` di docs/SERVER.md. Non lancia: gli errori diventano 500. */
export type Handler = (request: Request, ctx: RequestContext) => Promise<Response>;
