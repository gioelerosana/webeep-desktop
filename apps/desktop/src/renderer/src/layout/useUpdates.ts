/*
 * Stato dell'aggiornamento per l'interfaccia. Come l'auth, il dato sta nella cache
 * di TanStack Query: la lettura iniziale arriva da `updates:get-state`, poi ogni
 * cambio arriva con `updates:state-changed` e sostituisce il dato. Nel browser
 * (modalità web) i canali degli aggiornamenti non esistono: la query è disattivata.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { UpdateState } from '../../../shared/ipc';
import { isWebRenderer } from '../lib/http-bridge';
import { invoke } from '../lib/ipc';

const updatesQueryKey = ['updates'] as const;

export type UpdatesController = {
  /** Stato corrente; `undefined` finché non arriva la prima lettura, e sempre nel browser. */
  readonly state: UpdateState | undefined;
  /** La lettura iniziale è fallita: l'interfaccia lo dice invece di mostrare un caricamento infinito. */
  readonly readFailed: boolean;
  readonly check: () => void;
  /** Avvia il download della versione trovata (Windows): l'utente lo chiede con un clic. */
  readonly download: () => void;
  readonly install: () => void;
  readonly openRelease: () => void;
  /** Messaggio dell'ultima azione andata male, `null` altrimenti. */
  readonly actionError: string | null;
};

const useUpdateStateQuery = (enabled: boolean): UseQueryResult<UpdateState> =>
  useQuery({
    queryKey: updatesQueryKey,
    queryFn: () => invoke('updates:get-state'),
    enabled,
    // Il dato è tenuto aggiornato dagli eventi: non serve rileggerlo al cambio di finestra.
    staleTime: Infinity,
  });

/*
 * Una lettura di `get-state` partita prima dell'evento può arrivare dopo di lui con un valore
 * vecchio. `cancelQueries` la scarta, così il dato resta quello dell'evento, che è più recente.
 */
const applyStateChange = async (queryClient: QueryClient, next: UpdateState): Promise<void> => {
  await queryClient.cancelQueries({ queryKey: updatesQueryKey });
  queryClient.setQueryData(updatesQueryKey, next);
};

const useUpdateStateEvents = (enabled: boolean): void => {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    return window.webeep.on('updates:state-changed', (next) => {
      void applyStateChange(queryClient, next);
    });
  }, [enabled, queryClient]);
};

export const useUpdates = (): UpdatesController => {
  const queryClient = useQueryClient();
  const enabled = !isWebRenderer();
  const stateQuery = useUpdateStateQuery(enabled);
  useUpdateStateEvents(enabled);

  // `checking` arriva subito come risposta; l'esito successivo arriva con l'evento.
  const check = useMutation({
    mutationFn: () => invoke('updates:check'),
    onSuccess: (next) => queryClient.setQueryData(updatesQueryKey, next),
  });
  const download = useMutation({ mutationFn: () => invoke('updates:download') });
  const install = useMutation({ mutationFn: () => invoke('updates:install') });
  const openRelease = useMutation({ mutationFn: () => invoke('updates:open-release') });

  const actionError = [check.error, download.error, install.error, openRelease.error].find((error) => error !== null)?.message ?? null;

  return {
    state: stateQuery.data,
    readFailed: stateQuery.isError,
    check: () => check.mutate(),
    download: () => download.mutate(),
    install: () => install.mutate(),
    openRelease: () => openRelease.mutate(),
    actionError,
  };
};
