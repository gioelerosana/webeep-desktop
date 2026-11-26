/*
 * Login OIDC pendenti in memoria (docs/SERVER.md §3.2): chiave lo `state` OIDC, validità
 * 10 minuti, monouso. Un riavvio li cancella: il login va ripetuto.
 */
import { MAX_PENDING_LOGINS } from './constants.js';
import type { PendingLogin } from './types.js';

export type PendingLogins = {
  /** Registra un login. Oltre `MAX_PENDING_LOGINS` scarta il più vecchio. */
  readonly add: (state: string, login: PendingLogin, now: number) => void;
  /** Cerca e cancella il login: la voce è monouso anche se è scaduta. Null se assente o scaduta. */
  readonly take: (state: string, now: number) => PendingLogin | null;
};

export const createPendingLogins = (): PendingLogins => {
  const logins = new Map<string, PendingLogin>();

  const pruneExpired = (now: number): void => {
    logins.forEach((login, key) => {
      if (login.expiresAt <= now) logins.delete(key);
    });
  };

  return {
    add: (state, login, now) => {
      pruneExpired(now);
      const oldest = logins.keys().next();
      if (logins.size >= MAX_PENDING_LOGINS && !oldest.done) logins.delete(oldest.value);
      logins.set(state, login);
    },
    take: (state, now) => {
      const login = logins.get(state);
      logins.delete(state);
      if (login === undefined || login.expiresAt <= now) return null;
      return login;
    },
  };
};
