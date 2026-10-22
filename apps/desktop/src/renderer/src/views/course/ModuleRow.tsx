import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { type CourseRow, fileMeta } from './courseContent';
import { FileRow } from './FileRow';
import { FolderRow } from './FolderRow';
import { LinkModuleRow } from './LinkModuleRow';
import type { CourseFileActions } from './useCourseFileActions';

const TEXT_ROW_CLASS = 'py-2.5 pl-4 pr-4 text-sm text-muted-foreground';

export type ModuleRowProps = {
  readonly row: CourseRow;
  readonly sectionName: string;
  readonly fileActions: CourseFileActions;
};

/** Una riga di modulo: il componente dipende dal tipo già classificato in `courseContent.ts`. */
export const ModuleRow = ({ row, sectionName, fileActions }: ModuleRowProps): ReactNode => {
  if (row.kind === 'text') return <p className={TEXT_ROW_CLASS}>{row.text}</p>;
  if (row.kind === 'link') return <LinkModuleRow module={row.module} url={row.url} fileActions={fileActions} />;
  if (row.kind === 'file') {
    return (
      <FileRow
        icon={FileText}
        name={row.module.name}
        meta={fileMeta(row.file)}
        file={row.file}
        sectionName={sectionName}
        fileActions={fileActions}
      />
    );
  }
  return <FolderRow module={row.module} files={row.files} sectionName={sectionName} fileActions={fileActions} />;
};
