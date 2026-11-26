import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoodleNetworkError } from './errors.js';
import {
  fetchWebeepFile,
  InvalidWebeepUrlError,
  isWebeepUrl,
  sanitizeSegment,
  toWebserviceUrl,
  UnsafeRedirectError,
  WebeepFileTooLargeError,
} from './files.js';

const SITE_URL = 'https://webeep.polimi.it';
const PLUGINFILE_URL = `${SITE_URL}/pluginfile.php/1/mod_page/content/3/programma.pdf`;
const WEBSERVICE_PLUGINFILE_PATH = '/webservice/pluginfile.php/1/mod_page/content/3/programma.pdf';
const THEME_IMAGE_URL = `${SITE_URL}/theme/image.php/_s/icon`;
const INTERNAL_REDIRECT_PATH = '/pluginfile.php/1/mod_page/content/4/altro.pdf';
const WEBSERVICE_INTERNAL_REDIRECT_PATH = '/webservice/pluginfile.php/1/mod_page/content/4/altro.pdf';
const LOGIN_PAGE_PATH = '/login/index.php';
const EXTERNAL_FILE_URL = 'https://evil.example/raccolta.pdf';
const TOKEN = 'segreto-789';
const HTTP_OK = 200;
const HTTP_FOUND = 302;
const HTTP_SERVER_ERROR = 500;
// Massimo di redirect seguiti: la richiesta successiva al quinto redirect è già un errore.
const REDIRECT_LIMIT = 5;
const MAX_BYTES = 1024;
const OVERSIZE_BYTES = 2048;
const SEGMENT_LIMIT = 120;
const LONG_NAME_LENGTH = 200;
const FALLBACK_SEGMENT = 'senza-nome';

type RecordedCall = { readonly url: string; readonly init: RequestInit | undefined };

/** Sostituisce `fetch` globale con una risposta fissa e registra le richieste. */
const stubFetch = (respond: () => Promise<Response>): RecordedCall[] => {
  const calls: RecordedCall[] = [];
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init });
    return respond();
  });
  return calls;
};

const okResponse = (headers: Record<string, string> = {}): Response =>
  new Response('contenuto', { status: HTTP_OK, headers });

/** Come `stubFetch`, ma risponde in sequenza: una risposta per richiesta, nell'ordine dato. */
const stubFetchSequence = (responses: readonly Response[]): RecordedCall[] => {
  const queue = [...responses];
  return stubFetch(() => {
    const next = queue.shift();
    return next ? Promise.resolve(next) : Promise.reject(new Error('richiesta inattesa'));
  });
};

const redirectTo = (location: string): Response => new Response(null, { status: HTTP_FOUND, headers: { location } });

const callAt = (calls: readonly RecordedCall[], index: number): RecordedCall => {
  const call = calls.at(index);
  if (!call) throw new Error(`nessuna richiesta numero ${index} inviata al fetch finto`);
  return call;
};

const onlyCall = (calls: readonly RecordedCall[]): RecordedCall => callAt(calls, 0);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isWebeepUrl', () => {
  it('accetta https su webeep.polimi.it', () => {
    expect(isWebeepUrl(PLUGINFILE_URL)).toBe(true);
  });

  it('rifiuta http, altri host e sottodomini finti', () => {
    expect(isWebeepUrl('http://webeep.polimi.it/a.pdf')).toBe(false);
    expect(isWebeepUrl('https://webeep.polimi.it.attacker.com/a.pdf')).toBe(false);
    expect(isWebeepUrl('https://evil.example/webeep.polimi.it/a.pdf')).toBe(false);
  });

  it('rifiuta una porta diversa dal sito', () => {
    expect(isWebeepUrl('https://webeep.polimi.it:8443/a.pdf')).toBe(false);
  });

  it('rifiuta un testo che non è un URL senza lanciare errori', () => {
    expect(isWebeepUrl('non un url')).toBe(false);
  });
});

describe('toWebserviceUrl', () => {
  it('riscrive /pluginfile.php/ in /webservice/pluginfile.php/', () => {
    expect(toWebserviceUrl(new URL(PLUGINFILE_URL)).pathname).toBe(WEBSERVICE_PLUGINFILE_PATH);
  });

  it('lascia invariati i percorsi che già passano dal web service', () => {
    const url = new URL(`${SITE_URL}${WEBSERVICE_PLUGINFILE_PATH}`);
    expect(toWebserviceUrl(url).pathname).toBe(WEBSERVICE_PLUGINFILE_PATH);
  });

  it('lascia invariati gli altri percorsi e non modifica l\'URL di partenza', () => {
    const url = new URL(THEME_IMAGE_URL);
    expect(toWebserviceUrl(url).pathname).toBe('/theme/image.php/_s/icon');
    expect(url.pathname).toBe('/theme/image.php/_s/icon');
  });
});

describe('sanitizeSegment', () => {
  it('sostituisce i caratteri non ammessi nei nomi di file', () => {
    expect(sanitizeSegment('Analisi 1: esercizi/parte?')).toBe('Analisi 1_ esercizi_parte_');
  });

  it('toglie punti e spazi finali', () => {
    expect(sanitizeSegment('slide. ')).toBe('slide');
    expect(sanitizeSegment('slide.pdf')).toBe('slide.pdf');
  });

  it('non lascia passare i segmenti relativi', () => {
    expect(sanitizeSegment('..')).toBe(FALLBACK_SEGMENT);
    expect(sanitizeSegment('.')).toBe(FALLBACK_SEGMENT);
  });

  it('usa un nome di ripiego per un segmento vuoto', () => {
    expect(sanitizeSegment('   ')).toBe(FALLBACK_SEGMENT);
  });

  it('limita la lunghezza del segmento', () => {
    expect(sanitizeSegment('a'.repeat(LONG_NAME_LENGTH))).toHaveLength(SEGMENT_LIMIT);
  });
});

