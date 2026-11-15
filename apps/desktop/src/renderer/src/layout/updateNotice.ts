import type { UpdateState } from '../../../shared/ipc';

/** Azione dell'avviso: `install` riavvia e aggiorna, `open-release` apre la pagina della versione. */
export type UpdateNoticeAction = 'install' | 'open-release';

/** Titolo breve più una riga di dettaglio: nella sidebar il testo va a capo, non si tronca. */
export type UpdateNotice = {
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly action: UpdateNoticeAction;
};

/**
 * Cosa dire in sidebar, se c'è qualcosa da fare. Su Windows il download parte da solo, quindi
 * l'unico avviso è quello di una versione pronta, da installare alla chiusura (con "riavvia ora"
 * come azione secondaria). Su Linux resta l'avviso per la versione da scaricare a mano.
 * Il resto (controllo, download in corso, errori) sta nelle Impostazioni.
 */
export const selectUpdateNotice = (state: UpdateState): UpdateNotice | null => {
  if (state.status === 'ready') {
    return {
      title: `aggiornamento ${state.version} pronto`,
      detail: 'verrà installato alla chiusura',
      actionLabel: 'riavvia ora',
      action: 'install',
    };
  }
  if (state.status === 'available' && state.mode === 'manual') {
    return {
      title: 'nuova versione',
      detail: `versione ${state.version} disponibile`,
      actionLabel: 'Apri la pagina della versione',
      action: 'open-release',
    };
  }
  return null;
};
