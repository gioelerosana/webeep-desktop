/*
 * Stato e comandi dei controlli della finestra senza cornice nativa.
 * `enabled` è falso dove la barra non si mostra (web): così non si chiama mai
 * un canale `window:*` che in quella modalità non ha effetto.
 */
import { useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';

export type WindowControlsState = {
  readonly isMaximized: boolean;
  readonly minimize: () => Promise<void>;
  readonly toggleMaximize: () => Promise<void>;
  readonly close: () => Promise<void>;
};

type WindowActionChannel = 'window:minimize' | 'window:toggle-maximize' | 'window:close';

/* Un errore del main non deve restare muto: si vede in console, la finestra resta com'è. */
const runWindowAction = async (channel: WindowActionChannel): Promise<void> => {
  try {
    await invoke(channel);
  } catch (error: unknown) {
    console.error(`Errore sul canale ${channel}:`, error);
  }
};

const minimize = (): Promise<void> => runWindowAction('window:minimize');
const toggleMaximize = (): Promise<void> => runWindowAction('window:toggle-maximize');
const close = (): Promise<void> => runWindowAction('window:close');

export const useWindowControls = (enabled: boolean): WindowControlsState => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    // Se un evento arriva mentre la lettura iniziale è in volo, l'evento è più recente: vince lui.
    let hasReceivedEvent = false;
    const unsubscribe = window.webeep.on('window:maximized-changed', (maximized) => {
      hasReceivedEvent = true;
      setIsMaximized(maximized);
    });

    const readInitialState = async (): Promise<void> => {
      try {
        const maximized = await invoke('window:is-maximized');
        if (!hasReceivedEvent) setIsMaximized(maximized);
      } catch (error: unknown) {
        console.error('Impossibile leggere lo stato della finestra:', error);
      }
    };
    void readInitialState();

    return unsubscribe;
  }, [enabled]);

  return { isMaximized, minimize, toggleMaximize, close };
};
