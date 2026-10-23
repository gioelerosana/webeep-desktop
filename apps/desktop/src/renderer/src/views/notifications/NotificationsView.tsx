import { Button, Card, EmptyState, Skeleton } from '@webeep/ui-kit';
import { AlertCircle, BellOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader, Page } from '../../layout/Page';
import { MarkAllReadButton } from './MarkAllReadButton';
import { NotificationRow } from './NotificationRow';
import { useNotificationsView, type NotificationFilter } from './useNotificationsView';

const FILTER_OPTIONS: readonly { readonly value: NotificationFilter; readonly label: string }[] = [
  { value: 'all', label: 'Tutte' },
  { value: 'unread', label: 'Non lette' },
];

const EMPTY_TITLES: Readonly<Record<NotificationFilter, string>> = {
  all: 'Nessuna notifica',
  unread: 'Nessuna notifica da leggere',
};

const SKELETON_ROWS_COUNT = 5;
const SKELETON_ROWS: readonly number[] = Array.from({ length: SKELETON_ROWS_COUNT }, (_, index) => index);

export const NotificationsView = (): ReactNode => {
  const view = useNotificationsView();

  if (view.isLoadFailed) {
    return (
      <Page>
        <PageHeader title="Notifiche" />
        <Card>
          <EmptyState
            icon={<AlertCircle />}
            title="Impossibile caricare le notifiche"
            action={
              <Button variant="outline" size="sm" onClick={view.retry}>
                Riprova
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  const renderList = (): ReactNode => {
    if (view.isPending) {
      return (
        <div className="flex flex-col gap-3 px-4 py-3">
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      );
    }
    if (view.notifications.length === 0) return <EmptyState icon={<BellOff />} title={EMPTY_TITLES[view.filter]} />;
    return (
      <ul className="divide-y">
        {view.notifications.map((notification) => (
          <NotificationRow key={notification.id} notification={notification} />
        ))}
      </ul>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Notifiche"
        description={view.countLabel}
        actions={
          <>
            <MarkAllReadButton unreadCount={view.unreadCount} />
            <div role="group" aria-label="Filtra notifiche" className="flex items-center gap-1">
              {FILTER_OPTIONS.map((option) => {
                const active = option.value === view.filter;
                return (
                  <Button
                    key={option.value}
                    variant={active ? 'secondary' : 'ghost-muted'}
                    size="sm"
                    aria-pressed={active}
                    className={active ? 'border-input' : undefined}
                    onClick={() => view.setFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </>
        }
      />

      <Card>{renderList()}</Card>
    </Page>
  );
};
