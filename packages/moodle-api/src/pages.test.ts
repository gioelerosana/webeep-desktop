import { describe, expect, it } from 'vitest';
import { createMoodleClient, type FetchLike, type MoodleClient } from './client.js';
import { getPages } from './endpoints.js';
import pagesFixture from './__fixtures__/pages-by-courses.json';
import pagesMinimalFixture from './__fixtures__/pages-minimal.json';

const SITE_URL = 'https://webeep.polimi.it';
const TOKEN = 'token-di-prova';
const HTTP_OK = 200;
const FIRST_COURSE_ID = 101;
const SECOND_COURSE_ID = 102;
const COURSE_IDS = [FIRST_COURSE_ID, SECOND_COURSE_ID];
const FIRST_COURSE_MODULE_ID = 9010;
const SECOND_COURSE_MODULE_ID = 9011;
const WELCOME_PAGE_ID = 7001;
const EXTRA_PAGE_ID = 7002;
const MINIMAL_COURSE_MODULE_ID = 9020;
const PAGES_WITH_CONTENT_COUNT = 2;
const PROGRAMME_FILE_SIZE_BYTES = 20480;
const PROGRAMME_FILE_URL = `${SITE_URL}/webservice/pluginfile.php/1/mod_page/content/3/programma.pdf`;
const FUNCTION_NAME = 'mod_page_get_pages_by_courses';

type RecordedRequest = { readonly url: string; readonly init: RequestInit };

/** Un `fetch` finto che registra le richieste e risponde sempre con `body`. */
const fakeFetch = (body: unknown): { readonly fetchFn: FetchLike; readonly requests: RecordedRequest[] } => {
  const requests: RecordedRequest[] = [];
  const fetchFn: FetchLike = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status: HTTP_OK }));
  };
  return { fetchFn, requests };
};

const clientWith = (body: unknown): { readonly client: MoodleClient; readonly requests: RecordedRequest[] } => {
  const { fetchFn, requests } = fakeFetch(body);
  return { client: createMoodleClient({ siteUrl: SITE_URL, token: TOKEN, fetch: fetchFn }), requests };
};

const onlyRequest = (requests: readonly RecordedRequest[]): RecordedRequest => {
  const [request] = requests;
  if (!request) throw new Error('nessuna richiesta inviata al fetch finto');
  return request;
};

const formOf = (requests: readonly RecordedRequest[]): URLSearchParams =>
  new URLSearchParams(String(onlyRequest(requests).init.body));

describe('getPages', () => {
  it('invia courseids come array e la funzione corretta', async () => {
    const { client, requests } = clientWith(pagesFixture);

    await getPages(client, COURSE_IDS);

    const form = formOf(requests);
    expect(form.get('wsfunction')).toBe(FUNCTION_NAME);
    expect(form.get('courseids[0]')).toBe(String(FIRST_COURSE_ID));
    expect(form.get('courseids[1]')).toBe(String(SECOND_COURSE_ID));
    expect(onlyRequest(requests).url).toContain(`wsfunction=${FUNCTION_NAME}`);
  });

  it('restituisce le pagine con coursemodule e contenuto HTML', async () => {
    const { client } = clientWith(pagesFixture);

    const pages = await getPages(client, COURSE_IDS);
    const [welcome, extra] = pages;

    expect(pages).toHaveLength(PAGES_WITH_CONTENT_COUNT);
    expect(welcome).toMatchObject({ id: WELCOME_PAGE_ID, coursemodule: FIRST_COURSE_MODULE_ID, course: FIRST_COURSE_ID });
    expect(welcome?.content).toContain(`/mod/page/view.php?id=${SECOND_COURSE_MODULE_ID}`);
    expect(extra).toMatchObject({ id: EXTRA_PAGE_ID, coursemodule: SECOND_COURSE_MODULE_ID, course: SECOND_COURSE_ID });
  });

  it('mantiene i file allegati con i loro campi e lascia mimetype assente se manca', async () => {
    const { client } = clientWith(pagesFixture);

    const [welcome] = await getPages(client, COURSE_IDS);
    const [programme, calendar] = welcome?.contentfiles ?? [];

    expect(programme).toMatchObject({
      filename: 'programma.pdf',
      filesize: PROGRAMME_FILE_SIZE_BYTES,
      fileurl: PROGRAMME_FILE_URL,
      mimetype: 'application/pdf',
    });
    expect(calendar?.filename).toBe('calendario-lezioni.xlsx');
    expect(calendar?.mimetype).toBeUndefined();
  });

  it('applica i default quando i campi opzionali mancano', async () => {
    const { client } = clientWith(pagesMinimalFixture);

    const [page] = await getPages(client, [FIRST_COURSE_ID]);

    expect(page).toMatchObject({ name: 'Pagina essenziale', coursemodule: MINIMAL_COURSE_MODULE_ID, intro: '' });
    expect(page?.introfiles).toEqual([]);
    expect(page?.contentfiles).toEqual([]);
    expect(page?.contentformat).toBeUndefined();
    expect(page?.revision).toBeUndefined();
  });

  it('accetta una risposta senza la chiave warnings', async () => {
    const { client } = clientWith(pagesMinimalFixture);

    const pages = await getPages(client, [FIRST_COURSE_ID]);

    expect(pages).toHaveLength(1);
  });

  // Con courseids vuoto Moodle restituirebbe le pagine di tutti i corsi: non deve partire nessuna richiesta.
  it('con un elenco di corsi vuoto non chiama Moodle e restituisce []', async () => {
    const { client, requests } = clientWith(pagesFixture);

    const pages = await getPages(client, []);

    expect(pages).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
