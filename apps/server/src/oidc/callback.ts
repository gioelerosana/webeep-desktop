/*
 * `GET /oidc/callback` (docs/SERVER.md §10.2): verifica lo state, scambia il code, legge
 * userinfo, controlla il gruppo e passa l'identità al gestore del purpose.
 *
 * Nessun token e nessun codice entra nei log o nelle risposte: restano nelle variabili locali
 * di questa funzione e vengono scartati al ritorno.
 */
import { z } from 'zod';
import type { Config } from '../config.js';
import { emptyResponse } from '../http/responses.js';
import type { RequestContext } from '../http/types.js';
import { idTokenNonce } from './claims.js';
import {
  BASIC_SCHEME,
  BEARER_SCHEME,
  CREDENTIALS_SEPARATOR,
  FORM_CONTENT_TYPE,
  GET_METHOD,
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_METHOD_NOT_ALLOWED,
  HTTP_OK,
  HTTP_SERVICE_UNAVAILABLE,
  JSON_ACCEPT,
  OIDC_CALLBACK_PATH,
} from './constants.js';
import type { Discovery, OidcEndpoints } from './discovery.js';
import { OidcRejectedError, OidcUnavailableError } from './errors.js';
import { htmlPage } from './html.js';
import type { PendingLogins } from './pending.js';
import { readJsonOrRejected, sendOrUnavailable, type FetchLike } from './request.js';
import type { OidcIdentity, OidcPayload, OidcPurpose, PendingLogin } from './types.js';

export type ContinuationRunner = <P extends OidcPurpose>(
  purpose: P,
  payload: OidcPayload[P],
  identity: OidcIdentity,
  ctx: RequestContext,
) => Promise<Response>;

export type CallbackDeps = {
  readonly config: Config;
  readonly fetchImpl: FetchLike;
  readonly discovery: Discovery;
  readonly pending: PendingLogins;
  readonly runContinuation: ContinuationRunner;
};

/** Risposta del token endpoint: solo ciò che serve. Il refresh token non si chiede né si usa. */
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
});

type TokenResponse = z.infer<typeof tokenResponseSchema>;

/** Claim di userinfo: `groups` è obbligatorio, come da contratto (sezione 10.2). */
const userinfoSchema = z.object({
  sub: z.string().min(1),
  name: z.string().nullish(),
  email: z.string().nullish(),
  groups: z.array(z.string()),
});

type Session = {
  readonly identity: OidcIdentity;
  readonly groups: readonly string[];
};

const EXPIRED_TITLE = 'accesso scaduto';
const EXPIRED_MESSAGE = "accesso scaduto: riprova dall'inizio";
const REJECTED_TITLE = 'accesso non completato';
const REJECTED_MESSAGE = "accesso non completato: riprova dall'inizio";
const UNAVAILABLE_TITLE = 'servizio non disponibile';
const UNAVAILABLE_MESSAGE = 'servizio di accesso non disponibile, riprova tra poco';
const FORBIDDEN_TITLE = 'account non autorizzato';
const FORBIDDEN_MESSAGE = 'questo account non è abilitato a usare questo server WeBeep';

const callbackUri = (config: Config): string => `${config.publicUrl}${OIDC_CALLBACK_PATH}`;

/** Credenziali del client per `client_secret_basic` (RFC 6749 §2.3.1): ID e segreto codificati, poi base64. */
const basicCredentials = (clientId: string, clientSecret: string): string =>
  `${BASIC_SCHEME} ${btoa(`${encodeURIComponent(clientId)}${CREDENTIALS_SEPARATOR}${encodeURIComponent(clientSecret)}`)}`;

