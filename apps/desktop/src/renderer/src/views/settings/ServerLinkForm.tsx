import { Button, Input } from '@webeep/ui-kit';
import { useId, type ReactNode } from 'react';
import type { ServerLinkForm as ServerLinkFormState } from './useServerLinkForm';

export type ServerLinkFormProps = {
  readonly form: ServerLinkFormState;
};

const EXPIRED_HINT = 'il collegamento non è più valido: collega di nuovo.';

/** Modulo per collegare il server: solo l'indirizzo, poi l'accesso si fa nel browser. */
export const ServerLinkForm = ({ form }: ServerLinkFormProps): ReactNode => {
  const urlId = useId();
  const wasLinked = Boolean(form.status?.serverUrl);

  return (
    <form
      className="flex flex-col gap-3 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (form.canSubmit) form.link();
      }}
    >
      <p className="text-2xs text-muted-foreground">
        si apre il browser per confermare l'accesso con il tuo account.
      </p>
      {wasLinked ? <p className="text-2xs text-muted-foreground">{EXPIRED_HINT}</p> : null}
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
          invalid={form.linkError !== null}
          onChange={(event) => form.setUrl(event.target.value)}
        />
      </div>
      {form.linkError ? <p className="text-2xs text-error-foreground">{form.linkError}</p> : null}
      <div>
        <Button type="submit" disabled={!form.canSubmit}>
          collega al server
        </Button>
      </div>
    </form>
  );
};
