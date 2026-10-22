/*
 * Vista di una pagina del corso (`mod_page`), dentro la vista corso: il pulsante
 * "Torna al corso" riporta all'elenco. Dati dall'hook di lib/queries; link in PageLink.
 */
import { Button, EmptyState } from '@webeep/ui-kit';
import { ArrowLeft, CircleAlert, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RichLinkRenderer } from '../../components/rich-html/RichLink';
import { Page } from '../../layout/Page';
import { useCoursePage } from '../../lib/queries';
import type { ModuleLocation } from './courseContent';
import { CoursePageBody } from './CoursePageBody';
import { CoursePageSkeleton } from './CoursePageSkeleton';
import { PageLink } from './PageLink';
import { findModuleLocation, pageBrowserUrl } from './pageLinks';
import type { CourseFileActions } from './useCourseFileActions';

export type CoursePageViewProps = {
  readonly courseId: number;
  readonly courseName: string;
  readonly moduleId: number;
  readonly locations: readonly ModuleLocation[];
  readonly fileActions: CourseFileActions;
  readonly onOpenPage: (moduleId: number) => void;
  readonly onBack: () => void;
};

export const CoursePageView = ({
  courseId,
  courseName,
  moduleId,
  locations,
  fileActions,
  onOpenPage,
  onBack,
}: CoursePageViewProps): ReactNode => {
  const page = useCoursePage(courseId, moduleId);
  const location = findModuleLocation(locations, moduleId);
  const sectionName = location?.sectionName ?? courseName;
  const browserUrl = pageBrowserUrl(moduleId, location?.module.url);

  const renderLink: RichLinkRenderer = (href, children) => (
    <PageLink href={href} locations={locations} currentSectionName={sectionName} fileActions={fileActions} onOpenPage={onOpenPage}>
      {children}
    </PageLink>
  );

  return (
    <Page>
      <div>
        <Button variant="ghost" icon={<ArrowLeft />} onClick={onBack}>
          Torna al corso
        </Button>
      </div>

      {page.isPending ? <CoursePageSkeleton /> : null}
      {page.isError ? (
        <EmptyState
          icon={<CircleAlert />}
          title="Impossibile aprire la pagina"
          description={<span className="break-words">{page.error.message}</span>}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void page.refetch()}>
                Riprova
              </Button>
              <Button variant="ghost" icon={<ExternalLink />} onClick={() => fileActions.openLink(browserUrl)}>
                Apri nel browser
              </Button>
            </div>
          }
        />
      ) : null}
      {page.isSuccess ? (
        <CoursePageBody page={page.data} sectionName={sectionName} fileActions={fileActions} renderLink={renderLink} />
      ) : null}
    </Page>
  );
};
