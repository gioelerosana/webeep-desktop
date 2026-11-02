/*
 * Dati finti del bridge di sviluppo: dalle fixture JSON alle forme di Moodle, con
 * le date relative a "adesso". Lo stato mutabile (preferiti, notifiche lette) sta
 * qui perché è parte dei dati, non degli handler.
 */
import type {
  CalendarEvent,
  Course,
  CourseModuleContext,
  CourseSearchResult,
  CourseSection,
  CourseTimelineClassification,
  ModuleContent,
  MoodleNotification,
} from '@webeep/moodle-api';
import type { CoursePage, CoursePageFile } from '../../../../shared/ipc';
import fixtures from '../mock-fixtures.json';

const SECONDS_PER_MS = 1000;
const HOUR_S = 3_600;
const DAY_S = 86_400;
const PDF_EXTENSION = '.pdf';
const PDF_MIMETYPE = 'application/pdf';
const BINARY_MIMETYPE = 'application/octet-stream';
const SEARCH_LOCALE = 'it-IT';
const DEADLINES_PARAM = 'deadlines';
const NO_DEADLINES_PARAM_VALUE = 'none';

/** Parametri dell'URL letti una volta sola: `?mock=…`, `?update=…`, `?deadlines=…`. */
export const mockSearchParams = new URLSearchParams(window.location.search);

const nowSeconds = Math.floor(Date.now() / SECONDS_PER_MS);
export const mockUser = fixtures.user;

const mimetypeOf = (filename: string): string => (filename.endsWith(PDF_EXTENSION) ? PDF_MIMETYPE : BINARY_MIMETYPE);

type FixtureCourse = (typeof fixtures.courses)[number];

const toCourse = (course: FixtureCourse): Course => ({
  ...course,
  summary: '',
  isfavourite: course.isfavourite ?? false,
  hidden: false,
  viewurl: `${mockUser.siteurl}/course/view.php?id=${course.id}`,
});

// Mutabili: `moodle:set-course-favourite` cambia `isfavourite` come farebbe Moodle, e i preferiti si ricalcolano da qui.
let inProgressCourses: readonly Course[] = fixtures.courses.map(toCourse);
let pastCourses: readonly Course[] = fixtures.pastCourses.map(toCourse);
export const allCourses = (): readonly Course[] => [...inProgressCourses, ...pastCourses];

/** Come Moodle: cambia il flag nelle liste in memoria, senza toccare le fixture. */
export const setCourseFavourite = (courseId: number, favourite: boolean): void => {
  const applyFavourite = (course: Course): Course => (course.id === courseId ? { ...course, isfavourite: favourite } : course);
  inProgressCourses = inProgressCourses.map(applyFavourite);
  pastCourses = pastCourses.map(applyFavourite);
};

/** Come Moodle: le classificazioni che nelle fixture non hanno corsi restituiscono un elenco vuoto. */
export const coursesByClassification: Record<CourseTimelineClassification, () => readonly Course[]> = {
  all: allCourses,
  inprogress: () => inProgressCourses,
  past: () => pastCourses,
  future: () => [],
  favourites: () => allCourses().filter((course) => course.isfavourite),
  hidden: () => [],
};

export const catalog: readonly CourseSearchResult[] = fixtures.catalog;

export const matchesSearch = (course: CourseSearchResult, normalizedQuery: string): boolean =>
  [course.fullname, course.shortname, course.categoryname ?? ''].some((field) =>
    field.toLocaleLowerCase(SEARCH_LOCALE).includes(normalizedQuery),
  );

type FixtureFile = { readonly name: string; readonly size: number; readonly daysAgo: number };

const toContent = (file: FixtureFile): ModuleContent => ({
  type: 'file',
  filename: file.name,
  filesize: file.size,
  fileurl: `${mockUser.siteurl}/webservice/pluginfile.php/1/mod_resource/content/1/${encodeURIComponent(file.name)}`,
  timemodified: nowSeconds - file.daysAgo * DAY_S,
  mimetype: mimetypeOf(file.name),
});

type PageFixture = (typeof fixtures.pages)[number];
type PageFileFixture = PageFixture['files'][number];

const toCoursePageFile = (file: PageFileFixture): CoursePageFile => ({
  filename: file.name,
  filepath: '/',
  filesize: file.size,
  fileurl: file.fileurl,
  mimetype: mimetypeOf(file.name),
  timemodified: nowSeconds - file.daysAgo * DAY_S,
});

