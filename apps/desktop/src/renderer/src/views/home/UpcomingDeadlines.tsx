import { Card, CardHeader, EmptyState } from '@webeep/ui-kit';
import { CalendarCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { DeadlineRow } from './DeadlineRow';
import { ListErrorState } from './ListErrorState';
import { ListSkeleton } from './ListSkeleton';
import { useUpcomingDeadlines } from './useUpcomingDeadlines';

export const UpcomingDeadlines = (): ReactNode => {
  const { query, groups, nowMs } = useUpcomingDeadlines();
  return (
    <Card>
      <CardHeader title="Prossime scadenze" />
      {query.isPending ? <ListSkeleton /> : null}
      {query.isError ? (
        <ListErrorState title="Impossibile caricare le scadenze" onRetry={() => void query.refetch()} />
      ) : null}
      {query.isSuccess && groups.length === 0 ? (
        <EmptyState className="py-8" icon={<CalendarCheck />} title="Nessuna scadenza nei prossimi giorni" />
      ) : null}
      {query.isSuccess
        ? groups.map((group) => (
            <section key={group.key} className="border-t first:border-t-0">
              <h3 className="px-4 pt-2.5 pb-1 text-2xs font-medium text-muted-foreground">{group.label}</h3>
              <ul className="divide-y">
                {group.events.map((event) => (
                  <DeadlineRow key={event.id} event={event} nowMs={nowMs} />
                ))}
              </ul>
            </section>
          ))
        : null}
    </Card>
  );
};
