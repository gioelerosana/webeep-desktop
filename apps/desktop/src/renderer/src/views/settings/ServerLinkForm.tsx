import { Button, Input } from '@webeep/ui-kit';
import { useId, type ReactNode } from 'react';
import type { ServerLinkForm as ServerLinkFormState } from './useServerLinkForm';

export type ServerLinkFormProps = {
  readonly form: ServerLinkFormState;
};

/** Campi per collegare il server: indirizzo e chiave di accoppiamento (input password). */
export const ServerLinkForm = ({ form }: ServerLinkFormProps): ReactNode => {
  const urlId = useId();
  const keyId = useId();
  const serverWasLinked = Boolean(form.status?.serverUrl);

  return (
    <form
      className="flex flex-col gap-3 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (form.canSubmit && !form.linking) form.link();
      }}
    >
      {serverWasLinked ? (
        <p className="text-2xs text-muted-foreground">il server non risponde o non ha più questo collegamento: collega di nuovo.</p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={urlId} className="text-2xs text-muted-foreground">
          indirizzo del server
        </label>
        <Input
          id={urlId}
          type="url"
          mono
          placeholder="https://server.example.it"
          autoComplete="off"
          spellCheck={false}
          value={form.url}
          onChange={(event) => form.setUrl(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={keyId} className="text-2xs text-muted-foreground">
          chiave di accoppiamento
        </label>
        <Input
          id={keyId}
          type="password"
          autoComplete="off"
          value={form.pairingKey}
          onChange={(event) => form.setPairingKey(event.target.value)}
        />
      </div>
      {form.linkError ? <p className="text-2xs text-error-foreground">{form.linkError}</p> : null}
      <div>
        <Button type="submit" loading={form.linking} disabled={!form.canSubmit}>
          collega al server
        </Button>
      </div>
    </form>
  );
};
