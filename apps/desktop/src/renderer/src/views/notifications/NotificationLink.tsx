/*
 * Link dentro il corpo di una notifica: un bottone, mai `<a href>`, che apre l'URL
 * nel browser del sistema. `openExternal` valida l'URL nel main (solo http/https).
 */
import type { ReactNode } from 'react';
import { openExternal } from '../../lib/queries';

export type NotificationLinkProps = {
  /** URL già assoluto e http(s), come lo passa `<RichHtml>`. */
  readonly href: string;
  readonly children: ReactNode;
};

const LINK_CLASS =
  'rounded-sm text-primary underline underline-offset-2 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring';

export const NotificationLink = ({ href, children }: NotificationLinkProps): ReactNode => {
  // Il browser si apre fuori dall'app: se il main rifiuta, l'errore finisce in console e la vista non cambia.
  const open = (): void => {
    void openExternal(href).catch((error: unknown) => console.error('Impossibile aprire il link della notifica', error));
  };

  return (
    <button type="button" onClick={open} className={LINK_CLASS}>
      {children}
    </button>
  );
};
