/*
 * Strumenti di ispezione della modalità diagnostica: esiti, errori e struttura
 * delle risposte.
 *
 * Nessuna funzione qui stampa contenuti: solo tipi, conteggi e percorsi, così
 * token e dati personali restano fuori dall'output. Il corpo grezzo della
 * risposta resta in memoria, solo per leggerne i tipi.
 */
import {
  createMoodleClient,
  MoodleApiError,
  MoodleResponseShapeError,
  WEBEEP_SITE_URL,
  type Course,
  type CourseSection,
  type FetchLike,
  type MoodleClient,
  type MoodleParams,
} from '@webeep/moodle-api';
import { z } from 'zod';
import { getActiveToken } from '../auth.js';
import {
  FUNCTION_PREFIXES,
  log,
  REQUIRED_WS_FUNCTIONS,
  SITE_FUNCTIONS_KEY,
  SITE_FUNCTION_NAME_KEY,
} from './env.js';

const ISSUE_INDENT = '  ';
export const LIST_INDENT = '  ';
export const ITEM_INDENT = '    ';
export const MISSING_VALUE_TYPE = 'assente';
const EXCEPTION_KEY = 'exception';

export type PathKey = string | number;

const issuesSchema = z.array(
  z.object({
    message: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
  }),
);

/** `skipped`: chiamata non fatta perché manca un dato dal passo precedente; non conta come errore. */
export type Outcome<TResult> = {
  readonly lines: readonly string[];
  readonly result: TResult | undefined;
  readonly skipped: boolean;
};

type CapturingFetch = {
  readonly fetchFn: FetchLike;
  readonly body: () => unknown;
};

/** Righe di dettaglio di un errore Moodle, a partire dall'errore e dal corpo grezzo della risposta. */
export type FailureDescriber = (error: unknown, body: unknown) => readonly string[];

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

export const childOf = (node: unknown, key: PathKey): unknown => (isRecord(node) ? node[String(key)] : undefined);

const valueAt = (root: unknown, path: readonly PathKey[]): unknown => path.reduce<unknown>(childOf, root);

/** Solo il tipo del valore: mai il contenuto. */
const typeName = (value: unknown): string => {
  if (value === undefined) return MISSING_VALUE_TYPE;
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

/** Testo, numero o booleano così come sono, per il resto solo il tipo. Per valori brevi e non personali. */
export const shortValue = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : typeName(value);

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
  if (error instanceof MoodleApiError) {
    return [`ERRORE MoodleApiError (${error.errorCode}, ${error.wsfunction}): ${error.message}`];
  }
  const name = error instanceof Error ? error.name : 'NonError';
  const message = error instanceof Error ? error.message : String(error);
  return [`ERRORE ${name}: ${message}`];
};

/** Come `describeError`, con in più il nome dell'eccezione Moodle: distingue permesso, parametro o corso mancante. */
export const describeErrorWithException: FailureDescriber = (error, body) => [
  ...describeError(error, body),
  `${ISSUE_INDENT}exception: ${shortValue(childOf(body, EXCEPTION_KEY))}`,
];

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
export const probe = async <TResult>(
  label: string,
  call: (client: MoodleClient) => Promise<TResult>,
  summarize: (result: TResult) => string,
  describeFailure: FailureDescriber = describeError,
): Promise<Outcome<TResult>> => {
  const capture = createCapturingFetch();
  const client = createMoodleClient({ siteUrl: WEBEEP_SITE_URL, token: getActiveToken(), fetch: capture.fetchFn });
  try {
    const result = await call(client);
    return { lines: [`${label}: ok, ${summarize(result)}`], result, skipped: false };
  } catch (error) {
    const [header = '', ...details] = describeFailure(error, capture.body());
    return { lines: [`${label}: ${header}`, ...details], result: undefined, skipped: false };
  }
};

export const skipped = (label: string, reason: string): Outcome<unknown> => ({
  lines: [`${label}: saltata, ${reason}`],
  result: undefined,
  skipped: true,
});

export const summarizeCourses = (courses: readonly Course[]): string => `${courses.length} corsi`;

export const summarizeSections = (sections: readonly CourseSection[]): string => {
  const modules = sections.flatMap((section) => section.modules);
  const contents = modules.flatMap((module) => module.contents);
  const files = contents.filter((content) => content.fileurl !== undefined);
  return `${sections.length} sezioni, ${modules.length} moduli, ${contents.length} contenuti (${files.length} con file)`;
};

/** Stampa l'esito e ritorna `true` se la chiamata è riuscita o non è stata fatta di proposito. */
export const printOutcome = (outcome: Outcome<unknown>): boolean => {
  outcome.lines.forEach(log);
  return outcome.skipped || outcome.result !== undefined;
};

export const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

