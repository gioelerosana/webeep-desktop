import { Badge, cn } from '@webeep/ui-kit';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CourseSearchHit } from '../../lib/queries';
import { CourseSearchDetail } from './CourseSearchDetail';
import { CourseThumbnail } from './CourseThumbnail';
import { courseRowLabelsOf } from './courseLabels';

export type CourseSearchRowProps = {
  readonly course: CourseSearchHit;
  readonly expanded: boolean;
  readonly onOpenCourse: (courseId: number) => void;
  readonly onToggleCourse: (courseId: number) => void;
};

/*
 * Un corso iscritto si apre nell'app; uno non iscritto si espande nel dettaglio.
 * Finché lo stato di iscrizione è `unknown` la riga è disabilitata: non si sa
 * ancora quale delle due azioni sia quella giusta.
 * Il dettaglio sta fuori dal bottone: un <button> non può contenerne un altro.
 */
export const CourseSearchRow = ({ course, expanded, onOpenCourse, onToggleCourse }: CourseSearchRowProps): ReactNode => {
  const { title, meta } = courseRowLabelsOf(course);
  const isEnrolled = course.enrollment === 'enrolled';
  const isExpandable = course.enrollment === 'not-enrolled';
  const isPending = course.enrollment === 'unknown';

  const handleClick = (): void => {
    if (isEnrolled) onOpenCourse(course.id);
    else if (isExpandable) onToggleCourse(course.id);
  };

  return (
    <li>
      <button
        type="button"
        disabled={isPending}
        aria-expanded={isExpandable ? expanded : undefined}
        onClick={handleClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] disabled:opacity-60"
      >
        <CourseThumbnail imageUrl={course.courseimage} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            {isEnrolled ? <Badge size="sm" variant="success">Iscritto</Badge> : null}
          </div>
          {meta ? <p className="truncate text-2xs text-muted-foreground">{meta}</p> : null}
        </div>

        {isExpandable ? (
          <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        ) : null}
      </button>

      {isExpandable && expanded ? <CourseSearchDetail course={course} /> : null}
    </li>
  );
};
