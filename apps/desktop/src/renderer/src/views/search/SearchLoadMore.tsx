import { Button } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

export type SearchLoadMoreProps = {
  readonly loadedCount: number;
  readonly total: number;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly onLoadMore: () => void;
};

/** Fondo dell'elenco: quanti corsi sono caricati e il bottone per la pagina successiva. */
export const SearchLoadMore = ({ loadedCount, total, isFetching, isError, onLoadMore }: SearchLoadMoreProps): ReactNode => (
  <div className="flex flex-col items-center gap-2 px-4 py-3">
    <p className="text-2xs text-muted-foreground">
      {isError ? 'Impossibile caricare altri corsi' : `Mostrati ${loadedCount} di ${total}`}
    </p>
    <Button variant="outline" size="sm" loading={isFetching} onClick={onLoadMore}>
      {isError ? 'Riprova' : 'Carica altri'}
    </Button>
  </div>
);
