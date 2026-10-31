/*
 * Schemi zod delle risposte Moodle usate dall'app.
 *
 * Validiamo al confine: tutto ciò che esce da questo pacchetto ha già la forma
 * dichiarata qui. Gli schemi sono volutamente permissivi sui campi opzionali
 * (Moodle omette chiavi a seconda della versione e dei permessi) e rigidi solo
 * su ciò che l'interfaccia usa davvero. Le chiavi sconosciute vengono scartate.
 *
 * Riferimento delle funzioni: docs/MOODLE-API.md.
 */
import { z } from 'zod';

/** Moodle restituisce i booleani a volte come `true`, a volte come `0/1`. */
const moodleBool = z.union([z.boolean(), z.number()]).transform((value) => Boolean(value));

/** Timestamp Unix in secondi, come li manda Moodle. */
const unixSeconds = z.number().int();

export const siteInfoSchema = z.object({
  sitename: z.string(),
  siteurl: z.string(),
  username: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  fullname: z.string(),
  userid: z.number().int(),
  userpictureurl: z.string(),
  lang: z.string().optional(),
  release: z.string().optional(),
});
export type SiteInfo = z.infer<typeof siteInfoSchema>;

export const courseSchema = z.object({
  id: z.number().int(),
  fullname: z.string(),
  shortname: z.string(),
  summary: z.string().optional().default(''),
  courseimage: z.string().optional(),
  coursecategory: z.string().optional(),
  progress: z.number().nullable().optional(),
  startdate: unixSeconds.optional(),
  enddate: unixSeconds.optional(),
  isfavourite: moodleBool.optional().default(false),
  hidden: moodleBool.optional().default(false),
  viewurl: z.string().optional(),
});
export type Course = z.infer<typeof courseSchema>;

export const coursesByTimelineSchema = z.object({
  courses: z.array(courseSchema),
  nextoffset: z.number().int().optional(),
});

export const COURSE_TIMELINE_CLASSIFICATIONS = ['all', 'inprogress', 'future', 'past', 'favourites', 'hidden'] as const;
export type CourseTimelineClassification = (typeof COURSE_TIMELINE_CLASSIFICATIONS)[number];

/**
 * Moodle manda `filepath: null` sui file dei moduli `resource` (osservato su
 * WeBeep): la chiave c'è ma non ha valore. Lo normalizziamo a `undefined`, che è
 * il significato che il resto del codice si aspetta da un campo opzionale.
 */
const nullishToUndefined = <TValue>(value: TValue | null | undefined): TValue | undefined => value ?? undefined;

export const moduleContentSchema = z.object({
  type: z.string(),
  filename: z.string(),
  filepath: z
    .string()
    .nullish()
    .transform(nullishToUndefined)
    .optional(),
  filesize: z.number().optional().default(0),
  fileurl: z.string().optional(),
  timemodified: unixSeconds.optional(),
  mimetype: z.string().optional(),
  author: z.string().nullable().optional(),
});
export type ModuleContent = z.infer<typeof moduleContentSchema>;

export const courseModuleSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  modname: z.string(),
  modicon: z.string().optional(),
  url: z.string().optional(),
  instance: z.number().int().optional(),
  description: z.string().optional(),
  visible: moodleBool.optional().default(true),
  uservisible: moodleBool.optional().default(true),
  contents: z.array(moduleContentSchema).optional().default([]),
});
export type CourseModule = z.infer<typeof courseModuleSchema>;

export const courseSectionSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  summary: z.string().optional().default(''),
  section: z.number().int().optional(),
  visible: moodleBool.optional().default(true),
  uservisible: moodleBool.optional().default(true),
  modules: z.array(courseModuleSchema),
});
export type CourseSection = z.infer<typeof courseSectionSchema>;

export const courseContentsSchema = z.array(courseSectionSchema);

export const calendarEventSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().optional().default(''),
  eventtype: z.string(),
  modulename: z.string().optional(),
  timestart: unixSeconds,
  timesort: unixSeconds.optional(),
  timeduration: z.number().optional().default(0),
  overdue: moodleBool.optional().default(false),
  url: z.string().optional(),
  course: z
    .object({
      id: z.number().int(),
      fullname: z.string(),
      shortname: z.string().optional(),
    })
    .optional(),
  action: z
    .object({
      name: z.string(),
      url: z.string(),
      actionable: moodleBool,
    })
    .optional(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const actionEventsSchema = z.object({
  events: z.array(calendarEventSchema),
  firstid: z.number().optional(),
  lastid: z.number().optional(),
});

export const notificationSchema = z.object({
  id: z.number().int(),
  subject: z.string(),
  shortenedsubject: z.string().optional(),
  smallmessage: z.string().nullable().optional(),
  fullmessagehtml: z.string().nullable().optional(),
  contexturl: z.string().nullable().optional(),
  contexturlname: z.string().nullable().optional(),
  component: z.string().optional(),
  eventtype: z.string().optional(),
  timecreated: unixSeconds,
  read: moodleBool,
  iconurl: z.string().optional(),
});
export type MoodleNotification = z.infer<typeof notificationSchema>;

export const popupNotificationsSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadcount: z.number().int(),
});
export type NotificationsPage = z.infer<typeof popupNotificationsSchema>;

