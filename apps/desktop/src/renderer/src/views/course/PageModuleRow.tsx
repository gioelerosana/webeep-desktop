import { Button } from '@webeep/ui-kit';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CourseModule } from '@webeep/moodle-api';
import { FileStatus } from './FileStatus';
import { moduleIcon } from './moduleIcon';
import { pageBrowserUrl } from './pageLinks';
import type { CourseFileActions } from './useCourseFileActions';

export type PageModuleRowProps = {
  readonly module: CourseModule;
  readonly fileActions: CourseFileActions;
  readonly onOpenPage: (moduleId: number) => void;
};

/** Pagina del corso: il nome apre la pagina nell'app; l'azione secondaria la apre nel browser. */
export const PageModuleRow = ({ module, fileActions, onOpenPage }: PageModuleRowProps): ReactNode => {
  const Icon = moduleIcon(module.modname);
  const browserUrl = pageBrowserUrl(module.id, module.url);

  return (
    <div className="group flex items-center gap-3 py-2.5 pl-4 pr-4 hover:bg-accent">
      <button
        type="button"
        onClick={() => onOpenPage(module.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0 flex-1 truncate text-sm">{module.name}</span>
      </button>
      <FileStatus state={fileActions.stateOf(browserUrl)} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Apri nel browser"
        title="Apri nel browser"
        icon={<ExternalLink />}
        className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => fileActions.openLink(browserUrl)}
      />
    </div>
  );
};
