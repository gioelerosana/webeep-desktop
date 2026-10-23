import { Button, Card, CardHeader, EmptyState } from '@webeep/ui-kit';
import { CircleAlert, Search, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { COURSE_SEARCH_MIN_QUERY_LENGTH } from '../../../../shared/ipc';
import type { CourseSearchView } from './useCourseSearchView';
import { CourseSearchList } from './CourseSearchList';
import { SearchLoadMore } from './SearchLoadMore';
import { SearchSkeleton } from './SearchSkeleton';

const LOCALE = 'it-IT';

const describeTotal = (total: number): string => (total === 1 ? '1 corso trovato' : `${total.toLocaleString(LOCALE)} corsi trovati`);

const IDLE_TITLE = `Scrivi almeno ${COURSE_SEARCH_MIN_QUERY_LENGTH} caratteri`;

export type SearchBodyProps = {
  readonly search: CourseSearchView;
  readonly onOpenCourse: (courseId: number) => void;
};

/* Una fase alla volta: ogni stato (inizio, caricamento, errore, vuoto, risultati) ha il suo rendering. */
export const SearchBody = ({ search, onOpenCourse }: SearchBodyProps): ReactNode => {
  if (search.phase === 'idle') {
    return (
      <EmptyState
        className="py-12"
        icon={<Search />}
        title={IDLE_TITLE}
        description="Per cercare tra tutti i corsi di WeBeep, anche quelli a cui non sei iscritto"
      />
    );
  }

  if (search.phase === 'loading') {
    return (
      <Card>
        <SearchSkeleton />
      </Card>
    );
  }

  if (search.phase === 'error') {
    return (
      <Card>
        <EmptyState
          className="py-10"
          icon={<CircleAlert />}
          title="Impossibile cercare tra i corsi"
          action={
            <Button variant="outline" size="sm" onClick={search.retry}>
              Riprova
            </Button>
          }
        />
      </Card>
    );
  }

  if (search.phase === 'empty') {
    return (
      <Card>
        <EmptyState
          className="py-10"
          icon={<SearchX />}
          title="Nessun corso trovato"
          description="Prova con un altro nome, il cognome di un docente o la sigla del corso"
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={describeTotal(search.total)} />
      <CourseSearchList courses={search.courses} onOpenCourse={onOpenCourse} />
      {search.hasNextPage ? (
        <SearchLoadMore
          loadedCount={search.courses.length}
          total={search.total}
          isFetching={search.isFetchingNextPage}
          isError={search.isNextPageError}
          onLoadMore={search.loadMore}
        />
      ) : null}
    </Card>
  );
};
