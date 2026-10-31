/*
 * Endpoint tipizzati usati dall'app.
 *
 * Ogni funzione: nome Moodle → parametri → schema. Per aggiungerne uno, segui
 * lo stesso schema e documentalo in docs/MOODLE-API.md.
 */
import { z } from 'zod';
import { callPublicAjax, type FetchLike, type MoodleClient } from './client.js';
import { MoodleApiError } from './errors.js';
import {
  actionEventsSchema,
  courseContentsSchema,
  coursesByTimelineSchema,
  pagesByCoursesSchema,
  courseSearchResponseSchema,
  markAllNotificationsReadSchema,
  popupNotificationsSchema,
  publicConfigSchema,
  setFavouriteCoursesSchema,
  siteInfoSchema,
  type CalendarEvent,
  type Course,
  type CourseSearchPage,
  type CourseSection,
  type CourseTimelineClassification,
  type NotificationsPage,
  type Page,
  type PublicConfig,
  type SiteInfo,
} from './schemas.js';

const DEFAULT_EVENTS_LIMIT = 50;
const DEFAULT_NOTIFICATIONS_LIMIT = 50;
const SECONDS_PER_MS = 1000;

const nowInSeconds = (): number => Math.floor(Date.now() / SECONDS_PER_MS);

export const getPublicConfig = (siteUrl: string, fetchFn?: FetchLike): Promise<PublicConfig> =>
  callPublicAjax(siteUrl, 'tool_mobile_get_public_config', {}, publicConfigSchema, fetchFn);

export const getSiteInfo = (client: MoodleClient): Promise<SiteInfo> =>
  client.call('core_webservice_get_site_info', {}, siteInfoSchema);

export const getCourses = async (
  client: MoodleClient,
  classification: CourseTimelineClassification = 'inprogress',
): Promise<readonly Course[]> => {
  const result = await client.call(
    'core_course_get_enrolled_courses_by_timeline_classification',
    { classification, limit: 0, offset: 0, sort: 'fullname' },
    coursesByTimelineSchema,
  );
  return result.courses;
};

export const getCourseContents = (client: MoodleClient, courseId: number): Promise<readonly CourseSection[]> =>
  client.call('core_course_get_contents', { courseid: courseId }, courseContentsSchema);

/**
 * Pagine (`mod_page`) dei corsi indicati. Con `courseids` vuoto Moodle
 * restituisce le pagine di tutti i corsi dell'utente: quel caso non va inviato,
 * si risponde subito con un elenco vuoto.
 */
export const getPages = async (client: MoodleClient, courseIds: readonly number[]): Promise<readonly Page[]> => {
  if (courseIds.length === 0) return [];
  const result = await client.call('mod_page_get_pages_by_courses', { courseids: courseIds }, pagesByCoursesSchema);
  return result.pages;
};

export type UpcomingEventsOptions = {
  readonly fromSeconds?: number;
  readonly limit?: number;
};

/** Scadenze e attività con azione (la "Sequenza temporale" della dashboard). */
export const getUpcomingEvents = async (
  client: MoodleClient,
  options: UpcomingEventsOptions = {},
): Promise<readonly CalendarEvent[]> => {
  const result = await client.call(
    'core_calendar_get_action_events_by_timesort',
    { timesortfrom: options.fromSeconds ?? nowInSeconds(), limitnum: options.limit ?? DEFAULT_EVENTS_LIMIT },
    actionEventsSchema,
  );
  return result.events;
};

export type NotificationsOptions = {
  readonly userId: number;
  readonly limit?: number;
  readonly offset?: number;
};

export const getNotifications = (client: MoodleClient, options: NotificationsOptions): Promise<NotificationsPage> =>
  client.call(
    'message_popup_get_popup_notifications',
    { useridto: options.userId, limit: options.limit ?? DEFAULT_NOTIFICATIONS_LIMIT, offset: options.offset ?? 0 },
    popupNotificationsSchema,
  );

export type CourseSearchOptions = {
  readonly query: string;
  readonly page: number;
  readonly perPage: number;
};

/**
 * Ricerca nel catalogo dei corsi, anche tra quelli a cui l'utente non è iscritto.
 * `limittoenrolled: 0` è il default di Moodle e lo si esplicita per non dipenderne.
 */
export const searchCourses = (client: MoodleClient, options: CourseSearchOptions): Promise<CourseSearchPage> =>
  client.call(
    'core_course_search_courses',
    {
      criterianame: 'search',
      criteriavalue: options.query,
      page: options.page,
      perpage: options.perPage,
      limittoenrolled: 0,
    },
    courseSearchResponseSchema,
  );

export const markNotificationRead = async (client: MoodleClient, notificationId: number): Promise<void> => {
  await client.call(
    'core_message_mark_notification_read',
    { notificationid: notificationId, timeread: nowInSeconds() },
    z.object({ notificationid: z.number() }),
  );
};

/**
 * Segna come lette tutte le notifiche ricevute dall'utente. Si lasciano i
 * default di Moodle (`useridfrom` e `timecreatedto` a 0): nessun filtro per
 * mittente o per data, quindi vale per tutte.
 */
export const markAllNotificationsRead = async (client: MoodleClient, userId: number): Promise<void> => {
  await client.call('core_message_mark_all_notifications_as_read', { useridto: userId }, markAllNotificationsReadSchema);
};

const SET_FAVOURITE_FUNCTION = 'core_course_set_favourite_courses';

/**
 * Mette (`favourite: true`) o toglie (`false`) un corso dai preferiti di WeBeep.
 *
 * Scrittura su WeBeep: si chiama solo da un'azione esplicita dell'utente (AGENTS.md, regola 8).
 * Moodle risponde 200 con `warnings` anche quando non applica il cambio: un warning
 * diventa `MoodleApiError`, così un "no" non sembra un "sì".
 */
export const setCourseFavourite = async (client: MoodleClient, courseId: number, favourite: boolean): Promise<void> => {
  const result = await client.call(
    SET_FAVOURITE_FUNCTION,
    { courses: [{ id: courseId, favourite }] },
    setFavouriteCoursesSchema,
  );
  const [warning] = result.warnings;
  if (warning) throw new MoodleApiError(warning.warningcode, warning.message, SET_FAVOURITE_FUNCTION);
};

/**
 * I `fileurl` di Moodle (pluginfile) richiedono il token come query string.
 * L'URL risultante è una credenziale: non va mai mostrato né loggato.
 */
export const authenticatedFileUrl = (fileUrl: string, token: string): string => {
  const url = new URL(fileUrl);
  url.searchParams.set('token', token);
  return url.toString();
};
