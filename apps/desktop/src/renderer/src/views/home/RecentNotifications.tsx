import { Button, Card, CardHeader, EmptyState } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { useNavigation } from '../../lib/navigation';
import { ListErrorState } from './ListErrorState';
import { ListSkeleton } from './ListSkeleton';
import { NotificationRow } from './NotificationRow';
import { useRecentNotifications } from './useRecentNotifications';

export const RecentNotifications = (): ReactNode => {
  const { navigate } = useNavigation();
  const { query, items } = useRecentNotifications();
  return (
    <Card>
      <CardHeader
        title="Notifiche recenti"
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'notifications' })}>
            Vedi tutte
          </Button>
        }
      />
      {query.isPending ? <ListSkeleton /> : null}
      {query.isError ? (
        <ListErrorState title="Impossibile caricare le notifiche" onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess && items.length === 0 ? (
        <EmptyState className="py-8" title="Nessuna notifica recente" />
      ) : null}
      {query.isSuccess && items.length > 0 ? (
        <ul className="divide-y">
          {items.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </ul>
      ) : null}
    </Card>
  );
};
