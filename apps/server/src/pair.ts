/*
 * Accoppiamento del desktop (docs/SERVER.md §4, contratto v2): `GET /pair/start` avvia il
 * login Authentik e il dopo-login rilascia un codice monouso sul loopback; `POST /pair` lo
 * scambia (con PKCE) e restituisce il deviceToken; `GET` e `DELETE /pair` lo usano come Bearer.
 *
 * Il token WeBeep entra nel server solo da `POST /pair`. Nessun segreto condiviso: l'identità
 * è verificata da Authentik (sezione 10). Non si scrive nulla nei log: né token, né codici.
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
import { randomBase64Url, sha256, sha256Hex, toBase64Url, constantTimeEqual } from './crypto.js';
import { emptyResponse, errorResponse, jsonResponse } from './http/responses.js';
import type { RateLimiter } from './http/rate-limiter.js';
import type { RequestContext } from './http/types.js';
import { htmlPage } from './oidc/html.js';
import type { DesktopPairPayload, Oidc } from './oidc/index.js';
import type { OAuth } from './oauth/index.js';
import type { StateManager } from './state/manager.js';

export type PairDeps = {
  readonly config: Config;
  readonly store: StateManager;
  /** Contatore separato da quello OAuth: 5 codici errati in 15 minuti per IP. */
  readonly rateLimiter: RateLimiter;
  readonly oauth: OAuth;
  /** Login Authentik (docs/SERVER.md §10): avvia `/pair/start` e riceve la continuazione `desktop-pair`. */
  readonly oidc: Oidc;
};

export type Pair = {
  /** Gestisce `GET`, `POST` e `DELETE` di `/pair` (il router ha già scartato gli altri metodi). */
  readonly handle: (request: Request, ctx: RequestContext) => Promise<Response>;
  /** Gestisce `GET /pair/start` (il router ha già scartato gli altri metodi). */
  readonly start: (request: Request) => Promise<Response>;
};

const HTTP_NO_CONTENT = 204;
const HTTP_FOUND = 302;
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_UNAVAILABLE = 503;

const S256_METHOD = 'S256';
const PAIR_ALLOWED_METHODS = 'GET, POST, DELETE';
const CODE_BYTES = 32;
const DEVICE_TOKEN_BYTES = 32;
const MS_PER_SECOND = 1000;
// Codice di accoppiamento: 120 secondi, monouso (docs/SERVER.md §3.2).
const PAIRING_CODE_TTL_MS = 120 * MS_PER_SECOND;
const MIN_LOOPBACK_PORT = 1024;
const MAX_PORT = 65535;

const START_INVALID_TITLE = 'collegamento non valido';
const START_INVALID_MESSAGE = "richiesta di collegamento non valida: riprova dall'app desktop";

/*
 * Accetta: `http://127.0.0.1:4000/callback` (porta 1024-65535, senza zeri iniziali).
 * Non accetta: `http://localhost:4000/callback` (host diverso), `http://127.0.0.1:4000/callback?x=1`.
 * Esempio regex101: https://regex101.com/?regex=%5Ehttp%3A%5C%2F%5C%2F127%5C.0%5C.0%5C.1%3A(%5B1-9%5D%5Cd%7B0%2C4%7D)%5C%2Fcallback%24&flavor=javascript&testString=http%3A%2F%2F127.0.0.1%3A4000%2Fcallback
 */
const LOOPBACK_REDIRECT_PATTERN = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/callback$/;
/*
 * Accetta: stringhe base64url di 16-128 caratteri (lo `state` del desktop, 32 byte = 43 caratteri).
 * Non accetta: `abc` (troppo corto), `stato+con/caratteri` (fuori dall'alfabeto base64url).
 * Esempio regex101: https://regex101.com/?regex=%5E%5BA-Za-z0-9_-%5D%7B16%2C128%7D%24&flavor=javascript&testString=abcdefghijklmnop
 */
