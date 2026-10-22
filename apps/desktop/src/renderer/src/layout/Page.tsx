/*
 * Impaginazione comune delle viste: colonna centrata larga al massimo
 * `--content-max-width`, intestazione con titolo, sottotitolo e azioni.
 * Ogni vista usa `<Page>` come radice, così margini e larghezze restano coerenti.
 */
import { cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

export type PageProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

export const Page = ({ children, className }: PageProps): ReactNode => (
  <div className={cn('mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-6 px-[var(--workspace-gutter)] py-6', className)}>
    {children}
  </div>
);

export type PageHeaderProps = {
  readonly title: ReactNode;
  /** Riga di metadati sotto il titolo (categoria, conteggi…). */
  readonly description?: ReactNode;
  /** Bottoni a destra del titolo. */
  readonly actions?: ReactNode;
};

export const PageHeader = ({ title, description, actions }: PageHeaderProps): ReactNode => (
  <header className="flex items-start justify-between gap-4">
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="text-lg font-medium text-balance">{title}</h1>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </header>
);
