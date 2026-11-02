/*
 * Segnalazione dei crash, lato main process.
 *
 * Niente invio in background: l'app non ha un token GitHub né un server intermedio
 * (AGENTS.md). Il crash si salva in `userData/crash-reports/pending.json` (solo
 * l'ultimo) e al prossimo avvio l'interfaccia lo propone. Il clic apre nel browser
 * un'issue precompilata col template `crash_report.yml`: la invia l'utente.
 *
 * Prima di salvare ogni testo passa da `sanitizeCrashText` (`crash-sanitize.ts`):
 * il report non deve mai contenere token, parametri di query o il percorso della
 * home dell'utente. La lettura e la scrittura atomica stanno in `crash-store.ts`.
 */
import { app, shell } from 'electron';
import { z } from 'zod';
import { type CrashKind, type CrashReportSummary } from '../shared/ipc.js';
import {
  countCodePoints,
  MAX_ISSUE_URL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_RENDERER_MESSAGE_LENGTH,
  MAX_RENDERER_STACK_LENGTH,
  MAX_STACK_LENGTH,
  MAX_TITLE_MESSAGE_LENGTH,
  sanitizeCrashText,
  STACK_SHRINK_RATIO,
  truncate,
} from './crash-sanitize.js';
import {
  clearPendingReport,
  type CrashReport,
  readPendingReport,
  saveOrLog,
  savePendingReport,
} from './crash-store.js';
import { currentSystemInfo, describeSystem, NEW_ISSUE_URL } from './feedback.js';

const CRASH_TEMPLATE = 'crash_report.yml';
const CRASH_TITLE_PREFIX = '[crash] ';
const UNKNOWN_MESSAGE = 'errore sconosciuto';
const CLEAN_EXIT_REASON = 'clean-exit';
const FATAL_EXIT_CODE = 1;
const INVALID_RENDERER_REPORT_MESSAGE = 'segnalazione di errore non valida';
const NO_PENDING_CRASH_MESSAGE = 'nessuna segnalazione di crash da inviare';

export class InvalidCrashReportError extends Error {
  override readonly name = 'InvalidCrashReportError';
}

const rendererErrorSchema = z.object({
  message: z.string().refine((text) => countCodePoints(text) <= MAX_RENDERER_MESSAGE_LENGTH),
  stack: z
    .string()
    .refine((text) => countCodePoints(text) <= MAX_RENDERER_STACK_LENGTH)
    .optional(),
});

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
