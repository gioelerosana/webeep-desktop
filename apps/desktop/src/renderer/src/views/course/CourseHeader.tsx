import type { Course } from '@webeep/moodle-api';
import { Button } from '@webeep/ui-kit';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { FavouriteToggle } from '../../components/favourite/FavouriteToggle';
import { PageHeader } from '../../layout/Page';
import { parseCourseName } from '../../lib/format';
import { courseSubtitle } from './courseContent';
import { FileStatus } from './FileStatus';
import type { CourseFileActions } from './useCourseFileActions';

export type CourseHeaderProps = {
  /** Assente finché l'elenco dei corsi non è arrivato o se il corso non è nell'elenco. */
  readonly course: Course | undefined;
  readonly courseId: number;
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
  readonly fileActions: CourseFileActions;
};

export const CourseHeader = ({ course, courseId, isRefreshing, onRefresh, fileActions }: CourseHeaderProps): ReactNode => {
  const viewUrl = course?.viewurl;
  const title = course ? parseCourseName(course.fullname).title : `Corso ${courseId}`;
  const description = course ? courseSubtitle(course) : undefined;

  return (
    <PageHeader
      title={title}
      description={description}
      actions={
        <>
          {course ? <FavouriteToggle courseId={course.id} isFavourite={course.isfavourite} /> : null}
          {viewUrl ? <FileStatus state={fileActions.stateOf(viewUrl)} /> : null}
          <Button
            variant="outline"
            icon={<ExternalLink />}
            disabled={viewUrl === undefined}
            onClick={() => {
              if (viewUrl !== undefined) fileActions.openLink(viewUrl);
            }}
          >
            Apri su WeBeep
          </Button>
          <Button variant="ghost" size="icon" aria-label="Aggiorna" title="Aggiorna" icon={<RefreshCw />} loading={isRefreshing} onClick={onRefresh} />
        </>
      }
    />
  );
};
