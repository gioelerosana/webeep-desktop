import type { Course } from '@webeep/moodle-api';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { parseCourseName } from '../lib/format';
import { SidebarItem } from './SidebarItem';

export type SidebarCourseItemProps = {
  readonly course: Course;
  readonly active: boolean;
  readonly onSelect: (courseId: number) => void;
};

/** Voce di un corso in corso: mostra il titolo leggibile, il nome completo resta nel tooltip. */
export const SidebarCourseItem = ({ course, active, onSelect }: SidebarCourseItemProps): ReactNode => (
  <SidebarItem
    label={parseCourseName(course.fullname).title}
    title={course.fullname}
    trailing={
      course.isfavourite ? (
        // Sola lettura: il preferito si imposta su WeBeep, non nell'app. Colore `warning` come le scadenze.
        <span role="img" aria-label="preferito" title="preferito" className="flex shrink-0 text-warning-foreground">
          <Star aria-hidden fill="currentColor" />
        </span>
      ) : null
    }
    active={active}
    onSelect={() => onSelect(course.id)}
  />
);
