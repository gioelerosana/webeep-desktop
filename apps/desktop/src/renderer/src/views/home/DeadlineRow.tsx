import type { CalendarEvent } from '@webeep/moodle-api';
import { Badge, Button, cn } from '@webeep/ui-kit';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigation } from '../../lib/navigation';
import { formatRelative, formatTime, htmlToText, parseCourseName } from '../../lib/format';
import { openExternal } from '../../lib/queries';
import { deadlineUrgency, moduleIcon } from './deadlines';

export type DeadlineRowProps = {
  readonly event: CalendarEvent;
  readonly nowMs: number;
};

/*
 * La riga intera è un bottone "stirato" (`after:inset-0`) che apre l'attività su
 * WeBeep. Il titolo del corso e il bottone icona stanno sopra (`z-10`) perché
 * sono bottoni a sé: un <button> non può contenerne un altro.
 */
export const DeadlineRow = ({ event, nowMs }: DeadlineRowProps): ReactNode => {
  const { navigate } = useNavigation();
  const Icon = moduleIcon(event.modulename);
  const urgency = deadlineUrgency(event, nowMs);
  const url = event.url;
  const courseId = event.course?.id;
  const courseTitle = event.course ? parseCourseName(event.course.fullname).title : undefined;

  const openEvent = (): void => {
    if (url) void openExternal(url);
  };
  const openCourse = (): void => {
    if (courseId !== undefined) navigate({ name: 'course', courseId });
  };

  return (
    <li
      className={cn(
        'relative flex items-center gap-3 px-4 py-2.5',
        url && 'hover:bg-accent has-focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]',
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {url ? (
          <button
            type="button"
            onClick={openEvent}
            className="truncate text-left text-sm outline-none after:absolute after:inset-0"
          >
            {htmlToText(event.name)}
          </button>
        ) : (
          <p className="truncate text-sm">{htmlToText(event.name)}</p>
        )}
        {courseId !== undefined && courseTitle ? (
          <button
            type="button"
            onClick={openCourse}
            className="relative z-10 w-fit max-w-full truncate text-left text-2xs text-muted-foreground outline-none hover:text-foreground hover:underline"
          >
            {courseTitle}
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <time className="font-mono text-xs tabular-nums text-muted-foreground">{formatTime(event.timestart)}</time>
        {urgency === 'overdue' ? <Badge variant="error">Scaduta</Badge> : null}
        {urgency === 'soon' ? <Badge variant="warning">{formatRelative(event.timestart, nowMs)}</Badge> : null}
        {url ? (
          <Button variant="ghost" size="icon-sm" aria-label="Apri su WeBeep" className="relative z-10" onClick={openEvent}>
            <ExternalLink aria-hidden />
          </Button>
        ) : null}
      </div>
    </li>
  );
};
