/*
 * Selezione delle notifiche recenti: prima quelle non lette, poi le più nuove.
 */
import type { MoodleNotification } from '@webeep/moodle-api';

const byUnreadThenNewest = (a: MoodleNotification, b: MoodleNotification): number =>
  Number(a.read) - Number(b.read) || b.timecreated - a.timecreated;

/** Copia ordinata: non modifica l'array ricevuto dalla cache. */
export const selectRecentNotifications = (notifications: readonly MoodleNotification[], limit: number): readonly MoodleNotification[] =>
  [...notifications].sort(byUnreadThenNewest).slice(0, limit);
