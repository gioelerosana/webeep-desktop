/*
 * Accesso alla sessione WeBeep salvata dall'accoppiamento (`POST /pair`).
 *
 * Helper per i tool MCP: il token resta nel processo e non va mai nelle risposte.
 */
import { createMoodleClient, type MoodleClient } from '@webeep/moodle-api';
import type { StateManager } from './state/manager.js';

export type WebeepSessionView = {
  readonly siteUrl: string;
  readonly token: string;
};

/** Sessione WeBeep corrente, o null se il server non è collegato. */
export const getWebeepSession = async (store: StateManager): Promise<WebeepSessionView | null> => {
  const state = await store.read();
  if (state.webeep === null) return null;
  return { siteUrl: state.webeep.siteUrl, token: state.webeep.token };
};

/** Client Moodle per una sessione già letta da `getWebeepSession`. */
export const createWebeepClient = (session: WebeepSessionView): MoodleClient =>
  createMoodleClient({ siteUrl: session.siteUrl, token: session.token });
