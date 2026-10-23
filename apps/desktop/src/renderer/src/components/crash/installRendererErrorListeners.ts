/*
 * Listener globali del renderer: gli errori che nessun componente gestisce finiscono
 * qui. Va chiamato una volta sola, all'avvio (`main.tsx`).
 */
import { recordRendererError } from './rendererErrors';

export const installRendererErrorListeners = (): void => {
  // `event.error` è `null` per gli script di altre origini: in quel caso resta il messaggio.
  window.addEventListener('error', (event: ErrorEvent) => recordRendererError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => recordRendererError(event.reason));
};
