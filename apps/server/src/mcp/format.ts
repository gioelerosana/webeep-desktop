/*
 * Formattazione del testo per il modello (docs/SERVER.md §6.2): date ISO con offset e forma
 * locale nel fuso di Roma, dimensioni leggibili, elenchi compatti, limiti di lunghezza.
 * Funzioni pure: niente rete, niente stato.
 */

const ROME_TIME_ZONE = 'Europe/Rome';
const LOCALE_ITALIAN = 'it-IT';
const PAD_LENGTH = 2;
const PAD_CHAR = '0';
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const BYTES_PER_KIB = 1024;
const BYTE_UNITS = ['byte', 'KB', 'MB'] as const;
const BYTE_UNIT_SCALE = [1, BYTES_PER_KIB, BYTES_PER_KIB * BYTES_PER_KIB] as const;
const MAX_FRACTION_DIGITS = 1;
const TRUNCATED_NOTE = ' [testo troncato]';
/** Limite del testo di un singolo tool: oltre, si tronca con una nota. */
export const MAX_OUTPUT_CHARS = 60_000;
/** Limite delle descrizioni di moduli, eventi e notifiche. */
export const MAX_DESCRIPTION_CHARS = 500;

const romeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ROME_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

const byteFormatter = new Intl.NumberFormat(LOCALE_ITALIAN, { maximumFractionDigits: MAX_FRACTION_DIGITS });

type RomeDate = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** Scostamento da UTC in minuti (60 in inverno, 120 in estate per Roma). */
  readonly offsetMinutes: number;
};

const pad = (value: number): string => String(value).padStart(PAD_LENGTH, PAD_CHAR);

/** Componenti dell'istante (secondi Unix) nel fuso di Roma, con lo scostamento da UTC. */
const romeDateOf = (unixSeconds: number): RomeDate => {
  const instantMs = unixSeconds * MS_PER_SECOND;
  const parts = romeFormatter.formatToParts(new Date(instantMs));
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const hour = part('hour');
  const minute = part('minute');
  const second = part('second');
  // Lo scostamento è la differenza tra l'ora di Roma letta come UTC e l'istante reale.
  const wallClockMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((wallClockMs - instantMs) / (SECONDS_PER_MINUTE * MS_PER_SECOND));
  return { year, month, day, hour, minute, second, offsetMinutes };
};

/** Istante in ISO 8601 con offset di Roma, es. `2026-12-03T23:59:00+01:00`. */
export const formatIsoRome = (unixSeconds: number): string => {
  const date = romeDateOf(unixSeconds);
  const absOffset = Math.abs(date.offsetMinutes);
  const sign = date.offsetMinutes < 0 ? '-' : '+';
  const offset = `${sign}${pad(Math.floor(absOffset / MINUTES_PER_HOUR))}:${pad(absOffset % MINUTES_PER_HOUR)}`;
  return `${date.year}-${pad(date.month)}-${pad(date.day)}T${pad(date.hour)}:${pad(date.minute)}:${pad(date.second)}${offset}`;
};

/** Istante nella forma locale `gg/mm/aaaa hh:mm`, nel fuso di Roma. */
export const formatLocalRome = (unixSeconds: number): string => {
  const date = romeDateOf(unixSeconds);
  return `${pad(date.day)}/${pad(date.month)}/${date.year} ${pad(date.hour)}:${pad(date.minute)}`;
};

/** Dimensione leggibile in italiano: `512 byte`, `1,5 KB`, `2,4 MB`. */
export const formatBytes = (bytes: number): string => {
  const unitIndex = BYTE_UNIT_SCALE.reduce((index, scale, candidate) => (bytes >= scale ? candidate : index), 0);
  const scale = BYTE_UNIT_SCALE[unitIndex] ?? 1;
  const unit = BYTE_UNITS[unitIndex] ?? BYTE_UNITS[0];
  if (unitIndex === 0) return `${bytes} ${unit}`;
  return `${byteFormatter.format(bytes / scale)} ${unit}`;
};

/** Accorcia un testo lungo e segnala il taglio con una nota. */
export const truncate = (text: string, maxChars: number): string =>
  text.length <= maxChars ? text : `${text.slice(0, maxChars).trimEnd()}…${TRUNCATED_NOTE}`;

export const yesNo = (value: boolean): string => (value ? 'sì' : 'no');

/** Righe unite da a capo; le righe vuote in ingresso (`''`) restano come separatori. */
export const lines = (rows: readonly string[]): string => rows.join('\n');
