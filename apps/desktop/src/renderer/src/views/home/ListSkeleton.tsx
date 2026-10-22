import { Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

const SKELETON_ROWS = 3;

/** Segnaposto di caricamento per le card della Home: tre righe. */
export const ListSkeleton = (): ReactNode => (
  <div className="flex flex-col gap-3 px-4 py-3">
    {Array.from({ length: SKELETON_ROWS }, (_row, index) => (
      <Skeleton key={index} className="h-4 w-full" />
    ))}
  </div>
);
