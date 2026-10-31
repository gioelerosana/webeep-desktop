import { Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { COURSE_GRID_CLASSES } from './courseGridClasses';

const SKELETON_CARDS = 4;

/* Segnaposto di caricamento dei preferiti: card con banner e due righe di testo, nella stessa griglia. */
export const FavouriteCoursesSkeleton = (): ReactNode => (
  <div className={COURSE_GRID_CLASSES} aria-hidden>
    {Array.from({ length: SKELETON_CARDS }, (_card, index) => (
      <div key={index} className="flex flex-col overflow-hidden rounded-lg border bg-card">
        <Skeleton className="aspect-video w-full rounded-none" />
        <div className="flex flex-col gap-2 px-3 py-2.5">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);
