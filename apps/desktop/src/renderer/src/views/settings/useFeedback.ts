/*
 * Apertura del modulo di segnalazione su GitHub. Il renderer passa solo il tipo
 * (`bug` o `feature`): il main costruisce l'URL, così nessun indirizzo arriva dalla pagina.
 * Come `useUpdates`, la chiamata passa da `invoke`, che lancia `IpcError` in caso di fallimento.
 * Nella modalità web il canale non esiste: la card non chiama `open` in quel caso.
 */
import { useMutation } from '@tanstack/react-query';
import type { FeedbackKind } from '../../../../shared/ipc';
import { invoke } from '../../lib/ipc';

export type FeedbackController = {
  readonly open: (kind: FeedbackKind) => void;
  /** Tipo di segnalazione in apertura, `null` quando non c'è un'apertura in corso. */
  readonly pendingKind: FeedbackKind | null;
  /** L'ultima apertura è fallita: la card lo dice in italiano, senza il messaggio tecnico. */
  readonly failed: boolean;
};

export const useFeedback = (): FeedbackController => {
  const openFeedback = useMutation({
    mutationFn: (kind: FeedbackKind) => invoke('feedback:open', kind),
  });

  return {
    open: (kind) => openFeedback.mutate(kind),
    pendingKind: openFeedback.isPending ? (openFeedback.variables ?? null) : null,
    failed: openFeedback.isError,
  };
};
