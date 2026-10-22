import type { ReactNode } from 'react';
import { cn } from './cn.js';

export type EmptyStateProps = {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

/** Stato vuoto o di errore di una vista: icona muta, titolo, testo, azione opzionale. */
export const EmptyState = ({ icon, title, description, action, className }: EmptyStateProps): ReactNode => (
  <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
    {icon ? <div className="text-muted-foreground [&_svg]:size-6">{icon}</div> : null}
    <div className="flex max-w-sm flex-col gap-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
    </div>
    {action}
  </div>
);
