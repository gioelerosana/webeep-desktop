import { Card, CardHeader, EmptyState } from '@webeep/ui-kit';
import { Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { FavouriteCourseRow } from './FavouriteCourseRow';
import { ListErrorState } from './ListErrorState';
import { ListSkeleton } from './ListSkeleton';
import { useFavouriteCourses } from './useFavouriteCourses';

/** Sezione in fondo alla Home con i corsi preferiti; gli stati seguono quelli delle altre card. */
export const FavouriteCourses = (): ReactNode => {
  const { query, courses } = useFavouriteCourses();
  return (
    <Card>
      <CardHeader title="Corsi preferiti" />
      {query.isPending ? <ListSkeleton /> : null}
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
        <ul className="grid gap-0.5 p-2 sm:grid-cols-2">
          {courses.map((course) => (
            <FavouriteCourseRow key={course.id} course={course} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
};
