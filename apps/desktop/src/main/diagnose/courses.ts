/*
 * Corsi della modalità diagnostica: struttura dei contenuti e funzioni web
 * service che la vista corso usa (forum, consegne, voti, completamento, quiz,
 * libri, calendario, messaggi).
 *
 * Sola lettura: ogni chiamata sta dopo quella da cui prende l'id, così l'ordine
 * dei passi resta quello del corso vero.
 */
import {
  WEBEEP_SITE_URL,
  type Course,
  type CourseModule,
  type CourseSection,
  type ModuleContent,
} from '@webeep/moodle-api';
import { z } from 'zod';
import {
  FORUM_POSTS_ENV_VAR,
  isEnvFlagOn,
  log,
  SITE_INFO_WS,
  WEBEEP_ORIGIN,
} from './env.js';
import {
  childOf,
  forUser,
  idAt,
  inspectSiteFunctions,
  isRecord,
  isUnknownArray,
  ITEM_INDENT,
  LIST_INDENT,
  MISSING_VALUE_TYPE,
  numberOrUndefined,
  type Outcome,
  printOutcome,
  probe,
  probeStructure,
  probeWhenKnown,
  siteFunctionNames,
  skipped,
} from './inspect.js';

const CONTENT_INDENT = '      ';
const CONTENT_FIELD_KEY = 'content';

export type CourseContentsProbe = {
  readonly course: Course;
  readonly outcome: Outcome<readonly CourseSection[]>;
};

const PAGE_LIKE_MODNAMES = ['page', 'book'] as const;
type PageLikeModname = (typeof PAGE_LIKE_MODNAMES)[number];
type PageLikeCall = { readonly wsfunction: string; readonly collectionKey: string };
const PAGE_LIKE_CALLS: Readonly<Record<PageLikeModname, PageLikeCall>> = {
  page: { wsfunction: 'mod_page_get_pages_by_courses', collectionKey: 'pages' },
  book: { wsfunction: 'mod_book_get_books_by_courses', collectionKey: 'books' },
};

/** Mese di `Date` è da 0 a 11, quello di Moodle da 1 a 12. */
const MONTH_OFFSET = 1;

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

/**
 * Sola lettura: ogni chiamata sta dopo quella da cui prende l'id. Il post di un forum
 * (`mod_forum_get_discussion_posts`) non parte senza `WEBEEP_DIAGNOSE_FORUM_POSTS=1`,
 * perché Moodle lo registra come letto.
 */
