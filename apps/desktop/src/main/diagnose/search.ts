/*
 * Ricerca di corsi della modalità diagnostica (`WEBEEP_DIAGNOSE_SEARCH`).
 *
 * Sonda `core_course_search_courses`: forma della risposta, corsi trovati non
 * iscritti e, per il primo, esito di contenuti e metodi di iscrizione. Sola
 * lettura; il testo di ricerca non è dato personale.
 */
import { getCourseContents, type Course, type MoodleParams } from '@webeep/moodle-api';
import { z } from 'zod';
import {
  ENROL_METHODS_WS,
  log,
  SEARCH_WS,
  SITE_INFO_WS,
  USERS_COURSES_WS,
} from './env.js';
import {
  childOf,
  describeChildren,
  describeErrorWithException,
  idAt,
  isRecord,
  isUnknownArray,
  ITEM_INDENT,
  LIST_INDENT,
  listOf,
  printOutcome,
  probe,
  shortValue,
  siteFunctionNames,
  skipped,
  summarizeSections,
} from './inspect.js';

const SEARCH_CRITERIA_NAME = 'search';
const SEARCH_PAGE = 0;
const SEARCH_PER_PAGE = 5;
/** 0: la ricerca non si limita ai corsi iscritti, così compaiono anche quelli a cui l'utente non è iscritto. */
const SEARCH_NOT_LIMITED_TO_ENROLLED = 0;
const SEARCH_EXAMPLE_MAX_LENGTH = 40;
/** Campi che non si mostrano mai come esempio, anche se brevi: sono testo libero o HTML. */
const SEARCH_NO_EXAMPLE_KEYS: readonly string[] = ['summary'];
const SEARCH_COURSES_KEY = 'courses';
const SEARCH_TOTAL_KEY = 'total';
const SEARCH_WARNINGS_KEY = 'warnings';
const COURSE_ID_KEY = 'id';

const searchParams = (text: string): MoodleParams => ({
  criterianame: SEARCH_CRITERIA_NAME,
  criteriavalue: text,
  page: SEARCH_PAGE,
  perpage: SEARCH_PER_PAGE,
  limittoenrolled: SEARCH_NOT_LIMITED_TO_ENROLLED,
});

const searchCourses = (result: unknown): readonly unknown[] => listOf(childOf(result, SEARCH_COURSES_KEY));

const searchCourseIds = (result: unknown): readonly number[] =>
  searchCourses(result)
    .map((course) => idAt(course, [COURSE_ID_KEY]))
    .filter((id): id is number => id !== undefined);

/** Gli URL non escono nemmeno come esempio: quelli dei file Moodle portano il token. */
const isLikelyUrl = (value: string): boolean => value.includes('://') || value.startsWith('/');

/** Testo corto, non HTML né URL: l'unico tipo di valore che si mostra come esempio. */
const isShortText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= SEARCH_EXAMPLE_MAX_LENGTH && !isLikelyUrl(value);

/** Esempio di un campo: un testo corto, o una lista di testi corti (es. i metodi di iscrizione). */
const exampleOf = (key: string, value: unknown): readonly string[] => {
  if (SEARCH_NO_EXAMPLE_KEYS.includes(key)) return [];
  if (isShortText(value)) return [`${key}="${value}"`];
  if (isUnknownArray(value) && value.length > 0 && value.every(isShortText)) {
    return [`${key}=[${value.map((item) => `"${item}"`).join(', ')}]`];
  }
  return [];
};

/** Il corso compare tra gli iscritti? Senza elenco degli iscritti la risposta non si può dare. */
const enrolmentLabel = (id: number | undefined, enrolledIds: readonly number[] | undefined): string => {
  if (enrolledIds === undefined) return 'iscrizione non verificata';
  if (id === undefined) return 'id assente';
  return enrolledIds.includes(id) ? 'iscritto' : 'non iscritto';
};

/** Solo codice e oggetto di ogni warning: il messaggio di Moodle non serve alla diagnosi. */
const describeWarnings = (result: unknown): readonly string[] => {
  const warnings = listOf(childOf(result, SEARCH_WARNINGS_KEY));
  return [
    `${LIST_INDENT}warnings: ${warnings.length}`,
    ...warnings.map(
      (warning) =>
        `${ITEM_INDENT}- warningcode ${shortValue(childOf(warning, 'warningcode'))}, item ${shortValue(childOf(warning, 'item'))}`,
    ),
  ];
};

const describeSearchCourse = (
  course: unknown,
  index: number,
  enrolledIds: readonly number[] | undefined,
): readonly string[] => {
  const id = idAt(course, [COURSE_ID_KEY]);
  const examples = isRecord(course) ? Object.entries(course).flatMap(([key, value]) => exampleOf(key, value)) : [];
  return [
    `${LIST_INDENT}corso ${index + 1} (id ${shortValue(id)}): ${enrolmentLabel(id, enrolledIds)}`,
    `${ITEM_INDENT}chiavi: ${describeChildren(course).join(', ') || 'nessuna'}`,
    `${ITEM_INDENT}esempi: ${examples.join(', ') || 'nessuno'}`,
  ];
};

