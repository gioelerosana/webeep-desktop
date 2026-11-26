import { Button, Card, CardHeader, Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { isWebRenderer } from '../../lib/http-bridge';
import { ServerLinkForm } from './ServerLinkForm';
import { useServerLinkForm } from './useServerLinkForm';

const DESCRIPTION = 'Il server riceve la sessione WeBeep di questo computer, per servire Claude.';
const WEB_MESSAGE = "Il collegamento al server si gestisce dall'app desktop.";

/* Corpo della card: si monta solo fuori dalla modalità web, dove il canale di collegamento esiste. */
const ServerCardBody = (): ReactNode => {
  const form = useServerLinkForm();

  if (form.query.isPending) {
    return (
      <div className="px-4 py-3">
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (form.query.isError) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">impossibile leggere lo stato del server</p>;
  }
  if (form.status?.paired && form.status.serverUrl) {
    const { serverUrl, fullName } = form.status;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">{fullName ? `collegato come ${fullName}` : 'collegato'}</p>
          <p className="truncate font-mono text-sm text-muted-foreground" title={serverUrl}>
            {serverUrl}
          </p>
          {form.unlinkError ? <p className="text-2xs text-error-foreground">{form.unlinkError}</p> : null}
        </div>
        <Button variant="outline" size="sm" loading={form.unlinking} onClick={form.unlink}>
          scollega
        </Button>
      </div>
    );
  }
  return <ServerLinkForm form={form} />;
};

export const ServerCard = (): ReactNode => {
  // Nel browser il collegamento userebbe la sessione del desktop: qui si rimanda all'app.
  const isWeb = isWebRenderer();
  return (
    <Card>
      <CardHeader title="Server privato" description={DESCRIPTION} />
      {isWeb ? <p className="px-4 py-3 text-sm text-muted-foreground">{WEB_MESSAGE}</p> : <ServerCardBody />}
    </Card>
  );
};
