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
  CourseSearchPage,
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

/** Identifica una pagina (`mod_page`) per id del modulo nel corso. */
export type CoursePageRequest = {
  readonly courseId: number;
  readonly moduleId: number;
};

/** File allegato a una pagina. `fileurl` è già senza token: si apre con `files:open` / `files:download`. */
export type CoursePageFile = {
  readonly filename: string;
  readonly filepath: string;
  readonly filesize: number;
  readonly fileurl: string;
  readonly mimetype: string | undefined;
  readonly timemodified: number | undefined;
};

/**
 * Pagina del corso. `introHtml` e `contentHtml` sono HTML come stringa, senza token:
 * il renderer li mostra come testo o con una whitelist, mai iniettandoli.
 */
export type CoursePage = {
  readonly moduleId: number;
  readonly name: string;
  readonly introHtml: string;
  readonly contentHtml: string;
  readonly files: readonly CoursePageFile[];
  readonly timemodified: number;
};

/** Ricerca nel catalogo: il testo è pulito dal main (trim) e deve avere questa lunghezza. */
export const COURSE_SEARCH_MIN_QUERY_LENGTH = 2;
export const COURSE_SEARCH_MAX_QUERY_LENGTH = 100;
/** Risultati per pagina: la paginazione la decide il main, il renderer chiede solo il numero di pagina. */
export const COURSE_SEARCH_PAGE_SIZE = 20;

export type CourseSearchRequest = {
  readonly query: string;
  /** Pagina a partire da 0. */
  readonly page: number;
};

/**
 * Come si aggiorna l'app. `windows`: electron-updater scarica e installa (NSIS).
 * `linux`: l'AppImage si aggiorna con i manager zsync esterni, quindi l'app solo avvisa.
 * `other`: sviluppo o piattaforma non supportata.
 */
export type UpdatePlatform = 'windows' | 'linux' | 'other';

/** `install`: l'app scarica e installa la nuova versione. `manual`: l'app rimanda alla pagina della release. */
export type UpdateMode = 'install' | 'manual';

/** Campi presenti in ogni stato dell'aggiornamento: l'interfaccia li mostra sempre, senza leggerli dal main a parte. */
type UpdateBase = {
  /** Versione in esecuzione, da `package.json`. */
  readonly currentVersion: string;
  readonly platform: UpdatePlatform;
};

/**
 * Stato del controllo aggiornamenti, unione discriminata su `status`.
 * - `unsupported`: sviluppo, `dev:web`, modalità web o piattaforma non supportata.
 * - `lastCheckedAt`: istante ISO 8601 dell'ultimo controllo concluso.
 * - `percent`: avanzamento del download, da 0 a 100.
 * - `message`: testo in italiano per l'utente, senza URL, token o percorsi.
 */
export type UpdateState = UpdateBase &
  (
    | { readonly status: 'unsupported' }
    | { readonly status: 'idle'; readonly lastCheckedAt?: string }
    | { readonly status: 'checking' }
    | { readonly status: 'available'; readonly version: string; readonly mode: UpdateMode }
    | { readonly status: 'downloading'; readonly version: string; readonly percent: number }
    | { readonly status: 'ready'; readonly version: string }
    | { readonly status: 'error'; readonly message: string }
  );

/** Tipo di segnalazione: `bug` per un problema, `feature` per una proposta. */
export type FeedbackKind = 'bug' | 'feature';

/** Tipi di crash salvabili dal main. Unione chiusa: il main la usa anche per validare il file salvato. */
export const CRASH_KINDS = [
  'main-exception',
  'unhandled-rejection',
  'renderer-gone',
  'child-process-gone',
  'renderer-error',
] as const;
export type CrashKind = (typeof CRASH_KINDS)[number];

/** Ciò che il renderer vede di un crash in attesa: niente stack, niente percorsi. */
export type CrashReportSummary = {
  readonly kind: CrashKind;
  /** Istante ISO 8601 del crash. */
  readonly occurredAt: string;
  /** Messaggio già ripulito dal main (token, parametri di query e home oscurati). */
  readonly message: string;
};

