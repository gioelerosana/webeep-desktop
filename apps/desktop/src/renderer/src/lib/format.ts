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

// Docente tra parentesi in fondo al nome del corso Polimi: "CHIMICA GENERALE (ROSSI LUCA)" cattura "ROSSI LUCA";
// "CHIMICA GENERALE" non corrisponde.
// https://regex101.com/?regex=%5Cs*%5C(%28%5B%5E()%5D%2B%29%5C)%5Cs*%24&testString=CHIMICA%20GENERALE%20(ROSSI%20LUCA)%0ACHIMICA%20GENERALE&flavor=javascript
const TRAILING_TEACHER = /\s*\(([^()]+)\)\s*$/;
// Parole da lasciare maiuscole: numeri romani e sigle con punti o parentesi quadre ("II", "[C.I.]");
// "ANALISI" non corrisponde.
// https://regex101.com/?regex=%5E(%3F%3A%5BIVX%5D%2B%7C%5C%5B.*%5C%5D%7C.*%5C..*)%24&testString=II%0A%5BC.I.%5D%0AANALISI&flavor=javascript
const KEEP_UPPERCASE = /^(?:[IVX]+|\[.*\]|.*\..*)$/;
const MINOR_WORDS: ReadonlySet<string> = new Set(['di', 'e', 'del', 'della', 'delle', 'dei', 'degli', 'per', 'con', 'in', 'a', 'da', 'su', 'la', 'il', 'lo', 'le', 'gli', 'ed']);

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

const toTitleCase = (text: string): string =>
  text
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      if (KEEP_UPPERCASE.test(word)) return word;
      const lower = word.toLocaleLowerCase(LOCALE);
      return index && MINOR_WORDS.has(lower) ? lower : capitalize(lower);
    })
    .join(' ');

const isAllCaps = (text: string): boolean => text === text.toLocaleUpperCase(LOCALE);

export type CourseName = {
  /** "Analisi Matematica 1 [C.I.]" */
  readonly title: string;
  /** "Formiggini Maria", se presente tra parentesi. */
  readonly teacher: string | undefined;
};

/** Rende leggibile un nome corso Polimi ("ANALISI MATEMATICA 1 [C.I.] (FORMIGGINI MARIA)"). */
export const parseCourseName = (fullname: string): CourseName => {
  const match = TRAILING_TEACHER.exec(fullname);
  const rawTitle = match ? fullname.slice(0, match.index) : fullname;
  const rawTeacher = match?.[1];
  const title = isAllCaps(rawTitle) ? toTitleCase(rawTitle) : rawTitle.trim();
  const teacher = rawTeacher && isAllCaps(rawTeacher) ? toTitleCase(rawTeacher) : rawTeacher?.trim();
  return { title, teacher };
};
