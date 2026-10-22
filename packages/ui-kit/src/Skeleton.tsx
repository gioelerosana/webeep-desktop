import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

/** Segnaposto di caricamento: fill `muted`, pulsazione rispettosa di reduced-motion. */
export const Skeleton = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>): ReactNode => (
  <div aria-hidden className={cn('animate-pulse rounded-md bg-accent', className)} {...rest} />
);
