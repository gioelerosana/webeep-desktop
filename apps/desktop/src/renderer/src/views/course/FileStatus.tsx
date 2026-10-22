import { Badge, Button } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { isWebRenderer } from '../../lib/http-bridge';
import type { FileActionState } from './useCourseFileActions';

export type FileStatusProps = {
  readonly state: FileActionState | undefined;
  /** Presente solo dove ha senso mostrare il file scaricato. */
  readonly onReveal?: () => void;
};

/** Esito di un'azione su una riga. Durante l'operazione non mostra nulla: ci pensa lo spinner del bottone. */
export const FileStatus = ({ state, onReveal }: FileStatusProps): ReactNode => {
  if (state?.status === 'downloaded') {
    // In modalità web il file è finito nel browser di chi guarda, non nel computer che serve la pagina: niente "Mostra".
    const canReveal = onReveal !== undefined && !isWebRenderer();
    return (
      <span className="flex shrink-0 items-center gap-1">
        <Badge variant="success" size="sm">
          Scaricato
        </Badge>
        {canReveal ? (
          <Button variant="link" size="xs" onClick={onReveal}>
            Mostra
          </Button>
        ) : null}
      </span>
    );
  }
  if (state?.status === 'up-to-date') {
    return (
      <Badge variant="secondary" size="sm" className="shrink-0">
        Già aggiornato
      </Badge>
    );
  }
  if (state?.status === 'failed') {
    return (
      <Badge variant="error" size="sm" className="shrink-0" title={state.message}>
        Errore
      </Badge>
    );
  }
  return null;
};