/** Forma della risposta di ricerca: totale, warning e, per ogni corso, chiavi con tipo ed esempi brevi. */
const describeSearch = (result: unknown, enrolledIds: readonly number[] | undefined): readonly string[] => [
  `${LIST_INDENT}total: ${shortValue(childOf(result, SEARCH_TOTAL_KEY))}`,
  ...describeWarnings(result),
  ...searchCourses(result).flatMap((course, index) => describeSearchCourse(course, index, enrolledIds)),
];

/** Solo tipo e stato di ogni metodo di iscrizione: nomi e istruzioni restano fuori. */
const summarizeEnrolmentMethods = (result: unknown): string => {
  const methods = listOf(result).map(
    (method) => `${shortValue(childOf(method, 'type'))} (${shortValue(childOf(method, 'status'))})`,
  );
  return `${methods.length} metodi: ${methods.join(', ') || 'nessuno'}`;
};

/** Sul primo corso trovato che l'utente non segue: esito di contenuti e, se dichiarati, dei metodi di iscrizione. */
const inspectNotEnrolledCourse = async (
  courseId: number,
  declared: (wsfunction: string) => boolean,
): Promise<readonly boolean[]> => {
  const contents = await probe(
    `core_course_get_contents (corso non iscritto ${courseId})`,
    (client) => getCourseContents(client, courseId),
    summarizeSections,
    describeErrorWithException,
  );
  const methods = declared(ENROL_METHODS_WS)
    ? await probe(
        `${ENROL_METHODS_WS} (corso non iscritto ${courseId})`,
        (client) => client.call(ENROL_METHODS_WS, { courseid: courseId }, z.unknown()),
        summarizeEnrolmentMethods,
        describeErrorWithException,
      )
    : skipped(ENROL_METHODS_WS, 'non risulta dichiarata dal sito');
  return [contents, methods].map(printOutcome);
};

/** Confronta i risultati con gli iscritti e sonda il primo corso non iscritto. */
const inspectFirstNotEnrolled = async (
  searchResult: unknown,
  enrolledIds: readonly number[] | undefined,
  declared: (wsfunction: string) => boolean,
): Promise<readonly boolean[]> => {
  if (enrolledIds === undefined) {
    log(`${LIST_INDENT}corsi iscritti non letti: confronto con la ricerca saltato`);
    return [];
  }
  const found = searchCourseIds(searchResult);
  const notEnrolled = found.filter((id) => !enrolledIds.includes(id));
  log(`${LIST_INDENT}corsi trovati: ${found.length}, non iscritti: ${notEnrolled.length}`);
  const [firstNotEnrolled] = notEnrolled;
  if (firstNotEnrolled === undefined) {
    log(`${LIST_INDENT}nessun corso non iscritto nella pagina: prova un altro testo`);
    return [];
  }
  return inspectNotEnrolledCourse(firstNotEnrolled, declared);
};

/**
 * Sonda la ricerca di corsi (`WEBEEP_DIAGNOSE_SEARCH`): forma della risposta, confronto con gli
 * iscritti e, per il primo corso non iscritto, esito di contenuti e metodi di iscrizione.
 */
export const inspectSearch = async (
  text: string,
  enrolled: readonly Course[] | undefined,
): Promise<readonly boolean[]> => {
  const site = await probe(
    `${SITE_INFO_WS} (per la ricerca)`,
    (client) => client.call(SITE_INFO_WS, {}, z.unknown()),
    (siteInfo) => `${siteFunctionNames(siteInfo).length} funzioni dichiarate`,
  );
  const siteOk = printOutcome(site);
  const declared = (wsfunction: string): boolean => siteFunctionNames(site.result).includes(wsfunction);

  const search = await probe(
    `${SEARCH_WS} (testo "${text}")`,
    (client) => client.call(SEARCH_WS, searchParams(text), z.unknown()),
    (result) => `${searchCourses(result).length} corsi nella pagina`,
    describeErrorWithException,
  );
  const enrolledIds = enrolled?.map((course) => course.id);
  const searchLines = search.result === undefined ? [] : describeSearch(search.result, enrolledIds);
  const searchOk = printOutcome({ ...search, lines: [...search.lines, ...searchLines] });
  const notEnrolledResults =
    search.result === undefined ? [] : await inspectFirstNotEnrolled(search.result, enrolledIds, declared);

  const declarationLines =
    site.result === undefined
      ? [`${LIST_INDENT}funzioni dichiarate: non lette`]
      : [SEARCH_WS, ENROL_METHODS_WS, USERS_COURSES_WS].map(
          (name) => `${LIST_INDENT}${name}: ${declared(name) ? 'dichiarata' : 'non dichiarata'}`,
        );
  declarationLines.forEach(log);

  return [siteOk, searchOk, ...notEnrolledResults];
};
