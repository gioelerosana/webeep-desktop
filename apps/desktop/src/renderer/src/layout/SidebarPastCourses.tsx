import { Button, Skeleton, cn } from '@webeep/ui-kit';
import { ChevronRight } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { SidebarCourseGroup } from './SidebarCourseGroup';
import { useSidebarPastCourses } from './useSidebarPastCourses';

/** Righe segnaposto mentre i corsi passati si caricano, più discrete di quelle in corso. */
const LOADING_ROW_COUNT = 3;

export type SidebarPastCoursesProps = {
  readonly query: string;
  readonly activeCourseId: number | undefined;
  readonly onSelect: (courseId: number) => void;
};

/**
 * Sezione "anni precedenti" della sidebar: chiusa di default, con il conteggio.
 * Se non ci sono corsi passati (o nessuno corrisponde alla ricerca) la sezione sparisce.
 */
export const SidebarPastCourses = ({ query, activeCourseId, onSelect }: SidebarPastCoursesProps): ReactNode => {
  const panelId = useId();
  const { status, groups, count, isOpen, toggleOpen, retry } = useSidebarPastCourses(query);
  if (status === 'ready' && count === 0) return null;
  const showGroupHeadings = groups.length > 1;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggleOpen}
        className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-control px-2 text-left text-2xs text-muted-foreground outline-none transition-[background-color,scale] duration-150 hover:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] active:scale-[0.97]"
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 transition-transform duration-150 motion-reduce:transition-none', isOpen && 'rotate-90')}
        />
        <span className="flex-1">Anni precedenti</span>
        {status === 'ready' && <span className="font-mono tabular-nums">{count}</span>}
      </button>
      <div id={panelId} className="flex flex-col gap-1">
        {status === 'error' && (
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <p className="text-2xs text-muted-foreground">Impossibile caricare i corsi passati</p>
            <Button variant="ghost" size="xs" onClick={retry}>
              Riprova
            </Button>
          </div>
        )}
        {isOpen && status === 'loading' && (
          <div role="status" aria-label="Caricamento corsi passati" className="flex flex-col gap-0.5">
            {Array.from({ length: LOADING_ROW_COUNT }, (_, index) => (
              <Skeleton key={index} className="h-6 w-full rounded-control" />
            ))}
          </div>
        )}
        {isOpen &&
          status === 'ready' &&
          groups.map((group) => (
            <SidebarCourseGroup
              key={group.label}
              group={group}
              showHeading={showGroupHeadings}
              activeCourseId={activeCourseId}
              onSelect={onSelect}
            />
          ))}
      </div>
    </div>
  );
};
