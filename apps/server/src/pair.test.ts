import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSiteInfo,
  MoodleApiError,
  MoodleNetworkError,
  type SiteInfo,
} from '@webeep/moodle-api';
import { loadConfig, type Config } from './config.js';
import { randomBase64Url, sha256, sha256Hex, toBase64Url } from './crypto.js';
import { createPair, type Pair } from './pair.js';
import { createRateLimiter } from './http/rate-limiter.js';
import type { OAuth } from './oauth/index.js';
import type { Oidc, OidcContinuation, OidcIdentity, OidcPayload, OidcPurpose } from './oidc/index.js';
import { createStateManager, type StateManager } from './state/manager.js';
import type { StateStore } from './state/store.js';

// Solo `getSiteInfo` è finta: il resto di moodle-api (errori, costanti) resta reale.
vi.mock('@webeep/moodle-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@webeep/moodle-api')>();
  return { ...actual, getSiteInfo: vi.fn() };
});

const WEBEEP_TOKEN = 'token-webeep-di-prova';
const WEBEEP_SITE_URL = 'https://webeep.polimi.it';
const CLIENT_IP = '203.0.113.7';
const REDIRECT_URI = 'http://127.0.0.1:4812/callback';
const STATE = 'stato-di-prova-0123456789';
const AUTHORIZE_URL = 'https://auth.example.it/application/o/webeep/authorize';
const CODE_LENGTH = 43;
const DEVICE_TOKEN_LENGTH = 43;
const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const PAIRING_CODE_TTL_MS = 120 * 1000;
const HTTP_FOUND = 302;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const HTTP_UNAVAILABLE = 503;
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;

const IDENTITY: OidcIdentity = { sub: 'sub-utente-di-prova', name: 'Mario Rossi' };
const CTX = { clientIp: CLIENT_IP };

const siteInfo: SiteInfo = {
  sitename: 'WeBeep',
  siteurl: WEBEEP_SITE_URL,
  username: 'mario.rossi',
  firstname: 'Mario',
  lastname: 'Rossi',
  fullname: 'Mario Rossi',
  userid: 42,
  userpictureurl: 'https://webeep.polimi.it/pix/u/f1.png',
};

const createConfig = (): Config =>
  loadConfig({
    WEBEEP_PUBLIC_URL: 'https://server.example.it',
    WEBEEP_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
    WEBEEP_OIDC_ISSUER: 'https://auth.example.it/application/o/webeep/',
    WEBEEP_OIDC_CLIENT_ID: 'webeep-server-di-prova',
    WEBEEP_OIDC_CLIENT_SECRET: 'segreto-client-di-prova',
  });

// Store in memoria: gli stessi byte che userebbe il file store.
const createMemoryStore = (): StateStore => {
  let stored: Uint8Array | null = null;
  return {
    get: async () => stored,
    put: async (bytes) => {
      stored = bytes;
    },
  };
};

// Oidc finto: registra gli avvii di login e conserva i gestori come `unknown` per purpose.
const createFakeOidc = () => {
  const startCalls: { purpose: OidcPurpose; payload: OidcPayload[OidcPurpose] }[] = [];
  const handlers = new Map<OidcPurpose, unknown>();
  const oidc: Oidc = {
    startLogin: async (purpose, payload) => {
      startCalls.push({ purpose, payload });
      return new Response(null, { status: HTTP_FOUND, headers: { Location: AUTHORIZE_URL } });
    },
    registerContinuation: (purpose, handler) => {
      handlers.set(purpose, handler);
    },
    handle: async () => null,
  };
  // Il cast è giustificato: `registerContinuation` salva il gestore sotto il purpose di `desktop-pair`.
  const desktopPairContinuation = (): OidcContinuation<'desktop-pair'> => {
    const handler = handlers.get('desktop-pair');
    if (handler === undefined) throw new Error('continuazione desktop-pair non registrata');
    return handler as OidcContinuation<'desktop-pair'>;
  };
  return { oidc, startCalls, desktopPairContinuation };
};

const startRequest = (params: URLSearchParams): Request =>
  new Request(`https://server.example.it/pair/start?${params.toString()}`, { method: 'GET' });

