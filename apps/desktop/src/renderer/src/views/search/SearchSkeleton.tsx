import { Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

const SKELETON_ROWS_COUNT = 5;
const SKELETON_ROWS: readonly number[] = Array.from({ length: SKELETON_ROWS_COUNT }, (_row, index) => index);

/** Segnaposto della ricerca in corso: righe con miniatura e due linee di testo. */
export const SearchSkeleton = (): ReactNode => (
  <div role="status" aria-label="Ricerca in corso" className="flex flex-col gap-4 px-4 py-3">
    {SKELETON_ROWS.map((row) => (
      <div key={row} className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    ))}
  </div>
);
