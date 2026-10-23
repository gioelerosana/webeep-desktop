import { cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

export type UpdateProgressBarProps = {
  /** Avanzamento da 0 a 100. */
  readonly percent: number;
  readonly className?: string;
};

export const UpdateProgressBar = ({ percent, className }: UpdateProgressBarProps): ReactNode => {
  const clampedPercent = Math.min(Math.max(percent, MIN_PERCENT), MAX_PERCENT);
  return (
    <div
      role="progressbar"
      aria-label="avanzamento del download"
      aria-valuemin={MIN_PERCENT}
      aria-valuemax={MAX_PERCENT}
      aria-valuenow={clampedPercent}
      className={cn('h-1.5 overflow-hidden rounded-full bg-accent', className)}
    >
      <div className="h-full bg-primary transition-[width] duration-300 ease-sheet" style={{ width: `${clampedPercent}%` }} />
    </div>
  );
};
