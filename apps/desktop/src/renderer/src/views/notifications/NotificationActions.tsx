/*
 * Azioni di una notifica espansa: destinazione, "segna come letta", "apri nel corso"
 * e il ripiego "apri su WeBeep". La voce dentro l'app compare solo quando il contesto
 * del modulo è risolto; mentre si risolve resta uno skeleton, così la riga non salta.
 */
import { Badge, Button, Skeleton } from '@webeep/ui-kit';
import { BookOpen, Check, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

export type NotificationActionsProps = {
  /** Etichetta italiana della destinazione (`forum`, `compito`, …). */
  readonly destinationLabel: string;
  readonly isUnread: boolean;
  readonly isMarkingRead: boolean;
  /** Il contesto del modulo sta arrivando: al suo posto, per ora, uno skeleton. */
  readonly isResolvingContext: boolean;
  readonly canOpenInCourse: boolean;
  /** Solo con una `contexturl`: senza link non c'è niente da aprire sul sito. */
  readonly canOpenOnWebeep: boolean;
  readonly onMarkAsRead: () => void;
  readonly onOpenInCourse: () => void;
  readonly onOpenOnWebeep: () => void;
};

export const NotificationActions = ({
  destinationLabel,
  isUnread,
  isMarkingRead,
  isResolvingContext,
  canOpenInCourse,
  canOpenOnWebeep,
  onMarkAsRead,
  onOpenInCourse,
  onOpenOnWebeep,
}: NotificationActionsProps): ReactNode => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="outline" size="sm">
      {destinationLabel}
    </Badge>
    {isUnread ? (
      <Button variant="outline" size="xs" icon={<Check />} loading={isMarkingRead} onClick={onMarkAsRead}>
        Segna come letta
      </Button>
    ) : null}
    {isResolvingContext ? <Skeleton className="h-6 w-28" /> : null}
    {canOpenInCourse ? (
      <Button variant="outline" size="xs" icon={<BookOpen />} onClick={onOpenInCourse}>
        Apri nel corso
      </Button>
    ) : null}
    {canOpenOnWebeep ? (
      <Button variant="ghost-muted" size="xs" icon={<ExternalLink />} onClick={onOpenOnWebeep}>
        Apri su WeBeep
      </Button>
    ) : null}
  </div>
);
