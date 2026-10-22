/*
 * Bridge della modalità web (`WEBEEP_WEB=1`): l'interfaccia è servita dal main e parla
 * con `/api/*` invece che con Electron. Ha la stessa forma di `WebeepBridge`, così le
 * viste non sanno dove girano.
 *
 * Alcuni canali non arrivano al server. Un file va scaricato o aperto nel browser di chi
 * guarda la pagina, non sul computer che la serve. Il tema è una preferenza di questo
 * browser, quindi si salva qui. Logout e cartella dei download sono del desktop: qui si
 * rifiutano senza chiamare il server.
 */
import type {
  DownloadResult,
  FileRequest,
  IpcArgs,
  IpcChannel,
  IpcErrorKind,
  IpcResult,
  IpcReturn,
  Settings,
  ThemePreference,
  WebeepBridge,
} from '../../../shared/ipc';

const API_IPC_PREFIX = '/api/ipc/';
const API_ASSET_PATH = '/api/asset';
const API_FILE_PATH = '/api/file';
const HTTP_UNAUTHORIZED = 401;
const JSON_CONTENT_TYPE = 'application/json';
const WEB_PLATFORM = 'web';
const HTTP_PROTOCOLS: readonly string[] = ['http:', 'https:'];
const INLINE_DISPOSITION = 'inline';
const ATTACHMENT_DISPOSITION = 'attachment';
const THEME_STORAGE_KEY = 'webeep:theme';
const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

const SESSION_EXPIRED_MESSAGE = 'Sessione scaduta: riapri il link dal computer che serve WeBeep.';
const UNREACHABLE_MESSAGE = 'Il computer che serve WeBeep non risponde.';
const SERVER_ERROR_PREFIX = 'Il server ha risposto con errore';
const INVALID_URL_MESSAGE = 'URL non ammesso';
const LOGOUT_WEB_MESSAGE = "Per uscire usa l'app desktop.";
const DOWNLOAD_DIR_WEB_MESSAGE = "La cartella dei download si cambia dall'app desktop.";

const NO_OP_UNSUBSCRIBE = (): void => undefined;

/** Canali che il browser gestisce da sé: non arrivano a `/api/ipc`. `settings:get` viene dal server, ma col tema locale. */
type WebLocalChannel =
  | 'auth:logout'
  | 'files:download'
  | 'files:open'
  | 'settings:get'
  | 'settings:update'
  | 'shell:open-external';
type LocalAction<TChannel extends IpcChannel> = (...args: IpcArgs<TChannel>) => Promise<IpcResult<IpcReturn<TChannel>>>;
type LocalActions = { readonly [TChannel in WebLocalChannel]: LocalAction<TChannel> };

const failure = (kind: IpcErrorKind, message: string): IpcResult<never> => ({ ok: false, error: { kind, message } });

const isHttpUrl = (url: string): boolean => URL.canParse(url) && HTTP_PROTOCOLS.includes(new URL(url).protocol);

const fileHref = (file: FileRequest, disposition: string): string => {
  const query = new URLSearchParams({ url: file.fileUrl, name: file.fileName, disposition });
  return `${API_FILE_PATH}?${query.toString()}`;
};

const openInNewTab = (href: string): void => {
  window.open(href, '_blank', 'noopener');
};

/** Il download nasce da un link con `download`: il browser sceglie dove salvare. */
const startDownload = (file: FileRequest): void => {
  const link = document.createElement('a');
  link.href = fileHref(file, ATTACHMENT_DISPOSITION);
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
};

/** `fetch` che non lancia: una rete giù diventa un `IpcFailure` di tipo `network`. */
const sendRequest = async (url: string, init: RequestInit): Promise<Response | undefined> => {
  try {
    return await fetch(url, init);
  } catch {
    // Il renderer riceve un esito tipizzato, come da qualunque altro canale: il dettaglio tecnico non serve all'utente.
    return undefined;
  }
};