const toCoursePage = (page: PageFixture): CoursePage => ({
  moduleId: page.moduleId,
  name: page.name,
  introHtml: page.introHtml,
  contentHtml: page.contentHtml,
  files: page.files.map(toCoursePageFile),
  timemodified: nowSeconds - page.daysAgo * DAY_S,
});

/** Pagina del corso indicata dal `moduleId`; `null` se le fixture non la contengono. */
export const coursePageOf = (moduleId: number): CoursePage | null => {
  const page = fixtures.pages.find((item) => item.moduleId === moduleId);
  return page ? toCoursePage(page) : null;
};

export const sections: readonly CourseSection[] = fixtures.sections.map((section) => ({
  id: section.id,
  name: section.name,
  summary: section.summary,
  section: section.section,
  visible: true,
  uservisible: true,
  modules: section.modules.map((module) => ({
    id: module.id,
    name: module.name,
    modname: module.modname,
    url: 'url' in module ? module.url : undefined,
    description: 'description' in module ? module.description : undefined,
    visible: true,
    uservisible: true,
    contents:
      'externalUrl' in module
        ? [{ type: 'url', filename: module.name, filesize: 0, fileurl: module.externalUrl }]
        : module.files.map(toContent),
  })),
}));

const courseById = new Map(allCourses().map((course) => [course.id, course]));

const events: readonly CalendarEvent[] = fixtures.events.map((event) => {
  const course = courseById.get(event.courseId);
  return {
    id: event.id,
    name: event.name,
    description: '',
    eventtype: 'due',
    modulename: event.modulename,
    timestart: nowSeconds + event.inHours * HOUR_S,
    timesort: nowSeconds + event.inHours * HOUR_S,
    timeduration: 0,
    overdue: false,
    url: `${mockUser.siteurl}/mod/${event.modulename}/view.php?id=${event.id}`,
    course: course ? { id: course.id, fullname: course.fullname, shortname: course.shortname } : undefined,
  };
});

/** `?deadlines=none` toglie le scadenze, per vedere la Home senza la sezione. */
export const upcomingEvents: readonly CalendarEvent[] =
  mockSearchParams.get(DEADLINES_PARAM) === NO_DEADLINES_PARAM_VALUE ? [] : events;

type NotificationFixture = (typeof fixtures.notifications)[number];

/** Notifica di prova: le fixture danno solo il percorso della `contexturl`, qui diventa assoluto. */
const toNotification = (item: NotificationFixture): MoodleNotification => ({
  id: item.id,
  subject: item.subject,
  smallmessage: item.smallmessage,
  text: item.text,
  fullmessage: item.fullmessage,
  fullmessagehtml: item.fullmessagehtml,
  // `null` come farebbe Moodle: la notifica esiste ma non ha un link da aprire.
  contexturl: item.contexturlPath === null ? null : `${mockUser.siteurl}${item.contexturlPath}`,
  contexturlname: item.contexturlName,
  component: item.component,
  componentlabel: item.componentlabel,
  eventtype: item.eventtype,
  timecreated: nowSeconds - item.hoursAgo * HOUR_S,
  read: item.read,
});

let notifications: readonly MoodleNotification[] = fixtures.notifications.map(toNotification);

export const getNotifications = (): readonly MoodleNotification[] => notifications;

export const markNotificationRead = (notificationId: number): void => {
  notifications = notifications.map((item) => (item.id === notificationId ? { ...item, read: true } : item));
};

export const markAllNotificationsRead = (): void => {
  notifications = notifications.map((item) => ({ ...item, read: true }));
};

type CourseModuleFixture = (typeof fixtures.courseModules)[number];

/** Contesto del modulo come `core_course_get_course_module`: `null` quando il `cmid` non è nelle fixture. */
const toCourseModuleContext = (module: CourseModuleFixture): CourseModuleContext => ({
  ...module,
  visible: true,
  uservisible: true,
  url: `${mockUser.siteurl}/mod/${module.modname}/view.php?id=${module.id}`,
});

export const courseModuleContextOf = (cmid: number): CourseModuleContext | null => {
  const module = fixtures.courseModules.find((item) => item.id === cmid);
  return module ? toCourseModuleContext(module) : null;
};
