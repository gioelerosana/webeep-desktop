/*
 * Schermata mostrata quando l'interfaccia è caduta: niente stato da ripristinare, si
 * ricarica il renderer. Non usa l'intestazione né la sidebar, che potrebbero essere la causa.
 */
import { Button, EmptyState } from '@webeep/ui-kit';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

const reloadInterface = (): void => {
  window.location.reload();
};

export const CrashFallback = (): ReactNode => (
  <div className="h-full bg-background text-foreground">
    <EmptyState
      title="qualcosa è andato storto"
      description="ricarica l'interfaccia per continuare."
      action={
        <Button variant="outline" icon={<RefreshCw />} onClick={reloadInterface}>
          ricarica
        </Button>
      }
    />
  </div>
);