const STATE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
/*
 * Accetta: 43 caratteri base64url (il SHA-256 di un verifier in base64url).
 * Non accetta: 42 caratteri, o caratteri fuori dall'alfabeto base64url come `+` e `/`.
 * Esempio regex101: https://regex101.com/?regex=%5E%5BA-Za-z0-9_-%5D%7B43%7D%24&flavor=javascript&testString=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
 */
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/*
 * Accetta: 43-128 caratteri dell'insieme RFC 7636 (lettere, cifre, `-._~`).
 * Non accetta: 42 caratteri, o caratteri come `+`, `/`, `=` e spazi.
 * Esempio regex101: https://regex101.com/?regex=%5E%5BA-Za-z0-9._~-%5D%7B43%2C128%7D%24&flavor=javascript&testString=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
 */
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
/*
 * Accetta: `Bearer ab_-CD12` (token in base64url dopo lo schema).
 * Non accetta: `Basic ab_-CD12` (altro schema), `Bearer ab cd` (spazio nel token).
 * Esempio regex101: https://regex101.com/?regex=%5EBearer%20(%5BA-Za-z0-9_-%5D%2B)%24&flavor=javascript&testString=Bearer%20ab_-CD12
 */
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+)$/;

const isLoopbackRedirectUri = (value: string): boolean => {
  const match = LOOPBACK_REDIRECT_PATTERN.exec(value);
  if (match === null) return false;
  const port = Number(match[1]);
  return port >= MIN_LOOPBACK_PORT && port <= MAX_PORT;
};

const startQuerySchema = z.object({
  redirect_uri: z.string().refine(isLoopbackRedirectUri),
  state: z.string().regex(STATE_PATTERN),
  code_challenge: z.string().regex(CODE_CHALLENGE_PATTERN),
  code_challenge_method: z.literal(S256_METHOD),
});

const pairBodySchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().regex(CODE_VERIFIER_PATTERN),
  siteUrl: z.literal(WEBEEP_SITE_URL),
  token: z.string().min(1),
  privateToken: z.string().optional(),
});

type PairBody = z.infer<typeof pairBodySchema>;

type PairingCode = {
  readonly codeChallenge: string;
  /** Millisecondi epoch. */
  readonly expiresAt: number;
};

// Un parametro ripetuto non è valido: restituisce il valore solo se è unico.
const singleParam = (params: URLSearchParams, name: string): string | undefined => {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : undefined;
};

