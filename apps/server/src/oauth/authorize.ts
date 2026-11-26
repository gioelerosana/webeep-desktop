/*
 * `GET /authorize` (docs/SERVER.md §5.3) e `POST /authorize/consent` (§5.4).
 *
 * Due classi di errore, come chiede la RFC 6749 §4.1.2.1:
 * - client o redirect_uri non validi: pagina di errore, MAI redirect (anti open redirect);
 * - tutto il resto: redirect 302 verso il redirect_uri registrato, con `error` e `state`.
 *
 * Flusso: `/authorize` valida e avvia il login Authentik (purpose `claude-authorize`). Dopo il
 * login, la continuazione mostra la pagina di consenso con un token CSRF monouso. Solo il POST
 * del consenso, con quel token e `decision=allow`, emette il codice di autorizzazione.
 */
import type { ClaudeAuthorizePayload, OidcContinuation, OidcIdentity } from '../oidc/index.js';
import { randomBase64Url, sha256Hex } from '../crypto.js';
import {
  AUTHORIZATION_CODE_BYTES,
  AUTHORIZATION_CODE_TTL_MS,
  CODE_CHALLENGE_METHOD_S256,
  CONSENT_TOKEN_BYTES,
  CONSENT_TTL_MS,
  DECISION_ALLOW,
  DECISION_DENY,
  ERROR_ACCESS_DENIED,
  RESPONSE_TYPE_CODE,
} from './constants.js';
import type { OAuthContext, Route } from './context.js';
import { consentPageResponse, errorPageResponse } from './html.js';
import { isPkceValue, isRepeated, singleValue } from './params.js';
import { redirectResponse } from './responses.js';
import { pruneExpired } from './tokens.js';
import { byMethod } from './route.js';

const SINGLE_VALUED_PARAMS: readonly string[] = [
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'state',
  'resource',
];

const UNNAMED_USER = 'utente Authentik';
const CONSENT_EXPIRED_MESSAGE = 'richiesta scaduta: riprova il collegamento da Claude';
const INVALID_DECISION_MESSAGE = 'richiesta non valida: riprova il collegamento da Claude';
const ACCESS_DENIED_DESCRIPTION = "l'utente ha negato l'accesso";

type AuthorizeCheck =
  | { readonly kind: 'ok'; readonly request: ClaudeAuthorizePayload }
  | { readonly kind: 'unregistered' }
  | {
      readonly kind: 'redirect-error';
      readonly redirectUri: string;
      readonly state: string | undefined;
      readonly error: string;
      readonly description: string;
    };

/** Valida i parametri nell'ordine di docs/SERVER.md §5.3. */
const checkAuthorizeRequest = async (ctx: OAuthContext, params: URLSearchParams): Promise<AuthorizeCheck> => {
  const clientId = singleValue(params, 'client_id');
  const redirectUri = singleValue(params, 'redirect_uri');
  if (clientId === undefined || redirectUri === undefined) return { kind: 'unregistered' };

  const state = await ctx.store.read();
  const client = state.clients.find((candidate) => candidate.clientId === clientId);
  if (client === undefined || !client.redirectUris.includes(redirectUri)) return { kind: 'unregistered' };

  const stateValue = singleValue(params, 'state');
  const redirectError = (error: string, description: string): AuthorizeCheck => ({
    kind: 'redirect-error',
    redirectUri,
    state: stateValue,
    error,
    description,
  });

  if (SINGLE_VALUED_PARAMS.some((name) => isRepeated(params, name))) {
    return redirectError('invalid_request', 'parametro ripetuto');
  }
  const responseType = singleValue(params, 'response_type');
  if (responseType === undefined) return redirectError('invalid_request', 'response_type mancante');
  if (responseType !== RESPONSE_TYPE_CODE) {
    return redirectError('unsupported_response_type', 'è supportato solo response_type=code');
  }
  const codeChallenge = singleValue(params, 'code_challenge');
  if (codeChallenge === undefined || !isPkceValue(codeChallenge)) {
    return redirectError('invalid_request', 'code_challenge mancante o non valido');
  }
  if (singleValue(params, 'code_challenge_method') !== CODE_CHALLENGE_METHOD_S256) {
    return redirectError('invalid_request', 'code_challenge_method deve essere S256');
  }
  const resource = singleValue(params, 'resource');
  if (resource !== undefined && resource !== ctx.config.resourceUrl) {
    return redirectError('invalid_target', 'resource non corrisponde a questo server');
  }

  return {
    kind: 'ok',
    request: { clientId, clientName: client.clientName, redirectUri, codeChallenge, resource, state: stateValue },
  };
};

