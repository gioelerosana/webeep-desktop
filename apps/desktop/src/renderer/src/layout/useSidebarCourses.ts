import type { Course } from '@webeep/moodle-api';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useCourses } from '../lib/queries';
import { filterCoursesByTitle } from './courseFilter';

export type SidebarCourses = {
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly result: UseQueryResult<readonly Course[]>;
  /** Corsi che passano il filtro di ricerca, nell'ordine ricevuto da Moodle. */
  readonly visibleCourses: readonly Course[];
};

/** Corsi in corso per la sidebar, filtrati lato client per titolo (senza distinzione di maiuscole). */
export const useSidebarCourses = (): SidebarCourses => {
  const [query, setQuery] = useState('');
  const result = useCourses('inprogress');
  const courses = result.data;
  const visibleCourses = useMemo(() => filterCoursesByTitle(courses ?? [], query), [courses, query]);
  return { query, setQuery, result, visibleCourses };
};
