import { cn } from '@webeep/ui-kit';
import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';
import { fallbackGradientOf } from './courseBanner';

export type CourseBannerFallbackProps = {
  readonly courseId: number;
};

/* Banner di ripiego quando il corso non ha immagine o non si carica: sfondo dai token, icona del corso. */
export const CourseBannerFallback = ({ courseId }: CourseBannerFallbackProps): ReactNode => (
  <span
    aria-hidden
    className={cn('flex size-full items-center justify-center', fallbackGradientOf(courseId))}
  >
    <GraduationCap className="size-8 text-muted-foreground/60" />
  </span>
);
