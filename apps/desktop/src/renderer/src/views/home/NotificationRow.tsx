/*
 * Una notifica nella Home: il pallino segna le non lette, il tempo relativo sta sotto
 * il soggetto. Il soggetto è un bottone che apre il corpo (e le sue azioni) sotto la
 * riga, con gli stessi componenti della pagina Notifiche: qui la riga resta compatta.
 */
import type { MoodleNotification } from '@webeep/moodle-api';
import { cn } from '@webeep/ui-kit';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { NotificationPanel } from '../../components/notification/NotificationPanel';
import { formatDateTime, formatRelative, htmlToText } from '../../lib/format';
import { useNotificationRow } from '../notifications/useNotificationRow';

export type NotificationRowProps = {
  readonly notification: MoodleNotification;
};

export const NotificationRow = ({ notification }: NotificationRowProps): ReactNode => {
  const row = useNotificationRow(notification);
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', row.isUnread && 'bg-primary')} />
        <div className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            aria-expanded={row.isOpen}
            aria-controls={row.isOpen ? row.panelId : undefined}
            onClick={row.toggle}
            className="flex w-full items-start gap-2 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn('line-clamp-2 text-sm', row.isUnread && 'font-medium')}>
                {row.isUnread ? <span className="sr-only">Non letta: </span> : null}
                {htmlToText(notification.subject)}
              </span>
              <span className="text-2xs text-muted-foreground" title={formatDateTime(notification.timecreated)}>
                {formatRelative(notification.timecreated)}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={cn(
                'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
                row.isOpen && 'rotate-180',
              )}
            />
          </button>

          {row.isOpen ? <NotificationPanel row={row} /> : null}
        </div>
      </div>
    </li>
  );
};