/** Id numerico al percorso indicato (es. `['courses', 0, 'assignments', 0, 'id']`), altrimenti `undefined`. */
export const idAt = (root: unknown, path: readonly PathKey[]): number | undefined =>
  numberOrUndefined(valueAt(root, path));

/** Tipo del valore; per un array anche il numero di elementi. Mai il contenuto. */
const describeType = (value: unknown): string =>
  isUnknownArray(value) ? `array(${value.length})` : typeName(value);

/** Chiavi con il tipo del figlio; per un array, quelle del primo elemento. */
export const describeChildren = (value: unknown): readonly string[] => {
  const node = isUnknownArray(value) ? value[0] : value;
  if (!isRecord(node)) return [];
  return Object.entries(node).map(([key, child]) => `${key}: ${describeType(child)}`);
};

/** Un campo di primo livello e, se ha figli strutturati, i suoi campi di secondo livello. */
const describeField = (name: string, value: unknown): readonly string[] => {
  const children = describeChildren(value);
  const head = `${LIST_INDENT}${name}: ${describeType(value)}`;
  if (children.length === 0) return [head];
  const scope = isUnknownArray(value) ? ' del primo elemento' : '';
  return [head, `${ITEM_INDENT}chiavi${scope}: ${children.join(', ')}`];
};

/** Struttura a due livelli di una risposta: solo chiavi, tipi e conteggi degli array. */
const describeStructure = (value: unknown): readonly string[] => {
  if (isUnknownArray(value)) return describeField('radice', value);
  if (!isRecord(value)) return [`${LIST_INDENT}radice: ${typeName(value)}`];
  return Object.entries(value).flatMap(([key, child]) => describeField(key, child));
};

const summarizeRoot = (value: unknown): string => {
  if (isUnknownArray(value)) return `${value.length} elementi al primo livello`;
  if (isRecord(value)) return `oggetto con ${Object.keys(value).length} chiavi`;
  return `valore di tipo ${typeName(value)}`;
};

/** Come `probe`, ma con la struttura della risposta sotto l'esito. Il corpo non esce mai. */
export const probeStructure = async (
  label: string,
  wsfunction: string,
  params: MoodleParams,
): Promise<Outcome<unknown>> => {
  const outcome = await probe(
    label,
    (client) => client.call(wsfunction, params, z.unknown()),
    summarizeRoot,
  );
  if (outcome.result === undefined) return outcome;
  return { ...outcome, lines: [...outcome.lines, ...describeStructure(outcome.result)] };
};

/** Chiama la funzione solo se il passo precedente ha dato un id; altrimenti la segna come saltata. */
export const probeWhenKnown = async (
  id: number | undefined,
  label: string,
  wsfunction: string,
  paramsFor: (id: number) => MoodleParams,
  missingReason: string,
): Promise<Outcome<unknown>> => {
  if (id === undefined) return skipped(label, missingReason);
  return probeStructure(label, wsfunction, paramsFor(id));
};

/** Parametri per le funzioni per utente: senza id utente Moodle usa quello della sessione. */
export const forUser = (userId: number | undefined): MoodleParams => (userId === undefined ? {} : { userid: userId });

/** Elementi di una lista; lista vuota se il valore non è un array. */
export const listOf = (value: unknown): readonly unknown[] => (isUnknownArray(value) ? value : []);

export const siteFunctionNames = (siteInfo: unknown): readonly string[] => {
  const functions = childOf(siteInfo, SITE_FUNCTIONS_KEY);
  if (!isUnknownArray(functions)) return [];
  return functions
    .map((entry) => childOf(entry, SITE_FUNCTION_NAME_KEY))
    .filter((name): name is string => typeof name === 'string');
};

/** Elenco delle funzioni dichiarate dal sito, raggruppato per area: solo nomi, mai valori. */
const printFunctionsByPrefix = (siteInfo: unknown): void => {
  const names = siteFunctionNames(siteInfo);
  log(`${LIST_INDENT}funzioni dichiarate in totale: ${names.length}`);
  FUNCTION_PREFIXES.forEach((prefix) => {
    const matching = names.filter((name) => name.startsWith(prefix)).sort();
    log(`${ITEM_INDENT}${prefix}* (${matching.length}): ${matching.join(', ') || 'nessuna'}`);
  });
};

/** Dice quali funzioni WS il sito dichiara: la chiamata grezza non passa per gli schemi dell'app. */
export const inspectSiteFunctions = (siteInfo: unknown, functionsRequested: boolean): void => {
  const available = siteFunctionNames(siteInfo);
  REQUIRED_WS_FUNCTIONS.forEach((name) =>
    log(`${LIST_INDENT}${name}: ${available.includes(name) ? 'disponibile' : 'non dichiarata'}`),
  );
  if (functionsRequested) printFunctionsByPrefix(siteInfo);
};
