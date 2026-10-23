/*
 * Implementazione dei canali dichiarati in `shared/ipc.ts`.
 *
 * `Handlers` è un mapped type sul contratto: se aggiungi un canale e non lo
 * implementi qui, il typecheck fallisce. Ogni risposta passa da `toResult`,
 * che converte le eccezioni in `IpcFailure` tipizzati.
 *
 * `runChannel` non dipende da `ipcMain`: la usano sia la registrazione IPC sia
 * il server della modalità web. Chi chiama porta il proprio contesto (la
 * finestra, se esiste) invece di un `IpcMainInvokeEvent`.
 */
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';
import {
  getCourseContents,
  getCourses,
  getNotifications,
  getUpcomingEvents,
  markAllNotificationsRead,
  markNotificationRead,
  MoodleApiError,
  MoodleNetworkError,
  MoodleResponseShapeError,
  searchCourses,
} from '@webeep/moodle-api';
import { LaunchTokenError } from '@webeep/moodle-api/auth';
import {
  COURSE_SEARCH_MAX_QUERY_LENGTH,
  COURSE_SEARCH_MIN_QUERY_LENGTH,
  COURSE_SEARCH_PAGE_SIZE,
  type IpcArgs,
  type IpcChannel,
  type IpcFailure,
  type IpcResult,
  type IpcReturn,
} from '../shared/ipc.js';
import { getActiveUser, getAuthState, login, logout, NotSignedInError, withClient } from './auth.js';
import { downloadFile, InvalidFileRequestError, openFile, revealFile } from './files.js';
import {
  dismissPendingCrash,
  getPendingCrashSummary,
  InvalidCrashReportError,
  recordRendererError,
  reportPendingCrash,
} from './crash-report.js';
import { InvalidFeedbackRequestError, openFeedbackIssue } from './feedback.js';
import { LoginCancelledError } from './login-window.js';
import { getCoursePage, InvalidPageRequestError } from './pages.js';
import { getSettings, updateSettings } from './settings.js';
import { checkForUpdates, getUpdateState, installUpdate, openReleasePage, UpdateNotReadyError } from './updater.js';

/** Chi ha inviato il comando. In modalità web la finestra è sempre assente. */
export type ChannelContext = { readonly window: BrowserWindow | undefined };

type Handler<TChannel extends IpcChannel> = (
  context: ChannelContext,
  ...args: IpcArgs<TChannel>
) => Promise<IpcReturn<TChannel>>;

type Handlers = { readonly [TChannel in IpcChannel]: Handler<TChannel> };

const EXTERNAL_PROTOCOLS: readonly string[] = ['http:', 'https:'];
const WINDOW_UNAVAILABLE_MESSAGE = 'nessuna finestra per questo comando';

class InvalidSearchRequestError extends Error {
  override readonly name = 'InvalidSearchRequestError';
}

/** Gli argomenti arrivano dal renderer, quindi si ricontrollano qui: il tipo da solo non basta. */
const parseSearchQuery = (raw: unknown): string => {
  const query = typeof raw === 'string' ? raw.trim() : '';
  if (query.length < COURSE_SEARCH_MIN_QUERY_LENGTH || query.length > COURSE_SEARCH_MAX_QUERY_LENGTH) {
    throw new InvalidSearchRequestError(
      `La ricerca deve avere tra ${COURSE_SEARCH_MIN_QUERY_LENGTH} e ${COURSE_SEARCH_MAX_QUERY_LENGTH} caratteri`,
    );
  }
  return query;
};

const parseSearchPage = (raw: unknown): number => {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    throw new InvalidSearchRequestError('Pagina della ricerca non valida');
  }
  return raw;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/* Un argomento `null` o non oggetto arriva dal renderer: va rifiutato prima di leggerne i campi. */
const parseSearchRequest = (raw: unknown): { readonly query: string; readonly page: number } => {
  if (!isRecord(raw)) throw new InvalidSearchRequestError('Richiesta di ricerca non valida');
  return { query: parseSearchQuery(raw.query), page: parseSearchPage(raw.page) };
};

class WindowUnavailableError extends Error {
  override readonly name = 'WindowUnavailableError';

  constructor() {
    super(WINDOW_UNAVAILABLE_MESSAGE);
  }
}

const toFailure = (error: unknown): IpcFailure => {
  if (error instanceof NotSignedInError) return { kind: 'auth', message: error.message };
  if (error instanceof MoodleApiError) return { kind: error.isAuthError ? 'auth' : 'moodle', message: error.message };
  if (error instanceof MoodleNetworkError) return { kind: 'network', message: error.message };
  if (error instanceof LoginCancelledError || error instanceof LaunchTokenError) return { kind: 'auth', message: error.message };
  if (error instanceof InvalidFileRequestError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof InvalidPageRequestError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof InvalidSearchRequestError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof WindowUnavailableError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof UpdateNotReadyError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof InvalidFeedbackRequestError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof InvalidCrashReportError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof MoodleResponseShapeError) return { kind: 'moodle', message: error.message };
  return { kind: 'unknown', message: error instanceof Error ? error.message : String(error) };
};

