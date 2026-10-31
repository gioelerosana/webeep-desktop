import type { Course } from '@webeep/moodle-api';
import type { ReactNode } from 'react';
import { FavouriteToggle } from '../../components/favourite/FavouriteToggle';
import { parseCourseName } from '../../lib/format';
import { useNavigation } from '../../lib/navigation';

export type FavouriteCourseRowProps = {
  readonly course: Course;
};

/*
 * Un corso preferito nella Home: il titolo apre la pagina del corso nell'app, la stella lo toglie
 * dai preferiti. Sono due pulsanti fratelli (un bottone non può contenerne un altro).
 */
export const FavouriteCourseRow = ({ course }: FavouriteCourseRowProps): ReactNode => {
  const { navigate } = useNavigation();
  const { title, teacher } = parseCourseName(course.fullname);
  return (
    <li className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        title={course.fullname}
        onClick={() => navigate({ name: 'course', courseId: course.id })}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-control px-2 py-2 text-left outline-none hover:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
      >
        <span className="truncate text-sm">{title}</span>
        {teacher ? <span className="truncate text-2xs text-muted-foreground">{teacher}</span> : null}
      </button>
      <FavouriteToggle courseId={course.id} isFavourite={course.isfavourite} size="icon-sm" />
    </li>
  );
};
