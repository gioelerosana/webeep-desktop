/*
 * Bridge finto per sviluppare l'interfaccia nel browser (`pnpm dev`, poi
 * http://localhost:5173), senza Electron né login. Si installa SOLO in dev e
 * SOLO se `window.webeep` manca. Dati e handler stanno in `mock/`; qui c'è solo
 * il ponte verso `window.webeep`.
 *
 * `?mock=signed-out` nell'URL parte dalla schermata di login.
 * `?update=<scenario>` sceglie lo stato iniziale dell'aggiornamento (`idle` se manca).
 * `?mock=crash` parte con una segnalazione di crash in attesa.
 * `?deadlines=none` toglie le scadenze, per vedere la Home senza la sezione.
 */
import type { IpcContract, IpcEventName, IpcEvents, IpcResult, WebeepBridge } from '../../../shared/ipc';
import { handlers, listeners, MockIpcFailure } from './mock/handlers';

const MOCK_LATENCY_MS = 250;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const mockBridge: WebeepBridge = {
  kind: 'mock',
  invoke: async (channel, ...args) => {
    await delay(MOCK_LATENCY_MS);
    // Il mapped type garantisce che ogni handler accetti gli argomenti del proprio canale;
    // TypeScript non riesce a correlare `channel` e `args` attraverso l'indicizzazione.
    const handler = handlers[channel] as (...input: typeof args) => IpcContract[typeof channel]['result'];
    try {
      const result: IpcResult<IpcContract[typeof channel]['result']> = { ok: true, data: handler(...args) };
      return result;
    } catch (error) {
      // Solo gli errori simulati diventano un `IpcFailure`; gli altri sono bug del bridge e si rilanciano.
      if (error instanceof MockIpcFailure) return { ok: false, error: { kind: error.kind, message: error.message } };
      throw error;
    }
  },
  on: <TEvent extends IpcEventName>(event: TEvent, listener: (payload: IpcEvents[TEvent]) => void) => {
    const eventListeners = listeners[event];
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },
  // Nel bridge finto le immagini sono URL pubblici di fixture: nessun token da nascondere.
  assetUrl: (fileUrl) => fileUrl,
  platform: 'linux',
};

export const installMockBridgeIfNeeded = (): void => {
  if (!import.meta.env.DEV || 'webeep' in window) return;
  Object.defineProperty(window, 'webeep', { value: mockBridge });
  console.info('[webeep] Bridge finto attivo: dati inventati, nessuna chiamata a WeBeep.');
};
