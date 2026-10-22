/*
 * Entry del main process: ciclo di vita dell'app e finestra principale.
 */
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { handleAssetProtocol, registerAssetScheme } from './asset-protocol.js';
import { restoreSession } from './auth.js';
import { isDiagnoseMode, runDiagnosis } from './diagnose.js';
import { registerIpcHandlers } from './handlers.js';

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 820;
const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 600;
const EXTERNAL_PROTOCOLS: readonly string[] = ['http:', 'https:'];

registerAssetScheme();

const createMainWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: 'WeBeep',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.once('ready-to-show', () => window.show());

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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  void start();
}
