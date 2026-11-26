/*
 * Handler del bridge finto: risposte e stato mutabile (sessione, impostazioni,
 * crash, aggiornamenti) che imitano il main process. Il bridge che li espone a
 * `window.webeep` sta in `../mock-bridge.ts`.
 */
import {
  COURSE_SEARCH_PAGE_SIZE,
  SERVER_PAIRING_KEY_MIN_LENGTH,
  type AuthState,
  type CrashReportSummary,
  type FeedbackKind,
  type IpcContract,
  type IpcErrorKind,
  type IpcEventName,
  type IpcEvents,
  type ServerLinkState,
  type Settings,
  type UpdateState,
} from '../../../../shared/ipc';
import {
  allCourses,
  catalog,
  courseModuleContextOf,
  coursePageOf,
  coursesByClassification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  matchesSearch,
  mockSearchParams,
  mockUser,
  sections,
  setCourseFavourite,
  upcomingEvents,
} from './fixtures';
import {
  MOCK_CURRENT_VERSION,
  initialUpdateState,
  isUpdateBusy,
  simulateDownload,
  simulateUpdateAfterCheck,
} from './updates';

const SECONDS_PER_MS = 1000;
const HOUR_S = 3_600;
const SIGNED_OUT_FLAG = 'signed-out';
const PAGE_NOT_FOUND_MESSAGE = 'Pagina non trovata in questo corso';
const MOCK_COURSE_NOT_FOUND_MESSAGE = 'Corso non trovato o non accessibile (errore simulato)';
/** Una query con questo testo simula un errore del servizio di ricerca. */
const SEARCH_ERROR_QUERY = 'errore';
const SEARCH_ERROR_MESSAGE = 'Ricerca non disponibile (errore simulato)';
const SEARCH_LOCALE = 'it-IT';
const MOCK_CRASH_PARAM_VALUE = 'crash';
const MOCK_CRASH_HOURS_AGO = 2;
const MOCK_CRASH_MESSAGE = 'il processo del renderer si è chiuso (crashed, codice 139)';
const MOCK_NEW_CRASH_ISSUE_TEMPLATE = 'crash_report.yml';
const NO_PENDING_CRASH_MESSAGE = 'nessuna segnalazione di crash da inviare';
const UPDATE_CHECK_DELAY_MS = 1_500;
const MOCK_RELEASES_URL = 'https://github.com/gioelerosana/webeep-desktop/releases';
const UPDATE_NOT_READY_MESSAGE = 'Nessun aggiornamento pronto da installare';
const UPDATE_NOT_AVAILABLE_MESSAGE = 'Nessun aggiornamento da scaricare';
const MOCK_NEW_ISSUE_URL = 'https://github.com/gioelerosana/webeep-desktop/issues/new';
const MOCK_FEEDBACK_TEMPLATE: Record<FeedbackKind, string> = {
  bug: 'bug_report.yml',
  feature: 'feature_request.yml',
};
const MOCK_SYSTEM_DESCRIPTION = 'linux (x64), Electron di prova';
/* Un server il cui nome contiene questo testo simula un server spento (errore `network`), per vedere lo stato di errore. */
const MOCK_OFFLINE_HOST_PART = 'offline';
const MOCK_SERVER_OFFLINE_MESSAGE = 'server non raggiungibile';
const MOCK_SERVER_URL_MESSAGE = 'indirizzo del server non valido';
const MOCK_PAIRING_KEY_MESSAGE = `la chiave di accoppiamento deve avere almeno ${SERVER_PAIRING_KEY_MIN_LENGTH} caratteri`;
const MOCK_UNLINKED: ServerLinkState = { serverUrl: null, paired: false };

/** Errore da restituire al renderer come `IpcFailure`, come farebbe il main. */
export class MockIpcFailure extends Error {
  override readonly name = 'MockIpcFailure';
  readonly kind: IpcErrorKind;

