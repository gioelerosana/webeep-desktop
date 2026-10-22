import type { CoursePage } from '../../../../shared/ipc';
import { Card, EmptyState } from '@webeep/ui-kit';
import { FileX } from 'lucide-react';
import type { ReactNode } from 'react';
import { RichHtml } from '../../components/rich-html/RichHtml';
import { hasRichContent } from '../../components/rich-html/parseRichHtml';
import type { RichLinkRenderer } from '../../components/rich-html/RichLink';
import { PageHeader } from '../../layout/Page';
import { formatDateTime } from '../../lib/format';
import { CoursePageFiles } from './CoursePageFiles';
import type { CourseFileActions } from './useCourseFileActions';
import { useParsedPage } from './useParsedPage';

export type CoursePageBodyProps = {
  readonly page: CoursePage;
  readonly sectionName: string;
  readonly fileActions: CourseFileActions;
  readonly renderLink: RichLinkRenderer;
};

/** Contenuto di una pagina caricata: titolo, data, introduzione, testo, allegati. */
export const CoursePageBody = ({ page, sectionName, fileActions, renderLink }: CoursePageBodyProps): ReactNode => {
  const parsed = useParsedPage(page);
  const hasIntro = hasRichContent(parsed.intro);
  const hasContent = hasRichContent(parsed.content);
  const isEmpty = !hasIntro && !hasContent && page.files.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={page.name} description={`aggiornata ${formatDateTime(page.timemodified)}`} />
      {isEmpty ? (
        <EmptyState icon={<FileX />} title="Questa pagina è vuota" />
      ) : (
        <>
          {hasIntro ? (
            <Card className="p-4">
              <RichHtml nodes={parsed.intro} renderLink={renderLink} />
            </Card>
          ) : null}
          {hasContent ? (
            <Card className="p-5">
              <RichHtml nodes={parsed.content} renderLink={renderLink} />
            </Card>
          ) : null}
          {page.files.length > 0 ? <CoursePageFiles files={page.files} sectionName={sectionName} fileActions={fileActions} /> : null}
        </>
      )}
    </div>
  );
};
