/*
 * Bridge finto per sviluppare l'interfaccia nel browser (`pnpm dev`, poi
 * http://localhost:5173), senza Electron né login. Si installa SOLO in dev e
 * SOLO se `window.webeep` manca. I dati sono in `mock-fixtures.json`; qui si
 * trasformano nelle forme di Moodle, con date relative a "adesso".
 *
 * `?mock=signed-out` nell'URL parte dalla schermata di login.
 * `?update=<scenario>` sceglie lo stato iniziale dell'aggiornamento (`idle` se manca).
 */
import type {
  CalendarEvent,
  Course,
  CourseSearchResult,
  CourseSection,
  CourseTimelineClassification,
  ModuleContent,
  MoodleNotification,
} from '@webeep/moodle-api';
import {
  COURSE_SEARCH_PAGE_SIZE,
  type AuthState,
  type CoursePage,
  type CoursePageFile,
  type FeedbackKind,
  type IpcContract,
  type IpcErrorKind,
  type IpcEventName,
  type IpcEvents,
  type IpcResult,
  type Settings,
  type UpdatePlatform,
  type UpdateState,
  type WebeepBridge,
} from '../../../shared/ipc';
import fixtures from './mock-fixtures.json';

const SECONDS_PER_MS = 1000;
const HOUR_S = 3_600;
const DAY_S = 86_400;
const MOCK_LATENCY_MS = 250;
const SIGNED_OUT_FLAG = 'signed-out';
const PDF_EXTENSION = '.pdf';
const PDF_MIMETYPE = 'application/pdf';
const BINARY_MIMETYPE = 'application/octet-stream';
const PAGE_NOT_FOUND_MESSAGE = 'Pagina non trovata in questo corso';
/** Una query con questo testo simula un errore del servizio di ricerca. */
const SEARCH_ERROR_QUERY = 'errore';
const SEARCH_ERROR_MESSAGE = 'Ricerca non disponibile (errore simulato)';
const SEARCH_LOCALE = 'it-IT';
const UPDATE_PARAM = 'update';
const UPDATE_CHECK_DELAY_MS = 1_500;
const MOCK_CURRENT_VERSION = '0.0.1';
const MOCK_NEW_VERSION = '0.0.2';
const MOCK_DOWNLOAD_PERCENT = 40;
const MOCK_RELEASES_URL = 'https://github.com/gioelerosana/webeep-desktop/releases';
const UPDATE_CHECK_ERROR_MESSAGE = 'Controllo degli aggiornamenti non riuscito (errore simulato)';
const UPDATE_NOT_READY_MESSAGE = 'Nessun aggiornamento pronto da installare';
const MOCK_NEW_ISSUE_URL = 'https://github.com/gioelerosana/webeep-desktop/issues/new';
const MOCK_FEEDBACK_TEMPLATE: Record<FeedbackKind, string> = {
  bug: 'bug_report.yml',
  feature: 'feature_request.yml',
};
const MOCK_SYSTEM_DESCRIPTION = 'linux (x64), Electron di prova';

const nowSeconds = Math.floor(Date.now() / SECONDS_PER_MS);
const { user } = fixtures;

const mimetypeOf = (filename: string): string => (filename.endsWith(PDF_EXTENSION) ? PDF_MIMETYPE : BINARY_MIMETYPE);

/** Errore da restituire al renderer come `IpcFailure`, come farebbe il main. */
class MockIpcFailure extends Error {
  override readonly name = 'MockIpcFailure';
  readonly kind: IpcErrorKind;

