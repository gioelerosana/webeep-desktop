import { Card, cn } from '@webeep/ui-kit';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { CourseSectionView } from './courseContent';
import { ModuleRow } from './ModuleRow';
import type { CourseFileActions } from './useCourseFileActions';

export type CourseSectionBlockProps = {
  readonly view: CourseSectionView;
  readonly fileActions: CourseFileActions;
  readonly onOpenPage: (moduleId: number) => void;
};

/** Sezione del corso: un blocco richiudibile, aperto di default. */
export const CourseSectionBlock = ({ view, fileActions, onOpenPage }: CourseSectionBlockProps): ReactNode => {
  const [expanded, setExpanded] = useState(true);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent"
      >
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-sheet', !expanded && '-rotate-90')}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{view.name}</span>
        {view.fileCount > 0 ? <span className="shrink-0 text-2xs text-muted-foreground">{view.fileCount} file</span> : null}
      </button>
      {expanded ? (
        <div className="flex flex-col border-t">
          {view.summary !== '' ? <p className="px-4 py-3 text-sm text-muted-foreground">{view.summary}</p> : null}
          <div className="divide-y border-t">
            {view.rows.map((row, index) => (
              <ModuleRow key={index} row={row} sectionName={view.name} fileActions={fileActions} onOpenPage={onOpenPage} />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
};