const requireWindow = (context: ChannelContext): BrowserWindow => {
  if (!context.window) throw new WindowUnavailableError();
  return context.window;
};

const windowOf = (event: IpcMainInvokeEvent): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(event.sender) ?? undefined;

const handlers: Handlers = {
  'auth:get-state': async () => getAuthState(),
  'auth:login': async (context) => login(context.window),
  'auth:logout': async () => logout(),

  'moodle:courses': async (_context, classification) => withClient((client) => getCourses(client, classification)),
  'moodle:course-contents': async (_context, courseId) => withClient((client) => getCourseContents(client, courseId)),
  'moodle:upcoming-events': async () => withClient((client) => getUpcomingEvents(client)),
  'moodle:notifications': async () =>
    withClient((client) => getNotifications(client, { userId: getActiveUser().userid })),
  'moodle:mark-notification-read': async (_context, notificationId) => {
    await withClient((client) => markNotificationRead(client, notificationId));
    return null;
  },
  'moodle:mark-all-notifications-read': async () => {
    await withClient((client) => markAllNotificationsRead(client, getActiveUser().userid));
    return null;
  },
  'moodle:searchCourses': async (_context, request) => {
    const { query, page } = parseSearchRequest(request);
    return withClient((client) => searchCourses(client, { query, page, perPage: COURSE_SEARCH_PAGE_SIZE }));
  },
  'course:page': async (_context, request) => getCoursePage(request),

  'files:open': async (_context, file) => {
    await openFile(file);
    return null;
  },
  'files:download': async (_context, file) => downloadFile(file),
  'files:reveal': async (_context, path) => {
    revealFile(path);
    return null;
  },

  'shell:open-external': async (_context, url) => {
    if (!EXTERNAL_PROTOCOLS.includes(new URL(url).protocol)) throw new InvalidFileRequestError('URL non ammesso');
    await shell.openExternal(url);
    return null;
  },

  'settings:get': async () => getSettings(),
  'settings:update': async (_context, patch) => updateSettings(patch),
  'settings:choose-download-dir': async (context) => {
    const options: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: (await getSettings()).downloadDir,
    };
    const parent = context.window;
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  },

  'updates:get-state': async () => getUpdateState(),
  'updates:check': async () => checkForUpdates(),
  'updates:install': async () => {
    installUpdate();
    return null;
  },
  'updates:open-release': async () => {
    await openReleasePage();
    return null;
  },

  'feedback:open': async (_context, kind) => {
    await openFeedbackIssue(kind);
    return null;
  },

  'crash:get-pending': async () => getPendingCrashSummary(),
  'crash:report': async () => {
    await reportPendingCrash();
    return null;
  },
  'crash:dismiss': async () => {
    dismissPendingCrash();
    return null;
  },
  'crash:record-renderer-error': async (_context, report) => {
    recordRendererError(report);
    return null;
  },

  'window:minimize': async (context) => {
    requireWindow(context).minimize();
    return null;
  },
  'window:toggle-maximize': async (context) => {
    const browserWindow = requireWindow(context);
    if (browserWindow.isMaximized()) browserWindow.unmaximize();
    else browserWindow.maximize();
    return null;
  },
  'window:close': async (context) => {
    requireWindow(context).close();
    return null;
  },
  'window:is-maximized': async (context) => requireWindow(context).isMaximized(),
};

/**
 * Canali implementati. `Handlers` obbliga a coprire tutto il contratto e a non avere
 * chiavi estranee, quindi le chiavi sono esattamente i canali. `Object.keys` le
 * tipizza come `string[]`: il cast è sicuro per questo motivo.
 */
export const IPC_CHANNELS: readonly IpcChannel[] = Object.keys(handlers) as IpcChannel[];

export const isIpcChannel = (name: string): name is IpcChannel => IPC_CHANNELS.some((channel) => channel === name);

const toResult = async <TData>(run: () => Promise<TData>): Promise<IpcResult<TData>> => {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: toFailure(error) };
  }
};

/**
 * Esegue un canale del contratto e restituisce sempre un `IpcResult`: gli errori
 * diventano `IpcFailure`, non eccezioni. Riusabile fuori da `ipcMain`.
 */
export const runChannel = async <TChannel extends IpcChannel>(
  channel: TChannel,
  args: IpcArgs<TChannel>,
  context: ChannelContext,
): Promise<IpcResult<IpcReturn<TChannel>>> => toResult(() => handlers[channel](context, ...args));

const register = <TChannel extends IpcChannel>(channel: TChannel): void => {
  ipcMain.handle(channel, (event, ...args) =>
    // Gli argomenti arrivano dal renderer come `unknown[]`: il preload è tipizzato su
    // IpcContract, quindi qui li trattiamo come dichiarati nel contratto.
    runChannel(channel, args as IpcArgs<TChannel>, { window: windowOf(event) }),
  );
};

export const registerIpcHandlers = (): void => {
  IPC_CHANNELS.forEach((channel) => register(channel));
};
