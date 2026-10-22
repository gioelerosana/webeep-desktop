import { Button, cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { isIpcError } from '../../lib/ipc';
import { useLogin } from '../../lib/queries';

/** Messaggio del main quando l'utente chiude la finestra di login: non è un errore. */
const LOGIN_CANCELLED_MESSAGE = 'Login annullato';
const CANCELLED_TEXT = 'Accesso annullato.';
const GENERIC_ERROR_TEXT = 'Accesso non riuscito. Riprova tra poco.';

type LoginFeedback = {
  readonly text: string;
  readonly isError: boolean;
};

/** Traduce l'errore della mutation in un messaggio. Gli errori `unknown` non mostrano il testo tecnico. */
const feedbackOf = (error: Error | null): LoginFeedback | null => {
  if (!error) return null;
  if (isIpcError(error) && error.kind === 'auth' && error.message === LOGIN_CANCELLED_MESSAGE) return { text: CANCELLED_TEXT, isError: false };
  if (isIpcError(error) && error.kind !== 'unknown') return { text: error.message, isError: true };
  return { text: GENERIC_ERROR_TEXT, isError: true };
};

export const LoginView = (): ReactNode => {
  const login = useLogin();
  const feedback = feedbackOf(login.error);

  return (
    <main className="flex h-full flex-col items-center justify-between gap-6 bg-background p-6 text-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="flex max-w-sm flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">WeBeep</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Accedi con il tuo account del Politecnico. Si apre la pagina di login Polimi; le credenziali non passano dall'app.
          </p>
        </div>

        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <Button className="w-full" loading={login.isPending} onClick={() => login.mutate()}>
            Accedi con il Polimi
          </Button>
          {feedback ? (
            <p
              role={feedback.isError ? 'alert' : undefined}
              className={cn('text-sm text-balance', feedback.isError ? 'text-error-foreground' : 'text-muted-foreground')}
            >
              {feedback.text}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-2xs text-muted-foreground">Progetto non ufficiale, non affiliato al Politecnico di Milano.</p>
    </main>
  );
};
