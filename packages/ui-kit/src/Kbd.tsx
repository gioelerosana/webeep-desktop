import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

/** Un tasto per le scorciatoie; per un accordo usa più `Kbd` dentro `KbdGroup`. */
export const Kbd = ({ className, ...rest }: HTMLAttributes<HTMLElement>): ReactNode => (
  <kbd
    className={cn(
      'pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded bg-muted px-1 font-sans text-xs font-medium text-muted-foreground',
      className,
    )}
    {...rest}
  />
);

export const KbdGroup = ({ className, ...rest }: HTMLAttributes<HTMLSpanElement>): ReactNode => (
  <span className={cn('inline-flex items-center gap-1', className)} {...rest} />
);
