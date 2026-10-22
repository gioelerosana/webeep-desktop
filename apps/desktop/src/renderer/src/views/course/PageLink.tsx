import { Button } from '@webeep/ui-kit';
import { Download } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ModuleLocation } from './courseContent';
import { FileStatus } from './FileStatus';
import { resolvePageLink } from './pageLinks';
import type { CourseFileActions } from './useCourseFileActions';

const LINK_CLASS = 'rounded-sm text-primary underline underline-offset-2 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring';

export type PageLinkProps = {
  readonly href: string;
  readonly children: ReactNode;
  readonly locations: readonly ModuleLocation[];
  readonly currentSectionName: string;
  readonly fileActions: CourseFileActions;
  readonly onOpenPage: (moduleId: number) => void;
};

/** Link di una pagina: un bottone (mai `<a href>`) che apre il file, la pagina nell'app o il browser. */
export const PageLink = ({ href, children, locations, currentSectionName, fileActions, onOpenPage }: PageLinkProps): ReactNode => {
  const target = resolvePageLink(href, locations, currentSectionName);

  const open = (): void => {
    if (target.kind === 'page') onOpenPage(target.moduleId);
    else if (target.kind === 'file') fileActions.open(target.file, target.sectionName);
    else fileActions.openLink(target.url);
  };

  // Lo stato (es. errore) si legge con la chiave del file o dell'URL aperto.
  const stateKey = target.kind === 'page' ? undefined : target.kind === 'file' ? target.file.fileurl : target.url;
  const state = stateKey === undefined ? undefined : fileActions.stateOf(stateKey);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={open} className={LINK_CLASS}>
        {children}
      </button>
      {target.kind === 'file' ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Scarica ${target.file.filename}`}
          title="Scarica"
          icon={<Download />}
          onClick={() => fileActions.download(target.file, target.sectionName)}
        />
      ) : null}
      <FileStatus state={state} />
    </span>
  );
};
