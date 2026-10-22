/*
 * Barra del titolo a 36px disegnata dall'app: la finestra principale non ha la
 * cornice nativa. L'area trascinabile occupa tutto tranne i controlli; il
 * doppio click la massimizza o ripristina.
 */
import { cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { resolveTitleBarMode } from './titleBarMode';
import { useWindowControls } from './useWindowControls';
import { WindowControls } from './WindowControls';

const APP_NAME = 'WeBeep';
/* 80px a sinistra su macOS: lo spazio dei semafori nativi, che l'app non disegna. */
const MAC_LEFT_PADDING = 'pl-20';
const DEFAULT_LEFT_PADDING = 'pl-3';

export const TitleBar = (): ReactNode => {
  const mode = resolveTitleBarMode(window.webeep);
  const controls = useWindowControls(mode.isVisible);
  if (!mode.isVisible) return null;

  return (
    <header className="flex h-9 shrink-0 items-center border-b bg-sidebar">
      <div
        className={cn(
          'flex h-full min-w-0 flex-1 items-center text-xs font-medium text-muted-foreground select-none [-webkit-app-region:drag]',
          mode.isMac ? MAC_LEFT_PADDING : DEFAULT_LEFT_PADDING,
        )}
        onDoubleClick={() => void controls.toggleMaximize()}
      >
        {APP_NAME}
      </div>
      {mode.hasControls ? (
        <WindowControls
          isMaximized={controls.isMaximized}
          onMinimize={() => void controls.minimize()}
          onToggleMaximize={() => void controls.toggleMaximize()}
          onClose={() => void controls.close()}
        />
      ) : null}
    </header>
  );
};
