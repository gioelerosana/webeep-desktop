import type { UpdateState } from '../../../shared/ipc';

/** Azione dell'avviso: `download` scarica la versione, `install` riavvia e aggiorna, `open-release` apre la pagina della versione. */
export type UpdateNoticeAction = 'download' | 'install' | 'open-release';

/** Titolo breve più una riga di dettaglio: nella sidebar il testo va a capo, non si tronca. */
export type UpdateNotice = {
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly action: UpdateNoticeAction;
};

/**
 * Cosa dire in sidebar, se c'è qualcosa da fare. Solo tre stati meritano un avviso:
 * una versione da scaricare (Windows), una pronta da installare e una che su Linux va
 * scaricata a mano. Il resto (controllo in corso, download in corso, errori) sta nelle Impostazioni.
 */
export const selectUpdateNotice = (state: UpdateState): UpdateNotice | null => {
  if (state.status === 'ready') {
    return {
      title: 'aggiornamento pronto',
      detail: `versione ${state.version}: riavvia per aggiornare`,
      actionLabel: 'Riavvia e aggiorna',
      action: 'install',
    };
  }
  if (state.status === 'available' && state.mode === 'install') {
    return {
      title: 'nuova versione',
      detail: `versione ${state.version} disponibile`,
      actionLabel: 'Scarica aggiornamento',
      action: 'download',
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
