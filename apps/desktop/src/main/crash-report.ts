/*
 * Segnalazione dei crash, lato main process.
 *
 * Niente invio in background: l'app non ha un token GitHub né un server intermedio
 * (AGENTS.md). Il crash si salva in `userData/crash-reports/pending.json` (solo
 * l'ultimo) e al prossimo avvio l'interfaccia lo propone. Il clic apre nel browser
 * un'issue precompilata col template `crash_report.yml`: la invia l'utente.
 *
 * Prima di salvare ogni testo passa da `sanitizeCrashText`: il report non deve mai
 * contenere token, parametri di query o il percorso della home dell'utente.
 */
import { app, shell } from 'electron';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { CRASH_KINDS, type CrashKind, type CrashReportSummary, type CrashRendererErrorReport } from '../shared/ipc.js';
import { currentSystemInfo, describeSystem, NEW_ISSUE_URL, type SystemInfo } from './feedback.js';

const CRASH_DIR_NAME = 'crash-reports';
const PENDING_FILE_NAME = 'pending.json';
const PART_SUFFIX = '.part';
const CRASH_TEMPLATE = 'crash_report.yml';
const CRASH_TITLE_PREFIX = '[crash] ';
const UNKNOWN_MESSAGE = 'errore sconosciuto';
const REDACTED = '[rimosso]';
const HOME_PLACEHOLDER = '~';
const CLEAN_EXIT_REASON = 'clean-exit';
const MISSING_FILE_CODE = 'ENOENT';
const FATAL_EXIT_CODE = 1;
const JSON_INDENT = 2;
const MAX_MESSAGE_LENGTH = 500;
const MAX_TITLE_MESSAGE_LENGTH = 80;
const MAX_STACK_LENGTH = 4000;
/** Più lungo di così è un errore del renderer anomalo: si rifiuta invece di salvarlo a metà. */
const MAX_RENDERER_MESSAGE_LENGTH = 2000;
const MAX_RENDERER_STACK_LENGTH = 20000;
/** Limite prudenziale per l'URL del modulo: oltre, i browser e GitHub possono troncarlo o rifiutarlo. */
const MAX_ISSUE_URL_LENGTH = 7000;
/** A ogni passo lo stack si accorcia di questa frazione, finché l'URL entra nel limite. */
const STACK_SHRINK_RATIO = 0.8;
const INVALID_RENDERER_REPORT_MESSAGE = 'segnalazione di errore non valida';
const NO_PENDING_CRASH_MESSAGE = 'nessuna segnalazione di crash da inviare';

