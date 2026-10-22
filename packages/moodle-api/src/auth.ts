/*
 * Login SSO "alla Moodle Mobile".
 *
 * WeBeep accetta solo il login Polimi (Shibboleth), quindi niente
 * `login/token.php` con username e password. Si fa come l'app ufficiale:
 *
 * 1. si apre `launch.php?service=moodle_mobile_app&passport=<casuale>&urlscheme=moodlemobile`;
 * 2. l'utente fa il login Polimi nel browser;
 * 3. Moodle reindirizza a `moodlemobile://token=<base64>` dove il base64 è
 *    `md5(wwwroot + passport):::token[:::privatetoken]`.
 *
 * Il prefisso md5 lega il token al passport che abbiamo generato noi: se non
 * corrisponde, il redirect non è la risposta alla nostra richiesta e va
 * scartato.
 *
 * Usa `node:crypto`: questo modulo gira solo nel main process.
 */
import { createHash, randomBytes } from 'node:crypto';

export const MOBILE_SERVICE = 'moodle_mobile_app';
export const MOBILE_URL_SCHEME = 'moodlemobile';
const LAUNCH_PATH = '/admin/tool/mobile/launch.php';
const TOKEN_PREFIX = `${MOBILE_URL_SCHEME}://token=`;
const TOKEN_SEPARATOR = ':::';
const PASSPORT_BYTES = 16;

export type LaunchToken = {
  readonly token: string;
  readonly privateToken: string | undefined;
};

export class LaunchTokenError extends Error {
  override readonly name = 'LaunchTokenError';
}

export const createPassport = (): string => randomBytes(PASSPORT_BYTES).toString('hex');

export const buildLaunchUrl = (siteUrl: string, passport: string): string => {
  const url = new URL(LAUNCH_PATH, siteUrl);
  url.searchParams.set('service', MOBILE_SERVICE);
  url.searchParams.set('passport', passport);
  url.searchParams.set('urlscheme', MOBILE_URL_SCHEME);
  return url.toString();
};

export const isLaunchCallbackUrl = (url: string): boolean => url.startsWith(TOKEN_PREFIX);

const siteSignature = (siteUrl: string, passport: string): string =>
  createHash('md5').update(`${siteUrl}${passport}`).digest('hex');

/**
 * Estrae il token da `moodlemobile://token=...` verificando che sia la
 * risposta al nostro `passport`. Lancia `LaunchTokenError` altrimenti.
 */
export const parseLaunchCallback = (callbackUrl: string, siteUrl: string, passport: string): LaunchToken => {
  if (!isLaunchCallbackUrl(callbackUrl)) throw new LaunchTokenError('URL di ritorno non riconosciuto');
  const encoded = decodeURIComponent(callbackUrl.slice(TOKEN_PREFIX.length));
  const [signature, token, privateToken] = Buffer.from(encoded, 'base64').toString('utf8').split(TOKEN_SEPARATOR);
  if (!signature || !token) throw new LaunchTokenError('Token mancante nella risposta di Moodle');
  if (signature !== siteSignature(siteUrl, passport)) {
    throw new LaunchTokenError('Il token non corrisponde a questa richiesta di login');
  }
  return { token, privateToken: privateToken || undefined };
};
