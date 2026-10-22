/*
 * Quando e come si disegna la barra del titolo, in base a dove gira l'interfaccia.
 * Funzione pura: la barra non chiede nulla al main per decidere se mostrarsi.
 */
import type { WebeepBridge } from '../../../shared/ipc';

export type TitleBarMode = {
  /** Vero solo dove c'è una finestra del desktop (o il bridge finto di sviluppo). */
  readonly isVisible: boolean;
  /** Controlli disegnati dall'app. Su macOS restano i semafori nativi. */
  readonly hasControls: boolean;
  /** Su macOS la barra lascia libera l'area dei semafori a sinistra. */
  readonly isMac: boolean;
};

/* In web la finestra la gestisce il browser: nessuna barra. */
const DESKTOP_KINDS: readonly WebeepBridge['kind'][] = ['electron', 'mock'];
const MAC_PLATFORM = 'darwin';

export const resolveTitleBarMode = (bridge: Pick<WebeepBridge, 'kind' | 'platform'>): TitleBarMode => {
  const isVisible = DESKTOP_KINDS.includes(bridge.kind);
  const isMac = bridge.platform === MAC_PLATFORM;
  return { isVisible, hasControls: isVisible && !isMac, isMac };
};
