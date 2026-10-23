import type { Course } from '@webeep/moodle-api';
import { parseCourseName } from '../lib/format';

const SEARCH_LOCALE = 'it-IT';

/** Filtra per titolo leggibile, senza distinzione di maiuscole; query vuota = tutti i corsi. */
export const filterCoursesByTitle = (courses: readonly Course[], query: string): readonly Course[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase(SEARCH_LOCALE);
  return courses.filter((course) =>
    parseCourseName(course.fullname).title.toLocaleLowerCase(SEARCH_LOCALE).includes(normalizedQuery),
  );
};
