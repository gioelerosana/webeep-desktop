import { Button, cn } from '@webeep/ui-kit';
import { Download, Eye, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CourseFile } from './courseContent';
import { FileStatus } from './FileStatus';
import type { CourseFileActions } from './useCourseFileActions';

const INDENTED_PADDING = 'pl-10';
const DEFAULT_PADDING = 'pl-4';

export type FileRowProps = {
  readonly icon: LucideIcon;
  readonly name: string;
  readonly meta: string;
  readonly file: CourseFile;
  readonly sectionName: string;
  readonly indent?: boolean;
  readonly fileActions: CourseFileActions;
};

/** Un file del corso: il nome apre il file; a destra stato e azioni "Apri" e "Scarica". */
export const FileRow = ({ icon: Icon, name, meta, file, sectionName, indent = false, fileActions }: FileRowProps): ReactNode => {
  const state = fileActions.stateOf(file.fileurl);
  const isRunning = state?.status === 'running';
  const isOpening = state?.status === 'running' && state.action === 'open';
  const isDownloading = state?.status === 'running' && state.action === 'download';

  return (
    <div className={cn('group flex items-center gap-3 py-2.5 pr-4 hover:bg-accent', indent ? INDENTED_PADDING : DEFAULT_PADDING)}>
      <button
        type="button"
        onClick={() => fileActions.open(file, sectionName)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
      >
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{name}</span>
          <span className="truncate text-2xs text-muted-foreground">{meta}</span>
        </span>
      </button>
      <FileStatus
        state={state}
        onReveal={state?.status === 'downloaded' ? () => fileActions.reveal(file.fileurl, state.path) : undefined}
      />
      <div
        className={cn(
          'flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100',
          state && 'opacity-100',
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Apri"
          title="Apri"
          icon={<Eye />}
          loading={isOpening}
          disabled={isRunning}
          onClick={() => fileActions.open(file, sectionName)}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Scarica"
          title="Scarica"
          icon={<Download />}
          loading={isDownloading}
          disabled={isRunning}
          onClick={() => fileActions.download(file, sectionName)}
        />
      </div>
    </div>
  );
};
