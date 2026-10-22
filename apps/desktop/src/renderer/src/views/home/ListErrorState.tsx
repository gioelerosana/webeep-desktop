import { AlertCircle } from 'lucide-react';
import { Button, EmptyState } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

export type ListErrorStateProps = {
  readonly title: string;
  readonly onRetry: () => void;
};

/** Errore di una card della Home, con il tentativo di ricaricamento. */
export const ListErrorState = ({ title, onRetry }: ListErrorStateProps): ReactNode => (
  <EmptyState
    className="py-8"
    icon={<AlertCircle />}
    title={title}
    action={
      <Button variant="outline" size="sm" onClick={onRetry}>
        Riprova
      </Button>
    }
  />
);
