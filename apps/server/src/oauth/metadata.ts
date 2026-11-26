/*
 * Metadati di scoperta: RFC 9728 (risorsa protetta) e RFC 8414 (authorization server).
 * I nomi dei campi sono quelli della RFC (docs/SERVER.md §5.1).
 */
import { jsonResponse } from '../http/responses.js';
import {
  CODE_CHALLENGE_METHOD_S256,
  GRANT_AUTHORIZATION_CODE,
  GRANT_REFRESH_TOKEN,
  RESPONSE_TYPE_CODE,
  TOKEN_AUTH_METHOD_NONE,
} from './constants.js';
import type { Route } from './context.js';
import { byMethod } from './route.js';

const BEARER_METHOD_HEADER = 'header';

const protectedResourceRoute: Route = async (ctx) =>
  jsonResponse(200, {
    resource: ctx.config.resourceUrl,
    authorization_servers: [ctx.config.publicUrl],
    bearer_methods_supported: [BEARER_METHOD_HEADER],
  });

const authorizationServerRoute: Route = async (ctx) => {
  const base = ctx.config.publicUrl;
  return jsonResponse(200, {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    response_types_supported: [RESPONSE_TYPE_CODE],
    grant_types_supported: [GRANT_AUTHORIZATION_CODE, GRANT_REFRESH_TOKEN],
    code_challenge_methods_supported: [CODE_CHALLENGE_METHOD_S256],
    token_endpoint_auth_methods_supported: [TOKEN_AUTH_METHOD_NONE],
  });
};

export const protectedResourceMetadataRoute: Route = byMethod([['GET', protectedResourceRoute]]);
export const authorizationServerMetadataRoute: Route = byMethod([['GET', authorizationServerRoute]]);
