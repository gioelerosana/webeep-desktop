import { Button } from '@webeep/ui-kit';
import { Check, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MoodleNotification } from '@webeep/moodle-api';
import { formatDateTime, formatRelative, htmlToText } from '../../lib/format';
import { openExternal, useMarkNotificationRead } from '../../lib/queries';

export type NotificationRowProps = {
  readonly notification: MoodleNotification;
};

/** Riga di una notifica: pallino se non letta, testo, azioni visibili al passaggio o al focus. */
export const NotificationRow = ({ notification }: NotificationRowProps): ReactNode => {
  const markRead = useMarkNotificationRead();
  const isUnread = !notification.read;
  const rawPreview = htmlToText(notification.smallmessage ?? '');
  // Moodle spesso ripete il soggetto in `smallmessage`: in quel caso non lo mostriamo due volte.
  const preview = rawPreview === notification.subject ? '' : rawPreview;
  const contextUrl = notification.contexturl;

  const markAsRead = (): void => {
    if (isUnread) markRead.mutate(notification.id);
  };

  // Apre prima il browser: se fallisce la notifica resta non letta e l'errore finisce in console.
  const openOnWebeep = async (url: string): Promise<void> => {
    try {
      await openExternal(url);
    } catch (error) {
      console.error('Impossibile aprire il link della notifica', error);
      return;
    }
    markAsRead();
  };

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-within:bg-accent/50">
      <span
        aria-hidden
        className={isUnread ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-primary' : 'mt-1.5 size-1.5 shrink-0'}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={isUnread ? 'text-sm font-medium text-foreground' : 'text-sm text-foreground'}>{notification.subject}</p>
        {preview ? <p className="line-clamp-2 text-sm text-muted-foreground">{preview}</p> : null}
        <span className="text-2xs text-muted-foreground" title={formatDateTime(notification.timecreated)}>
          {formatRelative(notification.timecreated)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {isUnread ? (
          <Button variant="ghost" size="icon-sm" aria-label="Segna come letta" onClick={markAsRead}>
            <Check />
          </Button>
        ) : null}
        {contextUrl ? (
          <Button variant="ghost" size="icon-sm" aria-label="Apri su WeBeep" onClick={() => void openOnWebeep(contextUrl)}>
            <ExternalLink />
          </Button>
        ) : null}
      </div>
    </li>
  );
};
