import type { ReactNode } from 'react';
import type { CourseSearchHit } from '../../lib/queries';
import { CourseSearchRow } from './CourseSearchRow';
import { useExpandedCourse } from './useExpandedCourse';

export type CourseSearchListProps = {
  readonly courses: readonly CourseSearchHit[];
  readonly onOpenCourse: (courseId: number) => void;
};

/** Elenco dei corsi caricati; il dettaglio espanso è gestito qui, una riga alla volta. */
export const CourseSearchList = ({ courses, onOpenCourse }: CourseSearchListProps): ReactNode => {
  const { expandedCourseId, toggleCourse } = useExpandedCourse();

  return (
    <ul className="divide-y">
      {courses.map((course) => (
        <CourseSearchRow
          key={course.id}
          course={course}
          expanded={course.id === expandedCourseId}
          onOpenCourse={onOpenCourse}
          onToggleCourse={toggleCourse}
        />
      ))}
    </ul>
  );
};
