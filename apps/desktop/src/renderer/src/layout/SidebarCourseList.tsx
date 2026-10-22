import { Button, Skeleton } from '@webeep/ui-kit';
import type { Course } from '@webeep/moodle-api';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SidebarCourseItem } from './SidebarCourseItem';

/** Righe segnaposto mentre i corsi si caricano. */
const LOADING_ROW_COUNT = 5;

export type SidebarCourseListProps = {
  readonly result: UseQueryResult<readonly Course[]>;
  readonly visibleCourses: readonly Course[];
  readonly isSearching: boolean;
  readonly activeCourseId: number | undefined;
  readonly onSelect: (courseId: number) => void;
};

export const SidebarCourseList = ({
  result,
  visibleCourses,
  isSearching,
  activeCourseId,
  onSelect,
}: SidebarCourseListProps): ReactNode => {
  if (result.data === undefined) {
    if (!result.isError) {
      return (
        <div role="status" aria-label="Caricamento corsi" className="flex flex-col gap-0.5">
          {Array.from({ length: LOADING_ROW_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-control" />
          ))}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <p className="text-2xs text-muted-foreground">Impossibile caricare i corsi.</p>
        <Button variant="ghost" size="xs" onClick={() => void result.refetch()}>
          Riprova
        </Button>
      </div>
    );
  }
  if (visibleCourses.length === 0) {
    return (
      <p className="px-2 py-1 text-2xs text-muted-foreground">
        {isSearching ? 'Nessun corso corrisponde alla ricerca.' : 'Nessun corso in corso'}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {visibleCourses.map((course) => (
        <li key={course.id}>
          <SidebarCourseItem course={course} active={course.id === activeCourseId} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
};
