import { Button, Spinner } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import type { ServerLinkForm as ServerLinkFormState } from './useServerLinkForm';

export type ServerLinkPendingProps = {
  readonly form: ServerLinkFormState;
};

/** Attesa del ritorno dal browser: l'utente può annullare, e il main chiude il listener. */
export const ServerLinkPending = ({ form }: ServerLinkPendingProps): ReactNode => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
    <div className="flex min-w-0 items-center gap-2">
      <Spinner />
      <p className="text-sm">completa l'accesso nel browser…</p>
    </div>
    <Button variant="outline" size="sm" loading={form.cancelling} onClick={form.cancelLink}>
      annulla
    </Button>
  </div>
);
