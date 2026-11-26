/*
 * Router del nucleo: `handle(request, ctx)` di docs/SERVER.md.
 *
 * Ordine: corpo (limite 1 MB) → `/healthz` → `/pair` → OAuth (metadati, /register,
 * /authorize, /token, /revoke) → `/mcp` (metodo, poi token) → 404.
 * Non lancia mai: un errore imprevisto diventa 500 senza dettagli.
 */
import type { Config } from '../config.js';
import { createMcpHandler } from '../mcp/index.js';
import { createOAuth, type OAuth } from '../oauth/index.js';
import { createPair, type Pair } from '../pair.js';
import type { StateManager } from '../state/manager.js';
import { bufferRequestBody } from './body.js';
import { createRateLimiter } from './rate-limiter.js';
import { emptyResponse, errorResponse, jsonResponse, textResponse } from './responses.js';
import type { Handler, RequestContext } from './types.js';

export type AppDeps = {
  readonly config: Config;
  readonly store: StateManager;
};

export type App = {
  readonly handle: Handler;
};

const HEALTH_PATH = '/healthz';
const PAIR_PATH = '/pair';
const MCP_PATH = '/mcp';
const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';
const PAIR_METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'DELETE']);
const HEALTH_BODY = 'ok';
// 5 fallimenti in 15 minuti per IP, sia per /pair sia per la password di /authorize.
const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

export const createApp = (deps: AppDeps): App => {
  const { config, store } = deps;
  const pairRateLimiter = createRateLimiter({ windowMs: FAILURE_WINDOW_MS, max: MAX_FAILED_ATTEMPTS });
  const adminRateLimiter = createRateLimiter({ windowMs: FAILURE_WINDOW_MS, max: MAX_FAILED_ATTEMPTS });

  const oauth: OAuth = createOAuth({ config, store, rateLimiter: adminRateLimiter });
  const pair: Pair = createPair({ config, store, rateLimiter: pairRateLimiter, oauth });
  const mcp = createMcpHandler({ config, store });

  const handleMcp = async (request: Request): Promise<Response> => {
    // Il metodo si controlla prima del token: GET su /mcp è 405 anche senza credenziali.
    if (request.method !== 'POST') return emptyResponse(405, { Allow: 'POST' });
    const authorized = await oauth.verifyAccessToken(request.headers.get('authorization'));
    if (!authorized) {
      return emptyResponse(401, {
        'WWW-Authenticate': `Bearer resource_metadata="${config.publicUrl}${PROTECTED_RESOURCE_PATH}"`,
      });
    }
    return mcp.handle(request);
  };

  const route = async (request: Request, ctx: RequestContext): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === HEALTH_PATH) {
      return request.method === 'GET' ? textResponse(200, HEALTH_BODY) : emptyResponse(405, { Allow: 'GET' });
    }

    if (pathname === PAIR_PATH) {
      if (!PAIR_METHODS.has(request.method)) return emptyResponse(405, { Allow: 'GET, POST, DELETE' });
      return pair.handle(request, ctx);
    }

    const oauthResponse = await oauth.handle(request, ctx);
    if (oauthResponse !== null) return oauthResponse;

    if (pathname === MCP_PATH) return handleMcp(request);

    return emptyResponse(404);
  };

  const handle: Handler = async (request, ctx) => {
    try {
      const buffered = await bufferRequestBody(request);
      if (buffered === null) return jsonResponse(413, { error: 'payload_too_large' });
      return await route(buffered, ctx);
    } catch (error) {
      // Si registra solo il nome della classe dell'errore: mai messaggi o dati della richiesta.
      console.error(`errore interno: ${errorName(error)}`);
      return errorResponse(500, 'internal');
    }
  };

  return { handle };
};
