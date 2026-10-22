import type { CourseModule } from '@webeep/moodle-api';
import { cn } from '@webeep/ui-kit';
import { ChevronDown, FileText } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { fileMeta, type CourseFile } from './courseContent';
import { FileRow } from './FileRow';
import { moduleIcon } from './moduleIcon';
import type { CourseFileActions } from './useCourseFileActions';

const ROW_CLASS = 'flex w-full items-center gap-3 py-2.5 pl-4 pr-4 text-left hover:bg-accent';

export type FolderRowProps = {
  readonly module: CourseModule;
  readonly files: readonly CourseFile[];
  readonly sectionName: string;
  readonly fileActions: CourseFileActions;
};

/** Cartella o risorsa con più file: si espande nei file, indentati sotto la riga del modulo. */
export const FolderRow = ({ module, files, sectionName, fileActions }: FolderRowProps): ReactNode => {
  const [expanded, setExpanded] = useState(false);
  const Icon = moduleIcon(module.modname);

  return (
    <div>
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)} className={ROW_CLASS}>
        {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0 flex-1 truncate text-sm">{module.name}</span>
        <span className="shrink-0 text-2xs text-muted-foreground">{files.length} file</span>
        <ChevronDown
          aria-hidden
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-sheet', expanded && 'rotate-180')}
        />
      </button>
      {expanded ? (
        <div className="divide-y">
          {files.map((file) => (
            <FileRow
              key={file.fileurl}
              icon={FileText}
              name={file.filename}
              meta={fileMeta(file)}
              file={file}
              sectionName={sectionName}
              indent
              fileActions={fileActions}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
