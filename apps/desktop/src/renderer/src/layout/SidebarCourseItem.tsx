import type { Course } from '@webeep/moodle-api';
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
    active={active}
    onSelect={() => onSelect(course.id)}
  />
);
