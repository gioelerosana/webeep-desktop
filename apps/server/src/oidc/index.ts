/*
 * Login con Authentik (OIDC), docs/SERVER.md §10. Client confidenziale con Authorization Code
 * e PKCE S256, implementato con `fetch` e `crypto.subtle`, senza dipendenze.
 *
 * Contratto usato da `oauth/` e `pair.ts` (da non cambiare senza una nuova versione di SERVER.md):
 *
 *   createOidc(deps: { config: Config; fetch?: FetchLike }): Oidc
 *
 *   startLogin<P>(purpose: P, payload: OidcPayload[P]): Promise<Response>
 *     302 verso l'authorization endpoint di Authentik, con PKCE, state, nonce e login pendente
 *     (10 minuti, monouso). Se la discovery non è disponibile: pagina HTML 503.
 *
 *   registerContinuation<P>(purpose: P, handler: OidcContinuation<P>): void
 *     Registra il gestore del dopo-login per un purpose. Chiamarla una volta all'avvio, prima
 *     del primo login. Registrare di nuovo lo stesso purpose sostituisce il gestore precedente.
 *
 *   handle(request: Request, ctx: RequestContext): Promise<Response | null>
 *     Gestisce `GET /oidc/callback`; restituisce null per ogni altro percorso.
 *     Il gestore del purpose decide la risposta (pagina di consenso, codice di accoppiamento...).
 */
import type { Config } from '../config.js';
import { randomBase64Url, sha256, toBase64Url } from '../crypto.js';
import { emptyResponse } from '../http/responses.js';
import type { RequestContext } from '../http/types.js';
import {
  CODE_VERIFIER_BYTES,
  GET_METHOD,
  HTTP_METHOD_NOT_ALLOWED,
  HTTP_SERVICE_UNAVAILABLE,
  NONCE_BYTES,
  OIDC_CALLBACK_PATH,
  OIDC_SCOPE,
  PENDING_LOGIN_TTL_MS,
  STATE_BYTES,
} from './constants.js';
import { createCallbackHandler, type CallbackHandler, type ContinuationRunner } from './callback.js';
import { createDiscovery, type OidcEndpoints } from './discovery.js';
import { OidcContinuationMissingError, OidcUnavailableError } from './errors.js';
import { htmlPage } from './html.js';
import { createPendingLogins } from './pending.js';
import type { FetchLike } from './request.js';
import type { OidcContinuation, OidcPayload, OidcPurpose } from './types.js';

export type {
  ClaudeAuthorizePayload,
  DesktopPairPayload,
  OidcContinuation,
  OidcIdentity,
  OidcPayload,
  OidcPurpose,
} from './types.js';
export type { FetchLike } from './request.js';
export { OIDC_CALLBACK_PATH } from './constants.js';

export type Oidc = {
  /** Avvia il login per `purpose`: 302 verso Authentik (o 503 se la discovery non va). */
  readonly startLogin: <P extends OidcPurpose>(purpose: P, payload: OidcPayload[P]) => Promise<Response>;
  /** Registra il gestore del dopo-login per `purpose`. */
  readonly registerContinuation: <P extends OidcPurpose>(purpose: P, handler: OidcContinuation<P>) => void;
  /** Gestisce `/oidc/callback`; null per gli altri percorsi. */
  readonly handle: (request: Request, ctx: RequestContext) => Promise<Response | null>;
};

export type OidcDeps = {
  readonly config: Config;
  /** Sostituibile nei test; per default è il `fetch` globale. */
  readonly fetch?: FetchLike;
};

const CALLBACK_PATH = OIDC_CALLBACK_PATH;
const UNAVAILABLE_TITLE = 'servizio non disponibile';
const UNAVAILABLE_MESSAGE = 'servizio di accesso non disponibile, riprova tra poco';
const CODE_CHALLENGE_METHOD_S256 = 'S256';
const RESPONSE_TYPE_CODE = 'code';
const HTTP_FOUND = 302;

export const createOidc = (deps: OidcDeps): Oidc => {
  const fetchImpl: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const discovery = createDiscovery(deps.config.oidc, fetchImpl);
  const pending = createPendingLogins();
  // La mappa non è tipata per purpose: la correlazione purpose↔payload la garantiscono
  // `registerContinuation` (stesso P per chiave e gestore) e `runContinuation` (il payload
  // arriva dal login salvato con quello stesso purpose).
  const continuations = new Map<OidcPurpose, OidcContinuation<OidcPurpose>>();

  const runContinuation: ContinuationRunner = (purpose, payload, identity, ctx) => {
    const handler = continuations.get(purpose);
    if (handler === undefined) throw new OidcContinuationMissingError();
    return handler(payload, identity, ctx);
  };

  const callback: CallbackHandler = createCallbackHandler({
    config: deps.config,
    fetchImpl,
    discovery,
    pending,
    runContinuation,
  });

  const authorizationUrl = (endpoints: OidcEndpoints, state: string, nonce: string, codeChallenge: string): string => {
    const url = new URL(endpoints.authorizationEndpoint);
    url.searchParams.set('response_type', RESPONSE_TYPE_CODE);
    url.searchParams.set('client_id', deps.config.oidc.clientId);
    url.searchParams.set('redirect_uri', `${deps.config.publicUrl}${CALLBACK_PATH}`);
    url.searchParams.set('scope', OIDC_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', CODE_CHALLENGE_METHOD_S256);
    return url.toString();
  };

  const startLogin = async <P extends OidcPurpose>(purpose: P, payload: OidcPayload[P]): Promise<Response> => {
    try {
      const endpoints = await discovery.endpoints();
      const state = randomBase64Url(STATE_BYTES);
      const nonce = randomBase64Url(NONCE_BYTES);
      const codeVerifier = randomBase64Url(CODE_VERIFIER_BYTES);
      const codeChallenge = toBase64Url(await sha256(codeVerifier));
      const now = Date.now();
      pending.add(state, { purpose, payload, nonce, codeVerifier, expiresAt: now + PENDING_LOGIN_TTL_MS }, now);
      return emptyResponse(HTTP_FOUND, { Location: authorizationUrl(endpoints, state, nonce, codeChallenge) });
    } catch (error) {
      if (error instanceof OidcUnavailableError) {
        return htmlPage(HTTP_SERVICE_UNAVAILABLE, UNAVAILABLE_TITLE, UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
  };

  return {
    startLogin,
    registerContinuation: (purpose, handler) => {
      // Cast giustificato: il gestore di `purpose` riceve solo payload di quel purpose (vedi sopra).
      continuations.set(purpose, handler as OidcContinuation<OidcPurpose>);
    },
    handle: async (request, ctx) => {
      if (new URL(request.url).pathname !== CALLBACK_PATH) return null;
      if (request.method !== GET_METHOD) return emptyResponse(HTTP_METHOD_NOT_ALLOWED, { Allow: GET_METHOD });
      return callback(request, ctx);
    },
  };
};
