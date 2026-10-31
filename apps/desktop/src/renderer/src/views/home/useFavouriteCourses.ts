import type { UseQueryResult } from '@tanstack/react-query';
import type { Course } from '@webeep/moodle-api';
import { useCourses } from '../../lib/queries';

export type FavouriteCoursesState = {
  readonly query: UseQueryResult<readonly Course[]>;
  readonly courses: readonly Course[];
};

/* Corsi segnalati come preferiti su WeBeep: la classificazione `favourites` di Moodle, letta così com'è. */
export const useFavouriteCourses = (): FavouriteCoursesState => {
  const query = useCourses('favourites');
  return { query, courses: query.data ?? [] };
};
