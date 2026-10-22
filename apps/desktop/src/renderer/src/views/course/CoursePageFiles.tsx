import { Card } from '@webeep/ui-kit';
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CoursePageFile } from '../../../../shared/ipc';
import { fileMeta } from './courseContent';
import { FileRow } from './FileRow';
import type { CourseFileActions } from './useCourseFileActions';

export type CoursePageFilesProps = {
  readonly files: readonly CoursePageFile[];
  readonly sectionName: string;
  readonly fileActions: CourseFileActions;
};

/** Allegati della pagina, in fondo: stesse righe e stesse azioni "Apri" e "Scarica" dei file del corso. */
export const CoursePageFiles = ({ files, sectionName, fileActions }: CoursePageFilesProps): ReactNode => (
  <section className="flex flex-col gap-2">
    <h2 className="text-sm font-medium">File della pagina</h2>
    <Card className="overflow-hidden">
      <div className="divide-y">
        {files.map((file) => (
          <FileRow
            key={file.fileurl}
            icon={FileText}
            name={file.filename}
            meta={fileMeta(file)}
            file={file}
            sectionName={sectionName}
            fileActions={fileActions}
          />
        ))}
      </div>
    </Card>
  </section>
);