const exchangeCode = async (
  deps: CallbackDeps,
  endpoints: OidcEndpoints,
  login: PendingLogin,
  code: string,
): Promise<TokenResponse> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUri(deps.config),
    code_verifier: login.codeVerifier,
  });
  const response = await sendOrUnavailable(deps.fetchImpl, endpoints.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': FORM_CONTENT_TYPE,
      Accept: JSON_ACCEPT,
      Authorization: basicCredentials(deps.config.oidc.clientId, deps.config.oidc.clientSecret),
    },
    body: body.toString(),
  });
  if (response.status !== HTTP_OK) throw new OidcRejectedError();
  const parsed = tokenResponseSchema.safeParse(await readJsonOrRejected(response));
  if (!parsed.success) throw new OidcRejectedError();
  return parsed.data;
};

const fetchSession = async (deps: CallbackDeps, endpoints: OidcEndpoints, accessToken: string): Promise<Session> => {
  const response = await sendOrUnavailable(deps.fetchImpl, endpoints.userinfoEndpoint, {
    headers: { Accept: JSON_ACCEPT, Authorization: `${BEARER_SCHEME} ${accessToken}` },
  });
  if (response.status !== HTTP_OK) throw new OidcRejectedError();
  const parsed = userinfoSchema.safeParse(await readJsonOrRejected(response));
  if (!parsed.success) throw new OidcRejectedError();
  const { sub, name, email, groups } = parsed.data;
  return {
    identity: { sub, name: name ?? undefined, email: email ?? undefined },
    groups,
  };
};

/** Scambio del code, controllo del nonce, userinfo. Ogni rifiuto lancia un errore del modulo. */
const authenticate = async (deps: CallbackDeps, login: PendingLogin, code: string): Promise<Session> => {
  const endpoints = await deps.discovery.endpoints();
  const tokens = await exchangeCode(deps, endpoints, login, code);
  if (tokens.id_token !== undefined && idTokenNonce(tokens.id_token) !== login.nonce) throw new OidcRejectedError();
  return fetchSession(deps, endpoints, tokens.access_token);
};

/** Pagina per gli errori del login: 503 se Authentik non risponde, 400 se ha rifiutato. */
const failureResponse = (error: unknown): Response => {
  if (error instanceof OidcUnavailableError) {
    return htmlPage(HTTP_SERVICE_UNAVAILABLE, UNAVAILABLE_TITLE, UNAVAILABLE_MESSAGE);
  }
  if (error instanceof OidcRejectedError) return htmlPage(HTTP_BAD_REQUEST, REJECTED_TITLE, REJECTED_MESSAGE);
  throw error;
};

export type CallbackHandler = (request: Request, ctx: RequestContext) => Promise<Response>;

export const createCallbackHandler = (deps: CallbackDeps): CallbackHandler => {
  return async (request, ctx) => {
    if (request.method !== GET_METHOD) return emptyResponse(HTTP_METHOD_NOT_ALLOWED, { Allow: GET_METHOD });

    const params = new URL(request.url).searchParams;
    // Una sola occorrenza di `state`: un valore ripetuto non si sceglie, come in OAuth.
    const stateValues = params.getAll('state');
    const state = stateValues.length === 1 ? stateValues[0] : undefined;
    const login = state === undefined ? null : deps.pending.take(state, Date.now());
    if (login === null) return htmlPage(HTTP_BAD_REQUEST, EXPIRED_TITLE, EXPIRED_MESSAGE);

    // Authentik rifiuta o annulla: il valore di `error` non si mostra.
    const code = params.get('code');
    if (params.has('error') || code === null) {
      return htmlPage(HTTP_BAD_REQUEST, REJECTED_TITLE, REJECTED_MESSAGE);
    }

    let session: Session;
    try {
      session = await authenticate(deps, login, code);
    } catch (error) {
      return failureResponse(error);
    }

    if (!session.groups.includes(deps.config.oidc.allowedGroup)) {
      return htmlPage(HTTP_FORBIDDEN, FORBIDDEN_TITLE, FORBIDDEN_MESSAGE);
    }
    return deps.runContinuation(login.purpose, login.payload, session.identity, ctx);
  };
};
