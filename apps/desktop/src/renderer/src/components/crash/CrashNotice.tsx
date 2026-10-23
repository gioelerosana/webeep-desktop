/*
 * Avviso in cima all'app quando all'avvio c'è un crash da segnalare. L'invio apre il
 * browser con l'issue già compilata: la invia l'utente, non l'app.
 */
import { Button } from '@webeep/ui-kit';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { CRASH_KIND_LABELS, formatOccurredAt } from './crashText';
import { useCrashReport } from './useCrashReport';

export const CrashNotice = (): ReactNode => {
  const crash = useCrashReport();
  if (!crash.pending) return null;

  return (
    <section
      role="alert"
      className="flex flex-col gap-3 border-b bg-error/(--tint-strength) px-4 py-3 md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">webeep desktop si è chiuso in modo inatteso</p>
        <p className="text-2xs text-muted-foreground">
          {CRASH_KIND_LABELS[crash.pending.kind]} · {formatOccurredAt(crash.pending.occurredAt)}
        </p>
        <p className="break-words font-mono text-2xs">{crash.pending.message}</p>
        <p className="text-2xs text-muted-foreground">
          Il report non contiene il tuo token di accesso e oscura la cartella personale. Si apre il browser: controlla il
          testo e invialo tu da GitHub.
        </p>
        {crash.actionFailed ? (
          <p className="text-2xs text-error-foreground">impossibile completare l'operazione, riprova</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          icon={<ExternalLink />}
          loading={crash.isReporting}
          disabled={crash.isDismissing}
          onClick={crash.report}
        >
          segnala su github
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={crash.isDismissing}
          disabled={crash.isReporting}
          onClick={crash.dismiss}
        >
          ignora
        </Button>
      </div>
    </section>
  );
};
