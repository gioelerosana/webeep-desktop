import { Card, Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

/** Stato di caricamento della pagina: stessa forma del contenuto, con le linee al posto del testo. */
export const CoursePageSkeleton = (): ReactNode => (
  <div aria-busy="true" className="flex flex-col gap-6">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-72" />
      <Skeleton className="h-3 w-40" />
    </div>
    <Card className="flex flex-col gap-3 p-5">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </Card>
  </div>
);