const startQueryOf = (request: Request): Record<string, string | undefined> => {
  const params = new URL(request.url).searchParams;
  return {
    redirect_uri: singleParam(params, 'redirect_uri'),
    state: singleParam(params, 'state'),
    code_challenge: singleParam(params, 'code_challenge'),
    code_challenge_method: singleParam(params, 'code_challenge_method'),
  };
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

const sameDigest = (left: string, right: string): boolean => {
  const encoder = new TextEncoder();
  return constantTimeEqual(encoder.encode(left), encoder.encode(right));
};

export const createPair = (deps: PairDeps): Pair => {
  const { store, rateLimiter, oauth, oidc } = deps;
  // Codici di accoppiamento in memoria: chiave SHA-256 del codice, mai il codice in chiaro.
  const codes = new Map<string, PairingCode>();

  const pruneExpiredCodes = (now: number): void => {
    codes.forEach((entry, key) => {
      if (entry.expiresAt <= now) codes.delete(key);
    });
  };

  // Dopo il login Authentik: crea il codice monouso e rimanda il browser al loopback del desktop.
  const issueCode = async (payload: DesktopPairPayload): Promise<Response> => {
    const code = randomBase64Url(CODE_BYTES);
    const now = Date.now();
    pruneExpiredCodes(now);
    codes.set(await sha256Hex(code), { codeChallenge: payload.codeChallenge, expiresAt: now + PAIRING_CODE_TTL_MS });
    const location = new URL(payload.redirectUri);
    location.searchParams.set('code', code);
    location.searchParams.set('state', payload.state);
    return emptyResponse(HTTP_FOUND, { Location: location.toString() });
  };
  oidc.registerContinuation('desktop-pair', issueCode);

  // Il codice si consuma al primo tentativo, anche se la verifica PKCE fallisce.
  const redeemCode = async (code: string, codeVerifier: string): Promise<boolean> => {
    const key = await sha256Hex(code);
    const entry = codes.get(key);
    codes.delete(key);
    if (entry === undefined || entry.expiresAt <= Date.now()) return false;
    const challenge = toBase64Url(await sha256(codeVerifier));
    return sameDigest(challenge, entry.codeChallenge);
  };

  // Sostituisce la sessione WeBeep, salva l'hash del deviceToken e revoca ciò che Claude aveva ottenuto.
  const replaceSession = async (body: PairBody, deviceTokenHash: string): Promise<void> => {
    await store.update((state) => ({
      ...state,
      webeep: { siteUrl: WEBEEP_SITE_URL, token: body.token, privateToken: body.privateToken },
      deviceTokenHash,
    }));
    await oauth.revokeAll();
  };

  // Pulizia comune a `DELETE /pair` e alla revoca da parte di WeBeep: sessione, dispositivo, token OAuth.
  const clearPairing = async (): Promise<void> => {
    await store.update((state) => ({ ...state, webeep: null, deviceTokenHash: null }));
    await oauth.revokeAll();
  };

  const verifyToken = (token: string): Promise<SiteInfo> =>
    getSiteInfo(createMoodleClient({ siteUrl: WEBEEP_SITE_URL, token }));

  const isDeviceAuthorized = async (request: Request): Promise<boolean> => {
    const { deviceTokenHash } = await store.read();
    if (deviceTokenHash === null) return false;
    const match = BEARER_PATTERN.exec(request.headers.get('authorization') ?? '');
    const presented = match?.[1];
    if (presented === undefined) return false;
    return sameDigest(await sha256Hex(presented), deviceTokenHash);
  };

  const postPair = async (request: Request, ctx: RequestContext): Promise<Response> => {
    if (rateLimiter.isLimited(ctx.clientIp)) return errorResponse(HTTP_TOO_MANY_REQUESTS, 'too_many_attempts');

    const parsed = pairBodySchema.safeParse(await readJson(request));
    if (!parsed.success) return errorResponse(HTTP_BAD_REQUEST, 'invalid_body');

    if (!(await redeemCode(parsed.data.code, parsed.data.codeVerifier))) {
      rateLimiter.recordFailure(ctx.clientIp);
      return errorResponse(HTTP_UNAUTHORIZED, 'invalid_code');
    }

    try {
      const info = await verifyToken(parsed.data.token);
      const deviceToken = randomBase64Url(DEVICE_TOKEN_BYTES);
      await replaceSession(parsed.data, await sha256Hex(deviceToken));
      return jsonResponse(HTTP_OK, { fullName: info.fullname, siteUrl: WEBEEP_SITE_URL, deviceToken });
    } catch (error) {
      if (error instanceof MoodleApiError) return errorResponse(HTTP_UNPROCESSABLE, 'token_rejected');
      if (error instanceof MoodleNetworkError) return errorResponse(HTTP_UNAVAILABLE, 'webeep_unreachable');
      throw error;
    }
  };

  const getPair = async (): Promise<Response> => {
    const state = await store.read();
    if (state.webeep === null) return jsonResponse(HTTP_OK, { paired: false });

    try {
      const info = await verifyToken(state.webeep.token);
      return jsonResponse(HTTP_OK, { paired: true, fullName: info.fullname });
    } catch (error) {
      if (error instanceof MoodleApiError) {
        await clearPairing();
        return jsonResponse(HTTP_OK, { paired: false });
      }
      if (error instanceof MoodleNetworkError) return jsonResponse(HTTP_OK, { paired: true });
      throw error;
    }
  };

  const deletePair = async (): Promise<Response> => {
    await clearPairing();
    return emptyResponse(HTTP_NO_CONTENT);
  };

  const handle = async (request: Request, ctx: RequestContext): Promise<Response> => {
    if (request.method === 'POST') return postPair(request, ctx);
    if (!(await isDeviceAuthorized(request))) return errorResponse(HTTP_UNAUTHORIZED, 'unauthorized');
    if (request.method === 'GET') return getPair();
    if (request.method === 'DELETE') return deletePair();
    return emptyResponse(HTTP_METHOD_NOT_ALLOWED, { Allow: PAIR_ALLOWED_METHODS });
  };

  const start = async (request: Request): Promise<Response> => {
    const parsed = startQuerySchema.safeParse(startQueryOf(request));
    // Nessun redirect verso un redirect_uri non valido: la pagina d'errore è l'unica risposta.
    if (!parsed.success) return htmlPage(HTTP_BAD_REQUEST, START_INVALID_TITLE, START_INVALID_MESSAGE);
    return oidc.startLogin('desktop-pair', {
      redirectUri: parsed.data.redirect_uri,
      state: parsed.data.state,
      codeChallenge: parsed.data.code_challenge,
    });
  };

  return { handle, start };
};
