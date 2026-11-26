/*
 * `POST /register` (RFC 7591, docs/SERVER.md §5.2). Endpoint aperto: la protezione è la
 * password di `/authorize`. Al ventunesimo client si eliminano i più vecchi, con i loro
 * refresh token e i loro access token in memoria.
 */
import { z } from 'zod';
import { randomBase64Url } from '../crypto.js';
import { jsonResponse } from '../http/responses.js';
import type { OAuthClient } from '../state/schema.js';
import {
  CLIENT_ID_BYTES,
  GRANT_AUTHORIZATION_CODE,
  GRANT_REFRESH_TOKEN,
  HTTP_PROTOCOL,
  HTTPS_PROTOCOL,
  LOOPBACK_HOSTS,
  MAX_CLIENT_NAME_LENGTH,
  MAX_REDIRECT_URIS,
  MAX_REGISTERED_CLIENTS,
  MS_PER_SECOND,
  RESPONSE_TYPE_CODE,
  TOKEN_AUTH_METHOD_NONE,
} from './constants.js';
import type { Route } from './context.js';
import { readJsonBody } from './params.js';
import { oauthError } from './responses.js';

const registrationSchema = z.object({
  client_name: z.string().max(MAX_CLIENT_NAME_LENGTH).optional(),
  redirect_uris: z.array(z.string()).min(1).max(MAX_REDIRECT_URIS),
  token_endpoint_auth_method: z.literal(TOKEN_AUTH_METHOD_NONE).optional(),
  grant_types: z.array(z.enum([GRANT_AUTHORIZATION_CODE, GRANT_REFRESH_TOKEN])).optional(),
  response_types: z.array(z.literal(RESPONSE_TYPE_CODE)).optional(),
});

/**
 * Un redirect_uri è ammesso se è assoluto, senza frammento, e: https, oppure http verso
 * localhost o 127.0.0.1 (qualsiasi porta).
 */
const isAllowedRedirectUri = (value: string): boolean => {
  if (!URL.canParse(value) || value.includes('#')) return false;
  const url = new URL(value);
  if (url.protocol === HTTPS_PROTOCOL) return true;
  return url.protocol === HTTP_PROTOCOL && LOOPBACK_HOSTS.has(url.hostname);
};

/** Nome senza spazi ai bordi; vuoto diventa assente. */
const normalizeName = (name: string | undefined): string | undefined => {
  const trimmed = name?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

export const registerRoute: Route = async (ctx, request) => {
  const parsed = registrationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return oauthError(400, 'invalid_client_metadata', 'metadati di registrazione non validi');
  const body = parsed.data;
  if (!body.redirect_uris.every(isAllowedRedirectUri)) {
    return oauthError(
      400,
      'invalid_redirect_uri',
      'redirect_uri non ammesso: serve https, oppure http su localhost o 127.0.0.1, senza frammento',
    );
  }

  const now = Date.now();
  const clientId = randomBase64Url(CLIENT_ID_BYTES);
  const clientName = normalizeName(body.client_name);
  const client: OAuthClient = { clientId, clientName, redirectUris: body.redirect_uris, createdAt: now };

  // Ids dei client eliminati per superare il tetto: serve dopo l'update per ripulire la memoria.
  const evicted: string[] = [];
  await ctx.store.update((state) => {
    const clients = [...state.clients, client].sort((left, right) => left.createdAt - right.createdAt);
    const removedCount = Math.max(0, clients.length - MAX_REGISTERED_CLIENTS);
    clients.slice(0, removedCount).forEach((removed) => evicted.push(removed.clientId));
    return {
      ...state,
      clients: clients.slice(removedCount),
      refreshTokens: state.refreshTokens.filter((record) => !evicted.includes(record.clientId)),
    };
  });
  ctx.accessTokens.forEach((record, hash) => {
    if (evicted.includes(record.clientId)) ctx.accessTokens.delete(hash);
  });

  return jsonResponse(201, {
    client_id: clientId,
    client_id_issued_at: Math.floor(now / MS_PER_SECOND),
    client_name: clientName,
    redirect_uris: body.redirect_uris,
    token_endpoint_auth_method: TOKEN_AUTH_METHOD_NONE,
    grant_types: body.grant_types ?? [GRANT_AUTHORIZATION_CODE, GRANT_REFRESH_TOKEN],
    response_types: body.response_types ?? [RESPONSE_TYPE_CODE],
  });
};
