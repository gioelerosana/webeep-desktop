import type { UseQueryResult } from '@tanstack/react-query';
import type { Course } from '@webeep/moodle-api';
import { useCallback, useMemo, useState } from 'react';
import { useCourses } from '../lib/queries';
import { groupCoursesByAcademicYear, type CourseGroup } from './academicYears';
import { filterCoursesByTitle } from './courseFilter';

export type PastCoursesStatus = 'loading' | 'error' | 'ready';

export type SidebarPastCourses = {
  readonly status: PastCoursesStatus;
  /** Corsi passati che passano il filtro di ricerca, raggruppati per anno accademico. */
  readonly groups: readonly CourseGroup[];
  /** Numero di corsi in `groups`, mostrato accanto all'intestazione della sezione. */
  readonly count: number;
  readonly isOpen: boolean;
  readonly toggleOpen: () => void;
  readonly retry: () => void;
};

const resolveStatus = (result: UseQueryResult<readonly Course[]>): PastCoursesStatus => {
  if (result.data !== undefined) return 'ready';
  return result.isError ? 'error' : 'loading';
};

/**
 * Corsi degli anni precedenti per la sidebar. La sezione è chiusa di default e
 * il caricamento parte comunque, così il conteggio si vede già con la sezione chiusa.
 */
export const useSidebarPastCourses = (query: string): SidebarPastCourses => {
  const [isOpen, setIsOpen] = useState(false);
  const result = useCourses('past');
  const courses = result.data;
  const groups = useMemo(
    () => groupCoursesByAcademicYear(filterCoursesByTitle(courses ?? [], query)),
    [courses, query],
  );
  const count = useMemo(() => groups.reduce((total, group) => total + group.courses.length, 0), [groups]);
  const toggleOpen = useCallback(() => setIsOpen((open) => !open), []);
  const { refetch } = result;
  const retry = useCallback(() => void refetch(), [refetch]);
  return { status: resolveStatus(result), groups, count, isOpen, toggleOpen, retry };
};
