import { Badge, cn } from '@webeep/ui-kit';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { parseCourseName } from '../../lib/format';
import type { CourseSearchHit } from '../../lib/queries';
import { CourseSearchDetail } from './CourseSearchDetail';
import { CourseThumbnail } from './CourseThumbnail';

const META_SEPARATOR = ' · ';

export type CourseSearchRowProps = {
  readonly course: CourseSearchHit;
  readonly expanded: boolean;
  readonly onOpenCourse: (courseId: number) => void;
  readonly onToggleCourse: (courseId: number) => void;
};

/*
 * Un corso iscritto si apre nell'app; uno non iscritto si espande nel dettaglio.
 * Il dettaglio sta fuori dal bottone: un <button> non può contenerne un altro.
 */
export const CourseSearchRow = ({ course, expanded, onOpenCourse, onToggleCourse }: CourseSearchRowProps): ReactNode => {
  const title = parseCourseName(course.fullname).title;
  const teachers = course.contacts.map((contact) => contact.fullname).join(', ');
  const meta = [course.categoryname, teachers].filter(Boolean).join(META_SEPARATOR);

  const handleClick = (): void => {
    if (course.enrolled) onOpenCourse(course.id);
    else onToggleCourse(course.id);
  };

  return (
    <li>
      <button
        type="button"
        aria-expanded={course.enrolled ? undefined : expanded}
        onClick={handleClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
      >
        <CourseThumbnail imageUrl={course.courseimage} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            {course.enrolled ? <Badge size="sm" variant="success">Iscritto</Badge> : null}
          </div>
          {meta ? <p className="truncate text-2xs text-muted-foreground">{meta}</p> : null}
        </div>

        {course.enrolled ? null : (
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        )}
      </button>

      {course.enrolled || !expanded ? null : <CourseSearchDetail course={course} />}
    </li>
  );
};
