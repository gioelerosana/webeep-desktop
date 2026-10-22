import type { UseQueryResult } from '@tanstack/react-query';
import type { CalendarEvent } from '@webeep/moodle-api';
import { useMemo } from 'react';
import { useUpcomingEvents } from '../../lib/queries';
import { groupDeadlinesByDay, type DeadlineGroup } from './deadlines';

export type UpcomingDeadlinesState = {
  readonly query: UseQueryResult<readonly CalendarEvent[]>;
  readonly groups: readonly DeadlineGroup[];
  /** Istante del calcolo: le righe lo usano per urgenza e tempo relativo, coerenti tra loro. */
  readonly nowMs: number;
};

export const useUpcomingDeadlines = (): UpcomingDeadlinesState => {
  const query = useUpcomingEvents();
  const { groups, nowMs } = useMemo(() => {
    const now = Date.now();
    return { groups: groupDeadlinesByDay(query.data ?? [], now), nowMs: now };
  }, [query.data]);
  return { query, groups, nowMs };
};
