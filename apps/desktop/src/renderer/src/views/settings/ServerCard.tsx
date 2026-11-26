import { Card, CardHeader, Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { isWebRenderer } from '../../lib/http-bridge';
import { ServerLinkForm } from './ServerLinkForm';
import { ServerLinkedInfo } from './ServerLinkedInfo';
import { ServerLinkPending } from './ServerLinkPending';
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
  if (form.linking) return <ServerLinkPending form={form} />;
  if (form.status?.paired && form.status.serverUrl) {
    return <ServerLinkedInfo form={form} serverUrl={form.status.serverUrl} fullName={form.status.fullName} />;
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
