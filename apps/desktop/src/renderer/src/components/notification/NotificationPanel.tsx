/*
 * Pannello espanso di una notifica: corpo e azioni, identico nella Home e nella
 * pagina Notifiche. Riceve il modello della riga, così le due viste non ricopiano
 * le stesse nove prop delle azioni.
 */
import type { ReactNode } from 'react';
import { NotificationActions } from '../../views/notifications/NotificationActions';
import { NotificationBody } from '../../views/notifications/NotificationBody';
import type { NotificationRowModel } from '../../views/notifications/useNotificationRow';

export type NotificationPanelProps = {
  readonly row: NotificationRowModel;
};

export const NotificationPanel = ({ row }: NotificationPanelProps): ReactNode => (
  <div id={row.panelId} className="mt-2 flex flex-col gap-3 border-l-2 pl-3">
    <NotificationBody content={row.content} />
    <NotificationActions
      destinationLabel={row.destinationLabel}
      isUnread={row.isUnread}
      isMarkingRead={row.isMarkingRead}
      isResolvingContext={row.isResolvingContext}
      canOpenInCourse={row.canOpenInCourse}
      canOpenOnWebeep={row.canOpenOnWebeep}
      onMarkAsRead={row.markAsRead}
      onOpenInCourse={row.openInCourse}
      onOpenOnWebeep={row.openOnWebeep}
    />
  </div>
);
