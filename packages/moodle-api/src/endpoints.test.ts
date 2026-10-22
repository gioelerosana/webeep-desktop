import { describe, expect, it, vi } from 'vitest';
import { createMoodleClient, type FetchLike, type MoodleClient } from './client.js';
import {
  authenticatedFileUrl,
  getCourseContents,
  getCourses,
  getNotifications,
  getUpcomingEvents,
  markNotificationRead,
} from './endpoints.js';
import actionEventsFixture from './__fixtures__/action-events.json';
import courseContentsFixture from './__fixtures__/course-contents.json';
import courseContentsNullFilepathFixture from './__fixtures__/course-contents-null-filepath.json';
import coursesFixture from './__fixtures__/courses-by-timeline.json';
import notificationsFixture from './__fixtures__/popup-notifications.json';

const SITE_URL = 'https://webeep.polimi.it';
const TOKEN = 'token-di-prova';
const USER_ID = 1234;
const COURSE_ID = 101;
const SECOND_COURSE_ID = 102;
const NOTIFICATION_ID = 3001;
const EVENT_NAME = 'Consegna esercizio 1';
const FILE_SIZE_BYTES = 20480;
const MS_PER_SECOND = 1000;
const FROM_SECONDS = 1729600000;
const NOW_MS = FROM_SECONDS * MS_PER_SECOND;
const DEFAULT_LIMIT = 50;
const UNREAD_COUNT = 1;
const HTTP_OK = 200;
const FILE_URL = `${SITE_URL}/pluginfile.php/1/mod_resource/content/1/dispensa.pdf`;
const DEFAULT_CLASSIFICATION = 'inprogress';
const PAST_CLASSIFICATION = 'past';

type RecordedRequest = { readonly url: string; readonly init: RequestInit };

/** Un `fetch` finto che registra le richieste e risponde sempre con `body`. */
const fakeFetch = (body: unknown): { readonly fetchFn: FetchLike; readonly requests: readonly RecordedRequest[] } => {
  const requests: RecordedRequest[] = [];
  const fetchFn: FetchLike = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status: HTTP_OK }));
  };
  return { fetchFn, requests };
};

const clientWith = (body: unknown): { readonly client: MoodleClient; readonly requests: readonly RecordedRequest[] } => {
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

describe('getCourses', () => {
  it('invia la classificazione e restituisce l\'elenco dei corsi', async () => {
    const { client, requests } = clientWith(coursesFixture);

    const courses = await getCourses(client, PAST_CLASSIFICATION);

    expect(formOf(requests).get('classification')).toBe(PAST_CLASSIFICATION);
    expect(courses.map((course) => course.id)).toEqual([COURSE_ID, SECOND_COURSE_ID]);
  });

  it('usa "inprogress" se la classificazione non è indicata', async () => {
    const { client, requests } = clientWith(coursesFixture);

    await getCourses(client);

    expect(formOf(requests).get('classification')).toBe(DEFAULT_CLASSIFICATION);
  });

  it('converte isfavourite e hidden in booleani', async () => {
    const { client } = clientWith(coursesFixture);

    const [inProgress, introductory] = await getCourses(client);

    expect(inProgress?.isfavourite).toBe(true);
    expect(introductory?.isfavourite).toBe(false);
    expect(introductory?.hidden).toBe(false);
  });
});

describe('getCourseContents', () => {
  it('invia courseid', async () => {
    const { client, requests } = clientWith(courseContentsFixture);

    await getCourseContents(client, COURSE_ID);

    expect(formOf(requests).get('courseid')).toBe(String(COURSE_ID));
  });

  it('trasforma i booleani 0/1 di Moodle in boolean', async () => {
    const { client } = clientWith(courseContentsFixture);

    const [section, hiddenSection] = await getCourseContents(client, COURSE_ID);
    const [resource] = section?.modules ?? [];

    expect(section?.visible).toBe(true);
    expect(hiddenSection?.visible).toBe(false);
    expect(hiddenSection?.uservisible).toBe(false);
    expect(resource?.visible).toBe(true);
    expect(resource?.uservisible).toBe(false);
  });

  it('applica i default quando i campi mancano', async () => {
    const { client } = clientWith(courseContentsFixture);

    const [section] = await getCourseContents(client, COURSE_ID);
    const forumModule = section?.modules[1];

    expect(forumModule?.uservisible).toBe(true);
    expect(forumModule?.contents).toEqual([]);
  });

  it('mantiene i file dei moduli con i loro campi', async () => {
    const { client } = clientWith(courseContentsFixture);

    const [section] = await getCourseContents(client, COURSE_ID);
    const [file] = section?.modules[0]?.contents ?? [];

    expect(file).toMatchObject({ filename: 'dispensa.pdf', filesize: FILE_SIZE_BYTES, mimetype: 'application/pdf' });
  });

  // Regressione: WeBeep manda `filepath: null` sui file; prima lo schema rifiutava l'intero corso.
  it('accetta filepath null (file di risorse e cartelle) e lo rende undefined', async () => {
    const { client } = clientWith(courseContentsNullFilepathFixture);

    const sections = await getCourseContents(client, COURSE_ID);
    const [resource, folder] = sections[0]?.modules ?? [];

    expect(sections).toHaveLength(1);
    expect(resource?.contents[0]).toMatchObject({ filename: 'appunti-esempio.pdf', filepath: undefined });
    expect(folder?.contents[0]).toMatchObject({ filename: 'slide-esempio.pptx', filepath: undefined });
  });
});

describe('getUpcomingEvents', () => {
  it('invia timesortfrom e limitnum di default', async () => {
    const { client, requests } = clientWith(actionEventsFixture);

    await getUpcomingEvents(client, { fromSeconds: FROM_SECONDS });

    const form = formOf(requests);
    expect(form.get('timesortfrom')).toBe(String(FROM_SECONDS));
    expect(form.get('limitnum')).toBe(String(DEFAULT_LIMIT));
  });

  it('senza fromSeconds usa l\'istante corrente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    try {
      const { client, requests } = clientWith(actionEventsFixture);

      await getUpcomingEvents(client);

      expect(formOf(requests).get('timesortfrom')).toBe(String(FROM_SECONDS));
    } finally {
      vi.useRealTimers();
    }
  });

  it('restituisce gli eventi con actionable come booleano', async () => {
    const { client } = clientWith(actionEventsFixture);

    const [event] = await getUpcomingEvents(client, { fromSeconds: FROM_SECONDS });

    expect(event?.name).toBe(EVENT_NAME);
    expect(event?.action?.actionable).toBe(true);
  });
});

