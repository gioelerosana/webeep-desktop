/*
 * Instradamento per metodo HTTP: il metodo non ammesso riceve 405 con l'elenco `Allow`.
 * Si usa una lista di coppie e non un oggetto, così un metodo come `constructor` non
 * trova per sbaglio una proprietà di `Object.prototype`.
 */
import { methodNotAllowed } from './responses.js';
import type { Route } from './context.js';

export const byMethod = (handlers: readonly (readonly [method: string, route: Route])[]): Route => {
  const allow = handlers.map(([method]) => method).join(', ');
  return async (ctx, request, requestContext) => {
    const match = handlers.find(([method]) => method === request.method);
    if (match === undefined) return methodNotAllowed(allow);
    return match[1](ctx, request, requestContext);
  };
};
