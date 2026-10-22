import { describe, expect, it } from 'vitest';
import { callPublicAjax, createMoodleClient, type FetchLike } from './client.js';
import { MoodleApiError, MoodleNetworkError, MoodleResponseShapeError } from './errors.js';
import { publicConfigSchema, siteInfoSchema } from './schemas.js';
import publicConfigFixture from './__fixtures__/public-config.json';
import siteInfoFixture from './__fixtures__/site-info.json';

const SITE_URL = 'https://webeep.polimi.it';
const TOKEN = 'token-di-prova';
const WSFUNCTION = 'core_webservice_get_site_info';
const REST_ENDPOINT = `${SITE_URL}/webservice/rest/server.php?wsfunction=${WSFUNCTION}`;
const PUBLIC_CONFIG_METHOD = 'tool_mobile_get_public_config';
const PUBLIC_AJAX_ENDPOINT = `${SITE_URL}/lib/ajax/service-nologin.php?info=${PUBLIC_CONFIG_METHOD}`;
const COURSE_ID = 42;
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';
const HTTP_OK = 200;
const HTTP_UNAVAILABLE = 503;
const HTTP_SERVER_ERROR = 500;
const MOODLE_EXCEPTION = 'moodle_exception';
const INVALID_TOKEN_CODE = 'invalidtoken';
const ACCESS_EXCEPTION_CODE = 'accessexception';
const AJAX_ERROR_CODE = 'ajaxerror';

type RecordedRequest = { readonly url: string; readonly init: RequestInit };

type FakeFetch = { readonly fetchFn: FetchLike; readonly requests: readonly RecordedRequest[] };

/** Un `fetch` finto che registra le richieste e risponde con `respond`. */
const fakeFetch = (respond: () => Response): FakeFetch => {
  const requests: RecordedRequest[] = [];
  const fetchFn: FetchLike = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve(respond());
  };
  return { fetchFn, requests };
};

const jsonResponse = (body: unknown, status = HTTP_OK): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const onlyRequest = (requests: readonly RecordedRequest[]): RecordedRequest => {
  const [request] = requests;
  if (!request) throw new Error('nessuna richiesta inviata al fetch finto');
  return request;
};

const formOf = (request: RecordedRequest): URLSearchParams => new URLSearchParams(String(request.init.body));

const captureError = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error('la promessa avrebbe dovuto fallire');
};

describe('createMoodleClient', () => {
  describe('call', () => {
    it('invia una POST urlencoded con token, funzione, formato e parametri', async () => {
      const { fetchFn, requests } = fakeFetch(() => jsonResponse(siteInfoFixture));
      const client = createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn });

      await client.call(WSFUNCTION, { courseid: COURSE_ID }, siteInfoSchema);

      const request = onlyRequest(requests);
      expect(request.url).toBe(REST_ENDPOINT);
      expect(request.init.method).toBe('POST');
      expect(new Headers(request.init.headers).get('Content-Type')).toBe(FORM_CONTENT_TYPE);
      const form = formOf(request);
      expect(form.get('wstoken')).toBe(TOKEN);
      expect(form.get('wsfunction')).toBe(WSFUNCTION);
      expect(form.get('moodlewsrestformat')).toBe('json');
      expect(form.get('courseid')).toBe(String(COURSE_ID));
    });

    it('restituisce i dati validati dallo schema', async () => {
      const { fetchFn } = fakeFetch(() => jsonResponse(siteInfoFixture));
      const client = createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn });

      const info = await client.call(WSFUNCTION, {}, siteInfoSchema);

      expect(info).toEqual(siteInfoFixture);
    });

    it('rimuove le barre finali dal siteUrl', async () => {
      const { fetchFn, requests } = fakeFetch(() => jsonResponse(siteInfoFixture));
      const client = createMoodleClient({ siteUrl: `${SITE_URL}///`, token: TOKEN, fetch: fetchFn });

      await client.call(WSFUNCTION, {}, siteInfoSchema);

      expect(client.siteUrl).toBe(SITE_URL);
      expect(onlyRequest(requests).url).toBe(REST_ENDPOINT);
    });

    it('un errore invalidtoken diventa MoodleApiError con isAuthError true', async () => {
      const body = { exception: MOODLE_EXCEPTION, errorcode: INVALID_TOKEN_CODE, message: 'Invalid token' };
      const { fetchFn } = fakeFetch(() => jsonResponse(body));
      const client = createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn });

      const error = await captureError(client.call(WSFUNCTION, {}, siteInfoSchema));

      expect(error).toBeInstanceOf(MoodleApiError);
      expect(error).toMatchObject({
        errorCode: INVALID_TOKEN_CODE,
        message: body.message,
        wsfunction: WSFUNCTION,
        isAuthError: true,
      });
    });

    it('un altro errorcode non è un errore di autenticazione', async () => {
      const body = { exception: MOODLE_EXCEPTION, errorcode: ACCESS_EXCEPTION_CODE, message: 'Accesso negato' };
      const { fetchFn } = fakeFetch(() => jsonResponse(body));
      const client = createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn });

      const error = await captureError(client.call(WSFUNCTION, {}, siteInfoSchema));

      expect(error).toBeInstanceOf(MoodleApiError);
      expect(error).toMatchObject({ errorCode: ACCESS_EXCEPTION_CODE, isAuthError: false });
    });

    it('una risposta HTTP 500 diventa MoodleNetworkError con lo status', async () => {
      const { fetchFn } = fakeFetch(() => jsonResponse({ message: 'errore interno' }, HTTP_SERVER_ERROR));
      const client = createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn });

      const error = await captureError(client.call(WSFUNCTION, {}, siteInfoSchema));

      expect(error).toBeInstanceOf(MoodleNetworkError);
      expect(error).toMatchObject({ status: HTTP_SERVER_ERROR });
    });

    it('un fetch che lancia diventa MoodleNetworkError con la causa', async () => {
      const cause = new TypeError('fetch failed');
      const client = createMoodleClient({
        siteUrl: SITE_URL,
        token: TOKEN,
        fetch: () => Promise.reject(cause),
      });

      const error = await captureError(client.call(WSFUNCTION, {}, siteInfoSchema));

      expect(error).toBeInstanceOf(MoodleNetworkError);
      expect(error).toMatchObject({ cause });
    });

    it('il token non compare nei messaggi di errore di rete', async () => {
      const client = createMoodleClient({
        siteUrl: SITE_URL,
        token: TOKEN,
        fetch: () => Promise.reject(new TypeError('fetch failed')),
      });

      const error = await captureError(client.call(WSFUNCTION, {}, siteInfoSchema));

      expect(error).toMatchObject({ message: expect.not.stringContaining(TOKEN) });
    });

    it('una risposta con forma sbagliata diventa MoodleResponseShapeError', async () => {
      const { fetchFn } = fakeFetch(() => jsonResponse({ sitename: 'WeBeep' }));
      const client = createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn });

      const error = await captureError(client.call(WSFUNCTION, {}, siteInfoSchema));

      expect(error).toBeInstanceOf(MoodleResponseShapeError);
      expect(error).toMatchObject({ wsfunction: WSFUNCTION });
    });

    // Una pagina HTML con HTTP 200 (manutenzione, login scaduto) non deve uscire come SyntaxError.
    it('una risposta non JSON diventa MoodleResponseShapeError', async () => {
      const { fetchFn } = fakeFetch(() => new Response('<html>Accedi</html>', { status: HTTP_OK }));
      const client = createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn });

      const error = await captureError(client.call(WSFUNCTION, {}, siteInfoSchema));

      expect(error).toBeInstanceOf(MoodleResponseShapeError);
    });
  });
});

