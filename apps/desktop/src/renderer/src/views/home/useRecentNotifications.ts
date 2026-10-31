import type { UseQueryResult } from '@tanstack/react-query';
import type { MoodleNotification, NotificationsPage } from '@webeep/moodle-api';
import { useMemo } from 'react';
import { useNotifications } from '../../lib/queries';
import { selectRecentNotifications } from './notifications';

/* Le notifiche sono la sezione principale della Home: più voci visibili senza aprire la pagina dedicata. */
const RECENT_NOTIFICATIONS_LIMIT = 8;

export type RecentNotificationsState = {
  readonly query: UseQueryResult<NotificationsPage>;
  readonly items: readonly MoodleNotification[];
};

export const useRecentNotifications = (): RecentNotificationsState => {
  const query = useNotifications();
  const items = useMemo(
    () => selectRecentNotifications(query.data?.notifications ?? [], RECENT_NOTIFICATIONS_LIMIT),
    [query.data],
  );
  return { query, items };
};