/** Errore segnalato dal renderer (per esempio da un error boundary): input non fidato, validato nel main. */
export type CrashRendererErrorReport = {
  readonly message: string;
  readonly stack?: string;
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
  /** Segna come lette tutte le notifiche dell'utente della sessione: nessun argomento dal renderer. */
  'moodle:mark-all-notifications-read': { readonly args: []; readonly result: null };
  /** Ricerca nel catalogo, anche tra corsi a cui l'utente non è iscritto. Errore `invalid-input` se query o pagina non sono valide. */
  'moodle:searchCourses': { readonly args: [request: CourseSearchRequest]; readonly result: CourseSearchPage };
  /** Pagina `mod_page` di un corso. Errore `invalid-input` se il modulo non è una pagina di quel corso. */
  'course:page': { readonly args: [request: CoursePageRequest]; readonly result: CoursePage };

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

  /** Stato corrente del controllo aggiornamenti. Solo desktop: nel browser è `invalid-input`. */
  'updates:get-state': { readonly args: []; readonly result: UpdateState };
  /** Avvia un controllo; restituisce subito lo stato `checking`, l'esito arriva con `updates:state-changed`. */
  'updates:check': { readonly args: []; readonly result: UpdateState };
  /** Riavvia e installa l'aggiornamento scaricato. Errore `invalid-input` se lo stato non è `ready`. */
  'updates:install': { readonly args: []; readonly result: null };
  /** Apre nel browser la pagina della release. Il main costruisce l'URL dalla versione: il renderer non passa URL. */
  'updates:open-release': { readonly args: []; readonly result: null };

  /** Apre nel browser il modulo GitHub di segnalazione. Il main costruisce l'URL: il renderer passa solo il tipo. */
  'feedback:open': { readonly args: [kind: FeedbackKind]; readonly result: null };

  /** Crash salvato e non ancora segnalato, oppure `null`. Non include lo stack. */
  'crash:get-pending': { readonly args: []; readonly result: CrashReportSummary | null };
  /** Apre nel browser un'issue precompilata con il crash e cancella la segnalazione. Errore `invalid-input` se non c'è nulla da segnalare. */
  'crash:report': { readonly args: []; readonly result: null };
  /** Scarta la segnalazione in attesa senza aprire nulla. */
  'crash:dismiss': { readonly args: []; readonly result: null };
  /** Salva un errore del renderer come crash in attesa, se non ce n'è già uno. Input validato nel main. */
  'crash:record-renderer-error': { readonly args: [report: CrashRendererErrorReport]; readonly result: null };

  /** Controlli della barra del titolo disegnata dall'app (finestra senza cornice nativa). */
  'window:minimize': { readonly args: []; readonly result: null };
  'window:toggle-maximize': { readonly args: []; readonly result: null };
  'window:close': { readonly args: []; readonly result: null };
  'window:is-maximized': { readonly args: []; readonly result: boolean };
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
  /** La finestra principale è stata massimizzata (`true`) o ripristinata (`false`). */
  'window:maximized-changed': boolean;
  /** Ogni cambio di stato dell'aggiornamento: avvio di un controllo, download, fine, errore. */
  'updates:state-changed': UpdateState;
};
export type IpcEventName = keyof IpcEvents;

/**
 * Canali che in modalità web (`WEBEEP_WEB=1`) il server non esegue mai: agirebbero
 * sul computer che serve la pagina (sessione, file, browser, impostazioni, finestra)
 * oppure non avrebbero una finestra a cui riferirsi. Il bridge web li gestisce nel
 * browser (vedi `renderer/src/lib/http-bridge.ts`) o li rifiuta, senza chiamare il server.
 */
export const WEB_UNAVAILABLE_CHANNELS = [
  'auth:login',
  'auth:logout',
  'files:download',
  'files:open',
  'files:reveal',
  'settings:update',
  'settings:choose-download-dir',
  'shell:open-external',
  // Segnalazioni: aprono il browser di chi usa il desktop, come `shell:open-external`.
  'feedback:open',
  // Crash: la segnalazione in attesa è quella dell'installazione desktop, e l'invio apre il browser di chi la usa.
  'crash:get-pending',
  'crash:report',
  'crash:dismiss',
  'crash:record-renderer-error',
  // Aggiornamenti: riguardano l'installazione del desktop che serve la pagina, non il browser.
  'updates:get-state',
  'updates:check',
  'updates:install',
  'updates:open-release',
  'window:minimize',
  'window:toggle-maximize',
  'window:close',
  'window:is-maximized',
] as const satisfies readonly IpcChannel[];

export type WebUnavailableChannel = (typeof WEB_UNAVAILABLE_CHANNELS)[number];

/** Ciò che il preload espone come `window.webeep`. */
export type WebeepBridge = {
  /** Dove gira l'interfaccia: Electron, web in rete locale o bridge finto di sviluppo. */
  readonly kind: 'electron' | 'web' | 'mock';
  readonly invoke: <TChannel extends IpcChannel>(
    channel: TChannel,
    ...args: IpcArgs<TChannel>
  ) => Promise<IpcResult<IpcReturn<TChannel>>>;
  /** Restituisce la funzione per annullare l'iscrizione. */
  readonly on: <TEvent extends IpcEventName>(event: TEvent, listener: (payload: IpcEvents[TEvent]) => void) => () => void;
  /** URL con cui il renderer mostra un'immagine di WeBeep (copertine, avatar). */
  readonly assetUrl: (fileUrl: string) => string;
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
