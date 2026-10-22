/*
 * Stato di autenticazione del main process.
 *
 * Tiene il client Moodle e l'utente corrente. Ogni cambio di stato viene
 * spinto alle finestre con l'evento `auth:changed`. Un errore di token
 * scaduto in qualunque chiamata porta allo stato `signed-out`
 * (`withClient`), così l'interfaccia torna al login invece di mostrare errori.
 */
import { BrowserWindow } from 'electron';
import {
  createMoodleClient,
  getSiteInfo,
  MoodleApiError,
  WEBEEP_SITE_URL,
  type MoodleClient,
  type SiteInfo,
} from '@webeep/moodle-api';
import type { AuthState } from '../shared/ipc.js';
import { clearLoginSession, runLoginFlow } from './login-window.js';
import { clearSession, loadSession, saveSession } from './session-store.js';

type ActiveSession = {
  readonly client: MoodleClient;
  readonly token: string;
  readonly user: SiteInfo;
};

let active: ActiveSession | undefined;

export class NotSignedInError extends Error {
  override readonly name = 'NotSignedInError';
}

const SIGNED_OUT: AuthState = { status: 'signed-out' };

const toAuthState = (): AuthState => (active ? { status: 'signed-in', user: active.user } : SIGNED_OUT);

const broadcast = (): void => {
  const state = toAuthState();
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('auth:changed', state));
};

const activate = async (siteUrl: string, token: string): Promise<SiteInfo> => {
  const client = createMoodleClient({ siteUrl, token });
  const user = await getSiteInfo(client);
  active = { client, token, user };
  return user;
};

const signOutLocally = async (): Promise<void> => {
  active = undefined;
  await clearSession();
  broadcast();
};

/** All'avvio: riprende la sessione salvata, se il token vale ancora. */
export const restoreSession = async (): Promise<AuthState> => {
  const stored = await loadSession();
  if (!stored) return SIGNED_OUT;
  try {
    await activate(stored.siteUrl, stored.token);
  } catch (error) {
    if (error instanceof MoodleApiError && error.isAuthError) await clearSession();
    return SIGNED_OUT;
  }
  return toAuthState();
};

export const getAuthState = (): AuthState => toAuthState();

export const login = async (parent: BrowserWindow | undefined): Promise<AuthState> => {
  const launched = await runLoginFlow(WEBEEP_SITE_URL, parent);
  await activate(WEBEEP_SITE_URL, launched.token);
  await saveSession({ siteUrl: WEBEEP_SITE_URL, token: launched.token, privateToken: launched.privateToken });
  broadcast();
  return toAuthState();
};

export const logout = async (): Promise<AuthState> => {
  await clearLoginSession();
  await signOutLocally();
  return SIGNED_OUT;
};

/** Il token serve solo nel main (download, asset): non esportarlo verso il renderer. */
export const getActiveToken = (): string => {
  if (!active) throw new NotSignedInError('Accesso richiesto');
  return active.token;
};

export const getActiveUser = (): SiteInfo => {
  if (!active) throw new NotSignedInError('Accesso richiesto');
  return active.user;
};

/** Esegue una chiamata Moodle; se il token è scaduto chiude la sessione. */
export const withClient = async <TResult>(run: (client: MoodleClient) => Promise<TResult>): Promise<TResult> => {
  if (!active) throw new NotSignedInError('Accesso richiesto');
  try {
    return await run(active.client);
  } catch (error) {
    if (error instanceof MoodleApiError && error.isAuthError) await signOutLocally();
    throw error;
  }
};
