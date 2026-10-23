/*
 * Segnalazione di crash in attesa, per l'interfaccia. La lettura parte all'avvio e
 * ogni azione (invio o scarto) rilegge il dato dal main. Nel browser il canale non
 * esiste: la query è disattivata e non c'è nulla da mostrare.
 */
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { CrashReportSummary } from '../../../../shared/ipc';
import { isWebRenderer } from '../../lib/http-bridge';
import { invoke } from '../../lib/ipc';

const crashReportQueryKey = ['crash-report'] as const;

export type CrashReportController = {
  /** Crash in attesa, `null` se non c'è nulla da segnalare o da ignorare. */
  readonly pending: CrashReportSummary | null;
  /** L'ultimo invio o scarto è fallito: l'avviso lo dice in italiano, senza il messaggio tecnico. */
  readonly actionFailed: boolean;
  readonly isReporting: boolean;
  readonly isDismissing: boolean;
  readonly report: () => void;
  readonly dismiss: () => void;
};

const usePendingCrashQuery = (): UseQueryResult<CrashReportSummary | null> =>
  useQuery({
    queryKey: crashReportQueryKey,
    queryFn: () => invoke('crash:get-pending'),
    enabled: !isWebRenderer(),
  });

export const useCrashReport = (): CrashReportController => {
  const queryClient = useQueryClient();
  const pendingQuery = usePendingCrashQuery();

  // La lettura fallita non blocca l'app: il banner non compare, ma l'errore resta visibile in console.
  useEffect(() => {
    if (pendingQuery.error) console.error('Impossibile leggere la segnalazione di crash:', pendingQuery.error);
  }, [pendingQuery.error]);

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: crashReportQueryKey });

  // Il main cancella la segnalazione solo se l'apertura del browser riesce: a fallimento il crash resta in attesa.
  const report = useMutation({
    mutationFn: () => invoke('crash:report'),
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: () => invoke('crash:dismiss'),
    onSuccess: refresh,
  });

  return {
    pending: pendingQuery.data ?? null,
    actionFailed: report.isError || dismiss.isError,
    isReporting: report.isPending,
    isDismissing: dismiss.isPending,
    report: () => report.mutate(),
    dismiss: () => dismiss.mutate(),
  };
};