// Parametri di query degli URL: si tiene il percorso e si toglie tutto da `?` in poi.
// Accetta: "https://webeep.polimi.it/mod/page/view.php?id=1&wstoken=abc123" → "https://webeep.polimi.it/mod/page/view.php"
// Non accetta: "https://webeep.polimi.it/course/view.php" (senza `?` non cambia).
// https://regex101.com/?regex=(%5Cbhttps%3F%3A%5C%2F%5C%2F%5B%5E%5Cs'%22%3C%3E%3F%23%5D%2B)%5C%3F%5B%5E%5Cs'%22%3C%3E%23%5D*&testString=errore%20su%20https%3A%2F%2Fwebeep.polimi.it%2Fmod%2Fpage%2Fview.php%3Fid%3D1%26wstoken%3Dabc123%20fine%0Ahttps%3A%2F%2Fwebeep.polimi.it%2Fcourse%2Fview.php&flavor=javascript&flags=g
const URL_QUERY = /(\bhttps?:\/\/[^\s'"<>?#]+)\?[^\s'"<>#]*/g;
// Parametri sensibili anche fuori da un URL: "wstoken=abc" → "wstoken=[rimosso]".
// Accetta: "wstoken=abc", "privatetoken=xyz", "token=7". Non accetta: "tokenizer=1" (dopo `token` non c'è `=`).
// https://regex101.com/?regex=%5Cb(wstoken%7Ctoken%7Cprivatetoken)%3D%5B%5E%5Cs%26'%22%3C%3E%5D%2B&testString=wstoken%3Dabc%26privatetoken%3Dxyz%20tokenizer%3D1%20token%3D7&flavor=javascript&flags=gi
const SECRET_PARAM = /\b(wstoken|token|privatetoken)=[^\s&'"<>]+/gi;
// Stringhe esadecimali di almeno 32 caratteri, come il token Moodle (un md5).
// Accetta: "a1b2c3d4e5f60718293a4b5c6d7e8f90" → "[rimosso]". Non accetta: "a1b2c3" (troppo corta).
// https://regex101.com/?regex=%5B0-9a-f%5D%7B32%2C%7D&testString=a1b2c3d4e5f60718293a4b5c6d7e8f90%20e%20poi%20a1b2c3&flavor=javascript&flags=gi
const LONG_HEX = /[0-9a-f]{32,}/gi;

export class InvalidCrashReportError extends Error {
  override readonly name = 'InvalidCrashReportError';
}

export type CrashReport = SystemInfo & {
  readonly kind: CrashKind;
  readonly occurredAt: string;
  readonly appVersion: string;
  readonly message: string;
  readonly stack: string;
};

const storedReportSchema = z.object({
  kind: z.enum(CRASH_KINDS),
  occurredAt: z.iso.datetime(),
  appVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  osRelease: z.string(),
  electronVersion: z.string(),
  message: z.string(),
  stack: z.string(),
});

const rendererErrorSchema = z.object({
  message: z.string().max(MAX_RENDERER_MESSAGE_LENGTH),
  stack: z.string().max(MAX_RENDERER_STACK_LENGTH).optional(),
});

/* La home è un percorso lungo e personale: se è vuota, `split('')` spezzerebbe ogni carattere, quindi non si tocca. */
const hideHomeDirectory = (text: string): string => {
  const home = homedir();
  return home ? text.split(home).join(HOME_PLACEHOLDER) : text;
};

/** Oscura token, parametri di query e percorso della home. Funzione pura: stesso input, stesso output. */
export const sanitizeCrashText = (text: string): string =>
  hideHomeDirectory(text)
    .replace(URL_QUERY, '$1')
    .replace(SECRET_PARAM, `$1=${REDACTED}`)
    .replace(LONG_HEX, REDACTED);

/* Si taglia per caratteri, non per unità di codice: un taglio dentro una coppia surrogata renderebbe il testo illeggibile e farebbe fallire `encodeURIComponent`. */
const truncate = (text: string, maxLength: number): string => {
  const characters = Array.from(text);
  return characters.length > maxLength ? characters.slice(0, maxLength).join('') : text;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const errorStack = (error: unknown): string => (error instanceof Error ? (error.stack ?? '') : '');

const buildReport = (kind: CrashKind, message: string, stack: string): CrashReport => ({
  ...currentSystemInfo(),
  kind,
  occurredAt: new Date().toISOString(),
  appVersion: app.getVersion(),
  // Prima si oscura, poi si tronca: così un token che sta a cavallo del limite non sfugge.
  message: truncate(sanitizeCrashText(message || UNKNOWN_MESSAGE), MAX_MESSAGE_LENGTH),
  stack: truncate(sanitizeCrashText(stack), MAX_STACK_LENGTH),
});

const crashDir = (): string => join(app.getPath('userData'), CRASH_DIR_NAME);

const pendingPath = (): string => join(crashDir(), PENDING_FILE_NAME);

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE;

const readStoredText = (): string | undefined => {
  try {
    return readFileSync(pendingPath(), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
};

/* Un file corrotto si scarta: meglio nessuna segnalazione che una che nessuno può leggere. Non serve un errore esplicito all'utente. */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const parseStoredReport = (text: string): CrashReport | null => {
  const parsed = storedReportSchema.safeParse(parseJson(text));
  return parsed.success ? parsed.data : null;
};

const readPendingReport = (): CrashReport | null => {
  const text = readStoredText();
  return text === undefined ? null : parseStoredReport(text);
};

/* Scrittura atomica: un `.part` accanto al file, poi il rename. Un salvataggio interrotto non lascia un report a metà. */
const savePendingReport = (report: CrashReport): void => {
  mkdirSync(crashDir(), { recursive: true });
  const target = pendingPath();
  const partial = `${target}${PART_SUFFIX}`;
  writeFileSync(partial, JSON.stringify(report, null, JSON_INDENT), 'utf8');
  renameSync(partial, target);
};

const clearPendingReport = (): void => rmSync(pendingPath(), { force: true });

/* Usato dai listener dei processi: lì un'eccezione del salvataggio non avrebbe nessuno che la gestisca. Il log resta, la chiusura prosegue. */
const saveOrLog = (report: CrashReport): void => {
  try {
    savePendingReport(report);
  } catch (writeError: unknown) {
    console.error('Impossibile salvare la segnalazione di crash:', writeError);
  }
};

export const getPendingCrashSummary = (): CrashReportSummary | null => {
  const report = readPendingReport();
  return report ? { kind: report.kind, occurredAt: report.occurredAt, message: report.message } : null;
};

export const dismissPendingCrash = (): void => clearPendingReport();

const shortTitleMessage = (message: string): string => {
  const [firstLine = ''] = message.split('\n');
  return truncate(firstLine.trim(), MAX_TITLE_MESSAGE_LENGTH) || UNKNOWN_MESSAGE;
};

/* I nomi dei parametri sono gli `id` di `crash_report.yml`: GitHub precompila ogni campo dal parametro omonimo. */
const buildIssueUrl = (report: CrashReport, stack: string): string => {
  const params = new URLSearchParams({
    template: CRASH_TEMPLATE,
    title: `${CRASH_TITLE_PREFIX}${shortTitleMessage(report.message)}`,
    'app-version': report.appVersion,
    os: describeSystem(report),
    kind: report.kind,
    occurred: report.occurredAt,
    stack,
  });
  return `${NEW_ISSUE_URL}?${params.toString()}`;
};

/* Lo stack è la sola parte che può crescere: si accorcia finché l'URL entra nel limite. Il titolo e gli altri campi sono già corti. */
const fitIssueUrl = (report: CrashReport, stack: string): string => {
  const url = buildIssueUrl(report, stack);
  if (url.length <= MAX_ISSUE_URL_LENGTH || stack === '') return url;
  return fitIssueUrl(report, truncate(stack, Math.floor(Array.from(stack).length * STACK_SHRINK_RATIO)));
};

/** Apre nel browser l'issue precompilata e poi cancella la segnalazione: se l'apertura fallisce, il crash resta in attesa. */
export const reportPendingCrash = async (): Promise<void> => {
  const report = readPendingReport();
  if (!report) throw new InvalidCrashReportError(NO_PENDING_CRASH_MESSAGE);
  await shell.openExternal(fitIssueUrl(report, report.stack));
  clearPendingReport();
};

/**
 * Errore del renderer: input non fidato, quindi si valida il tipo e la lunghezza.
 * Non sovrascrive un crash vero già in attesa, che è più grave.
 */
export const recordRendererError = (input: unknown): void => {
  const parsed = rendererErrorSchema.safeParse(input);
  if (!parsed.success) throw new InvalidCrashReportError(INVALID_RENDERER_REPORT_MESSAGE);
  if (readPendingReport()) return;
  savePendingReport(buildReport('renderer-error', parsed.data.message, parsed.data.stack ?? ''));
};

/*
 * Un listener di `uncaughtException` impedisce a Node di chiudere il processo. Qui
 * il report si salva in modo sincrono (il processo sta per morire, non ci sono
 * promesse da aspettare) e poi si esce con codice di errore, come farebbe Node
 * senza listener. Non si inghiotte l'errore: il codice di uscita lo segnala.
 */
const onUncaughtException = (error: unknown): void => {
  saveOrLog(buildReport('main-exception', errorMessage(error), errorStack(error)));
  app.exit(FATAL_EXIT_CODE);
};

/*
 * Il listener sostituisce il comportamento di default di Node per le promesse non
 * gestite: qui si registrano e l'app resta aperta. Chi cambia questa scelta deve
 * decidere esplicitamente se chiudere.
 */
const onUnhandledRejection = (reason: unknown): void => {
  saveOrLog(buildReport('unhandled-rejection', errorMessage(reason), errorStack(reason)));
};

/** Da chiamare presto nel main, prima che la finestra o i canali facciano lavoro. */
export const installCrashReporting = (): void => {
  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);
  app.on('render-process-gone', (_event, _webContents, details) => {
    if (details.reason === CLEAN_EXIT_REASON) return;
    saveOrLog(
      buildReport('renderer-gone', `il processo del renderer si è chiuso (${details.reason}, codice ${details.exitCode})`, ''),
    );
  });
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === CLEAN_EXIT_REASON) return;
    saveOrLog(
      buildReport(
        'child-process-gone',
        `il processo ${details.type} si è chiuso (${details.reason}, codice ${details.exitCode})`,
        '',
      ),
    );
  });
};
