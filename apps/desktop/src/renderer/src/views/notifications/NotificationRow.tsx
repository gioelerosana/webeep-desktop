/*
 * Riga di una notifica: pallino se non letta, soggetto, anteprima e tempo. Il soggetto
 * è un bottone: apre il corpo sotto la riga (`aria-expanded` + `aria-controls`), con i
 * link che restano raggiungibili da tastiera. Le azioni rapide restano al passaggio.
 */
import type { MoodleNotification } from '@webeep/moodle-api';
import { Button, cn } from '@webeep/ui-kit';
import { Check, ChevronDown, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { NotificationPanel } from '../../components/notification/NotificationPanel';
import { formatDateTime, formatRelative } from '../../lib/format';
import { notificationPreviewText } from '../../lib/notificationContext';
import { useNotificationRow } from './useNotificationRow';

export type NotificationRowProps = {
  readonly notification: MoodleNotification;
};

export const NotificationRow = ({ notification }: NotificationRowProps): ReactNode => {
  const row = useNotificationRow(notification);
  const preview = row.isOpen ? '' : notificationPreviewText(notification);

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-within:bg-accent/50">
      <span
        aria-hidden
        className={row.isUnread ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-primary' : 'mt-1.5 size-1.5 shrink-0'}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          aria-expanded={row.isOpen}
          aria-controls={row.isOpen ? row.panelId : undefined}
          onClick={row.toggle}
          className="flex w-full items-start gap-2 rounded-control text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={row.isUnread ? 'text-sm font-medium text-foreground' : 'text-sm text-foreground'}>
              {notification.subject}
            </span>
            {preview ? <span className="line-clamp-2 text-sm text-muted-foreground">{preview}</span> : null}
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

      {row.isOpen ? null : (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {row.isUnread ? (
            <Button variant="ghost" size="icon-sm" aria-label="Segna come letta" onClick={row.markAsRead}>
              <Check />
            </Button>
          ) : null}
          {row.canOpenOnWebeep ? (
            <Button variant="ghost" size="icon-sm" aria-label="Apri su WeBeep" onClick={row.openOnWebeep}>
              <ExternalLink />
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
};
