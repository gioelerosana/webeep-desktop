/*
 * Tipi condivisi dai gestori OAuth: stato in memoria, dipendenze e firma delle rotte.
 */
import type { Config } from '../config.js';
import type { RequestContext } from '../http/types.js';
import type { RateLimiter } from '../http/rate-limiter.js';
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

export type OAuthContext = {
  readonly config: Config;
  readonly store: StateManager;
  /** Contatore della password di `/authorize`, separato da quello di `/pair`. */
  readonly rateLimiter: RateLimiter;
  readonly accessTokens: Map<string, AccessTokenRecord>;
  readonly codes: Map<string, AuthorizationCodeRecord>;
};

/** Gestore di una rotta. La richiesta ha già il corpo letto dal router. */
export type Route = (ctx: OAuthContext, request: Request, requestContext: RequestContext) => Promise<Response>;
