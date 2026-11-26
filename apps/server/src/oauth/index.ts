/*
 * OAuth 2.1 (docs/SERVER.md §5): metadati RFC 9728 e RFC 8414, registrazione dinamica
 * (RFC 7591), autorizzazione con PKCE S256 e consenso dopo il login Authentik, token con
 * rotazione del refresh token, revoca (RFC 7009).
 *
 * `handle` restituisce null per i percorsi che non sono suoi; il router prosegue.
 */
import type { Config } from '../config.js';
import type { RequestContext } from '../http/types.js';
import type { StateManager } from '../state/manager.js';
import type { Oidc } from '../oidc/index.js';
import {
  AUTHORIZATION_SERVER_PATH,
  AUTHORIZE_PATH,
  CONSENT_PATH,
  PROTECTED_RESOURCE_ALIAS_PATH,
  PROTECTED_RESOURCE_PATH,
  REGISTER_PATH,
  REVOKE_PATH,
  TOKEN_PATH,
} from './constants.js';
import type { AccessTokenRecord, AuthorizationCodeRecord, ConsentRecord, OAuthContext, Route } from './context.js';
import { authorizeRoute, consentRoute, createConsentContinuation } from './authorize.js';
import { byMethod } from './route.js';
import { authorizationServerMetadataRoute, protectedResourceMetadataRoute } from './metadata.js';
import { registerRoute } from './register.js';
import { revokeEndpointRoute, tokenEndpointRoute } from './token.js';
import { revokeAllTokens, verifyAccessToken } from './tokens.js';

export type OAuthDeps = {
  readonly config: Config;
  readonly store: StateManager;
  /** Login Authentik (docs/SERVER.md §10): `/authorize` lo avvia e il consenso ne è la continuazione. */
  readonly oidc: Oidc;
};

export type OAuth = {
  /**
   * Gestisce i percorsi OAuth. Restituisce null se il percorso non è suo.
   * Il corpo della richiesta è già letto dal router (limite 1 MB).
   */
  readonly handle: (request: Request, ctx: RequestContext) => Promise<Response | null>;
  /** true se l'header Authorization porta un access token valido e non scaduto (in memoria). */
  readonly verifyAccessToken: (authorizationHeader: string | null) => Promise<boolean>;
  /**
   * Revoca tutti i refresh token (scrive lo stato su disco) e cancella tutti gli access
   * token in memoria. Lo chiama `/pair` a ogni accoppiamento e a ogni scollegamento.
   */
  readonly revokeAll: () => Promise<void>;
};

export const createOAuth = (deps: OAuthDeps): OAuth => {
  const accessTokens = new Map<string, AccessTokenRecord>();
  const codes = new Map<string, AuthorizationCodeRecord>();
  const consents = new Map<string, ConsentRecord>();
  const ctx: OAuthContext = {
    config: deps.config,
    store: deps.store,
    oidc: deps.oidc,
    accessTokens,
    codes,
    consents,
  };

  // Il dopo-login di `/authorize` mostra il consenso: va registrato prima del primo login.
  deps.oidc.registerContinuation('claude-authorize', createConsentContinuation(ctx));

  const routes: ReadonlyMap<string, Route> = new Map<string, Route>([
    [PROTECTED_RESOURCE_PATH, protectedResourceMetadataRoute],
    [PROTECTED_RESOURCE_ALIAS_PATH, protectedResourceMetadataRoute],
    [AUTHORIZATION_SERVER_PATH, authorizationServerMetadataRoute],
    [REGISTER_PATH, byMethod([['POST', registerRoute]])],
    [AUTHORIZE_PATH, authorizeRoute],
    [CONSENT_PATH, consentRoute],
    [TOKEN_PATH, tokenEndpointRoute],
    [REVOKE_PATH, revokeEndpointRoute],
  ]);

  return {
    handle: async (request, requestContext) => {
      const route = routes.get(new URL(request.url).pathname);
      if (route === undefined) return null;
      return route(ctx, request, requestContext);
    },
    verifyAccessToken: (authorizationHeader) => verifyAccessToken(ctx, authorizationHeader),
    revokeAll: () => revokeAllTokens(ctx),
  };
};
