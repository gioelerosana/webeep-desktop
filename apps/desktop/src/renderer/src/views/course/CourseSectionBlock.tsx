import { Card, cn } from '@webeep/ui-kit';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode, type RefObject } from 'react';
import { hasRichContent } from '../../components/rich-html/parseRichHtml';
import type { RichLinkRenderer } from '../../components/rich-html/RichLink';
import type { CourseSectionView } from './courseContent';
import { ModuleRow } from './ModuleRow';
import { SectionSummary } from './SectionSummary';
import type { CourseFileActions } from './useCourseFileActions';

/** Anello e tinta del modulo arrivato da una notifica: solo token, uguali nei due temi. */
const HIGHLIGHTED_ROW_CLASS = 'rounded-lg bg-accent ring-2 ring-primary';

export type CourseSectionBlockProps = {
  readonly view: CourseSectionView;
  readonly fileActions: CourseFileActions;
  readonly onOpenPage: (moduleId: number) => void;
  /** Link di questa sezione: il sommario e le etichette li risolvono con la sezione in cui si trovano. */
  readonly renderLink: RichLinkRenderer;
  /** Aperta al primo render: poi comanda l'utente. Vero quando non arriva da una notifica. */
  readonly defaultExpanded?: boolean;
  /** Modulo da evidenziare, se una notifica puntava qui. */
  readonly highlightedModuleId?: number;
  /** Attacco della riga evidenziata, per portarla in vista. */
  readonly highlightedRowRef?: RefObject<HTMLDivElement | null>;
};

/** Sezione del corso: un blocco richiudibile, aperto di default. */
export const CourseSectionBlock = ({
  view,
  fileActions,
  onOpenPage,
  renderLink,
  defaultExpanded = true,
  highlightedModuleId,
  highlightedRowRef,
}: CourseSectionBlockProps): ReactNode => {
  const [expanded, setExpanded] = useState(defaultExpanded);

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
          {hasRichContent(view.summary) ? <SectionSummary nodes={view.summary} renderLink={renderLink} /> : null}
          <div className="divide-y border-t">
            {view.rows.map((row) => {
              // Ogni riga è un modulo: l'id è stabile e serve a chi arriva da una notifica.
              const highlighted = row.module.id === highlightedModuleId;
              return (
                <div
                  key={row.module.id}
                  ref={highlighted ? highlightedRowRef : undefined}
                  className={cn(highlighted && HIGHLIGHTED_ROW_CLASS)}
                >
                  <ModuleRow
                    row={row}
                    sectionName={view.name}
                    fileActions={fileActions}
                    onOpenPage={onOpenPage}
                    renderLink={renderLink}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
};
