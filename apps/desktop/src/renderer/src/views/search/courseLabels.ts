import { parseCourseName } from '../../lib/format';
import type { CourseSearchHit } from '../../lib/queries';

const META_SEPARATOR = ' · ';

export type CourseRowLabels = {
  readonly title: string;
  readonly meta: string;
};

/** Docenti del corso, uniti per la riga e per il dettaglio. */
export const teachersLabelOf = (course: CourseSearchHit): string => course.contacts.map((contact) => contact.fullname).join(', ');

/** Titolo e riga di metadati (categoria e docenti); i campi vuoti non lasciano separatori. */
export const courseRowLabelsOf = (course: CourseSearchHit): CourseRowLabels => ({
  title: parseCourseName(course.fullname).title,
  meta: [course.categoryname, teachersLabelOf(course)].filter(Boolean).join(META_SEPARATOR),
});
