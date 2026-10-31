// Entry neutrale (Node e browser). Il login SSO, che usa node:crypto, è in `@webeep/moodle-api/auth`.
export { callPublicAjax, createMoodleClient, type FetchLike, type MoodleClient, type MoodleClientOptions } from './client.js';
export {
  authenticatedFileUrl,
  getCourseContents,
  getCourses,
  getNotifications,
  getPages,
  getPublicConfig,
  getSiteInfo,
  getUpcomingEvents,
  markAllNotificationsRead,
  markNotificationRead,
  searchCourses,
  setCourseFavourite,
  type CourseSearchOptions,
  type NotificationsOptions,
  type UpcomingEventsOptions,
} from './endpoints.js';
export { MoodleApiError, MoodleNetworkError, MoodleResponseShapeError, type MoodleErrorCode } from './errors.js';
export { encodeMoodleParams, type MoodleParams, type MoodleParamValue } from './params.js';
export {
  COURSE_TIMELINE_CLASSIFICATIONS,
  type CalendarEvent,
  type Course,
  type CourseModule,
  type CourseSearchPage,
  type CourseSearchResult,
  type CourseSection,
  type CourseTimelineClassification,
  type ModuleContent,
  type MoodleNotification,
  type NotificationsPage,
  type Page,
  type PageFile,
  type PublicConfig,
  type SiteInfo,
} from './schemas.js';

export const WEBEEP_SITE_URL = 'https://webeep.polimi.it';
