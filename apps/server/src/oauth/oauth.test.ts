import { createHash, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, type Config } from '../config.js';
import type { OidcContinuation, OidcIdentity, OidcPayload, OidcPurpose } from '../oidc/types.js';
import type { Oidc } from '../oidc/index.js';
import { createStateManager, type StateManager } from '../state/manager.js';
import type { StateStore } from '../state/store.js';
import { createOAuth, type OAuth } from './index.js';

const BASE = 'https://server.example.it';
const RESOURCE = `${BASE}/mcp`;
const ISSUER = 'https://auth.example.it/application/o/webeep/';
const AUTHENTIK_AUTHORIZE_URL = 'https://auth.example.it/application/o/authorize/';
const REDIRECT_URI = 'http://localhost:3333/callback';
const CLIENT_IP = '203.0.113.7';
const STATE_VALUE = 'stato-di-prova';
const CODE_TTL_MS = 60 * 1000;
const CONSENT_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 3600 * 1000;
const REGISTRATION_LIMIT = 20;
const SECRET_KEY_BYTES = 32;
const SECRET_KEY_FILL = 7;
const METHOD_NOT_ALLOWED = 405;
const CONSENT_EXPIRED_MESSAGE = 'richiesta scaduta: riprova il collegamento da Claude';
const CONSENT_FIELD = 'name="consent" value="';
const IDENTITY: OidcIdentity = { sub: 'utente-1', name: 'Mario Rossi' };

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

const createConfig = (): Config =>
  loadConfig({
    WEBEEP_PUBLIC_URL: BASE,
    WEBEEP_SECRET_KEY: Buffer.alloc(SECRET_KEY_BYTES, SECRET_KEY_FILL).toString('base64'),
    WEBEEP_OIDC_ISSUER: ISSUER,
    WEBEEP_OIDC_CLIENT_ID: 'webeep-client-di-prova',
    WEBEEP_OIDC_CLIENT_SECRET: 'segreto-di-prova',
  });

const createMemoryStore = (): StateStore => {
  let stored: Uint8Array | null = null;
  return {
    get: async () => stored,
    put: async (bytes) => {
      stored = bytes;
    },
  };
};

/**
 * Oidc finto: `startLogin` esegue subito la continuazione registrata, come se il login
 * Authentik fosse già riuscito con l'identità `identity`.
 */
const createInstantOidc = (identity: OidcIdentity = IDENTITY): Oidc => {
  const continuations = new Map<OidcPurpose, OidcContinuation<OidcPurpose>>();
  return {
    startLogin: async (purpose, payload) => {
      const continuation = continuations.get(purpose);
      if (continuation === undefined) throw new Error(`continuazione assente: ${purpose}`);
      // Cast giustificato come in oidc/index.ts: il payload arriva dal purpose con cui è stato avviato il login.
      return continuation(payload, identity, { clientIp: CLIENT_IP });
    },
    registerContinuation: (purpose, handler) => {
      // Cast giustificato come in oidc/index.ts: ogni handler riceve solo il payload del proprio purpose.
      continuations.set(purpose, handler as OidcContinuation<OidcPurpose>);
    },
    handle: async () => null,
  };
};

type LoginCall = { readonly purpose: OidcPurpose; readonly payload: OidcPayload[OidcPurpose] };

