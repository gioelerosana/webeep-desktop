import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn.js';

export type SpinnerProps = {
  readonly className?: string;
  /** Testo per i lettori di schermo. */
  readonly label?: string;
};

export const Spinner = ({ className, label = 'Caricamento' }: SpinnerProps): ReactNode => (
  <LoaderCircle role="status" aria-label={label} className={cn('size-4 animate-spin text-muted-foreground', className)} />
);
