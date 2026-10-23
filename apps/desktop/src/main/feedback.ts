/*
 * Segnalazioni: apre nel browser il modulo GitHub per un bug o una proposta.
 *
 * Come `updates:open-release`, il renderer non passa l'URL: manda solo il tipo e il
 * main costruisce il link. Per i bug il modulo chiede versione e sistema operativo,
 * quindi li compiliamo qui. Nel link non finiscono mai token, nome utente, email o
 * percorsi locali.
 *
 * `crash-report.ts` riusa `NEW_ISSUE_URL` e `describeSystem` per l'issue di crash.
 */
import { app, shell } from 'electron';
import { release } from 'node:os';
import type { FeedbackKind } from '../shared/ipc.js';

const REPO_URL = 'https://github.com/gioelerosana/webeep-desktop';
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;

/* Nomi dei file in `.github/ISSUE_TEMPLATE/`: GitHub usa il template scelto nel parametro `template`. */
const ISSUE_TEMPLATE_BY_KIND: Record<FeedbackKind, string> = {
  bug: 'bug_report.yml',
  feature: 'feature_request.yml',
};

/** Il tipo arriva dal renderer, quindi è un dato non fidato: si controlla prima di usarlo. */
export class InvalidFeedbackRequestError extends Error {
  override readonly name = 'InvalidFeedbackRequestError';
}

export type SystemInfo = {
  readonly platform: string;
  readonly arch: string;
  readonly osRelease: string;
  readonly electronVersion: string;
};

export const currentSystemInfo = (): SystemInfo => ({
  platform: process.platform,
  arch: process.arch,
  osRelease: release(),
  electronVersion: process.versions.electron,
});

/** Stessa forma per il campo "sistema operativo" di tutti i moduli: il formato è quello di `bug_report.yml`. */
export const describeSystem = (system: SystemInfo): string =>
  `${system.platform} ${system.osRelease} (${system.arch}), Electron ${system.electronVersion}`;

const isFeedbackKind = (value: unknown): value is FeedbackKind =>
  typeof value === 'string' && Object.hasOwn(ISSUE_TEMPLATE_BY_KIND, value);

export const buildFeedbackUrl = (kind: FeedbackKind): string => {
  const params = new URLSearchParams({ template: ISSUE_TEMPLATE_BY_KIND[kind] });
  if (kind === 'bug') {
    params.set('app-version', app.getVersion());
    params.set('os', describeSystem(currentSystemInfo()));
  }
  return `${NEW_ISSUE_URL}?${params.toString()}`;
};

export const openFeedbackIssue = async (kind: unknown): Promise<void> => {
  if (!isFeedbackKind(kind)) throw new InvalidFeedbackRequestError('Tipo di segnalazione non valido');
  await shell.openExternal(buildFeedbackUrl(kind));
};
