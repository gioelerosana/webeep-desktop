import type { Course } from '@webeep/moodle-api';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { parseCourseName } from '../../lib/format';
import { useNavigation } from '../../lib/navigation';

export type FavouriteCourseRowProps = {
  readonly course: Course;
};

/** Un corso preferito nella Home: tutta la riga apre la pagina del corso nell'app. */
export const FavouriteCourseRow = ({ course }: FavouriteCourseRowProps): ReactNode => {
  const { navigate } = useNavigation();
  const { title, teacher } = parseCourseName(course.fullname);
  return (
    <li>
      <button
        type="button"
        title={course.fullname}
        onClick={() => navigate({ name: 'course', courseId: course.id })}
        className="flex w-full min-w-0 items-center gap-3 rounded-control px-2 py-2 text-left outline-none hover:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
      >
        <Star aria-hidden className="size-4 shrink-0 fill-current text-warning-foreground" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm">{title}</span>
          {teacher ? <span className="truncate text-2xs text-muted-foreground">{teacher}</span> : null}
        </span>
      </button>
    </li>
  );
};
