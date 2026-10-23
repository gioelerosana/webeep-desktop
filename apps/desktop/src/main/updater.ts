/*
 * Aggiornamenti dell'app, lato main process.
 *
 * Due modalità, scelte da `detectPlatform`:
 * - Windows (NSIS): electron-updater non scarica né installa da solo. Il download parte
 *   solo quando l'utente lo chiede (`downloadUpdate`), e l'installazione solo con
 *   "riavvia e aggiorna" (`installUpdate`): niente installazione alla chiusura.
 * - Linux AppImage: il file in esecuzione non si può sostituire dall'app. electron-updater
 *   serve solo a sapere se esiste una versione nuova (legge `latest-linux.yml`) e l'utente
 *   scarica dalla pagina della release.
 *
 * Lo stato vive qui, in un solo posto. Ogni cambio viene spinto a tutte le finestre con
 * `updates:state-changed`. In sviluppo (`!app.isPackaged`) o su altre piattaforme non si
 * fa nessuna chiamata di rete.
 */
import { app, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateMode, UpdatePlatform, UpdateState } from '../shared/ipc.js';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_BETWEEN_CHECKS = 4;
const FIRST_CHECK_DELAY_SECONDS = 10;
/** Il primo controllo arriva dopo qualche secondo, così non pesa sull'avvio della finestra. */
const FIRST_CHECK_DELAY_MS = FIRST_CHECK_DELAY_SECONDS * MS_PER_SECOND;
const CHECK_INTERVAL_MS = HOURS_BETWEEN_CHECKS * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;

const RELEASES_URL = 'https://github.com/gioelerosana/webeep-desktop/releases';
const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;

/* Messaggi per l'utente: il dettaglio tecnico va solo nel log del main. */
const CHECK_FAILED_MESSAGE = 'impossibile controllare gli aggiornamenti';
const DOWNLOAD_FAILED_MESSAGE = "impossibile scaricare l'aggiornamento";
const NOT_READY_MESSAGE = 'nessun aggiornamento pronto da installare';
const NOT_AVAILABLE_MESSAGE = 'nessun aggiornamento da scaricare';

/* Con uno di questi stati un nuovo controllo sarebbe inutile o farebbe partire un secondo download. `available` è a parte, in `isBusy`. */
const BUSY_STATUSES: readonly UpdateState['status'][] = ['checking', 'downloading', 'ready'];

const UPDATE_MODE_BY_PLATFORM: Record<UpdatePlatform, UpdateMode> = {
  windows: 'install',
  linux: 'manual',
  other: 'manual',
};

type UpdateRuntime = {
  readonly currentVersion: string;
  readonly platform: UpdatePlatform;
};

/** Azione (download o installazione) richiesta quando lo stato non la permette: il canale la rende `invalid-input`. */
export class UpdateNotReadyError extends Error {
  override readonly name = 'UpdateNotReadyError';
}

const detectPlatform = (): UpdatePlatform => {
  if (process.platform === 'win32') return 'windows';
  // Solo l'AppImage è aggiornabile: quando gira, la variabile `APPIMAGE` ne indica il file.
  if (process.platform === 'linux' && process.env['APPIMAGE']) return 'linux';
  return 'other';
};

const runtime: UpdateRuntime = { currentVersion: app.getVersion(), platform: detectPlatform() };

const isUpdatable = (): boolean => app.isPackaged && runtime.platform !== 'other';

let state: UpdateState = isUpdatable() ? { ...runtime, status: 'idle' } : { ...runtime, status: 'unsupported' };

const publish = (next: UpdateState): void => {
  state = next;
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('updates:state-changed', next));
};

const versionOf = (current: UpdateState): string | undefined => ('version' in current ? current.version : undefined);

/*
 * `available` su Windows aspetta il clic dell'utente per scaricare: non si ricontrolla,
 * così non si perde la versione trovata. Su Linux è solo un avviso: un controllo manuale
 * può trovare una release ancora più nuova.
 */
const isBusy = (current: UpdateState): boolean => {
  if (current.status === 'available') return current.mode === 'install';
  return BUSY_STATUSES.includes(current.status);
};

const nowIso = (): string => new Date().toISOString();

const releaseTagUrl = (version: string): string => `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`;