  constructor(kind: IpcErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

let auth: AuthState =
  mockSearchParams.get('mock') === SIGNED_OUT_FLAG ? { status: 'signed-out' } : { status: 'signed-in', user: mockUser };
let settings: Settings = { downloadDir: '/home/giulia/Scaricati/WeBeep', theme: 'system' };
/* Come il main: al più una segnalazione in attesa. Con `?mock=crash` ne parte una, da inviare o ignorare. */
let pendingCrash: CrashReportSummary | null =
  mockSearchParams.get('mock') === MOCK_CRASH_PARAM_VALUE
    ? {
        kind: 'renderer-gone',
        occurredAt: new Date(Date.now() - MOCK_CRASH_HOURS_AGO * HOUR_S * SECONDS_PER_MS).toISOString(),
        message: MOCK_CRASH_MESSAGE,
      }
    : null;
let updateState: UpdateState = initialUpdateState;
let serverLink: ServerLinkState = MOCK_UNLINKED;

/* Come il main: solo l'origine del server, con https o http verso localhost. Il bridge finto non fa rete. */
const mockOriginOf = (serverUrl: string): string => {
  try {
    return new URL(serverUrl.trim()).origin;
  } catch {
    throw new MockIpcFailure('invalid-input', MOCK_SERVER_URL_MESSAGE);
  }
};

// Un insieme di listener per evento: un listener di `window:maximized-changed` non deve ricevere `auth:changed`.
export const listeners: { readonly [TEvent in IpcEventName]: Set<(payload: IpcEvents[TEvent]) => void> } = {
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

type MockHandlers = {
  readonly [TChannel in keyof IpcContract]: (...args: IpcContract[TChannel]['args']) => IpcContract[TChannel]['result'];
};

export const handlers: MockHandlers = {
  'auth:get-state': () => auth,
  'auth:login': () => setAuth({ status: 'signed-in', user: mockUser }),
  'auth:logout': () => setAuth({ status: 'signed-out' }),
  'moodle:courses': (classification = 'inprogress') => coursesByClassification[classification](),
  // Come Moodle: un corso fuori dall'elenco dell'utente produce un errore `moodle`; il resto non cambia.
  'moodle:set-course-favourite': ({ courseId, favourite }) => {
    if (!allCourses().some((course) => course.id === courseId)) {
      throw new MockIpcFailure('moodle', MOCK_COURSE_NOT_FOUND_MESSAGE);
    }
    setCourseFavourite(courseId, favourite);
    return null;
  },
  'moodle:course-contents': () => sections,
  // Un `cmid` assente dalle fixture (es. 999999) simula una notifica che punta a un modulo non più risolvibile.
  'moodle:course-module': (cmid) => courseModuleContextOf(cmid),
  'moodle:upcoming-events': () => upcomingEvents,
  'moodle:notifications': () => {
    const items = getNotifications();
    return { notifications: [...items], unreadcount: items.filter((item) => !item.read).length };
  },
  // Come il main: il testo è pulito con trim e la pagina parte da 0; l'errore simulato non arriva al filtro.
  'moodle:searchCourses': ({ query, page }) => {
    const normalizedQuery = query.trim().toLocaleLowerCase(SEARCH_LOCALE);
    if (normalizedQuery === SEARCH_ERROR_QUERY) throw new MockIpcFailure('network', SEARCH_ERROR_MESSAGE);
    const matches = catalog.filter((course) => matchesSearch(course, normalizedQuery));
    const firstIndex = page * COURSE_SEARCH_PAGE_SIZE;
    return { total: matches.length, courses: matches.slice(firstIndex, firstIndex + COURSE_SEARCH_PAGE_SIZE) };
  },
  'moodle:mark-notification-read': (notificationId) => {
    markNotificationRead(notificationId);
    return null;
  },
  'moodle:mark-all-notifications-read': () => {
    markAllNotificationsRead();
    return null;
  },
  // Un id di modulo che non è una pagina nelle fixture (es. 999) simula l'errore `invalid-input` del main.
  'course:page': ({ moduleId }) => {
    const page = coursePageOf(moduleId);
    if (!page) throw new MockIpcFailure('invalid-input', PAGE_NOT_FOUND_MESSAGE);
    return page;
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
    setTimeout(() => simulateUpdateAfterCheck(platform, setUpdateState), UPDATE_CHECK_DELAY_MS);
    return setUpdateState({ currentVersion: MOCK_CURRENT_VERSION, platform, status: 'checking' });
  },
  // Riserva come nel main: su Windows il download parte da solo, quindi di norma risponde `invalid-input`.
  'updates:download': () => {
    if (updateState.status !== 'available' || updateState.mode !== 'install') {
      throw new MockIpcFailure('invalid-input', UPDATE_NOT_AVAILABLE_MESSAGE);
    }
    const { platform, version } = updateState;
    simulateDownload(platform, version, setUpdateState);
    return null;
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
  'crash:get-pending': () => pendingCrash,
  // Come il main: l'issue si apre nel browser e poi la segnalazione in attesa sparisce.
  'crash:report': () => {
    if (!pendingCrash) throw new MockIpcFailure('invalid-input', NO_PENDING_CRASH_MESSAGE);
    const params = new URLSearchParams({ template: MOCK_NEW_CRASH_ISSUE_TEMPLATE });
    window.open(`${MOCK_NEW_ISSUE_URL}?${params.toString()}`, '_blank', 'noopener');
    pendingCrash = null;
    return null;
  },
  'crash:dismiss': () => {
    pendingCrash = null;
    return null;
  },
  'crash:record-renderer-error': (report) => {
    pendingCrash ??= { kind: 'renderer-error', occurredAt: new Date().toISOString(), message: report.message };
    return null;
  },
  // Come il main: il collegamento salva URL e chiave solo se il server (qui finto) li accetta.
  'server:get-link': () => serverLink,
  'server:link': ({ serverUrl, pairingKey }) => {
    if (pairingKey.trim().length < SERVER_PAIRING_KEY_MIN_LENGTH) throw new MockIpcFailure('invalid-input', MOCK_PAIRING_KEY_MESSAGE);
    const origin = mockOriginOf(serverUrl);
    if (origin.includes(MOCK_OFFLINE_HOST_PART)) throw new MockIpcFailure('network', MOCK_SERVER_OFFLINE_MESSAGE);
    serverLink = { serverUrl: origin, paired: true, fullName: mockUser.fullname };
    return serverLink;
  },
  'server:unlink': () => {
    serverLink = MOCK_UNLINKED;
    return null;
  },
  'window:minimize': () => null,
  'window:toggle-maximize': () => null,
  'window:close': () => null,
  'window:is-maximized': () => false,
};
