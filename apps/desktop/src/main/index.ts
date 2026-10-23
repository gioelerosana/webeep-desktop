/*
 * Entry del main process: ciclo di vita dell'app e finestra principale.
 */
import { app, BrowserWindow, dialog, shell, type BrowserWindowConstructorOptions } from 'electron';
import { join } from 'node:path';
import appIcon from '../../resources/icon.png?asset';
import { handleAssetProtocol, registerAssetScheme } from './asset-protocol.js';
import { restoreSession } from './auth.js';
import { isDiagnoseMode, runDiagnosis } from './diagnose.js';
import { registerIpcHandlers } from './handlers.js';
import { isWebMode, startWebServer } from './web-server.js';

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 820;
const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 600;
const EXTERNAL_PROTOCOLS: readonly string[] = ['http:', 'https:'];
const SINGLE_INSTANCE_MESSAGE =
  'WeBeep Desktop è già aperto: la finestra esistente viene portata in primo piano. ' +
  "Se non compare, chiudi l'istanza precedente (per esempio pnpm dev o pnpm web).";
/**
 * La barra del titolo è disegnata dall'app (canali `window:*`). Su macOS si tiene
 * il titolo nativo nascosto, così restano i semafori; altrove la cornice va tolta.
 */
const WINDOW_CHROME: BrowserWindowConstructorOptions =
  process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : { frame: false };

registerAssetScheme();

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: 'WeBeep',
    // Su Linux, senza `icon`, la finestra mostra l'icona generica di Electron.
    icon: appIcon,
    show: false,
    autoHideMenuBar: true,
    ...WINDOW_CHROME,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.on('maximize', () => window.webContents.send('window:maximized-changed', true));
  window.on('unmaximize', () => window.webContents.send('window:maximized-changed', false));

  // Nessuna nuova finestra dal renderer: i link http(s) vanno nel browser di sistema.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_PROTOCOLS.includes(new URL(url).protocol)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadFile(join(__dirname, '../renderer/index.html'));

  return window;
};

const start = async (): Promise<void> => {
  await app.whenReady();
  handleAssetProtocol();
  registerIpcHandlers();
  await restoreSession();
  // Modalità web: il server serve l'interfaccia in rete locale, quindi nessuna finestra e nessun quit.
  if (isWebMode()) {
    await startWebServer();
    return;
  }
  if (isDiagnoseMode()) {
    try {
      await runDiagnosis();
    } finally {
      app.quit();
    }
    return;
  }
  createMainWindow();

  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createMainWindow();
  });
};

/**
 * Seconda istanza: esce subito, ma prima avvisa. L'app impacchettata non ha un terminale,
 * quindi un `console.warn` non si vede e sembra che la finestra non si apra mai.
 * Il lock è condiviso con `pnpm dev` e `pnpm web` (stessa cartella dati).
 */
const quitDuplicateInstance = async (): Promise<void> => {
  await app.whenReady();
  dialog.showMessageBoxSync({ type: 'info', message: SINGLE_INSTANCE_MESSAGE, buttons: ['OK'] });
  app.quit();
};

if (!app.requestSingleInstanceLock()) {
  void quitDuplicateInstance();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('window-all-closed', () => {
    // In modalità web il processo serve la rete anche senza finestre: non deve uscire.
    if (process.platform !== 'darwin' && !isWebMode()) app.quit();
  });
  void start();
}
