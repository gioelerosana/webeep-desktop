/*
 * Logica pura delle scadenze: raggruppamento per giorno, urgenza e icona per
 * tipo di attività. Niente React né rete, così si verifica senza montare nulla.
 */
import type { CalendarEvent } from '@webeep/moodle-api';
import { CalendarClock, FileText, ListChecks, MessagesSquare, type LucideIcon } from 'lucide-react';
import { formatDay, fromUnixSeconds } from '../../lib/format';

const MS_PER_SECOND = 1_000;
const SECONDS_PER_HOUR = 3_600;
/** Le scadenze entro questa finestra (da adesso) sono evidenziate come imminenti. */
const SOON_WINDOW_HOURS = 24;
const SOON_WINDOW_SECONDS = SOON_WINDOW_HOURS * SECONDS_PER_HOUR;
const DAYS_TO_TOMORROW = 1;
const TODAY_LABEL = 'Oggi';
const TOMORROW_LABEL = 'Domani';

export type DeadlineGroup = {
  /** Inizio del giorno locale in millisecondi: chiave stabile della lista. */
  readonly key: number;
  readonly label: string;
  readonly events: readonly CalendarEvent[];
};

export type DeadlineUrgency = 'overdue' | 'soon' | 'none';

const MODULE_ICONS: ReadonlyMap<string, LucideIcon> = new Map([
  ['assign', FileText],
  ['quiz', ListChecks],
  ['forum', MessagesSquare],
]);

/** Icona per tipo di attività Moodle; quelle non mappate usano un calendario generico. */
export const moduleIcon = (modulename: string | undefined): LucideIcon => MODULE_ICONS.get(modulename ?? '') ?? CalendarClock;

/** Scaduta se Moodle la segna così; imminente se cade nelle prossime 24 ore. */
export const deadlineUrgency = (event: CalendarEvent, nowMs: number): DeadlineUrgency => {
  if (event.overdue) return 'overdue';
  const secondsUntil = event.timestart - nowMs / MS_PER_SECOND;
  return secondsUntil >= 0 && secondsUntil <= SOON_WINDOW_SECONDS ? 'soon' : 'none';
};

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const dayLabel = (dayStart: number, now: Date): string => {
  if (dayStart === startOfDay(now).getTime()) return TODAY_LABEL;
  if (dayStart === addDays(now, DAYS_TO_TOMORROW).getTime()) return TOMORROW_LABEL;
  return formatDay(dayStart / MS_PER_SECOND);
};

/** Ordina per scadenza e raggruppa per giorno locale; i gruppi risultano in ordine cronologico. */
export const groupDeadlinesByDay = (events: readonly CalendarEvent[], nowMs: number): readonly DeadlineGroup[] => {
  const now = new Date(nowMs);
  const eventsByDay = [...events]
    .sort((a, b) => a.timestart - b.timestart)
    .reduce(
      (days, event) => {
        const dayStart = startOfDay(fromUnixSeconds(event.timestart)).getTime();
        return days.set(dayStart, [...(days.get(dayStart) ?? []), event]);
      },
      new Map<number, readonly CalendarEvent[]>(),
    );
  return [...eventsByDay].map(([dayStart, dayEvents]) => ({
    key: dayStart,
    label: dayLabel(dayStart, now),
    events: dayEvents,
  }));
};
