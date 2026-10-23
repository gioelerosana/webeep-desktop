import { Button } from '@webeep/ui-kit';
import { CheckCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMarkAllNotificationsRead } from '../../lib/queries';

export type MarkAllReadButtonProps = {
  readonly unreadCount: number;
};

const ERROR_TEXT = 'Impossibile segnare le notifiche come lette';

/**
 * Segna come lette tutte le notifiche con un solo clic: è un'azione esplicita
 * dell'utente, quindi niente conferma. Spento se non ci sono non lette e mentre
 * la richiesta è in corso, per non inviarla due volte.
 */
export const MarkAllReadButton = ({ unreadCount }: MarkAllReadButtonProps): ReactNode => {
  const markAllRead = useMarkAllNotificationsRead();

  return (
    <div className="flex items-center gap-2">
      {markAllRead.isError ? (
        <p role="alert" className="text-sm text-error-foreground">
          {ERROR_TEXT}
        </p>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        icon={<CheckCheck />}
        loading={markAllRead.isPending}
        disabled={unreadCount === 0}
        onClick={() => markAllRead.mutate()}
      >
        segna tutte come lette
      </Button>
    </div>
  );
};
