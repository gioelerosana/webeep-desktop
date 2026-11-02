import type { Course } from '@webeep/moodle-api';
import { joinMeta, parseCourseName } from '../../lib/format';

export type FavouriteCourseLabels = {
  readonly title: string;
  /** Categoria e docente, uniti; `undefined` se nessuno dei due c'è. */
  readonly meta: string | undefined;
};

/* Testi di una card corso: il titolo senza il docente tra parentesi, poi categoria e docente sotto. */
export const favouriteCourseLabelsOf = (course: Course): FavouriteCourseLabels => {
  const { title, teacher } = parseCourseName(course.fullname);
  const meta = joinMeta([course.coursecategory, teacher]);
  return { title, meta: meta === '' ? undefined : meta };
};
