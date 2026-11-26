/*
 * `POST /token` e `POST /revoke` (docs/SERVER.md §5.5 e §5.6). Gli errori seguono
 * RFC 6749 §5.2; ogni risposta porta `Cache-Control: no-store`.
 */
import { sha256, sha256Hex, toBase64Url } from '../crypto.js';
import { emptyResponse, jsonResponse } from '../http/responses.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  GRANT_AUTHORIZATION_CODE,
  GRANT_REFRESH_TOKEN,
  TOKEN_TYPE_BEARER,
} from './constants.js';
import type { OAuthContext, Route } from './context.js';
import { isPkceValue, singleValue } from './params.js';
import { oauthError } from './responses.js';
import { byMethod } from './route.js';
import { issueAccessToken, issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from './tokens.js';

const PRAGMA_NO_CACHE = 'no-cache';

const tokenResponse = (accessToken: string, refreshToken: string): Response =>
  jsonResponse(
    200,
    {
      access_token: accessToken,
      token_type: TOKEN_TYPE_BEARER,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
    },
    { Pragma: PRAGMA_NO_CACHE },
  );

const exchangeAuthorizationCode = async (
  ctx: OAuthContext,
  params: URLSearchParams,
  clientId: string,
): Promise<Response> => {
  const code = singleValue(params, 'code');
  const redirectUri = singleValue(params, 'redirect_uri');
  const verifier = singleValue(params, 'code_verifier');
  if (code === undefined || redirectUri === undefined || verifier === undefined) {
    return oauthError(400, 'invalid_request', 'parametri mancanti o ripetuti');
  }

  const codeHash = await sha256Hex(code);
  const record = ctx.codes.get(codeHash);
  // Il codice è monouso: esce dalla memoria subito, anche se i controlli seguenti falliscono.
  ctx.codes.delete(codeHash);
  if (record === undefined || record.expiresAt <= Date.now()) {
    return oauthError(400, 'invalid_grant', 'codice non valido o scaduto');
  }
  if (record.clientId !== clientId || record.redirectUri !== redirectUri) {
    return oauthError(400, 'invalid_grant', 'codice emesso per un altro client o redirect_uri');
  }
  // PKCE S256: base64url(SHA-256(code_verifier)) deve dare il code_challenge della richiesta.
  const challenge = isPkceValue(verifier) ? toBase64Url(await sha256(verifier)) : null;
  if (challenge !== record.codeChallenge) {
    return oauthError(400, 'invalid_grant', 'code_verifier non corrisponde al code_challenge');
  }

  const refreshToken = await issueRefreshToken(ctx, clientId);
  const accessToken = await issueAccessToken(ctx, clientId);
  return tokenResponse(accessToken, refreshToken);
};

const refreshWithToken = async (ctx: OAuthContext, params: URLSearchParams, clientId: string): Promise<Response> => {
  const presented = singleValue(params, 'refresh_token');
  if (presented === undefined) return oauthError(400, 'invalid_request', 'refresh_token mancante o ripetuto');

  const next = await rotateRefreshToken(ctx, await sha256Hex(presented), clientId);
  if (next === null) {
    return oauthError(400, 'invalid_grant', 'refresh token non valido, scaduto o già usato');
  }
  const accessToken = await issueAccessToken(ctx, clientId);
  return tokenResponse(accessToken, next);
};

const tokenRoute: Route = async (ctx, request) => {
  const params = new URLSearchParams(await request.text());
  const grantType = singleValue(params, 'grant_type');
  if (grantType === undefined) return oauthError(400, 'invalid_request', 'grant_type mancante o ripetuto');
  if (grantType !== GRANT_AUTHORIZATION_CODE && grantType !== GRANT_REFRESH_TOKEN) {
    return oauthError(400, 'unsupported_grant_type', 'grant_type non supportato');
  }

  const clientId = singleValue(params, 'client_id');
  if (clientId === undefined) return oauthError(400, 'invalid_request', 'client_id mancante o ripetuto');
  const state = await ctx.store.read();
  if (!state.clients.some((client) => client.clientId === clientId)) {
    return oauthError(401, 'invalid_client', 'client sconosciuto');
  }

  if (grantType === GRANT_AUTHORIZATION_CODE) return exchangeAuthorizationCode(ctx, params, clientId);
  return refreshWithToken(ctx, params, clientId);
};

/**
 * Revoca (RFC 7009). `token_type_hint` non serve: il token si cerca sia tra i refresh token
 * sia tra gli access token, e la risposta è 200 anche se non esiste (§2.2).
 */
const revokeRoute: Route = async (ctx, request) => {
  const params = new URLSearchParams(await request.text());
  const token = singleValue(params, 'token');
  if (token === undefined || token.length === 0) return oauthError(400, 'invalid_request', 'token mancante');

  const hash = await sha256Hex(token);
  ctx.accessTokens.delete(hash);
  await revokeRefreshToken(ctx, hash);
  return emptyResponse(200);
};

export const tokenEndpointRoute: Route = byMethod([['POST', tokenRoute]]);
export const revokeEndpointRoute: Route = byMethod([['POST', revokeRoute]]);
