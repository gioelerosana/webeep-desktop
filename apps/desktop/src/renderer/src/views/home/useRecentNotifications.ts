import type { UseQueryResult } from '@tanstack/react-query';
import type { MoodleNotification, NotificationsPage } from '@webeep/moodle-api';
import { useMemo } from 'react';
import { useNotifications } from '../../lib/queries';
import { selectRecentNotifications } from './notifications';

const RECENT_NOTIFICATIONS_LIMIT = 5;

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
