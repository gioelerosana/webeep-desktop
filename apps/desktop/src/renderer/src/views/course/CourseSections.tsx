import { EmptyState } from '@webeep/ui-kit';
import { FolderOpen, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { CourseSectionBlock } from './CourseSectionBlock';
import type { CourseSectionView } from './courseContent';
import type { CourseFileActions } from './useCourseFileActions';

export type CourseSectionsProps = {
  readonly views: readonly CourseSectionView[];
  /** Filtro scritto dall'utente, così lo stato vuoto può nominarlo. */
  readonly query: string;
  readonly fileActions: CourseFileActions;
  /** Apre una pagina del corso nell'app. */
  readonly onOpenPage: (moduleId: number) => void;
};

/** Elenco delle sezioni, o lo stato vuoto: corso senza materiali oppure filtro senza risultati. */
export const CourseSections = ({ views, query, fileActions, onOpenPage }: CourseSectionsProps): ReactNode => {
  if (views.length === 0) {
    const trimmed = query.trim();
    return trimmed === '' ? (
      <EmptyState icon={<FolderOpen />} title="Questo corso non ha ancora materiali" />
    ) : (
      <EmptyState icon={<SearchX />} title={`Nessun materiale corrisponde a «${trimmed}»`} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {views.map((view) => (
        <CourseSectionBlock key={view.id} view={view} fileActions={fileActions} onOpenPage={onOpenPage} />
      ))}
    </div>
  );
};
