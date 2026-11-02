/*
 * Pagina di un corso: intestazione, filtro, sezioni richiudibili con moduli e file.
 * Una pagina (`mod_page`) si apre al suo posto, nella stessa vista: lo stato è qui,
 * così il filtro resta com'è quando si torna all'elenco.
 * I dati arrivano solo dagli hook di lib/queries; filtro e righe in courseContent.ts.
 * `moduleId` arriva da una notifica: la pagina del corso resta la stessa rotta, cambia
 * solo cosa si apre o cosa si mette in evidenza.
 */
import type { CourseSection } from '@webeep/moodle-api';
import { Button, Card, EmptyState, Input, Skeleton } from '@webeep/ui-kit';
import { CircleAlert, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Page } from '../../layout/Page';
import { parseCourseName } from '../../lib/format';
import { useCourseContents, useCourses } from '../../lib/queries';
import { buildModuleLocations, buildSectionViews, PAGE_MODNAME } from './courseContent';
import { CourseHeader } from './CourseHeader';
import { CourseSections } from './CourseSections';
import { CoursePageView } from './CoursePageView';
import { useCourseFileActions } from './useCourseFileActions';

export type CourseViewProps = {
  readonly courseId: number;
  /** Modulo indicato da una notifica: se c'è, l'app apre la pagina o mostra il modulo. */
  readonly moduleId?: number;
};

const NO_SECTIONS: readonly CourseSection[] = [];
const SKELETON_CARD_COUNT = 3;
const SKELETON_CARD_KEYS = Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => index);
/** Per quanto resta acceso l'anello sul modulo arrivato da una notifica. */
const HIGHLIGHT_DURATION_MS = 2400;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
/** Lo scroll porta la riga a metà dello spazio visibile, non al bordo. */
const SCROLL_BLOCK = 'center';

/** Dove porta il modulo di una notifica: nessuna parte, una pagina da aprire, un modulo da mostrare. */
type ModuleJump =
  | { readonly kind: 'none' }
  | { readonly kind: 'page'; readonly moduleId: number }
  | { readonly kind: 'module'; readonly moduleId: number; readonly sectionId: number };

const NO_JUMP: ModuleJump = { kind: 'none' };

const prefersReducedMotion = (): boolean => window.matchMedia(REDUCED_MOTION_QUERY).matches;

/**
 * Modulo indicato dalla notifica, cercato nei contenuti del corso: se il modulo
 * non c'è più (notifica vecchia) o è nascosto, la pagina corso si apre normale.
 */
const findModuleJump = (sections: readonly CourseSection[], moduleId: number | undefined): ModuleJump => {
  if (moduleId === undefined) return NO_JUMP;
  const section = sections.find(
    (candidate) => candidate.uservisible && candidate.modules.some((module) => module.id === moduleId),
  );
  const module = section?.modules.find((candidate) => candidate.id === moduleId);
  if (section === undefined || module === undefined || !module.uservisible) return NO_JUMP;
  if (module.modname === PAGE_MODNAME) return { kind: 'page', moduleId: module.id };
  return { kind: 'module', moduleId: module.id, sectionId: section.id };
};

type ModuleJumpState = {
  /** Sezione da aprire subito: quella che contiene il modulo della notifica. */
  readonly defaultExpandedSectionId: number | undefined;
  /** Modulo con l'anello acceso, per qualche istante. */
  readonly highlightedModuleId: number | undefined;
  /** Riga del modulo evidenziato: serve a portarla in vista. */
  readonly highlightedRowRef: RefObject<HTMLDivElement | null>;
};

/**
 * Reazione al modulo di una notifica. La pagina si apre una volta sola per
 * modulo: tornando indietro non si riapre. Per gli altri moduli si espande la
 * sezione (già in fase di render, così la riga esiste) e la si porta in vista.
 */
const useModuleJump = (
  sections: readonly CourseSection[],
  moduleId: number | undefined,
  onOpenPage: (moduleId: number) => void,
): ModuleJumpState => {
  const jump = useMemo(() => findModuleJump(sections, moduleId), [sections, moduleId]);
  const [highlightedModuleId, setHighlightedModuleId] = useState<number | undefined>(undefined);
  const highlightedRowRef = useRef<HTMLDivElement | null>(null);
  const settledModuleId = useRef<number | undefined>(undefined);

  useEffect(() => {
    // I contenuti arrivano dopo il primo render: finché non si conosce il modulo non si decide nulla.
    if (jump.kind === 'none' || settledModuleId.current === jump.moduleId) return;
    settledModuleId.current = jump.moduleId;
    if (jump.kind === 'page') {
      onOpenPage(jump.moduleId);
      return;
    }
    setHighlightedModuleId(jump.moduleId);
  }, [jump, onOpenPage]);

  useEffect(() => {
    if (highlightedModuleId === undefined) return;
    const row = highlightedRowRef.current;
    row?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: SCROLL_BLOCK });
    const timer = window.setTimeout(() => setHighlightedModuleId(undefined), HIGHLIGHT_DURATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightedModuleId]);

  return {
    defaultExpandedSectionId: jump.kind === 'module' ? jump.sectionId : undefined,
    highlightedModuleId,
    highlightedRowRef,
  };
};

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
