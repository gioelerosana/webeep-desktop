/*
 * Chiamate HTTP verso Authentik. Usano solo `fetch` (API Web), con timeout, e portano i
 * fallimenti di rete nell'errore del modulo: così chi chiama decide la pagina da mostrare.
 */
import { OIDC_REQUEST_TIMEOUT_MS } from './constants.js';
import { OidcRejectedError, OidcUnavailableError } from './errors.js';

/** Firma minima di `fetch`: basta per i test con un finto. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Invia la richiesta. Ogni errore di rete, DNS o timeout diventa `OidcUnavailableError`. */
export const sendOrUnavailable = async (fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS) });
  } catch {
    // Il dettaglio dell'errore può contenere URL: si scarta, resta solo la classe di errore.
    throw new OidcUnavailableError();
  }
};

/** Corpo JSON di una risposta di Authentik. Un corpo non JSON è una risposta rifiutata. */
export const readJsonOrRejected = async (response: Response): Promise<unknown> => {
  try {
    const value: unknown = await response.json();
    return value;
  } catch {
    throw new OidcRejectedError();
  }
};
