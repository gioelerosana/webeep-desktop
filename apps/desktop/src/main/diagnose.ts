/*
 * Modalità diagnostica (`WEBEEP_DIAGNOSE=1`, script `pnpm diagnose`).
 *
 * Al posto della finestra: verifica la sessione salvata, chiama le funzioni Moodle
 * che usa la vista corso e stampa esiti e conteggi. Non stampa mai il token né dati
 * personali: solo nomi di funzione, esiti, classi d'errore, conteggi e, per gli
 * errori di forma, il percorso zod che fallisce e il TIPO del valore reale.
 *
 * Con `WEBEEP_DIAGNOSE_COURSE=<nome>` (sottostringa, senza distinzione di maiuscole)
 * stampa anche la struttura dei corsi che corrispondono: sezioni, moduli, tipi e nomi
 * di file, percorso degli URL interni e solo il dominio di quelli esterni. Di description,
 * content e file non esce mai il contenuto, solo lunghezze e presenza.
 *
 * Il corpo grezzo della risposta resta in memoria, solo per leggerne i tipi.
 */
import { z } from 'zod';
import {
  createMoodleClient,
  getCourseContents,
  getCourses,
  MoodleApiError,
  MoodleResponseShapeError,
  WEBEEP_SITE_URL,
  type Course,
  type CourseModule,
  type CourseSection,
  type FetchLike,
  type ModuleContent,
  type MoodleClient,
} from '@webeep/moodle-api';
import { getActiveToken, getAuthState } from './auth.js';

const WEBEEP_ORIGIN = new URL(WEBEEP_SITE_URL).origin;
const DIAGNOSE_ENV_VAR = 'WEBEEP_DIAGNOSE';
const DIAGNOSE_ENABLED_VALUE = '1';
const COURSE_FILTER_ENV_VAR = 'WEBEEP_DIAGNOSE_COURSE';
const LOG_PREFIX = '[diagnosi]';
const ISSUE_INDENT = '  ';
const LIST_INDENT = '  ';
const ITEM_INDENT = '    ';
const CONTENT_INDENT = '      ';
const MISSING_VALUE_TYPE = 'assente';
const REDACTED_TOKEN = 'token=<oscurato>';
const SITE_INFO_WS = 'core_webservice_get_site_info';
const SITE_FUNCTIONS_KEY = 'functions';
const SITE_FUNCTION_NAME_KEY = 'name';
const CONTENT_FIELD_KEY = 'content';

/** Funzioni che l'app potrebbe usare per risorse, link, cartelle, pagine e libri: il sito le dichiara o no. */
const REQUIRED_WS_FUNCTIONS: readonly string[] = [
  'mod_page_get_pages_by_courses',
  'mod_book_get_books_by_courses',
  'mod_resource_get_resources_by_courses',
  'mod_url_get_urls_by_courses',
  'mod_folder_get_folders_by_courses',
  'core_course_get_module',
  'core_course_get_course_module',
];

const PAGE_LIKE_MODNAMES = ['page', 'book'] as const;
type PageLikeModname = (typeof PAGE_LIKE_MODNAMES)[number];
type PageLikeCall = { readonly wsfunction: string; readonly collectionKey: string };
const PAGE_LIKE_CALLS: Readonly<Record<PageLikeModname, PageLikeCall>> = {
  page: { wsfunction: 'mod_page_get_pages_by_courses', collectionKey: 'pages' },
  book: { wsfunction: 'mod_book_get_books_by_courses', collectionKey: 'books' },
};

/**
 * Parametro `token=` (anche dentro `wstoken=`) in query o in testo, qualunque sia la maiuscolatura.
 * Passa: "https://webeep.polimi.it/x?id=1&token=abc". Non passa: "https://webeep.polimi.it/x?id=1".
 * https://regex101.com/?regex=token%3D%5B%5E%26%5Cs%5D*&testString=https%3A%2F%2Fwebeep.polimi.it%2Fx%3Fid%3D1%26token%3Dabc&flags=gi&flavor=javascript
 */
const TOKEN_PARAM_PATTERN = /token=[^&\s]*/gi;

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

type CourseContentsProbe = {
  readonly course: Course;
  readonly outcome: Outcome<readonly CourseSection[]>;
};

