/*
 * Segnalazioni: apre nel browser il modulo GitHub per un bug o una proposta.
 *
 * Come `updates:open-release`, il renderer non passa l'URL: manda solo il tipo e il
 * main costruisce il link. Per i bug il modulo chiede versione e sistema operativo,
 * quindi li compiliamo qui. Nel link non finiscono mai token, nome utente, email o
 * percorsi locali.
 */
import { app, shell } from 'electron';
import { release } from 'node:os';
import type { FeedbackKind } from '../shared/ipc.js';

const REPO_URL = 'https://github.com/gioelerosana/webeep-desktop';
const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;

/* Nomi dei file in `.github/ISSUE_TEMPLATE/`: GitHub usa il template scelto nel parametro `template`. */
const ISSUE_TEMPLATE_BY_KIND: Record<FeedbackKind, string> = {
  bug: 'bug_report.yml',
  feature: 'feature_request.yml',
};

/** Il tipo arriva dal renderer, quindi è un dato non fidato: si controlla prima di usarlo. */
export class InvalidFeedbackRequestError extends Error {
  override readonly name = 'InvalidFeedbackRequestError';
}

const isFeedbackKind = (value: unknown): value is FeedbackKind =>
  typeof value === 'string' && Object.hasOwn(ISSUE_TEMPLATE_BY_KIND, value);

const describeSystem = (): string =>
  `${process.platform} ${release()} (${process.arch}), Electron ${process.versions.electron}`;

export const buildFeedbackUrl = (kind: FeedbackKind): string => {
  const params = new URLSearchParams({ template: ISSUE_TEMPLATE_BY_KIND[kind] });
  if (kind === 'bug') {
    params.set('app-version', app.getVersion());
    params.set('os', describeSystem());
  }
  return `${NEW_ISSUE_URL}?${params.toString()}`;
};

export const openFeedbackIssue = async (kind: unknown): Promise<void> => {
  if (!isFeedbackKind(kind)) throw new InvalidFeedbackRequestError('Tipo di segnalazione non valido');
  await shell.openExternal(buildFeedbackUrl(kind));
};
