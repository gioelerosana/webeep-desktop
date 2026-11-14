/*
 * Aggiornamenti dell'app, lato main process.
 *
 * Due modalità, scelte da `detectPlatform`:
 * - Windows (NSIS): aggiornamento automatico. Quando electron-updater trova una versione nuova,
 *   il download parte da solo in background (`autoDownload`) e l'installazione avviene alla
 *   chiusura dell'app (`autoInstallOnAppQuit`): alla riapertura la versione è già quella nuova.
 *   Niente bottone "scarica" da premere, così l'utente non deve fare nulla per restare aggiornato.
 *   "Riavvia e aggiorna" (`installUpdate`) resta per installare subito.
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
const FIRST_CHECK_DELAY_SECONDS = 5;
/* Pochi secondi dopo l'avvio: non pesa sull'apertura della finestra, ma il primo controllo arriva presto. */
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
 * Su Windows `update-available` passa direttamente a `downloading`, quindi `available` non
 * compare quasi mai: il ramo resta come rete di sicurezza, così un controllo non fa partire
 * un secondo download sopra a quello in corso. Su Linux `available` è solo un avviso: un
 * controllo manuale può trovare una release ancora più nuova.
 */
const isBusy = (current: UpdateState): boolean => {
  if (current.status === 'available') return current.mode === 'install';
  return BUSY_STATUSES.includes(current.status);
};

const nowIso = (): string => new Date().toISOString();

const releaseTagUrl = (version: string): string => `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`;

/* Un errore con stato `available` o `downloading` arriva dal download (su Windows parte subito dopo `update-available`). */
const failureMessage = (previous: UpdateState): string =>
  previous.status === 'available' || previous.status === 'downloading' ? DOWNLOAD_FAILED_MESSAGE : CHECK_FAILED_MESSAGE;

/* Unico punto che porta lo stato a `error`: lo usano l'evento `error` e il rifiuto di `checkForUpdates`. */
const reportFailure = (error: unknown): void => {
  console.error('Aggiornamenti: errore', error);
  publish({ ...runtime, status: 'error', message: failureMessage(state) });
};

/*
 * Windows: download e installazione automatici, così l'utente non deve fare nulla. Con
 * `autoInstallOnAppQuit` l'installer (NSIS) parte in silenzio quando l'app si chiude.
 * Linux: nessuno dei due, perché l'AppImage non si sostituisce dall'app: l'utente la aggiorna
 * con un manager zsync o dalla pagina della release.
 */
const configureAutoUpdater = (): void => {
  const automatic = runtime.platform === 'windows';
  autoUpdater.autoDownload = automatic;
  autoUpdater.autoInstallOnAppQuit = automatic;
};

const subscribeToAutoUpdater = (): void => {
  autoUpdater.on('checking-for-update', () => publish({ ...runtime, status: 'checking' }));

  autoUpdater.on('update-available', (info) => {
    // Su Windows il download è già partito da solo: passare per `available` farebbe comparire
    // per un attimo il bottone "scarica", che qui non serve. Si va dritti a `downloading` a 0%.
    if (runtime.platform === 'windows') {
      publish({ ...runtime, status: 'downloading', version: info.version, percent: 0 });
      return;
    }
    publish({
      ...runtime,
      status: 'available',
      version: info.version,
      mode: UPDATE_MODE_BY_PLATFORM[runtime.platform],
    });
  });

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

const scheduleChecks = (): void => {
  setTimeout(() => {
    checkForUpdates();
    setInterval(checkForUpdates, CHECK_INTERVAL_MS);
  }, FIRST_CHECK_DELAY_MS);
};

export const getUpdateState = (): UpdateState => state;

/*
 * Con `autoDownload` electron-updater avvia il download dentro `checkForUpdates` e lo lascia in
 * `result.downloadPromise` senza attenderlo: se il download fallisce, quel rifiuto non ha alcun
 * handler e diventa un unhandled rejection. Lo attendiamo qui, dentro l'operazione protetta, così
 * l'errore passa da `runGuarded`, che non duplica lo stato `error` già impostato dall'evento.
 */
const checkAndDownload = async (): Promise<void> => {
  const result = await autoUpdater.checkForUpdates();
  await result?.downloadPromise;
};

/**
 * Avvia un controllo e restituisce subito lo stato; l'esito arriva con `updates:state-changed`.
 * electron-updater emette `checking-for-update` in modo sincrono, quindi lo stato restituito è già `checking`.
 */
export const checkForUpdates = (): UpdateState => {
  if (state.status === 'unsupported' || isBusy(state)) return state;
  void runGuarded(checkAndDownload);
  return state;
};

/*
 * Download della versione trovata, su richiesta dell'utente. Su Windows lo stato non passa più
 * da `available` (il download parte da solo), quindi questa funzione oggi rifiuta: resta come
 * riserva. Per riprovare dopo un errore basta `checkForUpdates`, che con `autoDownload` riscarica.
 * Lo stato passa subito a `downloading` con avanzamento 0, così l'interfaccia non resta ferma.
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