export const isDiagnoseMode = (): boolean => process.env[DIAGNOSE_ENV_VAR] === DIAGNOSE_ENABLED_VALUE;

/** Rete di sicurezza: nessuna riga di log esce con un parametro token, qualunque sia la sua origine. */
const redactTokens = (text: string): string => text.replace(TOKEN_PARAM_PATTERN, REDACTED_TOKEN);

const log = (line: string): void => {
  console.log(`${LOG_PREFIX} ${redactTokens(line)}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

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
  if (error instanceof MoodleApiError) {
    return [`ERRORE MoodleApiError (${error.errorCode}, ${error.wsfunction}): ${error.message}`];
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

/**
 * Query e frammenti (dove Moodle mette il token dei file) non escono mai. Per i link interni
 * si mostra il percorso; per quelli esterni solo il dominio, perché il percorso di molti link
 * (es. le condivisioni) contiene identificativi che alla diagnosi non servono.
 */
const describeUrl = (raw: string | undefined): string => {
  if (raw === undefined) return MISSING_VALUE_TYPE;
  if (!URL.canParse(raw, WEBEEP_SITE_URL)) return 'url non valido';
  const url = new URL(raw, WEBEEP_SITE_URL);
  if (url.origin === WEBEEP_ORIGIN) return url.pathname;
  return `esterno ${url.host}`;
};

/** Solo la lunghezza: la descrizione di un modulo può contenere testo personale o HTML. */
const describeDescription = (description: string | undefined): string =>
  description === undefined ? MISSING_VALUE_TYPE : `${description.length} caratteri`;

const describeContentLength = (content: unknown): string =>
  typeof content === 'string' ? String(content.length) : MISSING_VALUE_TYPE;

const describeContent = (content: ModuleContent): string =>
  `${content.type} | file: ${content.filename} | mimetype: ${content.mimetype ?? MISSING_VALUE_TYPE} | fileurl: ${describeUrl(content.fileurl)}`;

const describeModule = (module: CourseModule): readonly string[] => [
  `${ITEM_INDENT}- id ${module.id} | ${module.modname} | "${module.name}" | descrizione: ${describeDescription(module.description)} | url: ${describeUrl(module.url)}`,
  ...module.contents.map((content) => `${CONTENT_INDENT}contenuto: ${describeContent(content)}`),
];

const describeSection = (section: CourseSection): readonly string[] => [
  `${LIST_INDENT}sezione "${section.name}" (${section.modules.length} moduli)`,
  ...section.modules.flatMap(describeModule),
];

/** Riassume una lista di pagine o libri: solo conteggi, lunghezze di `content` e nomi delle chiavi. */
const summarizeCollection = (collectionKey: string, result: unknown): string => {
  const items = childOf(result, collectionKey);
  if (!isUnknownArray(items)) return `campo "${collectionKey}" assente o non è una lista`;
  const contentLengths = items.map((item) => describeContentLength(childOf(item, CONTENT_FIELD_KEY)));
  const [first] = items;
  const firstKeys = isRecord(first) ? Object.keys(first) : [];
  return `${items.length} elementi, lunghezze content: ${contentLengths.join(', ') || 'nessuna'}, chiavi del primo: ${firstKeys.join(', ') || 'nessuna'}`;
};

const siteFunctionNames = (siteInfo: unknown): readonly string[] => {
  const functions = childOf(siteInfo, SITE_FUNCTIONS_KEY);
  if (!isUnknownArray(functions)) return [];
  return functions
    .map((entry) => childOf(entry, SITE_FUNCTION_NAME_KEY))
    .filter((name): name is string => typeof name === 'string');
};

/** Dice quali funzioni WS il sito dichiara: la chiamata grezza non passa per gli schemi dell'app. */
const inspectSiteFunctions = async (): Promise<boolean> => {
  const outcome = await probe(
    `${SITE_INFO_WS} (funzioni)`,
    (client) => client.call(SITE_INFO_WS, {}, z.unknown()),
    (siteInfo) => `${siteFunctionNames(siteInfo).length} funzioni dichiarate`,
  );
  const available = siteFunctionNames(outcome.result);
  const ok = printOutcome(outcome);
  REQUIRED_WS_FUNCTIONS.forEach((name) =>
    log(`${LIST_INDENT}${name}: ${available.includes(name) ? 'disponibile' : 'non dichiarata'}`),
  );
  return ok;
};

const probePageLike = (course: Course, modname: PageLikeModname): Promise<Outcome<unknown>> => {
  const { wsfunction, collectionKey } = PAGE_LIKE_CALLS[modname];
  return probe(
    `${wsfunction} (corso ${course.id})`,
    (client) => client.call(wsfunction, { courseids: [course.id] }, z.unknown()),
    (result) => summarizeCollection(collectionKey, result),
  );
};

/** Stampa la struttura di un corso e, per pagine e libri presenti, la chiamata grezza dedicata. */
const inspectCourse = async (course: Course, sections: readonly CourseSection[]): Promise<readonly boolean[]> => {
  log(`corso "${course.fullname}" (id ${course.id}): ${sections.length} sezioni`);
  sections.flatMap(describeSection).forEach(log);
  const modnames = new Set(sections.flatMap((section) => section.modules.map((module) => module.modname)));
  const pageLikeModnames = PAGE_LIKE_MODNAMES.filter((modname) => modnames.has(modname));
  const outcomes = await Promise.all(pageLikeModnames.map((modname) => probePageLike(course, modname)));
  return outcomes.map(printOutcome);
};

const inspectCourseProbe = async ({ course, outcome }: CourseContentsProbe): Promise<readonly boolean[]> => {
  if (outcome.result === undefined) {
    log(`corso "${course.fullname}": contenuti non letti (vedi sopra)`);
    return [];
  }
  return inspectCourse(course, outcome.result);
};

const matchesCourse = (course: Course, needle: string): boolean =>
  [course.fullname, course.shortname].some((name) => name.toLocaleLowerCase().includes(needle));

/** Se nessun corso corrisponde, elenca i nomi disponibili per correggere il filtro. */
const inspectMatchingCourses = async (
  probes: readonly CourseContentsProbe[],
  filter: string,
): Promise<readonly boolean[]> => {
  const needle = filter.toLocaleLowerCase();
  const matches = probes.filter(({ course }) => matchesCourse(course, needle));
  if (matches.length === 0) {
    const names = probes.map(({ course }) => course.fullname).join(' | ');
    log(`nessun corso corrisponde al filtro "${filter}". Corsi disponibili: ${names}`);
    return [];
  }
  const inspected = await Promise.all(matches.map(inspectCourseProbe));
  return inspected.flat();
};

/** Filtro opzionale da `WEBEEP_DIAGNOSE_COURSE`; vuoto o solo spazi equivale a non impostato. */
const readCourseFilter = (): string | undefined => {
  const value = process.env[COURSE_FILTER_ENV_VAR]?.trim() ?? '';
  return value === '' ? undefined : value;
};

/** Dettaglio opt-in: funzioni dichiarate dal sito, poi struttura dei corsi che corrispondono. */
const inspectDetail = async (probes: readonly CourseContentsProbe[], filter: string): Promise<readonly boolean[]> => {
  const siteOk = await inspectSiteFunctions();
  const courseResults = await inspectMatchingCourses(probes, filter);
  return [siteOk, ...courseResults];
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
  const contentProbes: readonly CourseContentsProbe[] = await Promise.all(
    courses.map(async (course, index) => ({
      course,
      outcome: await probe(
        `core_course_get_contents (corso ${index + 1}/${courses.length})`,
        (client) => getCourseContents(client, course.id),
        summarizeSections,
      ),
    })),
  );

  const outcomes: readonly Outcome<unknown>[] = [inProgress, all, ...contentProbes.map(({ outcome }) => outcome)];
  const results = outcomes.map(printOutcome);
  const filter = readCourseFilter();
  const detailResults = filter === undefined ? [] : await inspectDetail(contentProbes, filter);
  const allResults = [...results, ...detailResults];
  const failed = allResults.filter((ok) => !ok).length;
  log(failed === 0 ? 'esito: tutte le chiamate ok' : `esito: ${failed} chiamate fallite su ${allResults.length}`);
  return failed === 0;
};
