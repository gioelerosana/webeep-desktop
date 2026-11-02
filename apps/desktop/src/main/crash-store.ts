/*
 * Salvataggio su disco del crash report.
 *
 * Il report si salva in `userData/crash-reports/pending.json` (solo l'ultimo) e
 * al prossimo avvio l'interfaccia lo propone. La scrittura è atomica: un `.part`
 * accanto al file e poi il rename, così un salvataggio interrotto non lascia un
 * report a metà.
 */
import { app } from 'electron';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CRASH_KINDS, type CrashKind } from '../shared/ipc.js';
import type { SystemInfo } from './feedback.js';
import { isMissingFile } from './fs-errors.js';

const CRASH_DIR_NAME = 'crash-reports';
const PENDING_FILE_NAME = 'pending.json';
const PART_SUFFIX = '.part';
const JSON_INDENT = 2;

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

const crashDir = (): string => join(app.getPath('userData'), CRASH_DIR_NAME);

const pendingPath = (): string => join(crashDir(), PENDING_FILE_NAME);

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

export const readPendingReport = (): CrashReport | null => {
  const text = readStoredText();
  return text === undefined ? null : parseStoredReport(text);
};

/* Scrittura atomica: un `.part` accanto al file, poi il rename. Un salvataggio interrotto non lascia un report a metà. */
export const savePendingReport = (report: CrashReport): void => {
  mkdirSync(crashDir(), { recursive: true });
  const target = pendingPath();
  const partial = `${target}${PART_SUFFIX}`;
  writeFileSync(partial, JSON.stringify(report, null, JSON_INDENT), 'utf8');
  renameSync(partial, target);
};

export const clearPendingReport = (): void => rmSync(pendingPath(), { force: true });

/* Usato dai listener dei processi: lì un'eccezione del salvataggio non avrebbe nessuno che la gestisca. Il log resta, la chiusura prosegue. */
export const saveOrLog = (report: CrashReport): void => {
  try {
    savePendingReport(report);
  } catch (writeError: unknown) {
    console.error('Impossibile salvare la segnalazione di crash:', writeError);
  }
};
