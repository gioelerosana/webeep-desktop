/*
 * Formattazione per l'interfaccia (italiano). Le date Moodle sono in secondi Unix.
 * Il testo HTML di Moodle si mostra solo come testo: `htmlToText` usa
 * DOMParser, che non esegue script né carica risorse.
 */

const MS_PER_SECOND = 1000;
const BYTES_PER_KB = 1024;
const SIZE_UNITS: readonly string[] = ['B', 'KB', 'MB', 'GB'];
const LOCALE = 'it-IT';

export const fromUnixSeconds = (seconds: number): Date => new Date(seconds * MS_PER_SECOND);

const dateFormatter = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const relativeFormatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

/** "mar 4 nov" */
export const formatDay = (seconds: number): string => dateFormatter.format(fromUnixSeconds(seconds));
/** "14:30" */
export const formatTime = (seconds: number): string => timeFormatter.format(fromUnixSeconds(seconds));
/** "4 nov, 14:30" */
export const formatDateTime = (seconds: number): string => dateTimeFormatter.format(fromUnixSeconds(seconds));

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;

const RELATIVE_STEPS: readonly { readonly unit: Intl.RelativeTimeFormatUnit; readonly seconds: number }[] = [
  { unit: 'day', seconds: SECONDS_PER_DAY },
  { unit: 'hour', seconds: SECONDS_PER_HOUR },
  { unit: 'minute', seconds: SECONDS_PER_MINUTE },
];

/** "tra 2 giorni", "3 ore fa", "ora" */
export const formatRelative = (seconds: number, nowMs: number = Date.now()): string => {
  const delta = seconds - Math.round(nowMs / MS_PER_SECOND);
  const step = RELATIVE_STEPS.find((candidate) => Math.abs(delta) >= candidate.seconds);
  if (!step) return relativeFormatter.format(0, 'second');
  return relativeFormatter.format(Math.round(delta / step.seconds), step.unit);
};

/** "1,2 MB" */
export const formatFileSize = (bytes: number): string => {
  const exponent = bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(BYTES_PER_KB)), SIZE_UNITS.length - 1) : 0;
  const value = bytes / BYTES_PER_KB ** exponent;
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: exponent ? 1 : 0 })} ${SIZE_UNITS[exponent] ?? 'B'}`;
};

// Sequenze di spazi bianchi (spazi, a capo, tab): "Lezione\n\n  del 4" → "Lezione del 4"; "Lezione" resta invariato.
// https://regex101.com/?regex=%5Cs%2B&testString=Lezione%0A%0A%20%20del%204%0ALezione&flavor=javascript&flags=g
const WHITESPACE_RUNS = /\s+/g;

/** Testo semplice da un frammento HTML di Moodle (riepiloghi, descrizioni, notifiche). */
export const htmlToText = (html: string): string =>
  (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(WHITESPACE_RUNS, ' ').trim();