const inspectCourseWebservices = async (courseId: number, userId: number | undefined): Promise<readonly boolean[]> => {
  const courseTag = `(corso ${courseId})`;
  const forums = await probeStructure(`mod_forum_get_forums_by_courses ${courseTag}`, 'mod_forum_get_forums_by_courses', {
    courseids: [courseId],
  });
  const forumId = idAt(forums.result, [0, 'id']);
  const discussions = await probeWhenKnown(
    forumId,
    `mod_forum_get_forum_discussions ${courseTag}`,
    'mod_forum_get_forum_discussions',
    (id) => ({ forumid: id }),
    'nessun forum nel corso',
  );
  const discussionId = idAt(discussions.result, ['discussions', 0, 'discussion']);
  const postsLabel = `mod_forum_get_discussion_posts ${courseTag}`;
  const posts = isEnvFlagOn(FORUM_POSTS_ENV_VAR)
    ? await probeWhenKnown(
        discussionId,
        postsLabel,
        'mod_forum_get_discussion_posts',
        (id) => ({ discussionid: id }),
        'nessuna discussione nel primo forum',
      )
    : skipped(postsLabel, `non chiamata di default, serve ${FORUM_POSTS_ENV_VAR}=1 (Moodle la segna come letta)`);

  const assignments = await probeStructure(`mod_assign_get_assignments ${courseTag}`, 'mod_assign_get_assignments', {
    courseids: [courseId],
  });
  const assignId = idAt(assignments.result, ['courses', 0, 'assignments', 0, 'id']);
  const submission = await probeWhenKnown(
    assignId,
    `mod_assign_get_submission_status ${courseTag}`,
    'mod_assign_get_submission_status',
    (id) => ({ assignid: id, ...forUser(userId) }),
    'nessun compito nel corso',
  );

  const gradeItems = await probeStructure(`gradereport_user_get_grade_items ${courseTag}`, 'gradereport_user_get_grade_items', {
    courseid: courseId,
    ...forUser(userId),
  });
  const completion = await probeStructure(
    `core_completion_get_activities_completion_status ${courseTag}`,
    'core_completion_get_activities_completion_status',
    { courseid: courseId, ...forUser(userId) },
  );

  const quizzes = await probeStructure(`mod_quiz_get_quizzes_by_courses ${courseTag}`, 'mod_quiz_get_quizzes_by_courses', {
    courseids: [courseId],
  });
  const quizId = idAt(quizzes.result, ['quizzes', 0, 'id']);
  const attempts = await probeWhenKnown(
    quizId,
    `mod_quiz_get_user_attempts ${courseTag}`,
    'mod_quiz_get_user_attempts',
    (id) => ({ quizid: id, status: 'all', ...forUser(userId) }),
    'nessun quiz nel corso',
  );

  const books = await probeStructure(`mod_book_get_books_by_courses ${courseTag}`, 'mod_book_get_books_by_courses', {
    courseids: [courseId],
  });

  const today = new Date();
  const calendar = await probeStructure(
    `core_calendar_get_calendar_monthly_view ${courseTag}`,
    'core_calendar_get_calendar_monthly_view',
    { year: today.getFullYear(), month: today.getMonth() + MONTH_OFFSET, courseid: courseId },
  );

  const conversations = await probeWhenKnown(
    userId,
    `core_message_get_conversations ${courseTag}`,
    'core_message_get_conversations',
    (id) => ({ userid: id }),
    'id utente assente dalla sessione',
  );

  return [
    forums,
    discussions,
    posts,
    assignments,
    submission,
    gradeItems,
    completion,
    quizzes,
    attempts,
    books,
    calendar,
    conversations,
  ].map(printOutcome);
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
  userId: number | undefined,
): Promise<readonly boolean[]> => {
  const needle = filter.toLocaleLowerCase();
  const matches = probes.filter(({ course }) => matchesCourse(course, needle));
  if (matches.length === 0) {
    const names = probes.map(({ course }) => course.fullname).join(' | ');
    log(`nessun corso corrisponde al filtro "${filter}". Corsi disponibili: ${names}`);
    return [];
  }
  const inspected = await Promise.all(
    matches.map(async (match) => [
      ...(await inspectCourseProbe(match)),
      ...(await inspectCourseWebservices(match.course.id, userId)),
    ]),
  );
  return inspected.flat();
};

/** Dettaglio opt-in: funzioni dichiarate dal sito, poi struttura dei corsi che corrispondono. */
export const inspectDetail = async (
  probes: readonly CourseContentsProbe[],
  filter: string | undefined,
  functionsRequested: boolean,
): Promise<readonly boolean[]> => {
  const site = await probe(
    `${SITE_INFO_WS} (funzioni)`,
    (client) => client.call(SITE_INFO_WS, {}, z.unknown()),
    (siteInfo) => `${siteFunctionNames(siteInfo).length} funzioni dichiarate`,
  );
  const siteOk = printOutcome(site);
  if (site.result === undefined) return [siteOk];
  inspectSiteFunctions(site.result, functionsRequested);
  if (filter === undefined) return [siteOk];
  const userId = numberOrUndefined(childOf(site.result, 'userid'));
  const courseResults = await inspectMatchingCourses(probes, filter, userId);
  return [siteOk, ...courseResults];
};
