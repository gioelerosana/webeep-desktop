import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, type Config } from '../config.js';
import { sha256, toBase64Url } from '../crypto.js';
import type { RequestContext } from '../http/types.js';
import { OidcContinuationMissingError } from './errors.js';
import { createOidc, type Oidc, type OidcIdentity } from './index.js';
import { MAX_PENDING_LOGINS, PENDING_LOGIN_TTL_MS } from './constants.js';
import type { FetchLike } from './request.js';
import type { ClaudeAuthorizePayload } from './types.js';

const ISSUER = 'https://auth.example.it/application/o/webeep';
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const AUTHORIZATION_URL = `${ISSUER}/authorize/`;
const TOKEN_URL = `${ISSUER}/token/`;
const USERINFO_URL = `${ISSUER}/userinfo/`;
const PUBLIC_URL = 'https://server.example.it';
const CALLBACK_URL = `${PUBLIC_URL}/oidc/callback`;
const CLIENT_ID = 'client-di-prova';
const CLIENT_SECRET = 'segreto-di-prova';
const ALLOWED_GROUP = 'webeep';
const CLIENT_IP = '203.0.113.7';
const SUBJECT = 'sub-42';
const ACCESS_TOKEN = 'access-token-di-prova';
const CODE = 'codice-di-prova';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_FOUND = 302;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_INTERNAL_ERROR = 500;
// 32 byte in base64url senza padding: 43 caratteri (state e nonce); PKCE S256: 43 caratteri.
const STATE_LENGTH = 43;
const CODE_CHALLENGE_LENGTH = 43;

const CONTEXT: RequestContext = { clientIp: CLIENT_IP };

const PAYLOAD: ClaudeAuthorizePayload = {
  clientId: 'claude-client',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  codeChallenge: 'c'.repeat(CODE_CHALLENGE_LENGTH),
  state: 'stato-del-client',
  clientName: 'Claude di prova',
};

const createConfig = (issuer = `${ISSUER}/`): Config =>
  loadConfig({
    WEBEEP_PUBLIC_URL: PUBLIC_URL,
    WEBEEP_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
    WEBEEP_OIDC_ISSUER: issuer,
    WEBEEP_OIDC_CLIENT_ID: CLIENT_ID,
    WEBEEP_OIDC_CLIENT_SECRET: CLIENT_SECRET,
  });

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const base64url = (text: string): string => Buffer.from(text).toString('base64url');

/** ID token con il nonce indicato; la firma non è verificata dal server, quindi è finta. */
const idTokenWithNonce = (nonce: string | null): string => {
  const claims = nonce === null ? { sub: SUBJECT } : { sub: SUBJECT, nonce };
  return `${base64url(JSON.stringify({ alg: 'none' }))}.${base64url(JSON.stringify(claims))}.firma`;
};

type FakeOptions = {
  readonly discoveryStatus?: number;
  readonly discoveryIssuer?: string;
  readonly tokenStatus?: number;
  readonly tokenNetworkError?: boolean;
  readonly withIdToken?: boolean;
  readonly idTokenNonce?: string | null;
  readonly userinfoStatus?: number;
  readonly groups?: readonly string[];
};

type Call = { readonly url: string; readonly init: RequestInit | undefined };

/** Authentik finto: risponde a discovery, token e userinfo, e registra ogni chiamata. */
const createFakeAuthentik = (options: FakeOptions = {}) => {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (url === DISCOVERY_URL) {
      return jsonResponse(options.discoveryStatus ?? HTTP_OK, {
        issuer: options.discoveryIssuer ?? ISSUER,
        authorization_endpoint: AUTHORIZATION_URL,
        token_endpoint: TOKEN_URL,
        userinfo_endpoint: USERINFO_URL,
      });
    }
    if (url === TOKEN_URL) {
      if (options.tokenNetworkError === true) throw new TypeError('fetch failed');
      const nonce = options.idTokenNonce === undefined ? currentNonce() : options.idTokenNonce;
      const tokenBody = {
        access_token: ACCESS_TOKEN,
        token_type: 'Bearer',
        ...(options.withIdToken === true ? { id_token: idTokenWithNonce(nonce) } : {}),
      };
      return jsonResponse(options.tokenStatus ?? HTTP_OK, tokenBody);
    }
    if (url === USERINFO_URL) {
      return jsonResponse(options.userinfoStatus ?? HTTP_OK, {
        sub: SUBJECT,
        name: 'Mario Rossi',
        email: 'mario@example.it',
        groups: options.groups ?? [ALLOWED_GROUP],
      });
    }
    throw new Error(`URL non previsto nel test: ${url}`);
  };
  // Il nonce dell'ultimo login avviato: serve a costruire un ID token coerente.
  let lastNonce = '';
  const currentNonce = (): string => lastNonce;
  return {
    fetch,
    calls,
    setNonce: (nonce: string) => {
      lastNonce = nonce;
    },
    callsTo: (url: string): readonly Call[] => calls.filter((call) => call.url === url),
  };
};

