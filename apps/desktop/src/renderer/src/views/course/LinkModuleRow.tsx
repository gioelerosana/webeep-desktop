import type { CourseModule } from '@webeep/moodle-api';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { FileStatus } from './FileStatus';
import { moduleIcon } from './moduleIcon';
import type { CourseFileActions } from './useCourseFileActions';

export type LinkModuleRowProps = {
  readonly module: CourseModule;
  readonly url: string | undefined;
  readonly fileActions: CourseFileActions;
};

/** Modulo che si apre sul sito (compiti, quiz, forum, link): click apre il browser. Senza URL resta una riga muta. */
export const LinkModuleRow = ({ module, url, fileActions }: LinkModuleRowProps): ReactNode => {
  const Icon = moduleIcon(module.modname);
  const content = (
    <>
      {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
      <span className="min-w-0 flex-1 truncate text-sm">{module.name}</span>
    </>
  );

  if (url === undefined) {
    return <div className="flex items-center gap-3 py-2.5 pl-4 pr-4">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => fileActions.openLink(url)}
      className="group flex w-full items-center gap-3 py-2.5 pl-4 pr-4 text-left hover:bg-accent"
    >
      {content}
      <FileStatus state={fileActions.stateOf(url)} />
      <ExternalLink aria-hidden className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </button>
  );
};
