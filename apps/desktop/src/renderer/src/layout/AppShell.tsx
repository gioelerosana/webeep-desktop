import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export type AppShellProps = { readonly children: ReactNode };

/** Shell a tutta altezza: sidebar a sinistra, contenuto della vista a destra che scorre da solo. */
export const AppShell = ({ children }: AppShellProps): ReactNode => (
  <div className="flex h-full bg-background text-foreground">
    <Sidebar />
    <main className="min-w-0 flex-1 overflow-y-auto bg-background">{children}</main>
  </div>
);
