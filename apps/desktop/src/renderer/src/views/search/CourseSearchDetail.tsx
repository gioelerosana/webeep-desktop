import { Button } from '@webeep/ui-kit';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { htmlToText } from '../../lib/format';
import type { CourseSearchHit } from '../../lib/queries';
import { courseRowLabelsOf, teachersLabelOf } from './courseLabels';
import { enrollmentLabelsOf } from './enrollmentLabels';
import { useCourseViewUrl } from './useCourseViewUrl';
import { useOpenCourseInBrowser } from './useOpenCourseInBrowser';

const NO_SUMMARY_TEXT = 'Nessun sommario';
const NO_TEACHERS_TEXT = 'Non indicati';
const NO_ENROLLMENT_TEXT = 'Nessun metodo di iscrizione noto';
const OPEN_ERROR_TEXT = 'Impossibile aprire la pagina nel browser';

export type CourseSearchDetailProps = {
  /** Corso non iscritto: il dettaglio mostra solo ciò che WeBeep rende pubblico. */
  readonly course: CourseSearchHit;
};

/*
 * Dettaglio di un corso non iscritto. Il sommario è HTML di Moodle: si mostra
 * come testo (`htmlToText`), mai iniettato. L'app non si iscrive da sola: il
 * pulsante apre la pagina del corso nel browser.
 */
export const CourseSearchDetail = ({ course }: CourseSearchDetailProps): ReactNode => {
  const courseUrl = useCourseViewUrl(course.id);
  const openCourse = useOpenCourseInBrowser(courseUrl);
  const summary = htmlToText(course.summary);
  const teachers = teachersLabelOf(course);
  const enrollment = enrollmentLabelsOf(course.enrollmentmethods).join(', ');

  return (
    <div className="flex flex-col gap-3 pb-4 pl-[3.25rem] pr-4 text-sm">
      <p className="line-clamp-6 text-muted-foreground">{summary || NO_SUMMARY_TEXT}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Docenti</dt>
        <dd>{teachers || NO_TEACHERS_TEXT}</dd>
        <dt className="text-muted-foreground">Iscrizione</dt>
        <dd>{enrollment || NO_ENROLLMENT_TEXT}</dd>
      </dl>
      <div className="flex flex-col items-start gap-2">
        <Button
          variant="outline"
          size="sm"
          icon={<ExternalLink />}
          disabled={courseUrl === undefined}
          onClick={openCourse.openInBrowser}
        >
          Apri nel browser
        </Button>
        {openCourse.isError ? (
          <p role="alert" className="text-xs text-error-foreground">
            {OPEN_ERROR_TEXT}
          </p>
        ) : null}
      </div>
    </div>
  );
};