const pairRequest = (method: string, body?: unknown): Request =>
  new Request('https://server.example.it/pair', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const deviceRequest = (method: 'GET' | 'DELETE', token?: string): Request => {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return new Request('https://server.example.it/pair', { method, headers });
};

describe('/pair', () => {
  let store: StateManager;
  let pair: Pair;
  let oauth: OAuth;
  let verifier: string;
  let challenge: string;
  let startCalls: { purpose: OidcPurpose; payload: OidcPayload[OidcPurpose] }[];
  let desktopPairContinuation: () => OidcContinuation<'desktop-pair'>;

  // Parametri validi di `/pair/start`, da modificare nei test.
  const validStartParams = (): URLSearchParams =>
    new URLSearchParams({
      redirect_uri: REDIRECT_URI,
      state: STATE,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

  // Esegue la continuazione dopo il login: restituisce il codice monouso consegnato al loopback.
  const issueCode = async (codeChallenge: string = challenge): Promise<string> => {
    const response = await desktopPairContinuation()(
      { redirectUri: REDIRECT_URI, state: STATE, codeChallenge },
      IDENTITY,
      CTX,
    );
    const code = new URL(response.headers.get('location') ?? '').searchParams.get('code');
    if (code === null) throw new Error('codice assente nel redirect');
    return code;
  };

  const pairBody = (code: string, codeVerifier: string = verifier): Record<string, unknown> => ({
    code,
    codeVerifier,
    siteUrl: WEBEEP_SITE_URL,
    token: WEBEEP_TOKEN,
  });

  // Accoppia il dispositivo e restituisce il deviceToken (il flusso completo di docs/SERVER.md §4.1).
  const pairDevice = async (): Promise<string> => {
    vi.mocked(getSiteInfo).mockResolvedValueOnce(siteInfo);
    const code = await issueCode();
    const response = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
    const body = (await response.json()) as { deviceToken: string };
    return body.deviceToken;
  };

  beforeEach(async () => {
    vi.mocked(getSiteInfo).mockReset();
    verifier = randomBase64Url(32);
    challenge = toBase64Url(await sha256(verifier));
    store = await createStateManager({ store: createMemoryStore(), secretKey: new Uint8Array(32).fill(7) });
    oauth = {
      handle: async () => null,
      verifyAccessToken: async () => false,
      revokeAll: vi.fn(async (): Promise<void> => {}),
    };
    const fake = createFakeOidc();
    startCalls = fake.startCalls;
    desktopPairContinuation = fake.desktopPairContinuation;
    pair = createPair({
      config: createConfig(),
      store,
      rateLimiter: createRateLimiter({ windowMs: WINDOW_MS, max: MAX_FAILED_ATTEMPTS }),
      oauth,
      oidc: fake.oidc,
    });
  });

  describe('GET /pair/start', () => {
    it('con parametri validi avvia il login desktop-pair', async () => {
      const response = await pair.start(startRequest(validStartParams()));

      expect(response.status).toBe(HTTP_FOUND);
      expect(response.headers.get('location')).toBe(AUTHORIZE_URL);
      expect(startCalls).toEqual([
        {
          purpose: 'desktop-pair',
          payload: { redirectUri: REDIRECT_URI, state: STATE, codeChallenge: challenge },
        },
      ]);
    });

    it.each(['http://127.0.0.1:1024/callback', 'http://127.0.0.1:65535/callback'])(
      'accetta il loopback di confine %s',
      async (redirectUri) => {
        const params = validStartParams();
        params.set('redirect_uri', redirectUri);
        const response = await pair.start(startRequest(params));
        expect(response.status).toBe(HTTP_FOUND);
      },
    );

    it.each([
      ['http://localhost:4812/callback'],
      ['http://127.0.0.1:1023/callback'],
      ['http://127.0.0.1:65536/callback'],
      ['http://127.0.0.1:04812/callback'],
      ['https://127.0.0.1:4812/callback'],
      ['http://127.0.0.1:4812/altro'],
      ['http://127.0.0.1:4812/callback?x=1'],
      ['https://evil.example.it/callback'],
    ])('rifiuta redirect_uri %s con una pagina 400, senza login', async (redirectUri) => {
      const params = validStartParams();
      params.set('redirect_uri', redirectUri);
      const response = await pair.start(startRequest(params));

      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(startCalls).toHaveLength(0);
    });

    it.each([
      ['state', 'corto'],
      ['state', 'stato+non/valido-0123456'],
      ['state', 'a'.repeat(129)],
      ['code_challenge', 'a'.repeat(42)],
    ])('rifiuta %s = %s con 400', async (name, value) => {
      const params = validStartParams();
      params.set(name, value);
      const response = await pair.start(startRequest(params));
      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(startCalls).toHaveLength(0);
    });

    it('rifiuta code_challenge_method diverso da S256', async () => {
      const params = validStartParams();
      params.set('code_challenge_method', 'plain');
      const response = await pair.start(startRequest(params));
      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(startCalls).toHaveLength(0);
    });

    it('rifiuta un parametro ripetuto', async () => {
      const params = validStartParams();
      params.append('state', 'secondo-stato-di-prova-0123');
      const response = await pair.start(startRequest(params));
      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(startCalls).toHaveLength(0);
    });
  });

  describe('continuazione desktop-pair', () => {
    it('risponde 302 verso il loopback con code (32 byte) e state', async () => {
      const response = await desktopPairContinuation()(
        { redirectUri: REDIRECT_URI, state: STATE, codeChallenge: challenge },
        IDENTITY,
        CTX,
      );
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(HTTP_FOUND);
      expect(`${location.origin}${location.pathname}`).toBe('http://127.0.0.1:4812/callback');
      expect(location.searchParams.get('state')).toBe(STATE);
      expect(location.searchParams.get('code')).toHaveLength(CODE_LENGTH);
    });
  });

  describe('POST /pair', () => {
    it('con codice e PKCE validi risponde 200 con deviceToken, senza mostrare il token WeBeep', async () => {
      vi.mocked(getSiteInfo).mockResolvedValueOnce(siteInfo);
      const code = await issueCode();

      const response = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
      const text = await response.text();
      const body = JSON.parse(text) as { fullName: string; siteUrl: string; deviceToken: string };

      expect(response.status).toBe(HTTP_OK);
      expect(body).toEqual({ fullName: 'Mario Rossi', siteUrl: WEBEEP_SITE_URL, deviceToken: body.deviceToken });
      expect(body.deviceToken).toHaveLength(DEVICE_TOKEN_LENGTH);
      expect(text).not.toContain(WEBEEP_TOKEN);
      expect(text).not.toContain(code);
    });

    it('salva la sessione e solo l hash SHA-256 del deviceToken', async () => {
      const deviceToken = await pairDevice();
      const state = await store.read();

      expect(state.webeep?.token).toBe(WEBEEP_TOKEN);
      expect(state.deviceTokenHash).toBe(await sha256Hex(deviceToken));
      expect(state.deviceTokenHash).not.toBe(deviceToken);
    });

    it('revoca i token OAuth quando accoppia', async () => {
      await pairDevice();
      expect(oauth.revokeAll).toHaveBeenCalledTimes(1);
    });

    it('un codice già usato risponde 401 invalid_code', async () => {
      vi.mocked(getSiteInfo).mockResolvedValueOnce(siteInfo);
      const code = await issueCode();
      const first = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
      expect(first.status).toBe(HTTP_OK);

      vi.mocked(getSiteInfo).mockResolvedValueOnce(siteInfo);
      const reused = await pair.handle(pairRequest('POST', pairBody(code)), CTX);

      expect(reused.status).toBe(HTTP_UNAUTHORIZED);
      expect(await reused.json()).toEqual({ error: 'invalid_code' });
    });

    it('con un code_verifier errato risponde 401 e il codice si consuma comunque', async () => {
      const code = await issueCode();
      const wrong = await pair.handle(pairRequest('POST', pairBody(code, randomBase64Url(32))), CTX);
      expect(wrong.status).toBe(HTTP_UNAUTHORIZED);
      expect(await wrong.json()).toEqual({ error: 'invalid_code' });

      vi.mocked(getSiteInfo).mockResolvedValueOnce(siteInfo);
      const retry = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
      expect(retry.status).toBe(HTTP_UNAUTHORIZED);
    });

    it('un codice scaduto dopo 120 secondi risponde 401', async () => {
      const issuedAt = Date.now();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(issuedAt);
      const code = await issueCode();
      nowSpy.mockReturnValue(issuedAt + PAIRING_CODE_TTL_MS + 1);

      const response = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
      nowSpy.mockRestore();
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(await response.json()).toEqual({ error: 'invalid_code' });
    });

    it('un siteUrl diverso da quello di WeBeep risponde 400 invalid_body', async () => {
      const code = await issueCode();
      const body = { ...pairBody(code), siteUrl: 'https://altro.example.it' };
      const response = await pair.handle(pairRequest('POST', body), CTX);
      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(await response.json()).toEqual({ error: 'invalid_body' });
    });

    it('un corpo non JSON risponde 400 invalid_body', async () => {
      const response = await pair.handle(
        new Request('https://server.example.it/pair', { method: 'POST', body: 'non è json' }),
        CTX,
      );
      expect(response.status).toBe(HTTP_BAD_REQUEST);
      expect(await response.json()).toEqual({ error: 'invalid_body' });
    });

    it('un token rifiutato da WeBeep risponde 422 token_rejected e non salva la sessione', async () => {
      const code = await issueCode();
      vi.mocked(getSiteInfo).mockRejectedValueOnce(
        new MoodleApiError('invalidtoken', 'token scaduto', 'core_webservice_get_site_info'),
      );

      const response = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
      expect(response.status).toBe(HTTP_UNPROCESSABLE);
      expect(await response.json()).toEqual({ error: 'token_rejected' });
      expect((await store.read()).webeep).toBeNull();
    });

    it('se WeBeep non è raggiungibile risponde 503 webeep_unreachable', async () => {
      const code = await issueCode();
      vi.mocked(getSiteInfo).mockRejectedValueOnce(new MoodleNetworkError('rete assente', undefined));

      const response = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
      expect(response.status).toBe(HTTP_UNAVAILABLE);
      expect(await response.json()).toEqual({ error: 'webeep_unreachable' });
    });

    it('dopo cinque codici errati dallo stesso IP risponde 429, anche con il codice giusto', async () => {
      const wrongAttempts = Array.from({ length: MAX_FAILED_ATTEMPTS }, () =>
        pair.handle(pairRequest('POST', pairBody('codice-inesistente-di-prova')), CTX),
      );
      const results = await Promise.all(wrongAttempts);
      expect(results.map((result) => result.status)).toEqual(Array(MAX_FAILED_ATTEMPTS).fill(HTTP_UNAUTHORIZED));

      const code = await issueCode();
      const response = await pair.handle(pairRequest('POST', pairBody(code)), CTX);
      expect(response.status).toBe(HTTP_TOO_MANY);
      expect(await response.json()).toEqual({ error: 'too_many_attempts' });
    });
  });

  describe('GET e DELETE /pair', () => {
    it('senza accoppiamento un deviceToken qualsiasi risponde 401', async () => {
      const response = await pair.handle(deviceRequest('GET', 'token-qualsiasi'), CTX);
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    });

    it('senza header Authorization risponde 401', async () => {
      await pairDevice();
      const response = await pair.handle(deviceRequest('GET'), CTX);
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    });

    it('con un deviceToken errato risponde 401', async () => {
      await pairDevice();
      const response = await pair.handle(deviceRequest('GET', randomBase64Url(32)), CTX);
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
    });

    it('con il deviceToken giusto GET risponde paired true e il nome', async () => {
      const deviceToken = await pairDevice();
      vi.mocked(getSiteInfo).mockResolvedValueOnce(siteInfo);

      const response = await pair.handle(deviceRequest('GET', deviceToken), CTX);
      expect(response.status).toBe(HTTP_OK);
      expect(await response.json()).toEqual({ paired: true, fullName: 'Mario Rossi' });
    });

    it('DELETE con un deviceToken errato risponde 401 e non scollega', async () => {
      await pairDevice();
      const response = await pair.handle(deviceRequest('DELETE', randomBase64Url(32)), CTX);
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
      expect((await store.read()).webeep).not.toBeNull();
    });

    it('DELETE con il deviceToken giusto risponde 204, cancella sessione e hash, revoca OAuth', async () => {
      const deviceToken = await pairDevice();
      vi.mocked(oauth.revokeAll).mockClear();

      const response = await pair.handle(deviceRequest('DELETE', deviceToken), CTX);
      const state = await store.read();

      expect(response.status).toBe(HTTP_NO_CONTENT);
      expect(state.webeep).toBeNull();
      expect(state.deviceTokenHash).toBeNull();
      expect(oauth.revokeAll).toHaveBeenCalledTimes(1);
    });

    it('dopo DELETE il deviceToken non vale più', async () => {
      const deviceToken = await pairDevice();
      await pair.handle(deviceRequest('DELETE', deviceToken), CTX);

      const response = await pair.handle(deviceRequest('GET', deviceToken), CTX);
      expect(response.status).toBe(HTTP_UNAUTHORIZED);
    });
  });
});
