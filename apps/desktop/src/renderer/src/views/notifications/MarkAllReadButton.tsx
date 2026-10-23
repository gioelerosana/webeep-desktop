import { Button } from '@webeep/ui-kit';
import { CheckCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMarkAllNotificationsRead } from '../../lib/queries';
import { useMarkAllReadConfirmation } from './useMarkAllReadConfirmation';

export type MarkAllReadButtonProps = {
  readonly unreadCount: number;
};

const ERROR_TEXT = 'Impossibile segnare le notifiche come lette';
const LABEL = 'Segna tutte come lette';
const CONFIRM_LABEL = 'Conferma: segna tutte come lette';
const CANCEL_LABEL = 'Annulla';

/**
 * Segna come lette tutte le notifiche. Scrive su WeBeep, quindi il primo clic
 * chiede conferma: il secondo esegue, Annulla o Esc (o il timeout) disarmano.
 * Spento se non ci sono non lette e mentre la richiesta è in corso.
 */
export const MarkAllReadButton = ({ unreadCount }: MarkAllReadButtonProps): ReactNode => {
  const markAllRead = useMarkAllNotificationsRead();
  const confirmation = useMarkAllReadConfirmation(() => markAllRead.mutate());

  return (
    <div className="flex items-center gap-2">
      {markAllRead.isError ? (
        <p role="alert" className="text-sm text-error-foreground">
          {ERROR_TEXT}
        </p>
      ) : null}
      {confirmation.isArmed ? (
        <Button variant="ghost-muted" size="sm" onClick={confirmation.cancel}>
          {CANCEL_LABEL}
        </Button>
      ) : null}
      <Button
        variant={confirmation.isArmed ? 'default' : 'outline'}
        size="sm"
        icon={<CheckCheck />}
        loading={markAllRead.isPending}
        disabled={unreadCount === 0}
        onClick={confirmation.press}
      >
        {confirmation.isArmed ? CONFIRM_LABEL : LABEL}
      </Button>
    </div>
  );
};
