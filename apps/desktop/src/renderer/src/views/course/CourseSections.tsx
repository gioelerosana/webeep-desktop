import { EmptyState } from '@webeep/ui-kit';
import { FolderOpen, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RichLinkRenderer } from '../../components/rich-html/RichLink';
import { CourseSectionBlock } from './CourseSectionBlock';
import type { CourseSectionView, ModuleLocation } from './courseContent';
import { PageLink } from './PageLink';
import type { CourseFileActions } from './useCourseFileActions';

export type CourseSectionsProps = {
  readonly views: readonly CourseSectionView[];
  /** Filtro scritto dall'utente, così lo stato vuoto può nominarlo. */
  readonly query: string;
  /** Tutti i moduli del corso: servono a risolvere i link interni dell'HTML. */
  readonly locations: readonly ModuleLocation[];
  readonly fileActions: CourseFileActions;
  /** Apre una pagina del corso nell'app. */
  readonly onOpenPage: (moduleId: number) => void;
};

/** Elenco delle sezioni, o lo stato vuoto: corso senza materiali oppure filtro senza risultati. */
export const CourseSections = ({ views, query, locations, fileActions, onOpenPage }: CourseSectionsProps): ReactNode => {
  if (views.length === 0) {
    const trimmed = query.trim();
    return trimmed === '' ? (
      <EmptyState icon={<FolderOpen />} title="Questo corso non ha ancora materiali" />
    ) : (
      <EmptyState icon={<SearchX />} title={`Nessun materiale corrisponde a «${trimmed}»`} />
    );
  }

  // Il link dipende dalla sezione: un file scaricato va nella cartella della sezione in cui sta il link.
  const linkRendererFor =
    (sectionName: string): RichLinkRenderer =>
    (href, children) => (
      <PageLink
        href={href}
        locations={locations}
        currentSectionName={sectionName}
        fileActions={fileActions}
        onOpenPage={onOpenPage}
      >
        {children}
      </PageLink>
    );

  return (
    <div className="flex flex-col gap-4">
      {views.map((view) => (
        <CourseSectionBlock
          key={view.id}
          view={view}
          fileActions={fileActions}
          onOpenPage={onOpenPage}
          renderLink={linkRendererFor(view.name)}
        />
      ))}
    </div>
  );
};
