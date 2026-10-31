import type { Course } from '@webeep/moodle-api';
import type { ReactNode } from 'react';
import { FavouriteToggle } from '../../components/favourite/FavouriteToggle';
import { useNavigation } from '../../lib/navigation';
import { CourseBanner } from './CourseBanner';
import { favouriteCourseLabelsOf } from './favouriteCourseLabels';

export type FavouriteCourseCardProps = {
  readonly course: Course;
};

/*
 * Card di un corso preferito: tutta la card apre il corso, tranne la stella che sta nell'angolo.
 * La stella è un fratello del bottone della card (un bottone non può contenerne un altro), quindi
 * il suo click non arriva alla card.
 */
export const FavouriteCourseCard = ({ course }: FavouriteCourseCardProps): ReactNode => {
  const { navigate } = useNavigation();
  const { title, meta } = favouriteCourseLabelsOf(course);
  return (
    <li className="relative min-w-0">
      <button
        type="button"
        title={course.fullname}
        onClick={() => navigate({ name: 'course', courseId: course.id })}
        className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left outline-none transition-colors hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <CourseBanner courseId={course.id} courseimage={course.courseimage} />
        <span className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
          <span className="line-clamp-2 text-sm leading-snug font-medium">{title}</span>
          {meta ? <span className="truncate text-2xs text-muted-foreground">{meta}</span> : null}
        </span>
      </button>
      <div className="absolute top-2 right-2 rounded-control border bg-background/90">
        <FavouriteToggle courseId={course.id} isFavourite={course.isfavourite} size="icon-sm" />
      </div>
    </li>
  );
};