describe('fetchWebeepFile', () => {
  it('invia il token in query per i file protetti, sul percorso del web service', async () => {
    const calls = stubFetch(() => Promise.resolve(okResponse()));

    await fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN });

    const requested = new URL(onlyCall(calls).url);
    expect(requested.pathname).toBe(WEBSERVICE_PLUGINFILE_PATH);
    expect(requested.searchParams.get('token')).toBe(TOKEN);
  });

  it('non invia il token a un URL di WeBeep che non è un file protetto', async () => {
    const calls = stubFetch(() => Promise.resolve(okResponse()));

    await fetchWebeepFile({ fileUrl: THEME_IMAGE_URL, token: TOKEN });

    expect(onlyCall(calls).url).toBe(THEME_IMAGE_URL);
    expect(onlyCall(calls).url).not.toContain(TOKEN);
  });

  it('rifiuta un URL di altro host senza fare richieste', async () => {
    const calls = stubFetch(() => Promise.resolve(okResponse()));

    await expect(fetchWebeepFile({ fileUrl: 'https://evil.example/a.pdf', token: TOKEN })).rejects.toBeInstanceOf(
      InvalidWebeepUrlError,
    );
    expect(calls).toHaveLength(0);
  });

  it('segnala lo stato HTTP non ok come errore di rete, senza token nel messaggio', async () => {
    stubFetch(() => Promise.resolve(new Response('errore', { status: HTTP_SERVER_ERROR })));

    const failure = fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN });

    await expect(failure).rejects.toBeInstanceOf(MoodleNetworkError);
    await expect(failure).rejects.toMatchObject({ status: HTTP_SERVER_ERROR });
    await expect(failure).rejects.not.toThrow(TOKEN);
  });

  it('non riporta il token nel messaggio se la rete cade', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));

    const failure = fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN });

    await expect(failure).rejects.toBeInstanceOf(MoodleNetworkError);
    await expect(failure).rejects.not.toThrow(TOKEN);
  });

  it('segue un redirect interno a WeBeep e aggiunge il token solo al file protetto di destinazione', async () => {
    const calls = stubFetchSequence([redirectTo(INTERNAL_REDIRECT_PATH), okResponse()]);

    const response = await fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN });

    expect(response.status).toBe(HTTP_OK);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.init?.redirect === 'manual')).toBe(true);
    expect(new URL(callAt(calls, 0).url).searchParams.get('token')).toBe(TOKEN);
    const followed = new URL(callAt(calls, 1).url);
    expect(followed.pathname).toBe(WEBSERVICE_INTERNAL_REDIRECT_PATH);
    expect(followed.searchParams.get('token')).toBe(TOKEN);
  });

  it('non aggiunge il token a un redirect verso una pagina di WeBeep non protetta', async () => {
    const calls = stubFetchSequence([redirectTo(LOGIN_PAGE_PATH), okResponse()]);

    await fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN });

    expect(callAt(calls, 1).url).toBe(`${SITE_URL}${LOGIN_PAGE_PATH}`);
    expect(callAt(calls, 1).url).not.toContain(TOKEN);
  });

  it('rifiuta un redirect verso un altro host senza contattarlo e senza token nel messaggio', async () => {
    const calls = stubFetchSequence([redirectTo(EXTERNAL_FILE_URL)]);

    const failure = fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN });

    await expect(failure).rejects.toBeInstanceOf(UnsafeRedirectError);
    await expect(failure).rejects.not.toThrow(TOKEN);
    expect(calls).toHaveLength(1);
    expect(calls.some((call) => new URL(call.url).hostname !== new URL(SITE_URL).hostname)).toBe(false);
  });

  it('rifiuta una Location non valida senza richiedere nulla', async () => {
    const calls = stubFetchSequence([redirectTo('http://[non-un-url')]);

    await expect(fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN })).rejects.toBeInstanceOf(UnsafeRedirectError);
    expect(calls).toHaveLength(1);
  });

  it('si ferma dopo il quinto redirect con un errore di rete, senza token nel messaggio', async () => {
    const calls = stubFetchSequence(Array.from({ length: REDIRECT_LIMIT + 1 }, () => redirectTo(INTERNAL_REDIRECT_PATH)));

    const failure = fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN });

    await expect(failure).rejects.toBeInstanceOf(MoodleNetworkError);
    await expect(failure).rejects.not.toThrow(TOKEN);
    expect(calls).toHaveLength(REDIRECT_LIMIT + 1);
  });

  it('rifiuta un file con Content-Length oltre il limite e chiude il corpo', async () => {
    stubFetch(() => Promise.resolve(okResponse({ 'content-length': String(OVERSIZE_BYTES) })));

    await expect(fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN, maxBytes: MAX_BYTES })).rejects.toBeInstanceOf(
      WebeepFileTooLargeError,
    );
  });

  it('accetta un file entro il limite', async () => {
    stubFetch(() => Promise.resolve(okResponse({ 'content-length': String(MAX_BYTES) })));

    const response = await fetchWebeepFile({ fileUrl: PLUGINFILE_URL, token: TOKEN, maxBytes: MAX_BYTES });

    expect(response.status).toBe(HTTP_OK);
  });
});
