/*
 * Implementazione dei canali dichiarati in `shared/ipc.ts`.
 *
 * `Handlers` è un mapped type sul contratto: se aggiungi un canale e non lo
 * implementi qui, il typecheck fallisce. Ogni risposta passa da `toResult`,
 * che converte le eccezioni in `IpcFailure` tipizzati.
 */
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';
import {
  getCourseContents,
  getCourses,
  getNotifications,
  getUpcomingEvents,
  markNotificationRead,
  MoodleApiError,
  MoodleNetworkError,
  MoodleResponseShapeError,
} from '@webeep/moodle-api';
import { LaunchTokenError } from '@webeep/moodle-api/auth';
import type { IpcArgs, IpcChannel, IpcFailure, IpcResult, IpcReturn } from '../shared/ipc.js';
import { getActiveUser, getAuthState, login, logout, NotSignedInError, withClient } from './auth.js';
import { downloadFile, InvalidFileRequestError, openFile, revealFile } from './files.js';
import { LoginCancelledError } from './login-window.js';
import { getSettings, updateSettings } from './settings.js';

type Handler<TChannel extends IpcChannel> = (
  event: IpcMainInvokeEvent,
  ...args: IpcArgs<TChannel>
) => Promise<IpcReturn<TChannel>>;

type Handlers = { readonly [TChannel in IpcChannel]: Handler<TChannel> };

const EXTERNAL_PROTOCOLS: readonly string[] = ['http:', 'https:'];

const toFailure = (error: unknown): IpcFailure => {
  if (error instanceof NotSignedInError) return { kind: 'auth', message: error.message };
  if (error instanceof MoodleApiError) return { kind: error.isAuthError ? 'auth' : 'moodle', message: error.message };
  if (error instanceof MoodleNetworkError) return { kind: 'network', message: error.message };
  if (error instanceof LoginCancelledError || error instanceof LaunchTokenError) return { kind: 'auth', message: error.message };
  if (error instanceof InvalidFileRequestError) return { kind: 'invalid-input', message: error.message };
  if (error instanceof MoodleResponseShapeError) return { kind: 'moodle', message: error.message };
  return { kind: 'unknown', message: error instanceof Error ? error.message : String(error) };
};

const windowOf = (event: IpcMainInvokeEvent): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(event.sender) ?? undefined;

const handlers: Handlers = {
  'auth:get-state': async () => getAuthState(),
  'auth:login': async (event) => login(windowOf(event)),
  'auth:logout': async () => logout(),

  'moodle:courses': async (_event, classification) => withClient((client) => getCourses(client, classification)),
  'moodle:course-contents': async (_event, courseId) => withClient((client) => getCourseContents(client, courseId)),
  'moodle:upcoming-events': async () => withClient((client) => getUpcomingEvents(client)),
  'moodle:notifications': async () =>
    withClient((client) => getNotifications(client, { userId: getActiveUser().userid })),
  'moodle:mark-notification-read': async (_event, notificationId) => {
    await withClient((client) => markNotificationRead(client, notificationId));
    return null;
  },

  'files:open': async (_event, file) => {
    await openFile(file);
    return null;
  },
  'files:download': async (_event, file) => downloadFile(file),
  'files:reveal': async (_event, path) => {
    revealFile(path);
    return null;
  },

  'shell:open-external': async (_event, url) => {
    if (!EXTERNAL_PROTOCOLS.includes(new URL(url).protocol)) throw new InvalidFileRequestError('URL non ammesso');
    await shell.openExternal(url);
    return null;
  },

  'settings:get': async () => getSettings(),
  'settings:update': async (_event, patch) => updateSettings(patch),
  'settings:choose-download-dir': async (event) => {
    const options: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: (await getSettings()).downloadDir,
    };
    const parent = windowOf(event);
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  },
};

const toResult = async <TData>(run: () => Promise<TData>): Promise<IpcResult<TData>> => {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: toFailure(error) };
  }
};

const register = <TChannel extends IpcChannel>(channel: TChannel, handler: Handler<TChannel>): void => {
  ipcMain.handle(channel, (event, ...args) =>
    // Gli argomenti arrivano dal renderer come `unknown[]`: il preload è tipizzato su
    // IpcContract, quindi qui li trattiamo come dichiarati nel contratto.
    toResult(() => handler(event, ...(args as IpcArgs<TChannel>))),
  );
};

export const registerIpcHandlers = (): void => {
  (Object.keys(handlers) as IpcChannel[]).forEach((channel) => register(channel, handlers[channel] as Handler<typeof channel>));
};
