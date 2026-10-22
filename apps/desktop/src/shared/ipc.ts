/*
 * Contratto IPC tra main process e renderer: l'UNICA superficie con cui il
 * renderer parla con il resto del sistema.
 *
 * Regole:
 * - il token Moodle non attraversa mai questo confine;
 * - ogni canale è dichiarato qui con argomenti e risultato;
 * - il main risponde sempre con `IpcResult`, così gli errori arrivano tipizzati
 *   (Electron serializza le eccezioni perdendo classe e campi).
 *
 * Aggiungere un canale: dichiaralo in `IpcContract`, implementalo in
 * `src/main/handlers.ts`, poi usalo dal renderer con `invoke` (src/renderer/src/lib/ipc.ts).
 */
import type {
  CalendarEvent,
  Course,
  CourseSection,
  CourseTimelineClassification,
  NotificationsPage,
  SiteInfo,
} from '@webeep/moodle-api';

export type AuthState =
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly user: SiteInfo };

export type ThemePreference = 'system' | 'light' | 'dark';

export type Settings = {
  /** Cartella base dei download; i file finiscono in `<downloadDir>/<corso>/<sezione>/`. */
  readonly downloadDir: string;
  readonly theme: ThemePreference;
};

/** Identifica un file di un modulo del corso da aprire o scaricare. */
export type FileRequest = {
  readonly fileUrl: string;
  readonly fileName: string;
  readonly courseName: string;
  readonly sectionName?: string;
  /** `timemodified` del file: se il file locale è più recente non si riscarica. */
  readonly timeModified?: number;
};

export type DownloadResult = {
  readonly path: string;
  /** `false` se il file locale era già aggiornato. */
  readonly downloaded: boolean;
};

export type IpcContract = {
  'auth:get-state': { readonly args: []; readonly result: AuthState };
  /** Apre la finestra di login Polimi; si risolve a login finito o annullato. */
  'auth:login': { readonly args: []; readonly result: AuthState };
  'auth:logout': { readonly args: []; readonly result: AuthState };

  'moodle:courses': { readonly args: [classification?: CourseTimelineClassification]; readonly result: readonly Course[] };
  'moodle:course-contents': { readonly args: [courseId: number]; readonly result: readonly CourseSection[] };
  'moodle:upcoming-events': { readonly args: []; readonly result: readonly CalendarEvent[] };
  'moodle:notifications': { readonly args: []; readonly result: NotificationsPage };
  'moodle:mark-notification-read': { readonly args: [notificationId: number]; readonly result: null };

  /** Scarica nella cache dell'app e apre con l'applicazione predefinita. */
  'files:open': { readonly args: [file: FileRequest]; readonly result: null };
  /** Salva nella cartella dei download (Impostazioni). */
  'files:download': { readonly args: [file: FileRequest]; readonly result: DownloadResult };
  /** Mostra un file scaricato nel file manager. */
  'files:reveal': { readonly args: [path: string]; readonly result: null };

  /** Apre un URL http(s) nel browser di sistema. */
  'shell:open-external': { readonly args: [url: string]; readonly result: null };

  'settings:get': { readonly args: []; readonly result: Settings };
  'settings:update': { readonly args: [patch: Partial<Settings>]; readonly result: Settings };
  /** Dialogo nativo per scegliere la cartella dei download; `null` se annullato. */
  'settings:choose-download-dir': { readonly args: []; readonly result: string | null };
};

export type IpcChannel = keyof IpcContract;
export type IpcArgs<TChannel extends IpcChannel> = IpcContract[TChannel]['args'];
export type IpcReturn<TChannel extends IpcChannel> = IpcContract[TChannel]['result'];

export type IpcErrorKind = 'auth' | 'network' | 'moodle' | 'invalid-input' | 'unknown';

export type IpcFailure = {
  readonly kind: IpcErrorKind;
  readonly message: string;
};

export type IpcResult<TData> =
  | { readonly ok: true; readonly data: TData }
  | { readonly ok: false; readonly error: IpcFailure };

/** Eventi spinti dal main al renderer. */
export type IpcEvents = {
  'auth:changed': AuthState;
};
export type IpcEventName = keyof IpcEvents;

/** Ciò che il preload espone come `window.webeep`. */
export type WebeepBridge = {
  readonly invoke: <TChannel extends IpcChannel>(
    channel: TChannel,
    ...args: IpcArgs<TChannel>
  ) => Promise<IpcResult<IpcReturn<TChannel>>>;
  /** Restituisce la funzione per annullare l'iscrizione. */
  readonly on: <TEvent extends IpcEventName>(event: TEvent, listener: (payload: IpcEvents[TEvent]) => void) => () => void;
  readonly platform: string;
};

/**
 * Schema URL con cui il renderer mostra immagini e file di WeBeep: il main lo
 * risolve aggiungendo il token, che così resta fuori dal DOM.
 * `webeep-asset://file/?url=<fileurl codificato>`
 */
export const ASSET_SCHEME = 'webeep-asset';

export const toAssetUrl = (fileUrl: string): string =>
  `${ASSET_SCHEME}://file/?url=${encodeURIComponent(fileUrl)}`;
