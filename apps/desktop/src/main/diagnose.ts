/*
 * Modalità diagnostica (`WEBEEP_DIAGNOSE=1`, script `pnpm diagnose`).
 *
 * Al posto della finestra: verifica la sessione salvata, chiama le funzioni Moodle
 * che usa la vista corso e stampa esiti e conteggi. Non stampa mai il token né dati
 * personali: solo nomi di funzione, esiti, classi d'errore, conteggi e, per gli
 * errori di forma, il percorso zod che fallisce e il TIPO del valore reale.
 *
 * Il corpo grezzo della risposta resta in memoria, solo per leggerne i tipi.
 */
import { z } from 'zod';
import {
  createMoodleClient,
  getCourseContents,
  getCourses,
  MoodleResponseShapeError,
  WEBEEP_SITE_URL,
  type Course,
  type CourseSection,
  type FetchLike,
  type MoodleClient,
} from '@webeep/moodle-api';
import { getActiveToken, getAuthState } from './auth.js';

const DIAGNOSE_ENV_VAR = 'WEBEEP_DIAGNOSE';
const DIAGNOSE_ENABLED_VALUE = '1';
const LOG_PREFIX = '[diagnosi]';
const ISSUE_INDENT = '  ';
const MISSING_VALUE_TYPE = 'assente';

type PathKey = string | number;

const issuesSchema = z.array(
  z.object({
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
  }),
);

type Outcome<TResult> = {
  readonly lines: readonly string[];
  readonly result: TResult | undefined;
};

type CapturingFetch = {
  readonly fetchFn: FetchLike;
  readonly body: () => unknown;
};

export const isDiagnoseMode = (): boolean => process.env[DIAGNOSE_ENV_VAR] === DIAGNOSE_ENABLED_VALUE;

const log = (line: string): void => {
  console.log(`${LOG_PREFIX} ${line}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const childOf = (node: unknown, key: PathKey): unknown => (isRecord(node) ? node[String(key)] : undefined);

const valueAt = (root: unknown, path: readonly PathKey[]): unknown => path.reduce<unknown>(childOf, root);

/** Solo il tipo del valore: mai il contenuto. */
const typeName = (value: unknown): string => {
  if (value === undefined) return MISSING_VALUE_TYPE;
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const pathLabel = (path: readonly PathKey[]): string => (path.length > 0 ? path.join('.') : '(radice)');

/** Un testo che non è JSON resta `undefined`: `describeIssues` lo mostra così com'è. */
const parseJsonOrUndefined = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** Il messaggio di MoodleResponseShapeError è il JSON delle issue zod (o un testo fisso se la risposta non è JSON). */
const describeIssues = (raw: string, body: unknown): readonly string[] => {
  const parsed = issuesSchema.safeParse(parseJsonOrUndefined(raw));
  if (!parsed.success) return [`${ISSUE_INDENT}${raw}`];
  return parsed.data.map(
    (issue) =>
      `${ISSUE_INDENT}- ${pathLabel(issue.path)}: ${issue.message} | valore reale: ${typeName(valueAt(body, issue.path))}`,
  );
};

const describeError = (error: unknown, body: unknown): readonly string[] => {
  if (error instanceof MoodleResponseShapeError) {
    return [`ERRORE MoodleResponseShapeError (${error.wsfunction})`, ...describeIssues(error.issues, body)];
  }
  const name = error instanceof Error ? error.name : 'NonError';
  const message = error instanceof Error ? error.message : String(error);
  return [`ERRORE ${name}: ${message}`];
};

/**
 * Legge una copia del corpo JSON: il renderer non lo vede mai, serve solo a confrontare i tipi.
 * Un corpo non JSON non è un errore di questa funzione: la chiamata fallirà con il suo messaggio.
 */
const readBodyCopy = async (response: Response): Promise<unknown> => {
  try {
    return await response.clone().json();
  } catch {
    return undefined;
  }
};

const createCapturingFetch = (): CapturingFetch => {
  const captured: { body: unknown } = { body: undefined };
  const fetchFn: FetchLike = async (url, init) => {
    const response = await fetch(url, init);
    captured.body = await readBodyCopy(response);
    return response;
  };
  return { fetchFn, body: () => captured.body };
};

/** Esegue una chiamata Moodle con un client dedicato, così il corpo catturato è quello della sola chiamata. */
const probe = async <TResult>(
  label: string,
  call: (client: MoodleClient) => Promise<TResult>,
  summarize: (result: TResult) => string,
): Promise<Outcome<TResult>> => {
  const capture = createCapturingFetch();
  const client = createMoodleClient({ siteUrl: WEBEEP_SITE_URL, token: getActiveToken(), fetch: capture.fetchFn });
  try {
    const result = await call(client);
    return { lines: [`${label}: ok, ${summarize(result)}`], result };
  } catch (error) {
    const [header = '', ...details] = describeError(error, capture.body());
    return { lines: [`${label}: ${header}`, ...details], result: undefined };
  }
};

const summarizeCourses = (courses: readonly Course[]): string => `${courses.length} corsi`;

const summarizeSections = (sections: readonly CourseSection[]): string => {
  const modules = sections.flatMap((section) => section.modules);
  const contents = modules.flatMap((module) => module.contents);
  const files = contents.filter((content) => content.fileurl !== undefined);
  return `${sections.length} sezioni, ${modules.length} moduli, ${contents.length} contenuti (${files.length} con file)`;
};

const printOutcome = (outcome: Outcome<unknown>): boolean => {
  outcome.lines.forEach(log);
  return outcome.result !== undefined;
};

/** Esegue la diagnosi e stampa il risultato. Ritorna `true` se tutte le chiamate sono riuscite. */
export const runDiagnosis = async (): Promise<boolean> => {
  const session = getAuthState();
  if (session.status !== 'signed-in') {
    log('sessione: assente o scaduta, fai il login nell\'app e riprova');
    return false;
  }
  log('sessione: ok');

  const inProgressName = 'core_course_get_enrolled_courses_by_timeline_classification [inprogress]';
  const allName = 'core_course_get_enrolled_courses_by_timeline_classification [all]';
  const inProgress = await probe(inProgressName, (client) => getCourses(client, 'inprogress'), summarizeCourses);
  const all = await probe(allName, (client) => getCourses(client, 'all'), summarizeCourses);

  const courses = all.result ?? [];
  const contentOutcomes = await Promise.all(
    courses.map((course, index) =>
      probe(
        `core_course_get_contents (corso ${index + 1}/${courses.length})`,
        (client) => getCourseContents(client, course.id),
        summarizeSections,
      ),
    ),
  );

  const outcomes: readonly Outcome<unknown>[] = [inProgress, all, ...contentOutcomes];
  const results = outcomes.map(printOutcome);
  const failed = results.filter((ok) => !ok).length;
  log(failed === 0 ? 'esito: tutte le chiamate ok' : `esito: ${failed} chiamate fallite su ${results.length}`);
  return failed === 0;
};
