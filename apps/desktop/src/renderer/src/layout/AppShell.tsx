import type { ReactNode } from 'react';

export type AppShellProps = { readonly children: ReactNode };

// SEGNAPOSTO: da implementare (vedi TODO.md).
export const AppShell = ({ children }: AppShellProps): ReactNode => <main className="h-full overflow-auto">{children}</main>;
