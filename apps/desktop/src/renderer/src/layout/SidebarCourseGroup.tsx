import type { Course } from '@webeep/moodle-api';
import type { ReactNode } from 'react';
import type { CourseGroup } from './academicYears';
import { SidebarCourseItem } from './SidebarCourseItem';

export type SidebarCourseGroupProps = {
  readonly group: CourseGroup;
  /** Intestazione con l'anno accademico: si mostra solo se ci sono più gruppi. */
  readonly showHeading: boolean;
  readonly activeCourseId: number | undefined;
  readonly onSelect: (courseId: number) => void;
};

/** Gruppo di corsi passati: intestazione facoltativa e stesse righe dei corsi in corso. */
export const SidebarCourseGroup = ({ group, showHeading, activeCourseId, onSelect }: SidebarCourseGroupProps): ReactNode => (
  <div className="flex flex-col gap-0.5">
    {showHeading && <h3 className="px-2 pb-0.5 pt-2 font-mono text-3xs text-muted-foreground tabular-nums">{group.label}</h3>}
    <ul className="flex flex-col gap-0.5">
      {group.courses.map((course: Course) => (
        <li key={course.id}>
          <SidebarCourseItem course={course} active={course.id === activeCourseId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  </div>
);
