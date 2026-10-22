import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { RichHtml } from '../../components/rich-html/RichHtml';
import type { RichLinkRenderer } from '../../components/rich-html/RichLink';
import { type CourseRow, fileMeta } from './courseContent';
import { FileRow } from './FileRow';
import { FolderRow } from './FolderRow';
import { LinkModuleRow } from './LinkModuleRow';
import { PageModuleRow } from './PageModuleRow';
import type { CourseFileActions } from './useCourseFileActions';

const LABEL_ROW_CLASS = 'py-2.5 pl-4 pr-4 text-muted-foreground';

export type ModuleRowProps = {
  readonly row: CourseRow;
  readonly sectionName: string;
  readonly fileActions: CourseFileActions;
  readonly onOpenPage: (moduleId: number) => void;
  readonly renderLink: RichLinkRenderer;
};

/** Una riga di modulo: il componente dipende dal tipo già classificato in `courseContent.ts`. */
export const ModuleRow = ({ row, sectionName, fileActions, onOpenPage, renderLink }: ModuleRowProps): ReactNode => {
  if (row.kind === 'label') {
    return (
      <div className={LABEL_ROW_CLASS}>
        <RichHtml nodes={row.nodes} renderLink={renderLink} className="text-muted-foreground" />
      </div>
    );
  }
  if (row.kind === 'page') return <PageModuleRow module={row.module} fileActions={fileActions} onOpenPage={onOpenPage} />;
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
