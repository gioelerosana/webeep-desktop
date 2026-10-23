import { describe, expect, it } from 'vitest';
import { createMoodleClient, type FetchLike, type MoodleClient } from './client.js';
import { searchCourses } from './endpoints.js';
import { MoodleResponseShapeError } from './errors.js';
import searchFixture from './__fixtures__/course-search.json';
import searchMinimalFixture from './__fixtures__/course-search-minimal.json';
import searchEmptyFixture from './__fixtures__/course-search-empty.json';
import searchNullNamesFixture from './__fixtures__/course-search-null-names.json';

const SITE_URL = 'https://webeep.polimi.it';
const TOKEN = 'token-di-prova';
const HTTP_OK = 200;
const FUNCTION_NAME = 'core_course_search_courses';
const QUERY = 'analisi';
const PAGE = 2;
const PER_PAGE = 20;
const FIRST_COURSE_ID = 101;
const SECOND_COURSE_ID = 205;
const SAMPLE_TOTAL = 27;
const MINIMAL_COURSE_ID = 301;
const MINIMAL_CATEGORY_ID = 9;
const EMPTY_TOTAL = 0;
const NULL_NAMES_COURSE_ID = 401;
const NULL_NAMES_CATEGORY_ID = 9;

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

const formOf = (requests: readonly RecordedRequest[]): URLSearchParams => {
  const [request] = requests;
  if (!request) throw new Error('nessuna richiesta inviata al fetch finto');
  return new URLSearchParams(String(request.init.body));
};

describe('searchCourses', () => {
  it('invia la ricerca per nome con pagina, dimensione e senza limite agli iscritti', async () => {
    const { client, requests } = clientWith(searchFixture);

    await searchCourses(client, { query: QUERY, page: PAGE, perPage: PER_PAGE });

    const form = formOf(requests);
    expect(form.get('wsfunction')).toBe(FUNCTION_NAME);
    expect(form.get('criterianame')).toBe('search');
    expect(form.get('criteriavalue')).toBe(QUERY);
    expect(form.get('page')).toBe(String(PAGE));
    expect(form.get('perpage')).toBe(String(PER_PAGE));
    expect(form.get('limittoenrolled')).toBe('0');
  });

  it('restituisce il totale e i corsi con i campi tipizzati, scartando quelli sconosciuti', async () => {
    const { client } = clientWith(searchFixture);

    const page = await searchCourses(client, { query: QUERY, page: 0, perPage: PER_PAGE });

    expect(page.total).toBe(SAMPLE_TOTAL);
    expect(page.courses.map((course) => course.id)).toEqual([FIRST_COURSE_ID, SECOND_COURSE_ID]);
    const [first, second] = page.courses;
    expect(first?.categoryname).toBe('Ingegneria Informatica');
    expect(first?.contacts).toEqual([{ id: 4001, fullname: 'Maria Formiggini' }]);
    expect(first?.enrollmentmethods).toEqual(['manual', 'self']);
    expect(second?.summary).toBe('');
    expect(second?.contacts).toEqual([]);
    expect(second).not.toHaveProperty('showactivitydates');
  });

  it('tollera i campi non essenziali mancanti o nulli', async () => {
    const { client } = clientWith(searchMinimalFixture);

    const page = await searchCourses(client, { query: QUERY, page: 0, perPage: PER_PAGE });

    const [course] = page.courses;
    expect(course?.id).toBe(MINIMAL_COURSE_ID);
    expect(course?.categoryid).toBe(MINIMAL_CATEGORY_ID);
    expect(course?.courseimage).toBeUndefined();
    expect(course?.categoryname).toBeUndefined();
    expect(course?.displayname).toBeUndefined();
    expect(course?.summary).toBe('');
    expect(course?.contacts).toEqual([]);
    expect(course?.enrollmentmethods).toEqual([]);
  });

  it('rifiuta una risposta senza categoryid', async () => {
    const { client } = clientWith({ total: 1, courses: [{ id: 1, fullname: 'Senza categoria', shortname: 'SC' }] });

    await expect(searchCourses(client, { query: QUERY, page: 0, perPage: PER_PAGE })).rejects.toThrow(MoodleResponseShapeError);
  });

  it('accetta una ricerca senza risultati come pagina vuota', async () => {
    const { client } = clientWith(searchEmptyFixture);

    const page = await searchCourses(client, { query: QUERY, page: 0, perPage: PER_PAGE });

    expect(page.total).toBe(EMPTY_TOTAL);
    expect(page.courses).toEqual([]);
  });

  it('normalizza displayname e categoryname a null come assenti', async () => {
    const { client } = clientWith(searchNullNamesFixture);

    const page = await searchCourses(client, { query: QUERY, page: 0, perPage: PER_PAGE });

    const [course] = page.courses;
    expect(course?.id).toBe(NULL_NAMES_COURSE_ID);
    expect(course?.categoryid).toBe(NULL_NAMES_CATEGORY_ID);
    expect(course?.displayname).toBeUndefined();
    expect(course?.categoryname).toBeUndefined();
  });
});
