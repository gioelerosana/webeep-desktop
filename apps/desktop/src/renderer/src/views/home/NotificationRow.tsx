import type { MoodleNotification } from '@webeep/moodle-api';
import { cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { formatRelative, htmlToText } from '../../lib/format';

export type NotificationRowProps = {
  readonly notification: MoodleNotification;
};

/** Una notifica nella Home: il pallino segna le non lette, il tempo relativo sta sotto il soggetto. */
export const NotificationRow = ({ notification }: NotificationRowProps): ReactNode => {
  const { read } = notification;
  return (
    <li className="flex items-start gap-3 px-4 py-2.5">
      <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', read ? 'bg-transparent' : 'bg-primary')} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className={cn('line-clamp-2 text-sm', !read && 'font-medium')}>
          {!read ? <span className="sr-only">Non letta: </span> : null}
          {htmlToText(notification.subject)}
        </p>
        <p className="text-2xs text-muted-foreground">{formatRelative(notification.timecreated)}</p>
      </div>
    </li>
  );
};
