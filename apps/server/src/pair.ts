/*
 * Accoppiamento: `GET`, `POST` e `DELETE /pair` (docs/SERVER.md §4).
 *
 * Il token WeBeep entra nel server solo da qui. Ogni richiesta passa, in ordine, da:
 * rate limit (429), chiave Bearer (401), metodo. Un tentativo fallito (401 o 422) conta
 * nel rate limit; gli altri esiti no.
 */
import {
  createMoodleClient,
  getSiteInfo,
  MoodleApiError,
  MoodleNetworkError,
  WEBEEP_SITE_URL,
  type SiteInfo,
} from '@webeep/moodle-api';
import { z } from 'zod';
import type { Config } from './config.js';
import { constantTimeEqual, sha256 } from './crypto.js';
import { emptyResponse, errorResponse, jsonResponse } from './http/responses.js';
import type { RateLimiter } from './http/rate-limiter.js';
import type { RequestContext } from './http/types.js';
import type { OAuth } from './oauth/index.js';
import type { StateManager } from './state/manager.js';

export type PairDeps = {
  readonly config: Config;
  readonly store: StateManager;
  /** Contatore separato da quello OAuth: 5 fallimenti in 15 minuti per IP. */
  readonly rateLimiter: RateLimiter;
  readonly oauth: OAuth;
};

export type Pair = {
  /** Gestisce `/pair` (il router ha già scartato i metodi non ammessi). */
  readonly handle: (request: Request, ctx: RequestContext) => Promise<Response>;
};

const BEARER_SCHEME = 'bearer';
const AUTHORIZATION_SEPARATOR = ' ';

const pairBodySchema = z.object({
  siteUrl: z.literal(WEBEEP_SITE_URL),
  token: z.string().min(1),
  privateToken: z.string().optional(),
});

type PairBody = z.infer<typeof pairBodySchema>;

/** Valore del Bearer, con schema case-insensitive; null se header assente o malformato. */
const parseBearer = (header: string | null): string | null => {
  if (header === null) return null;
  const [scheme, value, ...rest] = header.trim().split(AUTHORIZATION_SEPARATOR);
  if (scheme === undefined || value === undefined || rest.length > 0) return null;
  return scheme.toLowerCase() === BEARER_SCHEME && value.length > 0 ? value : null;
};

// Corpo non JSON: è un 400, quindi il valore nullo porta a `invalid_body`.
const readJson = async (request: Request): Promise<unknown> => {
  try {
    const value: unknown = await request.json();
    return value;
  } catch {
    return null;
  }
};

export const createPair = (deps: PairDeps): Pair => {
  const { config, store, rateLimiter, oauth } = deps;

  const isAuthorized = async (request: Request): Promise<boolean> => {
    const presented = parseBearer(request.headers.get('authorization'));
    if (presented === null) return false;
    const [presentedDigest, expectedDigest] = await Promise.all([sha256(presented), sha256(config.pairingKey)]);
    return constantTimeEqual(presentedDigest, expectedDigest);
  };

  // Sostituisce la sessione WeBeep e revoca ciò che Claude aveva ottenuto con la vecchia.
  const replaceSession = async (body: PairBody): Promise<void> => {
    await store.update((state) => ({
      ...state,
      webeep: { siteUrl: WEBEEP_SITE_URL, token: body.token, privateToken: body.privateToken },
    }));
    await oauth.revokeAll();
  };

  const clearSession = async (): Promise<void> => {
    await store.update((state) => ({ ...state, webeep: null }));
    await oauth.revokeAll();
  };

  const verifyToken = (token: string): Promise<SiteInfo> =>
    getSiteInfo(createMoodleClient({ siteUrl: WEBEEP_SITE_URL, token }));

  const postPair = async (request: Request, ctx: RequestContext): Promise<Response> => {
    const parsed = pairBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return errorResponse(400, 'invalid_body');

    try {
      const info = await verifyToken(parsed.data.token);
      await replaceSession(parsed.data);
      return jsonResponse(200, { fullName: info.fullname, siteUrl: WEBEEP_SITE_URL });
    } catch (error) {
      if (error instanceof MoodleApiError) {
        rateLimiter.recordFailure(ctx.clientIp);
        return errorResponse(422, 'token_rejected');
      }
      if (error instanceof MoodleNetworkError) return errorResponse(503, 'webeep_unreachable');
      throw error;
    }
  };

  const getPair = async (): Promise<Response> => {
    const state = await store.read();
    if (state.webeep === null) return jsonResponse(200, { paired: false });

    try {
      const info = await verifyToken(state.webeep.token);
      return jsonResponse(200, { paired: true, fullName: info.fullname });
    } catch (error) {
      if (error instanceof MoodleApiError) {
        await clearSession();
        return jsonResponse(200, { paired: false });
      }
      if (error instanceof MoodleNetworkError) return jsonResponse(200, { paired: true });
      throw error;
    }
  };

  const deletePair = async (): Promise<Response> => {
    await clearSession();
    return emptyResponse(204);
  };

  const handle = async (request: Request, ctx: RequestContext): Promise<Response> => {
    if (rateLimiter.isLimited(ctx.clientIp)) return errorResponse(429, 'too_many_attempts');

    if (!(await isAuthorized(request))) {
      rateLimiter.recordFailure(ctx.clientIp);
      return errorResponse(401, 'unauthorized');
    }

    if (request.method === 'GET') return getPair();
    if (request.method === 'DELETE') return deletePair();
    if (request.method === 'POST') return postPair(request, ctx);
    return emptyResponse(405, { Allow: 'GET, POST, DELETE' });
  };

  return { handle };
};
