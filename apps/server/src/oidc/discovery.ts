/*
 * Discovery OIDC (docs/SERVER.md §10.1): endpoint letti da `<issuer>/.well-known/openid-configuration`.
 * Il risultato valido resta in memoria per la vita del processo. Un fallimento non viene
 * mai messo in cache: la chiamata successiva riprova.
 */
import { z } from 'zod';
import type { OidcConfig } from '../config.js';
import { normalizeIssuer } from '../config.js';
import { DISCOVERY_PATH, HTTPS_PROTOCOL, HTTP_OK, JSON_ACCEPT } from './constants.js';
import { OidcUnavailableError } from './errors.js';
import { sendOrUnavailable, type FetchLike } from './request.js';

export type OidcEndpoints = {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly userinfoEndpoint: string;
};

export type Discovery = {
  /** Endpoint validi, dalla cache o da una nuova discovery. Lancia `OidcUnavailableError` se non disponibili. */
  readonly endpoints: () => Promise<OidcEndpoints>;
};

const isHttpsUrl = (value: string): boolean => URL.canParse(value) && new URL(value).protocol === HTTPS_PROTOCOL;
const httpsUrlSchema = z.string().refine(isHttpsUrl);

/** Un corpo non JSON nella discovery è un documento non valido: la discovery è indisponibile. */
const readDiscoveryDocument = async (response: Response): Promise<unknown> => {
  try {
    const value: unknown = await response.json();
    return value;
  } catch {
    throw new OidcUnavailableError();
  }
};

const discoveryDocumentSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: httpsUrlSchema,
  token_endpoint: httpsUrlSchema,
  userinfo_endpoint: httpsUrlSchema,
});

export const createDiscovery = (config: OidcConfig, fetchImpl: FetchLike): Discovery => {
  let cached: OidcEndpoints | null = null;

  const fetchEndpoints = async (): Promise<OidcEndpoints> => {
    const response = await sendOrUnavailable(fetchImpl, `${config.issuer}${DISCOVERY_PATH}`, {
      headers: { Accept: JSON_ACCEPT },
    });
    if (response.status !== HTTP_OK) throw new OidcUnavailableError();

    const parsed = discoveryDocumentSchema.safeParse(await readDiscoveryDocument(response));
    if (!parsed.success) throw new OidcUnavailableError();
    // L'issuer del documento deve essere quello configurato: altrimenti il server parla con un altro provider.
    if (normalizeIssuer(parsed.data.issuer) !== config.issuer) throw new OidcUnavailableError();

    return {
      authorizationEndpoint: parsed.data.authorization_endpoint,
      tokenEndpoint: parsed.data.token_endpoint,
      userinfoEndpoint: parsed.data.userinfo_endpoint,
    };
  };

  return {
    endpoints: async () => {
      if (cached !== null) return cached;
      const fresh = await fetchEndpoints();
      cached = fresh;
      return fresh;
    },
  };
};
