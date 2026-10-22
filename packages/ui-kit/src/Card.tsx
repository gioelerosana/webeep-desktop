/*
 * Pannello rialzato: superficie `card`, bordo hairline, raggio 10px. In scuro
 * la card è solo il 3% più chiara del fondo: la separazione la dà il bordo.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export const Card = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>): ReactNode => (
  <div className={cn('rounded-lg border bg-card text-card-foreground', className)} {...rest} />
);

export type CardHeaderProps = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

export const CardHeader = ({ title, description, action, className }: CardHeaderProps): ReactNode => (
  <div className={cn('flex items-start justify-between gap-3 border-b px-4 py-3', className)}>
    <div className="flex min-w-0 flex-col gap-0.5">
      <h2 className="truncate text-sm font-medium">{title}</h2>
      {description ? <p className="text-2xs text-muted-foreground">{description}</p> : null}
    </div>
    {action}
  </div>
);
