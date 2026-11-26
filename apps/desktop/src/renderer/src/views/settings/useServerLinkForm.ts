/*
 * Stato del pannello "Server privato": indirizzo, collega/annulla/scollega.
 * Il renderer manda solo l'indirizzo del server: l'accesso avviene nel browser e il token
 * WeBeep e il deviceToken restano nel main.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { SERVER_LINK_CANCELLED_MESSAGE, type ServerLinkState } from '../../../../shared/ipc';
import { isIpcError } from '../../lib/ipc';
import { useCancelServerLink, useLinkServer, useServerLink, useUnlinkServer } from '../../lib/queries';

const LINK_FAILED_MESSAGE = 'impossibile collegare il server';
const UNLINK_FAILED_MESSAGE = 'impossibile scollegare il server';
/* Il tipo `network` dello scollegamento vuol dire che il server non risponde: l'unico caso in cui si offre di rimuovere solo qui. */
const NETWORK_ERROR_KIND = 'network';

export type ServerLinkForm = {
  readonly query: UseQueryResult<ServerLinkState>;
  readonly status: ServerLinkState | undefined;
  readonly url: string;
  readonly canSubmit: boolean;
  /** Il browser è aperto e il main attende il ritorno dell'accesso. */
  readonly linking: boolean;
  readonly cancelling: boolean;
  readonly unlinking: boolean;
  /** Messaggio in italiano dal main, `null` se non c'è un errore da mostrare (anche se l'utente ha annullato). */
  readonly linkError: string | null;
  readonly unlinkError: string | null;
  /** Lo scollegamento non riesce perché il server non risponde: si può rimuovere la configurazione solo da questo computer. */
  readonly canUnlinkLocally: boolean;
  readonly setUrl: (value: string) => void;
  readonly link: () => void;
  readonly cancelLink: () => void;
  readonly unlink: () => void;
  readonly unlinkLocally: () => void;
};

const messageOf = (error: unknown, fallback: string): string => (isIpcError(error) ? error.message : fallback);

/* Annullare non è un errore: l'interfaccia torna al modulo senza messaggi rossi. */
const linkErrorOf = (error: unknown): string | null => {
  if (!isIpcError(error)) return LINK_FAILED_MESSAGE;
  return error.message === SERVER_LINK_CANCELLED_MESSAGE ? null : error.message;
};

export const useServerLinkForm = (): ServerLinkForm => {
  const query = useServerLink();
  const linkMutation = useLinkServer();
  const cancelMutation = useCancelServerLink();
  const unlinkMutation = useUnlinkServer();
  // Finché l'utente non modifica il campo, l'indirizzo mostrato è quello salvato (se c'è).
  const [draftUrl, setDraftUrl] = useState<string | null>(null);

  const status = query.data;
  const url = draftUrl ?? status?.serverUrl ?? '';
  const canSubmit = url.trim() !== '';
  const unlinkError = unlinkMutation.isError ? messageOf(unlinkMutation.error, UNLINK_FAILED_MESSAGE) : null;
  const canUnlinkLocally =
    unlinkMutation.isError && isIpcError(unlinkMutation.error) && unlinkMutation.error.kind === NETWORK_ERROR_KIND;

  const link = (): void => {
    linkMutation.mutate({ serverUrl: url.trim() });
  };

  const unlink = (): void => {
    unlinkMutation.mutate(false, { onSuccess: () => setDraftUrl('') });
  };

  const unlinkLocally = (): void => {
    unlinkMutation.mutate(true, { onSuccess: () => setDraftUrl('') });
  };

  return {
    query,
    status,
    url,
    canSubmit,
    linking: linkMutation.isPending,
    cancelling: cancelMutation.isPending,
    unlinking: unlinkMutation.isPending,
    linkError: linkMutation.isError ? linkErrorOf(linkMutation.error) : null,
    unlinkError,
    canUnlinkLocally,
    setUrl: setDraftUrl,
    link,
    cancelLink: () => cancelMutation.mutate(),
    unlink,
    unlinkLocally,
  };
};
