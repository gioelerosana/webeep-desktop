/*
 * `GET /authorize` e `POST /authorize` (docs/SERVER.md §5.3 e §5.4).
 *
 * Due classi di errore, come chiede la RFC 6749 §4.1.2.1:
 * - client o redirect_uri non validi: pagina di errore, MAI redirect (anti open redirect);
 * - tutto il resto: redirect 302 verso il redirect_uri registrato, con `error` e `state`.
 */
import { constantTimeEqual, randomBase64Url, sha256, sha256Hex } from '../crypto.js';
import {
  AUTHORIZATION_CODE_BYTES,
  AUTHORIZATION_CODE_TTL_MS,
  CODE_CHALLENGE_METHOD_S256,
  RESPONSE_TYPE_CODE,
} from './constants.js';
import type { OAuthContext, Route } from './context.js';
import { authorizePageResponse, errorPageResponse, type AuthorizePage, type HiddenField } from './html.js';
import { isPkceValue, isRepeated, singleValue } from './params.js';
import { redirectResponse } from './responses.js';
import { pruneExpired } from './tokens.js';
import { byMethod } from './route.js';

const RATE_LIMIT_WINDOW_MINUTES = 15;
const SINGLE_VALUED_PARAMS: readonly string[] = [
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'state',
  'resource',
];

type AuthorizeRequest = {
  readonly clientId: string;
  readonly clientName: string | undefined;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly resource: string | undefined;
  readonly state: string | undefined;
};

type AuthorizeCheck =
  | { readonly kind: 'ok'; readonly request: AuthorizeRequest }
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

const optionalField = (name: string, value: string | undefined): readonly HiddenField[] =>
  value === undefined ? [] : [[name, value]];

/** Campi nascosti del form: vengono rivalidati a ogni POST, perché il browser può manometterli. */
const pageFor = (request: AuthorizeRequest, errorMessage: string | undefined): AuthorizePage => ({
  clientName: request.clientName,
  fields: [
    ['client_id', request.clientId],
    ['redirect_uri', request.redirectUri],
    ['response_type', RESPONSE_TYPE_CODE],
    ['code_challenge', request.codeChallenge],
    ['code_challenge_method', CODE_CHALLENGE_METHOD_S256],
    ...optionalField('state', request.state),
    ...optionalField('resource', request.resource),
  ],
  redirectOrigin: new URL(request.redirectUri).origin,
  errorMessage,
});

const passwordMatches = async (ctx: OAuthContext, submitted: string): Promise<boolean> => {
  const [given, expected] = await Promise.all([sha256(submitted), sha256(ctx.config.adminPassword)]);
  return constantTimeEqual(given, expected);
};

const authorizeGet: Route = async (ctx, request) => {
  const check = await checkAuthorizeRequest(ctx, new URL(request.url).searchParams);
  if (check.kind !== 'ok') return rejectionResponse(check);
  return authorizePageResponse(200, pageFor(check.request, undefined));
};

const authorizePost: Route = async (ctx, request, requestContext) => {
  const params = new URLSearchParams(await request.text());
  const check = await checkAuthorizeRequest(ctx, params);
  if (check.kind !== 'ok') return rejectionResponse(check);
  const authorized = check.request;

  // Il limite si controlla prima della password: oltre la soglia non si confronta nulla.
  if (ctx.rateLimiter.isLimited(requestContext.clientIp)) {
    return errorPageResponse(
      429,
      'Accesso sospeso',
      `troppi tentativi: riprova tra ${RATE_LIMIT_WINDOW_MINUTES} minuti`,
    );
  }

  const password = singleValue(params, 'password') ?? '';
  if (!(await passwordMatches(ctx, password))) {
    ctx.rateLimiter.recordFailure(requestContext.clientIp);
    return authorizePageResponse(401, pageFor(authorized, 'password errata'));
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

  const location = new URL(authorized.redirectUri);
  location.searchParams.append('code', code);
  if (authorized.state !== undefined) location.searchParams.append('state', authorized.state);
  return redirectResponse(location.toString());
};

export const authorizeRoute: Route = byMethod([
  ['GET', authorizeGet],
  ['POST', authorizePost],
]);
