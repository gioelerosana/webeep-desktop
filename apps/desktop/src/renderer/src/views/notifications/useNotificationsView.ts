import type { MoodleNotification } from '@webeep/moodle-api';
import { useState } from 'react';
import { useNotifications } from '../../lib/queries';

export type NotificationFilter = 'all' | 'unread';

export type NotificationsView = {
  readonly filter: NotificationFilter;
  readonly setFilter: (filter: NotificationFilter) => void;
  readonly notifications: readonly MoodleNotification[];
  readonly unreadCount: number;
  /** Riga di intestazione, assente finché non arriva il primo elenco. */
  readonly countLabel: string | undefined;
  readonly isPending: boolean;
  /** Errore senza dati: con un elenco già visibile un refetch fallito non lo nasconde. */
  readonly isLoadFailed: boolean;
  readonly retry: () => void;
};

const visibleNotifications = (
  notifications: readonly MoodleNotification[],
  filter: NotificationFilter,
): readonly MoodleNotification[] => (filter === 'unread' ? notifications.filter((notification) => !notification.read) : notifications);

const describeCount = (unreadCount: number): string => (unreadCount > 0 ? `${unreadCount} non lette` : 'Tutto letto');

/** Elenco delle notifiche con il filtro "tutte" / "non lette" e i conteggi dell'intestazione. */
export const useNotificationsView = (): NotificationsView => {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const query = useNotifications();
  const page = query.data;

  return {
    filter,
    setFilter,
    notifications: visibleNotifications(page?.notifications ?? [], filter),
    unreadCount: page?.unreadcount ?? 0,
    countLabel: page ? describeCount(page.unreadcount) : undefined,
    isPending: query.isPending,
    isLoadFailed: query.isError && page === undefined,
    retry: () => void query.refetch(),
  };
};