describe('getNotifications', () => {
  it('invia useridto con limit e offset di default', async () => {
    const { client, requests } = clientWith(notificationsFixture);

    await getNotifications(client, { userId: USER_ID });

    const form = formOf(requests);
    expect(form.get('useridto')).toBe(String(USER_ID));
    expect(form.get('limit')).toBe(String(DEFAULT_LIMIT));
    expect(form.get('offset')).toBe('0');
  });

  it('restituisce notifiche e contatore non letti con read booleano', async () => {
    const { client } = clientWith(notificationsFixture);

    const page = await getNotifications(client, { userId: USER_ID });
    const [unread, read] = page.notifications;

    expect(page.unreadcount).toBe(UNREAD_COUNT);
    expect(unread).toMatchObject({ id: NOTIFICATION_ID, read: false });
    expect(read?.read).toBe(true);
  });
});

describe('markNotificationRead', () => {
  it('invia notificationid e timeread', async () => {
    const { client, requests } = clientWith({ notificationid: NOTIFICATION_ID });

    await markNotificationRead(client, NOTIFICATION_ID);

    const form = formOf(requests);
    expect(form.get('notificationid')).toBe(String(NOTIFICATION_ID));
    expect(form.has('timeread')).toBe(true);
  });
});

describe('authenticatedFileUrl', () => {
  it('aggiunge il token preservando la query esistente', () => {
    const url = new URL(authenticatedFileUrl(`${FILE_URL}?forcedownload=1`, TOKEN));

    expect(url.searchParams.get('forcedownload')).toBe('1');
    expect(url.searchParams.get('token')).toBe(TOKEN);
    expect(url.pathname).toBe(new URL(FILE_URL).pathname);
  });

  it('senza query aggiunge solo il token', () => {
    expect(authenticatedFileUrl(FILE_URL, TOKEN)).toBe(`${FILE_URL}?token=${TOKEN}`);
  });

  it('sostituisce un token già presente senza duplicarlo', () => {
    const url = new URL(authenticatedFileUrl(`${FILE_URL}?token=vecchio`, TOKEN));

    expect(url.searchParams.getAll('token')).toEqual([TOKEN]);
  });
});
