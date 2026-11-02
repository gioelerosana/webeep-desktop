/*
 * Chiavi di query e mutation in un modulo a parte: le usano sia `queries.ts` sia
 * `favourites.ts`, e tenerle qui evita un import circolare tra i due.
 */
import type { CourseTimelineClassification } from '@webeep/moodle-api';

export const queryKeys = {
  auth: ['auth'] as const,
  courses: (classification: CourseTimelineClassification) => ['courses', classification] as const,
  /** Prefisso di tutte le liste di corsi: invalidarlo le aggiorna tutte. */
  coursesRoot: ['courses'] as const,
  courseContents: (courseId: number) => ['course-contents', courseId] as const,
  courseSearch: (query: string) => ['course-search', query] as const,
  coursePage: (courseId: number, moduleId: number) => ['course-page', courseId, moduleId] as const,
  courseModule: (cmid: number | null) => ['course-module', cmid] as const,
  upcomingEvents: ['upcoming-events'] as const,
  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
  /** Chiave del cambio di preferito: serve a `useCourseFavouritePending` per trovare le mutation in corso. */
  courseFavourite: ['course-favourite'] as const,
};
