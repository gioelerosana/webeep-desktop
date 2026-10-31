import { Card, CardHeader, EmptyState } from '@webeep/ui-kit';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { COURSE_GRID_CLASSES } from './courseGridClasses';
import { FavouriteCourseCard } from './FavouriteCourseCard';
import { FavouriteCoursesSkeleton } from './FavouriteCoursesSkeleton';
import { ListErrorState } from './ListErrorState';
import { useFavouriteCourses } from './useFavouriteCourses';

/** Sezione in fondo alla Home con i corsi preferiti come card con il banner; gli stati seguono quelli delle altre card. */
export const FavouriteCourses = (): ReactNode => {
  const { query, courses } = useFavouriteCourses();
  return (
    <Card>
      <CardHeader title="Corsi preferiti" />
      {query.isPending ? <FavouriteCoursesSkeleton /> : null}
      {query.isError ? (
        <ListErrorState title="Impossibile caricare i corsi preferiti" onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess && courses.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<Star />}
          title="Nessun corso preferito"
          description="Segnali come preferiti su WeBeep."
        />
      ) : null}
      {query.isSuccess && courses.length > 0 ? (
        <ul className={COURSE_GRID_CLASSES}>
          {courses.map((course) => (
            <FavouriteCourseCard key={course.id} course={course} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
};