  constructor(kind: IpcErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

type FixtureCourse = (typeof fixtures.courses)[number];

const toCourse = (course: FixtureCourse): Course => ({
  ...course,
  summary: '',
  isfavourite: false,
  hidden: false,
  viewurl: `${user.siteurl}/course/view.php?id=${course.id}`,
});

const inProgressCourses: readonly Course[] = fixtures.courses.map(toCourse);
const pastCourses: readonly Course[] = fixtures.pastCourses.map(toCourse);
const courses: readonly Course[] = [...inProgressCourses, ...pastCourses];

/** Come Moodle: le classificazioni che nelle fixture non hanno corsi restituiscono un elenco vuoto. */
const coursesByClassification: Record<CourseTimelineClassification, readonly Course[]> = {
  all: courses,
  inprogress: inProgressCourses,
  past: pastCourses,
  future: [],
  favourites: [],
  hidden: [],
};

const catalog: readonly CourseSearchResult[] = fixtures.catalog;

const matchesSearch = (course: CourseSearchResult, normalizedQuery: string): boolean =>
  [course.fullname, course.shortname, course.categoryname ?? ''].some((field) =>
    field.toLocaleLowerCase(SEARCH_LOCALE).includes(normalizedQuery),
  );

type FixtureFile = { readonly name: string; readonly size: number; readonly daysAgo: number };

const toContent = (file: FixtureFile): ModuleContent => ({
  type: 'file',
  filename: file.name,
  filesize: file.size,
  fileurl: `${user.siteurl}/webservice/pluginfile.php/1/mod_resource/content/1/${encodeURIComponent(file.name)}`,
  timemodified: nowSeconds - file.daysAgo * DAY_S,
  mimetype: mimetypeOf(file.name),
});

type PageFixture = (typeof fixtures.pages)[number];
type PageFileFixture = PageFixture['files'][number];

const toCoursePageFile = (file: PageFileFixture): CoursePageFile => ({
  filename: file.name,
  filepath: '/',
  filesize: file.size,
  fileurl: file.fileurl,
  mimetype: mimetypeOf(file.name),
  timemodified: nowSeconds - file.daysAgo * DAY_S,
});

const toCoursePage = (page: PageFixture): CoursePage => ({
  moduleId: page.moduleId,
  name: page.name,
  introHtml: page.introHtml,
  contentHtml: page.contentHtml,
  files: page.files.map(toCoursePageFile),
  timemodified: nowSeconds - page.daysAgo * DAY_S,
});

const sections: readonly CourseSection[] = fixtures.sections.map((section) => ({
  id: section.id,
  name: section.name,
  summary: section.summary,
  section: section.section,
  visible: true,
  uservisible: true,
  modules: section.modules.map((module) => ({
    id: module.id,
    name: module.name,
    modname: module.modname,
    url: 'url' in module ? module.url : undefined,
    description: 'description' in module ? module.description : undefined,
    visible: true,
    uservisible: true,
    contents:
      'externalUrl' in module
        ? [{ type: 'url', filename: module.name, filesize: 0, fileurl: module.externalUrl }]
        : module.files.map(toContent),
  })),
}));

const courseById = new Map(courses.map((course) => [course.id, course]));

const events: readonly CalendarEvent[] = fixtures.events.map((event) => {
  const course = courseById.get(event.courseId);
  return {
    id: event.id,
    name: event.name,
    description: '',
    eventtype: 'due',
    modulename: event.modulename,
    timestart: nowSeconds + event.inHours * HOUR_S,
    timesort: nowSeconds + event.inHours * HOUR_S,
    timeduration: 0,
    overdue: false,
    url: `${user.siteurl}/mod/${event.modulename}/view.php?id=${event.id}`,
    course: course ? { id: course.id, fullname: course.fullname, shortname: course.shortname } : undefined,
  };
});

let notifications: readonly MoodleNotification[] = fixtures.notifications.map((item) => ({
  id: item.id,
  subject: item.subject,
  smallmessage: item.subject,
  fullmessagehtml: `<p>${item.subject}</p>`,
  contexturl: `${user.siteurl}/mod/forum/discuss.php?d=${item.id}`,
  contexturlname: 'Apri su WeBeep',
  component: 'mod_forum',
  eventtype: 'posts',
  timecreated: nowSeconds - item.hoursAgo * HOUR_S,
  read: item.read,
}));

let auth: AuthState =
  new URLSearchParams(window.location.search).get('mock') === SIGNED_OUT_FLAG
    ? { status: 'signed-out' }
    : { status: 'signed-in', user };
let settings: Settings = { downloadDir: '/home/giulia/Scaricati/WeBeep', theme: 'system' };

/** Scenari dell'aggiornamento per `?update=`: ognuno mostra uno stato diverso dell'interfaccia. */
type MockUpdateScenario =
  | 'unsupported'
  | 'idle'
  | 'available-win'
  | 'available-linux'
  | 'downloading'
  | 'ready'
  | 'error';
const MOCK_UPDATE_SCENARIOS: readonly MockUpdateScenario[] = [
  'unsupported',
  'idle',
  'available-win',
  'available-linux',
  'downloading',
  'ready',
  'error',
];
const MOCK_UPDATE_STATES: Record<MockUpdateScenario, UpdateState> = {
  unsupported: { currentVersion: MOCK_CURRENT_VERSION, platform: 'other', status: 'unsupported' },
  idle: { currentVersion: MOCK_CURRENT_VERSION, platform: 'linux', status: 'idle' },
  'available-win': {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'windows',
    status: 'available',
    version: MOCK_NEW_VERSION,
    mode: 'install',
  },
  'available-linux': {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'linux',
    status: 'available',
    version: MOCK_NEW_VERSION,
    mode: 'manual',
  },
  downloading: {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'windows',
    status: 'downloading',
    version: MOCK_NEW_VERSION,
    percent: MOCK_DOWNLOAD_PERCENT,
  },
  ready: { currentVersion: MOCK_CURRENT_VERSION, platform: 'windows', status: 'ready', version: MOCK_NEW_VERSION },
  error: {
    currentVersion: MOCK_CURRENT_VERSION,
    platform: 'linux',
    status: 'error',
    message: UPDATE_CHECK_ERROR_MESSAGE,
  },
};
const requestedUpdateScenario = new URLSearchParams(window.location.search).get(UPDATE_PARAM);
let updateState: UpdateState =
  MOCK_UPDATE_STATES[MOCK_UPDATE_SCENARIOS.find((scenario) => scenario === requestedUpdateScenario) ?? 'idle'];

// Un insieme di listener per evento: un listener di `window:maximized-changed` non deve ricevere `auth:changed`.
const listeners: { readonly [TEvent in IpcEventName]: Set<(payload: IpcEvents[TEvent]) => void> } = {
  'auth:changed': new Set(),
  'window:maximized-changed': new Set(),
  'updates:state-changed': new Set(),
};
const setAuth = (next: AuthState): AuthState => {
  auth = next;
  listeners['auth:changed'].forEach((listener) => listener(next));
  return next;
};
const setUpdateState = (next: UpdateState): UpdateState => {
  updateState = next;
  listeners['updates:state-changed'].forEach((listener) => listener(next));
  return next;
};

/** Esito simulato del controllo: su Windows c'è una versione da installare, su Linux solo da segnalare. */
const updateAvailableAfterCheck = (platform: UpdatePlatform): UpdateState => ({
  currentVersion: MOCK_CURRENT_VERSION,
  platform,
  status: 'available',
  version: MOCK_NEW_VERSION,
  mode: platform === 'windows' ? 'install' : 'manual',
});

/* Stessa regola di `isBusy` nel main: con questi stati un nuovo controllo sarebbe inutile o avvierebbe un secondo download. */
const BUSY_UPDATE_STATUSES: readonly UpdateState['status'][] = ['checking', 'downloading', 'ready'];

/* `available` è occupato solo su Windows (download in corso o imminente); su Linux è un avviso e si può ricontrollare. */
const isUpdateBusy = (current: UpdateState): boolean => {
  if (current.status === 'available') return current.mode === 'install';
  return BUSY_UPDATE_STATUSES.includes(current.status);
};

type MockHandlers = {
  readonly [TChannel in keyof IpcContract]: (...args: IpcContract[TChannel]['args']) => IpcContract[TChannel]['result'];
};

const handlers: MockHandlers = {
  'auth:get-state': () => auth,
  'auth:login': () => setAuth({ status: 'signed-in', user }),
  'auth:logout': () => setAuth({ status: 'signed-out' }),
  'moodle:courses': (classification = 'inprogress') => coursesByClassification[classification],
  'moodle:course-contents': () => sections,
  'moodle:upcoming-events': () => events,
  'moodle:notifications': () => ({ notifications: [...notifications], unreadcount: notifications.filter((item) => !item.read).length }),
  // Come il main: il testo è pulito con trim e la pagina parte da 0; l'errore simulato non arriva al filtro.
  'moodle:searchCourses': ({ query, page }) => {
    const normalizedQuery = query.trim().toLocaleLowerCase(SEARCH_LOCALE);
    if (normalizedQuery === SEARCH_ERROR_QUERY) throw new MockIpcFailure('network', SEARCH_ERROR_MESSAGE);
    const matches = catalog.filter((course) => matchesSearch(course, normalizedQuery));
    const firstIndex = page * COURSE_SEARCH_PAGE_SIZE;
    return { total: matches.length, courses: matches.slice(firstIndex, firstIndex + COURSE_SEARCH_PAGE_SIZE) };
  },
  'moodle:mark-notification-read': (notificationId) => {
    notifications = notifications.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
    return null;
  },
  'moodle:mark-all-notifications-read': () => {
    notifications = notifications.map((item) => ({ ...item, read: true }));
    return null;
  },
  // Un id di modulo che non è una pagina nelle fixture (es. 999) simula l'errore `invalid-input` del main.
  'course:page': ({ moduleId }) => {
    const page = fixtures.pages.find((item) => item.moduleId === moduleId);
    if (!page) throw new MockIpcFailure('invalid-input', PAGE_NOT_FOUND_MESSAGE);
    return toCoursePage(page);
  },
  'files:open': () => null,
  'files:download': (request) => ({ path: `${settings.downloadDir}/${request.courseName}/${request.fileName}`, downloaded: true }),
  'files:reveal': () => null,
  'shell:open-external': (url) => {
    window.open(url, '_blank', 'noopener');
    return null;
  },
  'settings:get': () => settings,
  'settings:update': (patch) => {
    settings = { ...settings, ...patch };
    return settings;
  },
  'settings:choose-download-dir': () => '/home/giulia/Documenti/Polimi',
  'updates:get-state': () => updateState,
  // Come il main: `checking` subito, poi l'esito con `updates:state-changed` dopo un ritardo.
  'updates:check': () => {
    if (updateState.status === 'unsupported' || isUpdateBusy(updateState)) return updateState;
    const { platform } = updateState;
    setTimeout(() => setUpdateState(updateAvailableAfterCheck(platform)), UPDATE_CHECK_DELAY_MS);
    return setUpdateState({ currentVersion: MOCK_CURRENT_VERSION, platform, status: 'checking' });
  },
  // Nel bridge finto non si riavvia nulla: il log basta a vedere che la chiamata è arrivata.
  'updates:install': () => {
    if (updateState.status !== 'ready') throw new MockIpcFailure('invalid-input', UPDATE_NOT_READY_MESSAGE);
    console.info('[webeep] Installazione simulata: nessun riavvio.');
    return null;
  },
  'updates:open-release': () => {
    window.open(MOCK_RELEASES_URL, '_blank', 'noopener');
    return null;
  },
  // Come il main: il tipo sceglie il modulo; la versione e il sistema, solo per i bug, sono di prova.
  'feedback:open': (kind) => {
    const params = new URLSearchParams({ template: MOCK_FEEDBACK_TEMPLATE[kind] });
    if (kind === 'bug') {
      params.set('app-version', MOCK_CURRENT_VERSION);
      params.set('os', MOCK_SYSTEM_DESCRIPTION);
    }
    window.open(`${MOCK_NEW_ISSUE_URL}?${params.toString()}`, '_blank', 'noopener');
    return null;
  },
  'window:minimize': () => null,
  'window:toggle-maximize': () => null,
  'window:close': () => null,
  'window:is-maximized': () => false,
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const mockBridge: WebeepBridge = {
  kind: 'mock',
  invoke: async (channel, ...args) => {
    await delay(MOCK_LATENCY_MS);
    // Il mapped type garantisce che ogni handler accetti gli argomenti del proprio canale;
    // TypeScript non riesce a correlare `channel` e `args` attraverso l'indicizzazione.
    const handler = handlers[channel] as (...input: typeof args) => IpcContract[typeof channel]['result'];
    try {
      const result: IpcResult<IpcContract[typeof channel]['result']> = { ok: true, data: handler(...args) };
      return result;
    } catch (error) {
      // Solo gli errori simulati diventano un `IpcFailure`; gli altri sono bug del bridge e si rilanciano.
      if (error instanceof MockIpcFailure) return { ok: false, error: { kind: error.kind, message: error.message } };
      throw error;
    }
  },
  on: <TEvent extends IpcEventName>(event: TEvent, listener: (payload: IpcEvents[TEvent]) => void) => {
    const eventListeners = listeners[event];
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },
  // Nel bridge finto le immagini sono URL pubblici di fixture: nessun token da nascondere.
  assetUrl: (fileUrl) => fileUrl,
  platform: 'linux',
};

export const installMockBridgeIfNeeded = (): void => {
  if (!import.meta.env.DEV || 'webeep' in window) return;
  Object.defineProperty(window, 'webeep', { value: mockBridge });
  console.info('[webeep] Bridge finto attivo: dati inventati, nessuna chiamata a WeBeep.');
};