/** Parametri del redirect verso Authentik, letti dalla Location. */
const readAuthorization = (response: Response): URLSearchParams => {
  const location = response.headers.get('location');
  if (location === null) throw new Error('Location assente');
  return new URL(location).searchParams;
};

const callbackRequest = (query: Record<string, string>): Request =>
  new Request(`${CALLBACK_URL}?${new URLSearchParams(query).toString()}`);

/** Avvia un login e restituisce lo state e il nonce generati. */
const startAndRead = async (
  oidc: Oidc,
  fake: ReturnType<typeof createFakeAuthentik>,
): Promise<{ state: string; nonce: string; challenge: string }> => {
  const response = await oidc.startLogin('claude-authorize', PAYLOAD);
  const params = readAuthorization(response);
  const state = params.get('state') ?? '';
  const nonce = params.get('nonce') ?? '';
  fake.setNonce(nonce);
  return { state, nonce, challenge: params.get('code_challenge') ?? '' };
};

describe('createOidc: avvio del login', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('risponde 302 verso Authentik con PKCE S256, state, nonce e i parametri del contratto', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });

    const response = await oidc.startLogin('claude-authorize', PAYLOAD);

    expect(response.status).toBe(HTTP_FOUND);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const location = new URL(response.headers.get('location') ?? '');
    expect(`${location.origin}${location.pathname}`).toBe(AUTHORIZATION_URL);
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(CALLBACK_URL);
    expect(location.searchParams.get('scope')).toBe('openid profile email');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toHaveLength(STATE_LENGTH);
    expect(location.searchParams.get('nonce')).toHaveLength(STATE_LENGTH);
    expect(location.searchParams.get('code_challenge')).toHaveLength(CODE_CHALLENGE_LENGTH);
  });

  it('usa la discovery una sola volta: la seconda chiamata la prende dalla cache', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });

    await oidc.startLogin('claude-authorize', PAYLOAD);
    await oidc.startLogin('desktop-pair', { redirectUri: 'http://127.0.0.1:4000/callback', state: 's', codeChallenge: 'c'.repeat(43) });

    expect(fake.callsTo(DISCOVERY_URL)).toHaveLength(1);
  });

  it('con un issuer diverso dalla discovery risponde 503 e riprova alla chiamata successiva', async () => {
    const wrong = createFakeAuthentik({ discoveryIssuer: 'https://altro.example.it/application/o/webeep' });
    const oidc = createOidc({ config: createConfig(), fetch: wrong.fetch });

    const failed = await oidc.startLogin('claude-authorize', PAYLOAD);
    expect(failed.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(await failed.text()).toContain('servizio di accesso non disponibile');

    const ok = createFakeAuthentik();
    const retry = createOidc({ config: createConfig(), fetch: ok.fetch });
    expect((await retry.startLogin('claude-authorize', PAYLOAD)).status).toBe(HTTP_FOUND);
  });

  it('accetta un issuer nel documento senza slash finale quando la configurazione ne ha una', async () => {
    const fake = createFakeAuthentik({ discoveryIssuer: ISSUER });
    const oidc = createOidc({ config: createConfig(`${ISSUER}/`), fetch: fake.fetch });
    expect((await oidc.startLogin('claude-authorize', PAYLOAD)).status).toBe(HTTP_FOUND);
  });

  it('una discovery con HTTP 500 risponde 503 e non viene messa in cache', async () => {
    const fake = createFakeAuthentik({ discoveryStatus: HTTP_INTERNAL_ERROR });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });

    expect((await oidc.startLogin('claude-authorize', PAYLOAD)).status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect((await oidc.startLogin('claude-authorize', PAYLOAD)).status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(fake.callsTo(DISCOVERY_URL)).toHaveLength(2);
  });

  it('un login pendente scade dopo 10 minuti', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const { state } = await startAndRead(oidc, fake);

    vi.setSystemTime(new Date(Date.now() + PENDING_LOGIN_TTL_MS + 1));
    const response = await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_BAD_REQUEST);
    expect(await response?.text()).toContain('accesso scaduto');
  });

  it('oltre il tetto di login pendenti scarta il più vecchio', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const first = await startAndRead(oidc, fake);
    await Promise.all(Array.from({ length: MAX_PENDING_LOGINS }, () => oidc.startLogin('claude-authorize', PAYLOAD)));

    const response = await oidc.handle(callbackRequest({ state: first.state, code: CODE }), CONTEXT);
    expect(response?.status).toBe(HTTP_BAD_REQUEST);
  });
});

