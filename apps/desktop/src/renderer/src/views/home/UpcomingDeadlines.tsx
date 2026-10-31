import { Card, CardHeader } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { DeadlineRow } from './DeadlineRow';
import { useUpcomingDeadlines } from './useUpcomingDeadlines';

/*
 * La sezione esiste solo quando ci sono scadenze da mostrare: in caricamento,
 * vuota o in errore non rende nulla, così la Home non riempie lo spazio con
 * messaggi di servizio. I dati restano caricati e la logica è la stessa.
 */
export const UpcomingDeadlines = (): ReactNode => {
  const { query, groups, nowMs } = useUpcomingDeadlines();
  if (!query.isSuccess || groups.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Prossime scadenze" />
      {groups.map((group) => (
        <section key={group.key} className="border-t first:border-t-0">
          <h3 className="px-4 pt-2.5 pb-1 text-2xs font-medium text-muted-foreground">{group.label}</h3>
          <ul className="divide-y">
            {group.events.map((event) => (
              <DeadlineRow key={event.id} event={event} nowMs={nowMs} />
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
};
