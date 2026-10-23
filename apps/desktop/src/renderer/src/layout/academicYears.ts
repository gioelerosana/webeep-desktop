import type { Course } from '@webeep/moodle-api';

// Anno accademico tra parentesi quadre nel nome del corso: "ANALISI 1 [2025-26]" cattura "2025-26";
// "CHIMICA [2025-2026]" e "ANALISI 1 [C.I.]" non corrispondono.
// https://regex101.com/?regex=%5C%5B%28%5Cd%7B4%7D-%5Cd%7B2%7D%29%5C%5D&testString=ANALISI%201%20%5B2025-26%5D%0AANALISI%201%20%5BC.I.%5D%0ACHIMICA%20%5B2025-2026%5D&flavor=javascript
const ACADEMIC_YEAR_TAG = /\[(\d{4}-\d{2})\]/;

/** Etichetta del gruppo per i corsi senza tag d'anno; maiuscola perché è un'intestazione visibile. */
const UNTAGGED_GROUP_LABEL = 'Altri';

export type CourseGroup = {
  /** "2025-26", oppure "Altri" per i corsi senza tag. */
  readonly label: string;
  readonly courses: readonly Course[];
};

type TaggedCourse = {
  readonly course: Course;
  /** Assente se il nome del corso non ha il tag d'anno. */
  readonly academicYear: string | undefined;
};

const tagCourse = (course: Course): TaggedCourse => ({
  course,
  academicYear: ACADEMIC_YEAR_TAG.exec(course.fullname)?.[1],
});

/**
 * Raggruppa per anno accademico, dal più recente. "2025-26" > "2024-25" in ordine
 * di stringa perché il formato è fisso, quindi non serve un parsing numerico.
 * I corsi senza tag finiscono in fondo nel gruppo "altri", nell'ordine ricevuto.
 */
export const groupCoursesByAcademicYear = (courses: readonly Course[]): readonly CourseGroup[] => {
  const tagged = courses.map(tagCourse);
  const years = [...new Set(tagged.flatMap(({ academicYear }) => (academicYear ? [academicYear] : [])))].sort((a, b) =>
    b.localeCompare(a),
  );
  const taggedGroups = years.map((year) => ({
    label: year,
    courses: tagged.filter((entry) => entry.academicYear === year).map((entry) => entry.course),
  }));
  const untagged = tagged.filter((entry) => entry.academicYear === undefined).map((entry) => entry.course);
  return untagged.length > 0 ? [...taggedGroups, { label: UNTAGGED_GROUP_LABEL, courses: untagged }] : taggedGroups;
};
