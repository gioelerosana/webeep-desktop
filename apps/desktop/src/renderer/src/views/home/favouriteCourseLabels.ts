import type { Course } from '@webeep/moodle-api';
import { parseCourseName } from '../../lib/format';

const META_SEPARATOR = ' · ';

export type FavouriteCourseLabels = {
  readonly title: string;
  /** Categoria e docente, uniti; `undefined` se nessuno dei due c'è. */
  readonly meta: string | undefined;
};

/* Testi di una card corso: il titolo senza il docente tra parentesi, poi categoria e docente sotto. */
export const favouriteCourseLabelsOf = (course: Course): FavouriteCourseLabels => {
  const { title, teacher } = parseCourseName(course.fullname);
  const parts = [course.coursecategory, teacher].filter((part): part is string => Boolean(part));
  return { title, meta: parts.length > 0 ? parts.join(META_SEPARATOR) : undefined };
};
