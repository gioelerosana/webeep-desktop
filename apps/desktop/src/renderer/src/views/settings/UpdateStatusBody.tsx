import { Button, Spinner } from '@webeep/ui-kit';
import { ExternalLink, RefreshCw, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UpdateState } from '../../../../shared/ipc';
import type { UpdatesController } from '../../layout/useUpdates';
import { UpdateProgressBar } from './UpdateProgressBar';
import { formatLastCheck } from './formatLastCheck';

export type UpdateActions = Pick<UpdatesController, 'check' | 'install' | 'openRelease'>;

export type UpdateStatusBodyProps = {
  readonly state: UpdateState;
  readonly actions: UpdateActions;
};

/** Testo e azione della sezione Aggiornamenti, uno per stato. */
export const UpdateStatusBody = ({ state, actions }: UpdateStatusBodyProps): ReactNode => {
  if (state.status === 'unsupported') {
    return <p className="text-sm text-muted-foreground">aggiornamenti automatici non disponibili in questa versione</p>;
  }

  if (state.status === 'idle') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm">sei all'ultima versione</p>
          {state.lastCheckedAt ? (
            <p className="text-2xs text-muted-foreground">ultimo controllo: {formatLastCheck(state.lastCheckedAt)}</p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw />} onClick={actions.check}>
          Controlla aggiornamenti
        </Button>
      </div>
    );
  }

  if (state.status === 'checking') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        controllo degli aggiornamenti in corso
      </div>
    );
  }

  // Su Windows il download parte da solo: questo stato dura solo l'istante prima del download.
  if (state.status === 'available' && state.mode === 'install') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        versione {state.version} trovata, download in avvio
      </div>
    );
  }

  if (state.status === 'available') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">versione {state.version} disponibile</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Il controllo serve anche qui: l'utente può riprovare a vedere se è uscita una versione più recente. */}
            <Button variant="outline" size="sm" icon={<RefreshCw />} onClick={actions.check}>
              Controlla aggiornamenti
            </Button>
            <Button size="sm" icon={<ExternalLink />} onClick={actions.openRelease}>
              Apri la pagina della versione
            </Button>
          </div>
        </div>
        <p className="text-2xs text-muted-foreground">
          aggiorna con il tuo gestore di AppImage (AppImageUpdate, Gear Lever) o scarica la nuova AppImage.
        </p>
      </div>
    );
  }

  // Nessun bottone: il download è automatico e si segue qui senza azioni da fare.
  if (state.status === 'downloading') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-2xs text-muted-foreground">download dell'aggiornamento {state.version}, {state.percent}%</p>
        <UpdateProgressBar percent={state.percent} />
      </div>
    );
  }

  // Su Windows l'installazione avviene alla chiusura: "riavvia ora" è solo un'azione in più.
  if (state.status === 'ready') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">aggiornamento {state.version} pronto: verrà installato alla chiusura</p>
        <Button variant="outline" size="sm" icon={<RotateCw />} onClick={actions.install}>
          riavvia ora
        </Button>
      </div>
    );
  }

  // Ultimo stato possibile dopo i controlli sopra: l'errore, con il messaggio già pronto dal main.
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-error-foreground">{state.message}</p>
      <Button variant="outline" size="sm" icon={<RefreshCw />} onClick={actions.check}>
        Riprova
      </Button>
    </div>
  );
};
