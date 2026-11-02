/*
 * Segnaposto della pagina corso mentre i contenuti arrivano: tre card con righe
 * di dimensioni diverse, così il passaggio al contenuto vero non fa saltare il layout.
 */
import { Card, Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

const SKELETON_CARD_COUNT = 3;
const SKELETON_CARD_KEYS = Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => index);

export const CourseSkeleton = (): ReactNode => (
  <div aria-busy="true" className="flex flex-col gap-4">
    {SKELETON_CARD_KEYS.map((key) => (
      <Card key={key} className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </Card>
    ))}
  </div>
);