/* Un errore con stato `available` o `downloading` arriva dal download (su Windows parte subito dopo `available`). */
const failureMessage = (previous: UpdateState): string =>
  previous.status === 'available' || previous.status === 'downloading' ? DOWNLOAD_FAILED_MESSAGE : CHECK_FAILED_MESSAGE;

/* Unico punto che porta lo stato a `error`: lo usano l'evento `error` e il rifiuto di `checkForUpdates`. */
const reportFailure = (error: unknown): void => {
  console.error('Aggiornamenti: errore', error);
  publish({ ...runtime, status: 'error', message: failureMessage(state) });
};

/* Né download né installazione automatici: su Windows li avvia l'utente; su Linux l'AppImage si sostituisce a mano. */
const configureAutoUpdater = (): void => {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
};

const subscribeToAutoUpdater = (): void => {
  autoUpdater.on('checking-for-update', () => publish({ ...runtime, status: 'checking' }));

  autoUpdater.on('update-available', (info) =>
    publish({
      ...runtime,
      status: 'available',
      version: info.version,
      mode: UPDATE_MODE_BY_PLATFORM[runtime.platform],
    }),
  );

  autoUpdater.on('download-progress', (progress) => {
    // Il progresso arriva solo dopo `update-available`, quindi la versione è già nello stato.
    const version = versionOf(state);
    if (version) publish({ ...runtime, status: 'downloading', version, percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (event) => publish({ ...runtime, status: 'ready', version: event.version }));

  autoUpdater.on('update-not-available', () => publish({ ...runtime, status: 'idle', lastCheckedAt: nowIso() }));

  autoUpdater.on('error', reportFailure);
};

/*
 * `checkForUpdates` e `downloadUpdate` emettono `error` e poi rifiutano la promessa: di solito
 * il rifiuto arriva quando lo stato è già `error` e non si fa nulla. Se invece arriva da solo
 * (eccezione sincrona, nessun evento), lo stato non deve restare su `checking` o `downloading`,
 * che bloccherebbero le azioni successive.
 */
const runGuarded = async (operation: () => Promise<unknown>): Promise<void> => {
  try {
    await operation();
  } catch (error: unknown) {
    if (state.status !== 'error') reportFailure(error);
  }
};

const scheduledCheck = (): void => {
  checkForUpdates();
};

const scheduleChecks = (): void => {
  setTimeout(() => {
    scheduledCheck();
    setInterval(scheduledCheck, CHECK_INTERVAL_MS);
  }, FIRST_CHECK_DELAY_MS);
};

export const getUpdateState = (): UpdateState => state;

/**
 * Avvia un controllo e restituisce subito lo stato; l'esito arriva con `updates:state-changed`.
 * electron-updater emette `checking-for-update` in modo sincrono, quindi lo stato restituito è già `checking`.
 */
export const checkForUpdates = (): UpdateState => {
  if (state.status === 'unsupported' || isBusy(state)) return state;
  void runGuarded(() => autoUpdater.checkForUpdates());
  return state;
};

/*
 * Download della versione trovata, su richiesta dell'utente. Lo stato passa subito a
 * `downloading` con avanzamento 0, così l'interfaccia non resta ferma prima del primo evento.
 */
export const downloadUpdate = (): void => {
  if (state.status !== 'available' || state.mode !== 'install') throw new UpdateNotReadyError(NOT_AVAILABLE_MESSAGE);
  const { version } = state;
  publish({ ...runtime, status: 'downloading', version, percent: 0 });
  void runGuarded(() => autoUpdater.downloadUpdate());
};

/** Riavvia e installa l'aggiornamento scaricato. Su Linux non è mai `ready`, quindi rifiuta. */
export const installUpdate = (): void => {
  if (state.status !== 'ready') throw new UpdateNotReadyError(NOT_READY_MESSAGE);
  autoUpdater.quitAndInstall();
};

/* La pagina della versione trovata; senza versione nota si apre l'ultima release. */
export const openReleasePage = async (): Promise<void> => {
  const version = versionOf(state);
  await shell.openExternal(version ? releaseTagUrl(version) : LATEST_RELEASE_URL);
};

/** Da chiamare una sola volta all'avvio, con la finestra principale aperta. */
export const startUpdater = (): void => {
  if (!isUpdatable()) return;
  configureAutoUpdater();
  subscribeToAutoUpdater();
  scheduleChecks();
};