describe('callPublicAjax', () => {
  it('con risposta [{ error: false, data }] restituisce data validata', async () => {
    const { fetchFn, requests } = fakeFetch(() => jsonResponse([{ error: false, data: publicConfigFixture }]));

    const config = await callPublicAjax(SITE_URL, PUBLIC_CONFIG_METHOD, {}, publicConfigSchema, fetchFn);

    const request = onlyRequest(requests);
    expect(request.url).toBe(PUBLIC_AJAX_ENDPOINT);
    expect(request.init.method).toBe('POST');
    expect(JSON.parse(String(request.init.body))).toEqual([{ index: 0, methodname: PUBLIC_CONFIG_METHOD, args: {} }]);
    expect(config).toEqual({ ...publicConfigFixture, enablemobilewebservice: true });
  });

  it('rimuove la barra finale dal siteUrl', async () => {
    const { fetchFn, requests } = fakeFetch(() => jsonResponse([{ error: false, data: publicConfigFixture }]));

    await callPublicAjax(`${SITE_URL}/`, PUBLIC_CONFIG_METHOD, {}, publicConfigSchema, fetchFn);

    expect(onlyRequest(requests).url).toBe(PUBLIC_AJAX_ENDPOINT);
  });

  it('con risposta [{ error: true, data }] lancia MoodleApiError', async () => {
    const { fetchFn } = fakeFetch(() => jsonResponse([{ error: true, data: { errorcode: 'servicenotavailable' } }]));

    const error = await captureError(
      callPublicAjax(SITE_URL, PUBLIC_CONFIG_METHOD, {}, publicConfigSchema, fetchFn),
    );

    expect(error).toBeInstanceOf(MoodleApiError);
    expect(error).toMatchObject({ errorCode: AJAX_ERROR_CODE, wsfunction: PUBLIC_CONFIG_METHOD, isAuthError: false });
  });

  it('una risposta senza { error, data } diventa MoodleResponseShapeError', async () => {
    const { fetchFn } = fakeFetch(() => jsonResponse([{ foo: 'bar' }]));

    const error = await captureError(
      callPublicAjax(SITE_URL, PUBLIC_CONFIG_METHOD, {}, publicConfigSchema, fetchFn),
    );

    expect(error).toBeInstanceOf(MoodleResponseShapeError);
  });

  it('una risposta HTTP non riuscita diventa MoodleNetworkError', async () => {
    const { fetchFn } = fakeFetch(() => jsonResponse([], HTTP_UNAVAILABLE));

    const error = await captureError(
      callPublicAjax(SITE_URL, PUBLIC_CONFIG_METHOD, {}, publicConfigSchema, fetchFn),
    );

    expect(error).toBeInstanceOf(MoodleNetworkError);
    expect(error).toMatchObject({ status: HTTP_UNAVAILABLE });
  });
});
