/*
 * Pagina di un corso: intestazione, filtro, sezioni richiudibili con moduli e file.
 * Una pagina (`mod_page`) si apre al suo posto, nella stessa vista: lo stato è qui,
 * così il filtro resta com'è quando si torna all'elenco.
 * I dati arrivano solo dagli hook di lib/queries; filtro e righe in courseContent.ts.
 * `moduleId` arriva da una notifica: la pagina del corso resta la stessa rotta, cambia
 * solo cosa si apre o cosa si mette in evidenza.
 */
import type { CourseSection } from '@webeep/moodle-api';
import { Button, Input } from '@webeep/ui-kit';
import { Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { QueryErrorState } from '../../components/QueryErrorState';
import { Page } from '../../layout/Page';
import { parseCourseName } from '../../lib/format';
import { useCourseContents, useCourses } from '../../lib/queries';
import { buildModuleLocations, buildSectionViews } from './courseContent';
import { CourseHeader } from './CourseHeader';
import { CoursePageView } from './CoursePageView';
import { CourseSections } from './CourseSections';
import { CourseSkeleton } from './CourseSkeleton';
import { useCourseFileActions } from './useCourseFileActions';
import { useModuleJump } from './useModuleJump';

export type CourseViewProps = {
  readonly courseId: number;
  /** Modulo indicato da una notifica: se c'è, l'app apre la pagina o mostra il modulo. */
  readonly moduleId?: number;
};

const NO_SECTIONS: readonly CourseSection[] = [];

export const CourseView = ({ courseId, moduleId }: CourseViewProps): ReactNode => {
  // Tutti i corsi, non solo quelli in corso: si può aprire anche un corso concluso.
  const courses = useCourses('all');
  const contents = useCourseContents(courseId);
  const course = courses.data?.find((candidate) => candidate.id === courseId);
  const courseName = course ? parseCourseName(course.fullname).title : `corso ${courseId}`;
  const fileActions = useCourseFileActions(courseName);

  const [query, setQuery] = useState('');
  const [openPageId, setOpenPageId] = useState<number | null>(null);
  const sections = contents.data ?? NO_SECTIONS;
  const views = useMemo(() => buildSectionViews(sections, query), [sections, query]);
  const locations = useMemo(() => buildModuleLocations(sections), [sections]);
  const jump = useModuleJump(sections, moduleId, setOpenPageId);

  const refresh = (): void => {
    void contents.refetch();
  };

  if (openPageId !== null) {
    return (
      <CoursePageView
        key={openPageId}
        courseId={courseId}
        courseName={courseName}
        moduleId={openPageId}
        locations={locations}
        fileActions={fileActions}
        onOpenPage={setOpenPageId}
        onBack={() => setOpenPageId(null)}
      />
    );
  }

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
        <QueryErrorState
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
      {contents.isSuccess ? (
        <CourseSections
          views={views}
          query={query}
          locations={locations}
          fileActions={fileActions}
          onOpenPage={setOpenPageId}
          defaultExpandedSectionId={jump.defaultExpandedSectionId}
          highlightedModuleId={jump.highlightedModuleId}
          highlightedRowRef={jump.highlightedRowRef}
        />
      ) : null}
    </Page>
  );
};