const rejectionResponse = (check: Exclude<AuthorizeCheck, { readonly kind: 'ok' }>): Response => {
  if (check.kind === 'unregistered') {
    return errorPageResponse(
      400,
      'Richiesta non valida',
      "Il client o l'indirizzo di ritorno non sono registrati. L'autorizzazione non può proseguire.",
    );
  }
  const location = new URL(check.redirectUri);
  location.searchParams.append('error', check.error);
  location.searchParams.append('error_description', check.description);
  if (check.state !== undefined) location.searchParams.append('state', check.state);
  return redirectResponse(location.toString());
};

/** Redirect verso il redirect_uri registrato con i campi dati e, se presente, `state`. */
const redirectWithFields = (
  params: ClaudeAuthorizePayload,
  fields: readonly (readonly [name: string, value: string])[],
): Response => {
  const location = new URL(params.redirectUri);
  fields.forEach(([name, value]) => location.searchParams.append(name, value));
  if (params.state !== undefined) location.searchParams.append('state', params.state);
  return redirectResponse(location.toString());
};

/** Nome mostrato nel consenso: quello Authentik, altrimenti l'email, altrimenti un testo di ripiego. */
const userLabel = (identity: OidcIdentity): string => identity.name ?? identity.email ?? UNNAMED_USER;

/**
 * Continuazione del login `claude-authorize` (docs/SERVER.md §10.2, passo 9): salva i parametri
 * validati sotto un token CSRF monouso e mostra la pagina di consenso.
 */
export const createConsentContinuation =
  (ctx: OAuthContext): OidcContinuation<'claude-authorize'> =>
  async (payload, identity) => {
    const consentToken = randomBase64Url(CONSENT_TOKEN_BYTES);
    const now = Date.now();
    pruneExpired(ctx.consents, now);
    ctx.consents.set(consentToken, { params: payload, expiresAt: now + CONSENT_TTL_MS });
    return consentPageResponse(200, {
      clientName: payload.clientName,
      redirectHost: new URL(payload.redirectUri).host,
      userLabel: userLabel(identity),
      consentToken,
      redirectOrigin: new URL(payload.redirectUri).origin,
    });
  };

const authorizeGet: Route = async (ctx, request) => {
  const check = await checkAuthorizeRequest(ctx, new URL(request.url).searchParams);
  if (check.kind !== 'ok') return rejectionResponse(check);
  return ctx.oidc.startLogin('claude-authorize', check.request);
};

/**
 * Risposta al consenso (docs/SERVER.md §5.4). Il token è monouso: la voce esce dalla memoria
 * in ogni caso, anche se scaduta o con una decisione non valida.
 */
const consentPost: Route = async (ctx, request) => {
  const params = new URLSearchParams(await request.text());
  const token = singleValue(params, 'consent');
  const record = token === undefined ? undefined : ctx.consents.get(token);
  if (token !== undefined) ctx.consents.delete(token);
  if (record === undefined || record.expiresAt <= Date.now()) {
    return errorPageResponse(400, 'Richiesta scaduta', CONSENT_EXPIRED_MESSAGE);
  }

  const decision = singleValue(params, 'decision');
  if (decision !== DECISION_ALLOW && decision !== DECISION_DENY) {
    return errorPageResponse(400, 'Richiesta non valida', INVALID_DECISION_MESSAGE);
  }

  const authorized = record.params;
  if (decision === DECISION_DENY) {
    return redirectWithFields(authorized, [
      ['error', ERROR_ACCESS_DENIED],
      ['error_description', ACCESS_DENIED_DESCRIPTION],
    ]);
  }

  const code = randomBase64Url(AUTHORIZATION_CODE_BYTES);
  const codeHash = await sha256Hex(code);
  const now = Date.now();
  pruneExpired(ctx.codes, now);
  ctx.codes.set(codeHash, {
    clientId: authorized.clientId,
    redirectUri: authorized.redirectUri,
    codeChallenge: authorized.codeChallenge,
    resource: authorized.resource,
    expiresAt: now + AUTHORIZATION_CODE_TTL_MS,
  });
  return redirectWithFields(authorized, [['code', code]]);
};

export const authorizeRoute: Route = byMethod([['GET', authorizeGet]]);
export const consentRoute: Route = byMethod([['POST', consentPost]]);
