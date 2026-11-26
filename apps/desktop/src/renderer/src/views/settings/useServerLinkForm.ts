/*
 * Stato del pannello "Server privato": campi del modulo e azioni di collega/scollega.
 * Il renderer manda solo URL e chiave; token e sessione WeBeep restano nel main.
 * La chiave resta in memoria solo mentre si compila il modulo e si svuota dopo il collegamento.
 */
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { ServerLinkState } from '../../../../shared/ipc';
import { isIpcError } from '../../lib/ipc';
import { useLinkServer, useServerLink, useUnlinkServer } from '../../lib/queries';

const LINK_FAILED_MESSAGE = 'impossibile collegare il server';
const UNLINK_FAILED_MESSAGE = 'impossibile scollegare il server';

export type ServerLinkForm = {
  readonly query: UseQueryResult<ServerLinkState>;
  readonly status: ServerLinkState | undefined;
  readonly url: string;
  readonly pairingKey: string;
  readonly canSubmit: boolean;
  readonly linking: boolean;
  readonly unlinking: boolean;
  /** Messaggio in italiano dal main, `null` se l'ultimo collegamento è riuscito o non è stato tentato. */
  readonly linkError: string | null;
  readonly unlinkError: string | null;
  readonly setUrl: (value: string) => void;
  readonly setPairingKey: (value: string) => void;
  readonly link: () => void;
  readonly unlink: () => void;
};

const messageOf = (error: unknown, fallback: string): string => (isIpcError(error) ? error.message : fallback);

export const useServerLinkForm = (): ServerLinkForm => {
  const query = useServerLink();
  const linkMutation = useLinkServer();
  const unlinkMutation = useUnlinkServer();
  // Finché l'utente non modifica il campo, l'URL mostrato è quello salvato (se c'è).
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [pairingKey, setPairingKey] = useState('');

  const status = query.data;
  const url = draftUrl ?? status?.serverUrl ?? '';
  const canSubmit = url.trim() !== '' && pairingKey.trim() !== '';

  const link = (): void => {
    linkMutation.mutate({ serverUrl: url.trim(), pairingKey }, { onSuccess: () => setPairingKey('') });
  };

  const unlink = (): void => {
    unlinkMutation.mutate(undefined, {
      onSuccess: () => {
        setDraftUrl('');
        setPairingKey('');
      },
    });
  };

  return {
    query,
    status,
    url,
    pairingKey,
    canSubmit,
    linking: linkMutation.isPending,
    unlinking: unlinkMutation.isPending,
    linkError: linkMutation.isError ? messageOf(linkMutation.error, LINK_FAILED_MESSAGE) : null,
    unlinkError: unlinkMutation.isError ? messageOf(unlinkMutation.error, UNLINK_FAILED_MESSAGE) : null,
    setUrl: setDraftUrl,
    setPairingKey,
    link,
    unlink,
  };
};
