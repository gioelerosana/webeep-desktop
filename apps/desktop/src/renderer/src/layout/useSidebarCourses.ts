import type { Course } from '@webeep/moodle-api';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { parseCourseName } from '../lib/format';
import { useCourses } from '../lib/queries';

const SEARCH_LOCALE = 'it-IT';

export type SidebarCourses = {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly result: UseQueryResult<readonly Course[]>;
  /** Corsi che passano il filtro di ricerca, nell'ordine ricevuto da Moodle. */
  readonly visibleCourses: readonly Course[];
};

const matchesQuery = (course: Course, normalizedQuery: string): boolean =>
  parseCourseName(course.fullname).title.toLocaleLowerCase(SEARCH_LOCALE).includes(normalizedQuery);

/** Corsi in corso per la sidebar, filtrati lato client per titolo (senza distinzione di maiuscole). */
export const useSidebarCourses = (): SidebarCourses => {
  const [query, setQuery] = useState('');
  const result = useCourses('inprogress');
  const normalizedQuery = query.trim().toLocaleLowerCase(SEARCH_LOCALE);
  const courses = result.data;
  const visibleCourses = useMemo(
    () => (courses ?? []).filter((course) => matchesQuery(course, normalizedQuery)),
    [courses, normalizedQuery],
  );
  return { query, setQuery, result, visibleCourses };
};