const postChannel = async <TChannel extends IpcChannel>(
  channel: TChannel,
  args: IpcArgs<TChannel>,
): Promise<IpcResult<IpcReturn<TChannel>>> => {
  const response = await sendRequest(`${API_IPC_PREFIX}${channel}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': JSON_CONTENT_TYPE },
    body: JSON.stringify({ args }),
  });
  if (!response) return failure('network', UNREACHABLE_MESSAGE);
  if (response.status === HTTP_UNAUTHORIZED) return failure('auth', SESSION_EXPIRED_MESSAGE);
  if (!response.ok) return failure('unknown', `${SERVER_ERROR_PREFIX} ${response.status}.`);
  // Il main risponde sempre con un `IpcResult` del contratto: stesso formato dell'IPC di Electron.
  const body: IpcResult<IpcReturn<TChannel>> = await response.json();
  return body;
};

/** Il tema scelto in questo browser; `undefined` se manca o se lo storage è bloccato. */
const readLocalTheme = (): ThemePreference | undefined => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_PREFERENCES.find((preference) => preference === stored);
  } catch {
    // Storage bloccato (dati del sito disabilitati, finestra privata): non c'è preferenza locale, vale quella del server.
    return undefined;
  }
};

const writeLocalTheme = (theme: ThemePreference): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage non disponibile: la scelta vale per questa sessione grafica, ma non sopravvive al ricaricamento.
  }
};

/** Impostazioni del server con il tema di questo browser sopra: il tema è per browser, non per il desktop. */
const readSettings = async (): Promise<IpcResult<Settings>> => {
  const result = await postChannel('settings:get', []);
  if (!result.ok) return result;
  return { ok: true, data: { ...result.data, theme: readLocalTheme() ?? result.data.theme } };
};

const LOCAL_ACTIONS: LocalActions = {
  // Il logout chiuderebbe la sessione del desktop: qui non è consentito.
  'auth:logout': async () => failure('invalid-input', LOGOUT_WEB_MESSAGE),
  'files:download': async (file) => {
    startDownload(file);
    const data: DownloadResult = { path: file.fileName, downloaded: true };
    return { ok: true, data };
  },
  'files:open': async (file) => {
    openInNewTab(fileHref(file, INLINE_DISPOSITION));
    return { ok: true, data: null };
  },
  'settings:get': readSettings,
  'settings:update': async (patch) => {
    // La cartella dei download è sul computer del server: si cambia solo dall'app desktop.
    if (patch.downloadDir !== undefined) return failure('invalid-input', DOWNLOAD_DIR_WEB_MESSAGE);
    if (patch.theme === undefined) return readSettings();
    writeLocalTheme(patch.theme);
    const current = await readSettings();
    // Con lo storage bloccato il tema appena scelto resta comunque nel risultato, così la vista non torna indietro.
    return current.ok ? { ok: true, data: { ...current.data, theme: patch.theme } } : current;
  },
  'shell:open-external': async (url) => {
    if (!isHttpUrl(url)) return failure('invalid-input', INVALID_URL_MESSAGE);
    openInNewTab(url);
    return { ok: true, data: null };
  },
};

const isLocalChannel = (channel: IpcChannel): channel is WebLocalChannel => Object.hasOwn(LOCAL_ACTIONS, channel);

const invoke = async <TChannel extends IpcChannel>(
  channel: TChannel,
  ...args: IpcArgs<TChannel>
): Promise<IpcResult<IpcReturn<TChannel>>> => {
  if (isLocalChannel(channel)) {
    // Il mapped type `LocalActions` garantisce che ogni azione accetti gli argomenti del proprio canale;
    // TypeScript non li correla attraverso l'indicizzazione con `channel`.
    const action = LOCAL_ACTIONS[channel] as LocalAction<TChannel>;
    return action(...args);
  }
  return postChannel(channel, args);
};

const httpBridge: WebeepBridge = {
  kind: 'web',
  invoke,
  // Nessun evento spinto dal server in modalità web: il renderer rilegge i dati con le query.
  on: () => NO_OP_UNSUBSCRIBE,
  assetUrl: (fileUrl) => `${API_ASSET_PATH}?url=${encodeURIComponent(fileUrl)}`,
  platform: WEB_PLATFORM,
};

/** Installa il bridge web se nessun preload ha già esposto `window.webeep` (cioè fuori da Electron). */
export const installHttpBridgeIfNeeded = (): void => {
  if ('webeep' in window) return;
  Object.defineProperty(window, 'webeep', { value: httpBridge });
};

/** Vero quando l'interfaccia è servita dal main in rete locale: alcune azioni non hanno senso lì. */
export const isWebRenderer = (): boolean => window.webeep.kind === 'web';
