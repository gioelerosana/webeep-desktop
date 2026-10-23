/*
 * Listener globali del renderer: gli errori che nessun componente gestisce finiscono
 * qui. Va chiamato una volta sola, all'avvio (`main.tsx`).
 */
import { recordRendererError } from './rendererErrors';

/*
 * Avvisi che il browser riporta come errori ma che non rompono nulla. Si filtrano prima
 * di registrare: altrimenti userebbero la registrazione unica della sessione. Il testo
 * cambia tra browser e versioni, quindi si confronta l'inizio del messaggio.
 */
const BENIGN_MESSAGE_PREFIXES: readonly string[] = [
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded',
];

const isBenignMessage = (message: string): boolean =>
  BENIGN_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix));

export const installRendererErrorListeners = (): void => {
  window.addEventListener('error', (event: ErrorEvent) => {
    if (isBenignMessage(event.message)) return;
    // `event.error` è `null` per gli script di altre origini: in quel caso resta il messaggio.
    recordRendererError(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => recordRendererError(event.reason));
};
