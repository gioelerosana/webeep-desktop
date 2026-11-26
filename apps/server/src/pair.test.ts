import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSiteInfo, MoodleApiError, type SiteInfo } from '@webeep/moodle-api';
import { loadConfig, type Config } from './config.js';
import { createPair, type Pair } from './pair.js';
import { createRateLimiter } from './http/rate-limiter.js';
import type { OAuth } from './oauth/index.js';
import { createStateManager, type StateManager } from './state/manager.js';
import type { StateStore } from './state/store.js';

// Solo `getSiteInfo` è finta: il resto di moodle-api (errori, costanti) resta reale.
vi.mock('@webeep/moodle-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@webeep/moodle-api')>();
  return { ...actual, getSiteInfo: vi.fn() };
});

const PAIRING_KEY = 'chiave-di-accoppiamento-di-prova-32+';
const WEBEEP_TOKEN = 'token-webeep-di-prova';
const CLIENT_IP = '203.0.113.7';
const UNAUTHORIZED_CODE = 401;
const TOO_MANY_CODE = 429;
const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const siteInfo: SiteInfo = {
  sitename: 'WeBeep',
  siteurl: 'https://webeep.polimi.it',
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
    WEBEEP_ADMIN_PASSWORD: 'password-admin-lunga',
    WEBEEP_PAIRING_KEY: PAIRING_KEY,
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

const unusedOAuth: OAuth = {
  handle: async () => null,
  verifyAccessToken: async () => false,
  revokeAll: vi.fn(async () => {}),
};

const pairRequest = (options: { readonly key?: string; readonly body?: string; readonly method?: string }): Request => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.key !== undefined) headers.Authorization = `Bearer ${options.key}`;
  return new Request('https://server.example.it/pair', {
    method: options.method ?? 'POST',
    headers,
    body: options.body ?? JSON.stringify({ siteUrl: 'https://webeep.polimi.it', token: WEBEEP_TOKEN }),
  });
};

describe('/pair', () => {
  let store: StateManager;
  let pair: Pair;

  beforeEach(async () => {
    vi.mocked(getSiteInfo).mockReset();
    store = await createStateManager({ store: createMemoryStore(), secretKey: new Uint8Array(32).fill(7) });
    pair = createPair({
      config: createConfig(),
      store,
      rateLimiter: createRateLimiter({ windowMs: WINDOW_MS, max: MAX_FAILED_ATTEMPTS }),
      oauth: unusedOAuth,
    });
  });

  it('senza chiave risponde 401 unauthorized', async () => {
    const response = await pair.handle(pairRequest({}), { clientIp: CLIENT_IP });
    expect(response.status).toBe(UNAUTHORIZED_CODE);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('con un corpo non JSON risponde 400 invalid_body', async () => {
    const response = await pair.handle(pairRequest({ key: PAIRING_KEY, body: 'non è json' }), { clientIp: CLIENT_IP });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_body' });
  });

  it('con un siteUrl diverso da quello di WeBeep risponde 400', async () => {
    const body = JSON.stringify({ siteUrl: 'https://altro.example.it', token: WEBEEP_TOKEN });
    const response = await pair.handle(pairRequest({ key: PAIRING_KEY, body }), { clientIp: CLIENT_IP });
    expect(response.status).toBe(400);
  });

  it('con un token valido risponde 200, salva la sessione e non mostra il token', async () => {
    vi.mocked(getSiteInfo).mockResolvedValueOnce(siteInfo);

    const response = await pair.handle(pairRequest({ key: PAIRING_KEY }), { clientIp: CLIENT_IP });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ fullName: 'Mario Rossi', siteUrl: 'https://webeep.polimi.it' });
    expect(text).not.toContain(WEBEEP_TOKEN);
    expect((await store.read()).webeep?.token).toBe(WEBEEP_TOKEN);
  });

  it('dopo cinque chiavi errate il client riceve 429 anche con la chiave giusta', async () => {
    const wrongKey = 'chiave-sbagliata';
    const attempts = Array.from({ length: MAX_FAILED_ATTEMPTS }, () =>
      pair.handle(pairRequest({ key: wrongKey }), { clientIp: CLIENT_IP }),
    );
    await Promise.all(attempts);

    const response = await pair.handle(pairRequest({ key: PAIRING_KEY }), { clientIp: CLIENT_IP });
    expect(response.status).toBe(TOO_MANY_CODE);
    expect(await response.json()).toEqual({ error: 'too_many_attempts' });
  });

  it('un token rifiutato da WeBeep risponde 422 token_rejected', async () => {
    vi.mocked(getSiteInfo).mockRejectedValueOnce(new MoodleApiError('invalidtoken', 'token scaduto', 'core_webservice_get_site_info'));
    const response = await pair.handle(pairRequest({ key: PAIRING_KEY }), { clientIp: CLIENT_IP });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'token_rejected' });
  });
});