/** Oidc finto che registra la richiesta di login e risponde 302 verso Authentik. */
const createRedirectingOidc = (calls: LoginCall[]): Oidc => ({
  startLogin: async (purpose, payload) => {
    calls.push({ purpose, payload });
    return new Response(null, { status: 302, headers: { Location: AUTHENTIK_AUTHORIZE_URL } });
  },
  registerContinuation: () => undefined,
  handle: async () => null,
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const jsonOf = async (response: Response): Promise<Record<string, unknown>> => {
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new Error('il corpo JSON non è un oggetto');
  return value;
};

const stringField = (body: Record<string, unknown>, name: string): string => {
  const value = body[name];
  if (typeof value !== 'string') throw new Error(`campo ${name} assente o non stringa`);
  return value;
};

/** Token CSRF del consenso, letto dal campo nascosto della pagina. */
const consentTokenOf = (html: string): string => {
  const start = html.indexOf(CONSENT_FIELD);
  if (start < 0) throw new Error('token di consenso assente nella pagina');
  const valueStart = start + CONSENT_FIELD.length;
  return html.slice(valueStart, html.indexOf('"', valueStart));
};

const pkcePair = (): { readonly verifier: string; readonly challenge: string } => {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

/** Esegue le azioni una dopo l'altra: le richieste al server restano in ordine. */
const inSequence = <T>(items: readonly T[], action: (item: T) => Promise<void>): Promise<void> =>
  items.reduce<Promise<void>>(async (previous, item) => {
    await previous;
    await action(item);
  }, Promise.resolve());

const formPost = (path: string, fields: Record<string, string>): Request =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': FORM_CONTENT_TYPE },
    body: new URLSearchParams(fields).toString(),
  });

const jsonPost = (path: string, body: unknown): Request =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('OAuth', () => {
  let store: StateManager;
  let oauth: OAuth;
  let config: Config;

  const send = async (request: Request): Promise<Response> => {
    const response = await oauth.handle(request, { clientIp: CLIENT_IP });
    if (response === null) throw new Error(`percorso non gestito: ${request.url}`);
    return response;
  };

  const register = async (extra: Record<string, unknown> = {}): Promise<string> => {
    const response = await send(jsonPost('/register', { redirect_uris: [REDIRECT_URI], client_name: 'Claude di prova', ...extra }));
    expect(response.status).toBe(201);
    return stringField(await jsonOf(response), 'client_id');
  };

  const authorizeQuery = (clientId: string, challenge: string, extra: Record<string, string> = {}): string =>
    `/authorize?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: STATE_VALUE,
      ...extra,
    }).toString()}`;

  /** Risposta dell'utente alla pagina di consenso: `allow` o `deny`. */
  const decide = (consent: string, decision: string): Promise<Response> =>
    send(formPost('/authorize/consent', { consent, decision }));

  /** Simula l'approvazione: apre /authorize (login riuscito), legge il consenso e risponde allow. */
  const approve = async (clientId: string, challenge: string): Promise<string> => {
    const page = await send(new Request(`${BASE}${authorizeQuery(clientId, challenge)}`));
    expect(page.status).toBe(200);
    const response = await decide(consentTokenOf(await page.text()), 'allow');
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('Location') ?? '');
    expect(location.searchParams.get('state')).toBe(STATE_VALUE);
    const code = location.searchParams.get('code');
    if (code === null) throw new Error('codice assente nel redirect');
    return code;
  };

  const exchangeCode = (clientId: string, code: string, verifier: string): Promise<Response> =>
    send(
      formPost('/token', {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier,
      }),
    );

  const refresh = (clientId: string, refreshToken: string): Promise<Response> =>
    send(formPost('/token', { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }));

  beforeEach(async () => {
    config = createConfig();
    store = await createStateManager({
      store: createMemoryStore(),
      secretKey: new Uint8Array(SECRET_KEY_BYTES).fill(SECRET_KEY_FILL),
    });
    oauth = createOAuth({ config, store, oidc: createInstantOidc() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('metadati', () => {
    it('serve la risorsa protetta anche dall\'alias /mcp (RFC 9728)', async () => {
      await inSequence(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], async (path) => {
        const response = await send(new Request(`${BASE}${path}`));
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await jsonOf(response)).toEqual({
          resource: RESOURCE,
          authorization_servers: [BASE],
          bearer_methods_supported: ['header'],
        });
      });
    });

    it('descrive l\'authorization server (RFC 8414)', async () => {
      const body = await jsonOf(await send(new Request(`${BASE}/.well-known/oauth-authorization-server`)));
      expect(body).toEqual({
        issuer: BASE,
        authorization_endpoint: `${BASE}/authorize`,
        token_endpoint: `${BASE}/token`,
        registration_endpoint: `${BASE}/register`,
        revocation_endpoint: `${BASE}/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    });

    it('risponde 405 al metodo sbagliato e null ai percorsi non suoi', async () => {
      const wrongMethod = await send(new Request(`${BASE}/token`, { method: 'GET' }));
      expect(wrongMethod.status).toBe(METHOD_NOT_ALLOWED);
      expect(wrongMethod.headers.get('Allow')).toBe('POST');
      expect(await oauth.handle(new Request(`${BASE}/healthz`), { clientIp: CLIENT_IP })).toBeNull();
    });
  });

  describe('registrazione', () => {
    it('registra un client pubblico e restituisce i metadati', async () => {
      const response = await send(jsonPost('/register', { redirect_uris: [REDIRECT_URI], client_name: 'Claude' }));
      expect(response.status).toBe(201);
      const body = await jsonOf(response);
      expect(stringField(body, 'client_id').length).toBeGreaterThan(0);
      expect(body.token_endpoint_auth_method).toBe('none');
      expect(body.redirect_uris).toEqual([REDIRECT_URI]);
      expect(body).not.toHaveProperty('client_secret');
    });

    it('accetta https e http su localhost o 127.0.0.1, rifiuta gli altri', async () => {
      const accepted = ['https://app.example.org/cb', 'http://127.0.0.1:9000/cb', 'http://localhost/cb'];
      await inSequence(accepted, async (redirect) => {
        const response = await send(jsonPost('/register', { redirect_uris: [redirect] }));
        expect(response.status).toBe(201);
      });
      const rejected = ['http://app.example.org/cb', 'https://app.example.org/cb#frammento', 'javascript:alert(1)', '/relativo'];
      await inSequence(rejected, async (redirect) => {
        const response = await send(jsonPost('/register', { redirect_uris: [redirect] }));
        expect(response.status).toBe(400);
        expect((await jsonOf(response)).error).toBe('invalid_redirect_uri');
      });
    });

    it('rifiuta metadati non validi con invalid_client_metadata', async () => {
      const bodies: unknown[] = [
        'non json',
        {},
        { redirect_uris: [] },
        { redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: 'client_secret_basic' },
        { redirect_uris: [REDIRECT_URI], grant_types: ['implicit'] },
      ];
      await inSequence(bodies, async (body) => {
        const response = await send(jsonPost('/register', body));
        expect(response.status).toBe(400);
        expect((await jsonOf(response)).error).toBe('invalid_client_metadata');
      });
    });

    it('mantiene al massimo 20 client eliminando i più vecchi', async () => {
      const firstClient = await register();
      const pkce = pkcePair();
      await inSequence(Array.from({ length: REGISTRATION_LIMIT - 1 }, (_, index) => index), async () => {
        await register();
      });
      const state = await store.read();
      expect(state.clients).toHaveLength(REGISTRATION_LIMIT);

      await register();
      const after = await store.read();
      expect(after.clients).toHaveLength(REGISTRATION_LIMIT);
      expect(after.clients.some((client) => client.clientId === firstClient)).toBe(false);

      const response = await send(new Request(`${BASE}${authorizeQuery(firstClient, pkce.challenge)}`));
      expect(response.status).toBe(400);
    });
  });

  describe('autorizzazione e consenso', () => {
    it('authorize valido: avvia il login Authentik con purpose claude-authorize e i parametri validati', async () => {
      const calls: LoginCall[] = [];
      oauth = createOAuth({ config, store, oidc: createRedirectingOidc(calls) });
      const clientId = await register({ client_name: 'Claude di prova' });
      const pkce = pkcePair();

      const response = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge)}`));
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe(AUTHENTIK_AUTHORIZE_URL);
      expect(calls).toEqual([
        {
          purpose: 'claude-authorize',
          payload: {
            clientId,
            redirectUri: REDIRECT_URI,
            codeChallenge: pkce.challenge,
            state: STATE_VALUE,
            resource: undefined,
            clientName: 'Claude di prova',
          },
        },
      ]);
    });

    it('la continuazione mostra il consenso con escaping di client, host e utente', async () => {
      const malicious = '<script>alert("x")</script> & \'quote\'';
      oauth = createOAuth({
        config,
        store,
        oidc: createInstantOidc({ sub: 'utente-1', name: '<b>Mario</b>' }),
      });
      const clientId = await register({ client_name: malicious });
      const pkce = pkcePair();

      const response = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge)}`));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<b>Mario');
      expect(html).toContain(
        'Autorizza &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quote&#39; (localhost:3333) ad accedere a WeBeep in sola lettura',
      );
      expect(html).toContain('Accesso effettuato come &lt;b&gt;Mario&lt;/b&gt;.');
      expect(html).toContain('action="/authorize/consent"');
      expect(html).toContain('name="decision" value="allow">autorizza');
      expect(html).toContain('name="decision" value="deny">annulla');
      expect(html).not.toContain('password');
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
      expect(response.headers.get('Content-Security-Policy')).toContain("form-action 'self' http://localhost:3333");
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    });

    it('senza nome del client usa il testo di ripiego in italiano', async () => {
      const clientId = await register({ client_name: undefined });
      const pkce = pkcePair();
      const html = await (await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge)}`))).text();
      expect(html).toContain('Autorizza un&#39;app senza nome (localhost:3333) ad accedere a WeBeep in sola lettura');
    });

    it('autorizza: codice di 60 secondi, poi token e refresh con rotazione', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const code = await approve(clientId, pkce.challenge);

      const tokens = await exchangeCode(clientId, code, pkce.verifier);
      expect(tokens.status).toBe(200);
      expect(tokens.headers.get('Cache-Control')).toBe('no-store');
      expect(tokens.headers.get('Pragma')).toBe('no-cache');
      const issued = await jsonOf(tokens);
      expect(issued.token_type).toBe('Bearer');
      expect(issued.expires_in).toBe(ACCESS_TOKEN_TTL_MS / 1000);
      const accessToken = stringField(issued, 'access_token');
      const refreshToken = stringField(issued, 'refresh_token');
      expect(await oauth.verifyAccessToken(`Bearer ${accessToken}`)).toBe(true);
      expect(await oauth.verifyAccessToken(`bearer ${accessToken}`)).toBe(true);
      expect(await oauth.verifyAccessToken('Bearer token-inventato')).toBe(false);
      expect(await oauth.verifyAccessToken(null)).toBe(false);

      const rotated = await refresh(clientId, refreshToken);
      expect(rotated.status).toBe(200);
      const next = await jsonOf(rotated);
      const nextRefresh = stringField(next, 'refresh_token');
      expect(nextRefresh).not.toBe(refreshToken);
      expect(await oauth.verifyAccessToken(`Bearer ${stringField(next, 'access_token')}`)).toBe(true);

      const reused = await refresh(clientId, refreshToken);
      expect(reused.status).toBe(400);
      expect((await jsonOf(reused)).error).toBe('invalid_grant');

      const again = await refresh(clientId, nextRefresh);
      expect(again.status).toBe(200);

      const revoke = await send(formPost('/revoke', { token: stringField(await jsonOf(again), 'refresh_token') }));
      expect(revoke.status).toBe(200);
      expect(await revoke.text()).toBe('');
    });

    it('annulla: redirect con error=access_denied e state, senza codice', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const page = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge)}`));
      const response = await decide(consentTokenOf(await page.text()), 'deny');
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('Location') ?? '');
      expect(location.origin + location.pathname).toBe(REDIRECT_URI);
      expect(location.searchParams.get('error')).toBe('access_denied');
      expect(location.searchParams.get('error_description')).not.toBe('');
      expect(location.searchParams.get('state')).toBe(STATE_VALUE);
      expect(location.searchParams.has('code')).toBe(false);
    });

    it('token di consenso riusato: pagina 400, nessun secondo codice', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const page = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge)}`));
      const token = consentTokenOf(await page.text());
      expect((await decide(token, 'allow')).status).toBe(302);

      const reused = await decide(token, 'allow');
      expect(reused.status).toBe(400);
      expect(reused.headers.get('Location')).toBeNull();
      expect(await reused.text()).toContain(CONSENT_EXPIRED_MESSAGE);
    });

    it('token di consenso scaduto dopo 5 minuti: pagina 400, nessun codice', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const clientId = await register();
      const pkce = pkcePair();
      const page = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge)}`));
      const token = consentTokenOf(await page.text());
      vi.setSystemTime(Date.now() + CONSENT_TTL_MS + 1);

      const expired = await decide(token, 'allow');
      expect(expired.status).toBe(400);
      expect(expired.headers.get('Location')).toBeNull();
      expect(await expired.text()).toContain(CONSENT_EXPIRED_MESSAGE);
    });

    it('token mancante o decisione non valida: pagina 400, e il token si consuma comunque', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const missing = await send(formPost('/authorize/consent', { decision: 'allow' }));
      expect(missing.status).toBe(400);
      expect(missing.headers.get('Location')).toBeNull();

      const page = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge)}`));
      const token = consentTokenOf(await page.text());
      const invalid = await decide(token, 'forse');
      expect(invalid.status).toBe(400);
      expect(invalid.headers.get('Location')).toBeNull();

      const afterInvalid = await decide(token, 'allow');
      expect(afterInvalid.status).toBe(400);
      expect(afterInvalid.headers.get('Location')).toBeNull();
    });

    it('il consenso accetta solo POST su /authorize/consent e solo GET su /authorize', async () => {
      const consentGet = await send(new Request(`${BASE}/authorize/consent`));
      expect(consentGet.status).toBe(METHOD_NOT_ALLOWED);
      expect(consentGet.headers.get('Allow')).toBe('POST');
      const authorizePost = await send(formPost('/authorize', {}));
      expect(authorizePost.status).toBe(METHOD_NOT_ALLOWED);
      expect(authorizePost.headers.get('Allow')).toBe('GET');
    });
  });

  describe('sicurezza', () => {
    it('salva nello stato solo l\'hash del refresh token', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const tokens = await jsonOf(await exchangeCode(clientId, await approve(clientId, pkce.challenge), pkce.verifier));
      const refreshToken = stringField(tokens, 'refresh_token');
      const state = await store.read();
      const expectedHash = createHash('sha256').update(refreshToken).digest('hex');
      expect(state.refreshTokens.map((record) => record.hash)).toEqual([expectedHash]);
      expect(JSON.stringify(state)).not.toContain(refreshToken);
    });

    it('rifiuta un code_verifier errato e brucia comunque il codice', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const code = await approve(clientId, pkce.challenge);

      const wrong = await exchangeCode(clientId, code, pkcePair().verifier);
      expect(wrong.status).toBe(400);
      expect((await jsonOf(wrong)).error).toBe('invalid_grant');

      const retry = await exchangeCode(clientId, code, pkce.verifier);
      expect(retry.status).toBe(400);
      expect((await jsonOf(retry)).error).toBe('invalid_grant');
    });

    it('un codice usato due volte non vale una seconda volta', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const code = await approve(clientId, pkce.challenge);
      expect((await exchangeCode(clientId, code, pkce.verifier)).status).toBe(200);
      const reused = await exchangeCode(clientId, code, pkce.verifier);
      expect(reused.status).toBe(400);
      expect((await jsonOf(reused)).error).toBe('invalid_grant');
    });

    it('il codice scade dopo 60 secondi', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const clientId = await register();
      const pkce = pkcePair();
      const code = await approve(clientId, pkce.challenge);
      vi.setSystemTime(Date.now() + CODE_TTL_MS + 1);
      const expired = await exchangeCode(clientId, code, pkce.verifier);
      expect(expired.status).toBe(400);
      expect((await jsonOf(expired)).error).toBe('invalid_grant');
    });

    it('rifiuta un redirect_uri non registrato senza reindirizzare', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const response = await send(
        new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge, { redirect_uri: 'https://evil.example/cb' })}`),
      );
      expect(response.status).toBe(400);
      expect(response.headers.get('Location')).toBeNull();
      expect(response.headers.get('Content-Type')).toContain('text/html');
    });

    it('rifiuta un client sconosciuto con pagina di errore, senza redirect', async () => {
      const pkce = pkcePair();
      const response = await send(new Request(`${BASE}${authorizeQuery('client-inesistente', pkce.challenge)}`));
      expect(response.status).toBe(400);
      expect(response.headers.get('Location')).toBeNull();
    });

    it('con client valido ma PKCE mancante reindirizza con invalid_request e state', async () => {
      const clientId = await register();
      const response = await send(
        new Request(`${BASE}/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT_URI, response_type: 'code', state: 'abc' })}`),
      );
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get('Location') ?? '');
      expect(location.searchParams.get('error')).toBe('invalid_request');
      expect(location.searchParams.get('state')).toBe('abc');
    });

    it('response_type diverso da code: unsupported_response_type', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const response = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge, { response_type: 'token' })}`));
      expect(new URL(response.headers.get('Location') ?? '').searchParams.get('error')).toBe('unsupported_response_type');
    });

    it('resource diverso da quello del server: invalid_target', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const response = await send(new Request(`${BASE}${authorizeQuery(clientId, pkce.challenge, { resource: 'https://altro.example/mcp' })}`));
      expect(new URL(response.headers.get('Location') ?? '').searchParams.get('error')).toBe('invalid_target');
    });

    it('revokeAll invalida access token e refresh token', async () => {
      const clientId = await register();
      const pkce = pkcePair();
      const tokens = await jsonOf(await exchangeCode(clientId, await approve(clientId, pkce.challenge), pkce.verifier));
      const accessToken = stringField(tokens, 'access_token');
      const refreshToken = stringField(tokens, 'refresh_token');
      expect(await oauth.verifyAccessToken(`Bearer ${accessToken}`)).toBe(true);

      await oauth.revokeAll();
      expect(await oauth.verifyAccessToken(`Bearer ${accessToken}`)).toBe(false);
      expect((await jsonOf(await refresh(clientId, refreshToken))).error).toBe('invalid_grant');
    });

    it('revoca di un token inesistente risponde 200 e non scrive nulla', async () => {
      const response = await send(formPost('/revoke', { token: 'non-esiste' }));
      expect(response.status).toBe(200);
      const missing = await send(formPost('/revoke', {}));
      expect(missing.status).toBe(400);
      expect((await jsonOf(missing)).error).toBe('invalid_request');
    });

    it('grant sconosciuto e client sconosciuto nel token endpoint', async () => {
      const unsupported = await send(formPost('/token', { grant_type: 'password', client_id: 'x' }));
      expect(unsupported.status).toBe(400);
      expect((await jsonOf(unsupported)).error).toBe('unsupported_grant_type');

      const unknown = await send(formPost('/token', { grant_type: 'refresh_token', refresh_token: 'x', client_id: 'sconosciuto' }));
      expect(unknown.status).toBe(401);
      expect((await jsonOf(unknown)).error).toBe('invalid_client');
    });
  });

  it('/register accetta solo POST', async () => {
    const response = await send(new Request(`${BASE}/register`, { method: 'GET' }));
    expect(response.status).toBe(METHOD_NOT_ALLOWED);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});
