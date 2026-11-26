/*
 * Tipi condivisi del modulo OIDC: purpose, payload tipizzati per purpose, identità e
 * login pendenti. Sono il contratto usato da `callback.ts` e da chi registra i gestori.
 */
import type { RequestContext } from '../http/types.js';

/**
 * Parametri di `/authorize` già validati (docs/SERVER.md §5.3), da riportare al consenso
 * dopo il login Authentik. Non contengono segreti.
 */
export type ClaudeAuthorizePayload = {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly state?: string;
  readonly resource?: string;
  readonly clientName?: string;
};

/** Parametri di `/pair/start` già validati (docs/SERVER.md §4.2). */
export type DesktopPairPayload = {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
};

/** Payload di ogni purpose: la chiave è il purpose del login. */
export type OidcPayload = {
  readonly 'claude-authorize': ClaudeAuthorizePayload;
  readonly 'desktop-pair': DesktopPairPayload;
};

export type OidcPurpose = keyof OidcPayload;

/** Identità verificata dell'utente, letta da userinfo. Il gruppo non è esposto ai gestori. */
export type OidcIdentity = {
  /** Identificatore stabile dell'utente in Authentik (claim `sub`). */
  readonly sub: string;
  readonly name?: string;
  readonly email?: string;
};

/**
 * Gestore del dopo-login per un purpose. Riceve il payload salvato all'avvio, l'identità e il
 * contesto della richiesta di callback; restituisce la risposta HTTP da inviare al browser.
 */
export type OidcContinuation<P extends OidcPurpose> = (
  payload: OidcPayload[P],
  identity: OidcIdentity,
  ctx: RequestContext,
) => Promise<Response>;

/**
 * Login in attesa del callback. Il `nonce` e il `codeVerifier` restano in memoria, mai su
 * disco; la voce vive 10 minuti ed è monouso.
 */
export type PendingLogin = {
  readonly purpose: OidcPurpose;
  readonly payload: OidcPayload[OidcPurpose];
  readonly nonce: string;
  readonly codeVerifier: string;
  /** Millisecondi epoch. */
  readonly expiresAt: number;
};
