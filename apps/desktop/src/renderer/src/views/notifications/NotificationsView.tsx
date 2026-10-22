import { Button, Card, EmptyState, Skeleton } from '@webeep/ui-kit';
import { AlertCircle, BellOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { MoodleNotification } from '@webeep/moodle-api';
import { PageHeader, Page } from '../../layout/Page';
import { useNotifications } from '../../lib/queries';
import { NotificationRow } from './NotificationRow';

type NotificationFilter = 'all' | 'unread';

const FILTER_OPTIONS: readonly { readonly value: NotificationFilter; readonly label: string }[] = [
  { value: 'all', label: 'Tutte' },
  { value: 'unread', label: 'Non lette' },
];

const SKELETON_ROWS_COUNT = 5;
const SKELETON_ROWS: readonly number[] = Array.from({ length: SKELETON_ROWS_COUNT }, (_, index) => index);

const visibleNotifications = (
  notifications: readonly MoodleNotification[],
  filter: NotificationFilter,
): readonly MoodleNotification[] => (filter === 'unread' ? notifications.filter((notification) => !notification.read) : notifications);

const describeCount = (unreadCount: number): string => (unreadCount > 0 ? `${unreadCount} non lette` : 'Tutto letto');

export const NotificationsView = (): ReactNode => {
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const notificationsQuery = useNotifications();

  if (notificationsQuery.isError) {
    return (
      <Page>
        <PageHeader title="Notifiche" />
        <Card>
          <EmptyState
            icon={<AlertCircle />}
            title="Impossibile caricare le notifiche"
            action={
              <Button variant="outline" size="sm" onClick={() => notificationsQuery.refetch()}>
                Riprova
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  const page = notificationsQuery.data;
  const notifications = visibleNotifications(page?.notifications ?? [], filter);
  const emptyTitle = filter === 'unread' ? 'Nessuna notifica da leggere' : 'Nessuna notifica';

  const renderList = (): ReactNode => {
    if (notificationsQuery.isPending) {
      return (
        <div className="flex flex-col gap-3 px-4 py-3">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      );
    }
    if (notifications.length === 0) return <EmptyState icon={<BellOff />} title={emptyTitle} />;
    return (
      <ul className="divide-y">
        {notifications.map((notification) => (
          <NotificationRow key={notification.id} notification={notification} />
        ))}
      </ul>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Notifiche"
        description={page ? describeCount(page.unreadcount) : undefined}
        actions={
          <div role="group" aria-label="Filtra notifiche" className="flex items-center gap-1">
            {FILTER_OPTIONS.map((option) => {
              const active = option.value === filter;
              return (
                <Button
                  key={option.value}
                  variant={active ? 'secondary' : 'ghost-muted'}
                  size="sm"
                  aria-pressed={active}
                  className={active ? 'border-input' : undefined}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        }
      />

      <Card>{renderList()}</Card>
    </Page>
  );
};
