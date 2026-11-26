/*
 * Tipi condivisi dai gestori OAuth: stato in memoria, dipendenze e firma delle rotte.
 */
import type { Config } from '../config.js';
import type { RequestContext } from '../http/types.js';
import type { ClaudeAuthorizePayload, Oidc } from '../oidc/index.js';
import type { StateManager } from '../state/manager.js';

/** Access token in memoria. La chiave della mappa è il SHA-256 esadecimale del token. */
export type AccessTokenRecord = {
  readonly clientId: string;
  /** Millisecondi epoch. */
  readonly expiresAt: number;
};

/** Codice di autorizzazione in memoria, monouso. La chiave della mappa è il suo SHA-256. */
export type AuthorizationCodeRecord = {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly resource: string | undefined;
  /** Millisecondi epoch. */
  readonly expiresAt: number;
};

/**
 * Consenso in attesa: i parametri di `/authorize` restano nel server, il form invia solo il
 * token CSRF che è la chiave della mappa. Monouso, in memoria.
 */
export type ConsentRecord = {
  readonly params: ClaudeAuthorizePayload;
  /** Millisecondi epoch. */
  readonly expiresAt: number;
};

export type OAuthContext = {
  readonly config: Config;
  readonly store: StateManager;
  /** Login Authentik: `/authorize` lo avvia, il consenso è la sua continuazione. */
  readonly oidc: Oidc;
  readonly accessTokens: Map<string, AccessTokenRecord>;
  readonly codes: Map<string, AuthorizationCodeRecord>;
  /** Consensi in attesa, per token CSRF. */
  readonly consents: Map<string, ConsentRecord>;
};

/** Gestore di una rotta. La richiesta ha già il corpo letto dal router. */
export type Route = (ctx: OAuthContext, request: Request, requestContext: RequestContext) => Promise<Response>;
