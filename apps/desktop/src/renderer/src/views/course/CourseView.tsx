/*
 * Pagina di un corso: intestazione, filtro, sezioni richiudibili con moduli e file.
 * I dati arrivano solo dagli hook di lib/queries; filtro e righe in courseContent.ts.
 */
import type { CourseSection } from '@webeep/moodle-api';
import { Button, Card, EmptyState, Input, Skeleton } from '@webeep/ui-kit';
import { CircleAlert, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Page } from '../../layout/Page';
import { parseCourseName } from '../../lib/format';
import { useCourseContents, useCourses } from '../../lib/queries';
import { buildSectionViews } from './courseContent';
import { CourseHeader } from './CourseHeader';
import { CourseSections } from './CourseSections';
import { useCourseFileActions } from './useCourseFileActions';

export type CourseViewProps = { readonly courseId: number };

const NO_SECTIONS: readonly CourseSection[] = [];
const SKELETON_CARD_COUNT = 3;
const SKELETON_CARD_KEYS = Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => index);

const CourseSkeleton = (): ReactNode => (
  <div aria-busy="true" className="flex flex-col gap-4">
    {SKELETON_CARD_KEYS.map((key) => (
      <Card key={key} className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </Card>
    ))}
  </div>
);

export const CourseView = ({ courseId }: CourseViewProps): ReactNode => {
  // Tutti i corsi, non solo quelli in corso: si può aprire anche un corso concluso.
  const courses = useCourses('all');
  const contents = useCourseContents(courseId);
  const course = courses.data?.find((candidate) => candidate.id === courseId);
  const courseName = course ? parseCourseName(course.fullname).title : `corso ${courseId}`;
  const fileActions = useCourseFileActions(courseName);

  const [query, setQuery] = useState('');
  const sections = contents.data ?? NO_SECTIONS;
  const views = useMemo(() => buildSectionViews(sections, query), [sections, query]);

  const refresh = (): void => {
    void contents.refetch();
  };

  return (
    <Page>
      <CourseHeader
        course={course}
        courseId={courseId}
        isRefreshing={contents.isFetching}
        onRefresh={refresh}
        fileActions={fileActions}
      />

      <Input
        type="search"
        leading={<Search />}
        placeholder="Filtra materiali"
        aria-label="Filtra materiali"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {contents.isPending ? <CourseSkeleton /> : null}
      {contents.isError ? (
        <EmptyState
          icon={<CircleAlert />}
          title="Impossibile caricare il corso"
          description={
            <>
              <span>Controlla la connessione e riprova.</span>
              {contents.error ? (
                <span className="mt-1 block break-words text-2xs text-muted-foreground">{contents.error.message}</span>
              ) : null}
            </>
          }
          action={
            <Button variant="outline" onClick={refresh}>
              Riprova
            </Button>
          }
        />
      ) : null}
      {contents.isSuccess ? <CourseSections views={views} query={query} fileActions={fileActions} /> : null}
    </Page>
  );
};
