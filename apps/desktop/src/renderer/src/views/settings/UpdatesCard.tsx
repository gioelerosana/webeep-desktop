import { Card, CardHeader, Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { isWebRenderer } from '../../lib/http-bridge';
import { useUpdates } from '../../layout/useUpdates';
import { UpdateStatusBody } from './UpdateStatusBody';

export const UpdatesCard = (): ReactNode => {
  const updates = useUpdates();
  const { state } = updates;
  // Nel browser gli aggiornamenti riguardano il desktop che serve la pagina: non si mostrano.
  const isWeb = isWebRenderer();

  const renderBody = (): ReactNode => {
    if (isWeb) return <p className="text-sm text-muted-foreground">Gli aggiornamenti si gestiscono dall'app desktop.</p>;
    if (updates.readFailed) return <p className="text-sm text-error-foreground">Impossibile leggere lo stato degli aggiornamenti.</p>;
    if (!state) return <Skeleton className="h-4 w-2/3" />;
    return <UpdateStatusBody state={state} actions={updates} />;
  };

  return (
    <Card>
      <CardHeader
        title="Aggiornamenti"
        description={state && !isWeb ? `Versione installata ${state.currentVersion}` : undefined}
      />
      <div className="flex flex-col gap-3 px-4 py-3">
        {renderBody()}
        {updates.actionError ? <p className="text-2xs text-error-foreground">{updates.actionError}</p> : null}
      </div>
    </Card>
  );
};
