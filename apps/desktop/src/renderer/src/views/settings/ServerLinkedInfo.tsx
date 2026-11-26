import { Button } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import type { ServerLinkForm as ServerLinkFormState } from './useServerLinkForm';

export type ServerLinkedInfoProps = {
  readonly form: ServerLinkFormState;
  readonly serverUrl: string;
  readonly fullName: string | undefined;
};

const LOCAL_ONLY_HINT = 'il server non risponde: puoi rimuovere il collegamento solo da questo computer.';

/** Server collegato: nome dell'utente, indirizzo e scollegamento (con la via locale se il server è spento). */
export const ServerLinkedInfo = ({ form, serverUrl, fullName }: ServerLinkedInfoProps): ReactNode => (
  <div className="flex flex-col gap-3 px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{fullName ? `collegato come ${fullName}` : 'collegato'}</p>
        <p className="truncate font-mono text-sm text-muted-foreground" title={serverUrl}>
          {serverUrl}
        </p>
      </div>
      <Button variant="outline" size="sm" loading={form.unlinking} onClick={form.unlink}>
        scollega
      </Button>
    </div>
    {form.unlinkError ? <p className="text-2xs text-error-foreground">{form.unlinkError}</p> : null}
    {form.canUnlinkLocally ? (
      <div className="flex flex-col gap-2">
        <p className="text-2xs text-muted-foreground">{LOCAL_ONLY_HINT}</p>
        <div>
          <Button variant="outline" size="sm" disabled={form.unlinking} onClick={form.unlinkLocally}>
            rimuovi solo da questo computer
          </Button>
        </div>
      </div>
    ) : null}
  </div>
);
