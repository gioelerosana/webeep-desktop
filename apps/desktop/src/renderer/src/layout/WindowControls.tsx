/*
 * Tre bottoni tondi per la finestra: riduci a icona, massimizza/ripristina, chiudi.
 * Solo rendering: lo stato e i comandi arrivano da `useWindowControls` via props.
 * Le icone sono SVG a linea scritti a mano (12px, tratto 1.5) per restare nel
 * linguaggio di T3 Code, senza una libreria di icone.
 */
import { cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

export type WindowControlsProps = {
  readonly isMaximized: boolean;
  readonly onMinimize: () => void;
  readonly onToggleMaximize: () => void;
  readonly onClose: () => void;
};

const ICON_STROKE_WIDTH = 1.5;

const ICON_PROPS = {
  viewBox: '0 0 12 12',
  className: 'size-3 shrink-0',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: ICON_STROKE_WIDTH,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const MINIMIZE_ICON = (
  <svg {...ICON_PROPS}>
    <path d="M2 6h8" />
  </svg>
);

const MAXIMIZE_ICON = (
  <svg {...ICON_PROPS}>
    <rect x="2" y="2" width="8" height="8" rx="1" />
  </svg>
);

/* Due quadrati sovrapposti: la finestra è già massimizzata, il comando ripristina. */
const RESTORE_ICON = (
  <svg {...ICON_PROPS}>
    <path d="M4 4V2h6v6H8" />
    <rect x="2" y="4" width="6" height="6" rx="0.5" />
  </svg>
);

const CLOSE_ICON = (
  <svg {...ICON_PROPS}>
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
  </svg>
);

/* `no-drag` su ogni bottone: nella barra trascinabile i click devono arrivare ai controlli. */
const BUTTON_BASE =
  'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-[background-color,color,scale] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [-webkit-app-region:no-drag]';
const NEUTRAL_TONE = 'bg-accent hover:bg-accent-foreground/10 hover:text-foreground';
/* Chiudere è l'unico gesto distruttivo della barra: in hover si tinge di errore. */
const CLOSE_TONE = 'bg-accent hover:bg-error hover:text-white';

export const WindowControls = ({ isMaximized, onMinimize, onToggleMaximize, onClose }: WindowControlsProps): ReactNode => (
  <div className="flex items-center gap-2 pr-2">
    <button type="button" aria-label="Riduci a icona" onClick={onMinimize} className={cn(BUTTON_BASE, NEUTRAL_TONE)}>
      {MINIMIZE_ICON}
    </button>
    <button
      type="button"
      aria-label={isMaximized ? 'Ripristina' : 'Massimizza'}
      onClick={onToggleMaximize}
      className={cn(BUTTON_BASE, NEUTRAL_TONE)}
    >
      {isMaximized ? RESTORE_ICON : MAXIMIZE_ICON}
    </button>
    <button type="button" aria-label="Chiudi" onClick={onClose} className={cn(BUTTON_BASE, CLOSE_TONE)}>
      {CLOSE_ICON}
    </button>
  </div>
);
