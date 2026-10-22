/*
 * Finestra di login Polimi.
 *
 * Apre `launch.php` in una finestra con una sessione dedicata (i cookie SSO
 * restano separati da quelli della finestra principale) e aspetta il redirect
 * a `moodlemobile://token=...`. Il redirect può arrivare come 3xx, come
 * navigazione JS o come richiesta allo schema: intercettiamo tutti e tre.
 *
 * Se dopo il login Moodle ci lascia sulla dashboard invece di tornare a
 * `launch.php` (succede quando si perde il `wantsurl`), ricarichiamo noi il
 * launch: la sessione SSO è ormai attiva e il token arriva subito.
 */
import { BrowserWindow, session, type Event } from 'electron';
import {
  buildLaunchUrl,
  createPassport,
  isLaunchCallbackUrl,
  MOBILE_URL_SCHEME,
  parseLaunchCallback,
  type LaunchToken,
} from '@webeep/moodle-api/auth';

export const LOGIN_PARTITION = 'persist:webeep-login';
const LOGIN_WINDOW_WIDTH = 520;
const LOGIN_WINDOW_HEIGHT = 720;
const MAX_LAUNCH_RETRIES = 2;
const HTTP_NO_CONTENT = 204;
const LANDING_PATHS: readonly string[] = ['/my/', '/my/index.php', '/'];

export class LoginCancelledError extends Error {
  override readonly name = 'LoginCancelledError';
}

const isLandingPage = (url: string, siteUrl: string): boolean => {
  const parsed = new URL(url);
  return parsed.origin === new URL(siteUrl).origin && LANDING_PATHS.includes(parsed.pathname);
};

export const runLoginFlow = (siteUrl: string, parent: BrowserWindow | undefined): Promise<LaunchToken> => {
  const passport = createPassport();
  const launchUrl = buildLaunchUrl(siteUrl, passport);
  const loginSession = session.fromPartition(LOGIN_PARTITION);

  const window = new BrowserWindow({
    width: LOGIN_WINDOW_WIDTH,
    height: LOGIN_WINDOW_HEIGHT,
    title: 'Accedi a WeBeep',
    parent,
    modal: Boolean(parent),
    autoHideMenuBar: true,
    webPreferences: { session: loginSession, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  return new Promise<LaunchToken>((resolve, reject) => {
    let settled = false;
    let launchRetries = 0;

    const finish = (outcome: () => void): void => {
      if (settled) return;
      settled = true;
      loginSession.protocol.unhandle(MOBILE_URL_SCHEME);
      outcome();
      if (!window.isDestroyed()) window.close();
    };

    const handleCallback = (url: string): void => {
      try {
        const token = parseLaunchCallback(url, siteUrl, passport);
        finish(() => resolve(token));
      } catch (error) {
        finish(() => reject(error));
      }
    };

    const interceptNavigation = (event: Event, url: string): void => {
      if (!isLaunchCallbackUrl(url)) return;
      event.preventDefault();
      handleCallback(url);
    };

    loginSession.protocol.handle(MOBILE_URL_SCHEME, (request) => {
      handleCallback(request.url);
      return new Response('', { status: HTTP_NO_CONTENT });
    });

    window.webContents.on('will-redirect', (event, url) => interceptNavigation(event, url));
    window.webContents.on('will-navigate', (event, url) => interceptNavigation(event, url));
    window.webContents.on('did-navigate', (_event, url) => {
      if (!isLandingPage(url, siteUrl) || launchRetries >= MAX_LAUNCH_RETRIES) return;
      launchRetries += 1;
      void window.loadURL(launchUrl);
    });
    window.on('closed', () => finish(() => reject(new LoginCancelledError('Login annullato'))));

    void window.loadURL(launchUrl);
  });
};

/** Dimentica i cookie SSO: al prossimo login Polimi richiede di nuovo le credenziali. */
export const clearLoginSession = async (): Promise<void> => {
  await session.fromPartition(LOGIN_PARTITION).clearStorageData();
};