/** Moodle risponde `true` quando ha segnato le notifiche; `false` non è atteso e fa fallire la validazione. */
export const markAllNotificationsReadSchema = z.literal(true);

export const publicConfigSchema = z.object({
  wwwroot: z.string(),
  sitename: z.string(),
  launchurl: z.string().optional(),
  typeoflogin: z.number().int(),
  enablemobilewebservice: moodleBool,
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;

/**
 * File allegati a una pagina (`contentfiles`, `introfiles`). Non hanno il campo
 * `type` dei file dei moduli del corso, quindi non riusano `moduleContentSchema`.
 */
export const pageFileSchema = z.object({
  filename: z.string(),
  filepath: z
    .string()
    .nullish()
    .transform(nullishToUndefined)
    .optional(),
  filesize: z.number().optional().default(0),
  fileurl: z.string().optional(),
  timemodified: unixSeconds.optional(),
  mimetype: z.string().optional(),
});
export type PageFile = z.infer<typeof pageFileSchema>;

/**
 * Pagina `mod_page`. `coursemodule` è l'id del modulo nel corso, lo stesso di
 * `core_course_get_contents` (`modules[].id`). `content` è HTML: va mostrato
 * come testo, non iniettato (vedi AGENTS.md).
 */
export const pageSchema = z.object({
  id: z.number().int(),
  coursemodule: z.number().int(),
  course: z.number().int(),
  name: z.string(),
  intro: z.string().optional().default(''),
  introfiles: z.array(pageFileSchema).optional().default([]),
  content: z.string(),
  contentformat: z.number().int().optional(),
  contentfiles: z.array(pageFileSchema).optional().default([]),
  timemodified: unixSeconds,
  revision: z.number().int().optional(),
});
export type Page = z.infer<typeof pageSchema>;

const moodleWarningSchema = z.object({
  item: z.string(),
  itemid: z.number().int(),
  warningcode: z.string(),
  message: z.string(),
});

export const pagesByCoursesSchema = z.object({
  pages: z.array(pageSchema),
  warnings: z.array(moodleWarningSchema).optional().default([]),
});

/*
 * `core_course_set_favourite_courses` risponde solo con i `warnings`: il cambio è
 * riuscito quando la lista è vuota. Un warning non vuoto va trattato come errore
 * dal chiamante (vedi `setCourseFavourite`).
 */
export const setFavouriteCoursesSchema = z.object({
  warnings: z.array(moodleWarningSchema).optional().default([]),
});

/*
 * Ricerca nel catalogo (`core_course_search_courses`). Riguarda anche corsi a cui
 * l'utente non è iscritto: per quelli Moodle non dà progresso né date, quindi
 * il risultato non riusa `courseSchema`.
 */
const nullishToEmpty = (value: string | null | undefined): string => value ?? '';

const optionalText = z
  .string()
  .nullish()
  .transform(nullishToUndefined)
  .optional();

const courseContactSchema = z.object({
  id: z.number().int(),
  fullname: z.string(),
});

export const courseSearchResultSchema = z.object({
  id: z.number().int(),
  fullname: z.string(),
  displayname: optionalText,
  shortname: z.string(),
  courseimage: optionalText,
  categoryid: z.number().int(),
  categoryname: optionalText,
  summary: z
    .string()
    .nullish()
    .transform(nullishToEmpty),
  contacts: z.array(courseContactSchema).optional().default([]),
  enrollmentmethods: z.array(z.string()).optional().default([]),
});
export type CourseSearchResult = z.infer<typeof courseSearchResultSchema>;

export const courseSearchResponseSchema = z.object({
  total: z.number().int(),
  courses: z.array(courseSearchResultSchema),
});

/** Una pagina della ricerca; `total` conta i risultati su tutte le pagine. */
export type CourseSearchPage = {
  readonly total: number;
  readonly courses: readonly CourseSearchResult[];
};