describe('createOidc: callback', () => {
  it('scambia il code, verifica l\'utente e passa identità e payload al gestore del purpose', async () => {
    const fake = createFakeAuthentik({ withIdToken: true });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const continuation = vi.fn(
      async (_payload: ClaudeAuthorizePayload, _identity: OidcIdentity, _ctx: RequestContext): Promise<Response> =>
        new Response('pagina di consenso', { status: HTTP_OK }),
    );
    oidc.registerContinuation('claude-authorize', continuation);
    const { state, challenge } = await startAndRead(oidc, fake);

    const response = await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_OK);
    expect(await response?.text()).toBe('pagina di consenso');
    expect(continuation).toHaveBeenCalledTimes(1);
    expect(continuation).toHaveBeenCalledWith(
      PAYLOAD,
      { sub: SUBJECT, name: 'Mario Rossi', email: 'mario@example.it' },
      CONTEXT,
    );

    const [tokenCall] = fake.callsTo(TOKEN_URL);
    const headers = new Headers(tokenCall?.init?.headers);
    const expectedBasic = `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;
    expect(headers.get('authorization')).toBe(expectedBasic);
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');

    const body = new URLSearchParams(String(tokenCall?.init?.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe(CODE);
    expect(body.get('redirect_uri')).toBe(CALLBACK_URL);
    const verifier = body.get('code_verifier') ?? '';
    expect(toBase64Url(await sha256(verifier))).toBe(challenge);

    const [userinfoCall] = fake.callsTo(USERINFO_URL);
    expect(new Headers(userinfoCall?.init?.headers).get('authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('passa il purpose desktop-pair con il suo payload', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const pairPayload = { redirectUri: 'http://127.0.0.1:4000/callback', state: 'stato-desktop', codeChallenge: 'd'.repeat(43) };
    const continuation = vi.fn(async (): Promise<Response> => new Response('ok', { status: HTTP_FOUND }));
    oidc.registerContinuation('desktop-pair', continuation);

    const response = await oidc.startLogin('desktop-pair', pairPayload);
    const state = readAuthorization(response).get('state') ?? '';
    fake.setNonce(readAuthorization(response).get('nonce') ?? '');
    await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(continuation).toHaveBeenCalledWith(pairPayload, expect.objectContaining({ sub: SUBJECT }), CONTEXT);
  });

  it('con state sconosciuto risponde 400 senza scambiare il code', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    await startAndRead(oidc, fake);

    const response = await oidc.handle(callbackRequest({ state: 'sconosciuto', code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_BAD_REQUEST);
    expect(response?.headers.get('content-type')).toContain('text/html');
    expect(fake.callsTo(TOKEN_URL)).toHaveLength(0);
  });

  it('uno state già usato risponde 400 alla seconda chiamata', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    oidc.registerContinuation('claude-authorize', async () => new Response('ok', { status: HTTP_OK }));
    const { state } = await startAndRead(oidc, fake);

    expect((await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT))?.status).toBe(HTTP_OK);
    expect((await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT))?.status).toBe(HTTP_BAD_REQUEST);
    expect(fake.callsTo(TOKEN_URL)).toHaveLength(1);
  });

  it('un account fuori dal gruppo risponde 403 e non chiama il gestore', async () => {
    const fake = createFakeAuthentik({ groups: ['altro-gruppo'] });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const continuation = vi.fn(async (): Promise<Response> => new Response('ok', { status: HTTP_OK }));
    oidc.registerContinuation('claude-authorize', continuation);
    const { state } = await startAndRead(oidc, fake);

    const response = await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_FORBIDDEN);
    expect(await response?.text()).toContain('account non autorizzato');
    expect(continuation).not.toHaveBeenCalled();
  });

  it('senza il claim groups il login è rifiutato con 400', async () => {
    const base = createFakeAuthentik();
    // Userinfo senza `groups`: il contratto lo richiede, quindi l'accesso è rifiutato.
    const withoutGroups: FetchLike = async (url, init) =>
      url === USERINFO_URL ? jsonResponse(HTTP_OK, { sub: SUBJECT }) : base.fetch(url, init);
    const oidc = createOidc({ config: createConfig(), fetch: withoutGroups });
    const continuation = vi.fn(async (): Promise<Response> => new Response('ok', { status: HTTP_OK }));
    oidc.registerContinuation('claude-authorize', continuation);
    const { state } = await startAndRead(oidc, base);

    const response = await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_BAD_REQUEST);
    expect(continuation).not.toHaveBeenCalled();
  });

  it('un errore esplicito di Authentik risponde 400 senza mostrare il valore di error', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const { state } = await startAndRead(oidc, fake);

    const response = await oidc.handle(callbackRequest({ state, error: 'access_denied_valore' }), CONTEXT);

    expect(response?.status).toBe(HTTP_BAD_REQUEST);
    const text = await response?.text();
    expect(text).toContain('accesso non completato');
    expect(text).not.toContain('access_denied_valore');
    expect(fake.callsTo(TOKEN_URL)).toHaveLength(0);
  });

  it('se il token endpoint rifiuta lo scambio risponde 400 e non chiama userinfo', async () => {
    const fake = createFakeAuthentik({ tokenStatus: HTTP_BAD_REQUEST });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const { state } = await startAndRead(oidc, fake);

    const response = await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_BAD_REQUEST);
    expect(fake.callsTo(USERINFO_URL)).toHaveLength(0);
  });

  it('un errore di rete verso Authentik risponde 503', async () => {
    const fake = createFakeAuthentik({ tokenNetworkError: true });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const { state } = await startAndRead(oidc, fake);

    const response = await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_SERVICE_UNAVAILABLE);
    expect(await response?.text()).toContain('servizio di accesso non disponibile');
  });

  it('userinfo con errore risponde 400', async () => {
    const fake = createFakeAuthentik({ userinfoStatus: HTTP_FORBIDDEN });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const { state } = await startAndRead(oidc, fake);

    expect((await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT))?.status).toBe(HTTP_BAD_REQUEST);
  });

  it('un nonce diverso nell\'ID token risponde 400', async () => {
    const fake = createFakeAuthentik({ withIdToken: true, idTokenNonce: 'nonce-altrui' });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const continuation = vi.fn(async (): Promise<Response> => new Response('ok', { status: HTTP_OK }));
    oidc.registerContinuation('claude-authorize', continuation);
    const { state } = await startAndRead(oidc, fake);

    const response = await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT);

    expect(response?.status).toBe(HTTP_BAD_REQUEST);
    expect(continuation).not.toHaveBeenCalled();
  });

  it('un nonce coerente nell\'ID token passa', async () => {
    const fake = createFakeAuthentik({ withIdToken: true });
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    oidc.registerContinuation('claude-authorize', async () => new Response('ok', { status: HTTP_OK }));
    const { state } = await startAndRead(oidc, fake);

    expect((await oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT))?.status).toBe(HTTP_OK);
  });

  it('senza gestore registrato per il purpose il callback lancia un errore interno', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });
    const { state } = await startAndRead(oidc, fake);

    await expect(oidc.handle(callbackRequest({ state, code: CODE }), CONTEXT)).rejects.toBeInstanceOf(
      OidcContinuationMissingError,
    );
  });

  it('le pagine di errore portano la CSP stretta e no-store', async () => {
    const fake = createFakeAuthentik();
    const oidc = createOidc({ config: createConfig(), fetch: fake.fetch });

    const response = await oidc.handle(callbackRequest({ state: 'niente' }), CONTEXT);

    expect(response?.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response?.headers.get('x-frame-options')).toBe('DENY');
    expect(response?.headers.get('cache-control')).toBe('no-store');
  });
});

describe('createOidc: instradamento', () => {
  it('restituisce null per i percorsi che non sono suoi', async () => {
    const oidc = createOidc({ config: createConfig(), fetch: createFakeAuthentik().fetch });
    expect(await oidc.handle(new Request(`${PUBLIC_URL}/mcp`), CONTEXT)).toBeNull();
    expect(await oidc.handle(new Request(`${PUBLIC_URL}/oidc/altro`), CONTEXT)).toBeNull();
  });

  it('il callback accetta solo GET', async () => {
    const oidc = createOidc({ config: createConfig(), fetch: createFakeAuthentik().fetch });
    const response = await oidc.handle(new Request(CALLBACK_URL, { method: 'POST' }), CONTEXT);
    expect(response?.status).toBe(HTTP_METHOD_NOT_ALLOWED);
    expect(response?.headers.get('allow')).toBe('GET');
  });
});
