import { Button } from '@webeep/ui-kit';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { htmlToText } from '../../lib/format';
import { openExternal, type CourseSearchHit } from '../../lib/queries';
import { enrollmentLabelsOf } from './enrollmentLabels';
import { useCourseViewUrl } from './useCourseViewUrl';

const NO_SUMMARY_TEXT = 'Nessun sommario';
const NO_TEACHERS_TEXT = 'Non indicati';
const NO_ENROLLMENT_TEXT = 'Nessun metodo di iscrizione noto';

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
  const summary = htmlToText(course.summary);
  const teachers = course.contacts.map((contact) => contact.fullname).join(', ');
  const enrollment = enrollmentLabelsOf(course.enrollmentmethods).join(', ');

  const openInBrowser = (): void => {
    if (courseUrl) void openExternal(courseUrl);
  };

  return (
    <div className="flex flex-col gap-3 pb-4 pl-[3.25rem] pr-4 text-sm">
      <p className="line-clamp-6 text-muted-foreground">{summary || NO_SUMMARY_TEXT}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Docenti</dt>
        <dd>{teachers || NO_TEACHERS_TEXT}</dd>
        <dt className="text-muted-foreground">Iscrizione</dt>
        <dd>{enrollment || NO_ENROLLMENT_TEXT}</dd>
      </dl>
      <div>
        <Button variant="outline" size="sm" icon={<ExternalLink />} disabled={courseUrl === undefined} onClick={openInBrowser}>
          Apri nel browser
        </Button>
      </div>
    </div>
  );
};
