import type { SiteInfo } from '@webeep/moodle-api';
import { useAuthState } from '../lib/queries';

/** Utente con cui si è entrati; `undefined` se non c'è una sessione attiva. */
export const useCurrentUser = (): SiteInfo | undefined => {
  const auth = useAuthState();
  return auth.data?.status === 'signed-in' ? auth.data.user : undefined;
};
