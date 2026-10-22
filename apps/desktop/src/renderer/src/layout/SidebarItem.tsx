import { cn } from '@webeep/ui-kit';
import type { ReactNode } from 'react';

export type SidebarItemProps = {
  readonly label: string;
  readonly icon?: ReactNode;
  /** Testo completo, mostrato al passaggio del mouse quando `label` è troncato. */
  readonly title?: string;
  /** Elemento a destra dell'etichetta, es. il conteggio delle notifiche. */
  readonly trailing?: ReactNode;
  readonly active: boolean;
  readonly onSelect: () => void;
};

/** Riga di navigazione della sidebar: bottone a tutta larghezza, alto 32px. */
export const SidebarItem = ({ label, icon, title, trailing, active, onSelect }: SidebarItemProps): ReactNode => (
  <button
    type="button"
    title={title}
    aria-current={active ? 'page' : undefined}
    onClick={onSelect}
    className={cn(
      'flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-control px-2 text-left text-sm outline-none transition-[background-color,scale] duration-150 focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0',
      active ? 'bg-sidebar-row-active text-foreground' : 'text-muted-foreground hover:bg-accent',
    )}
  >
    {icon}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {trailing}
  </button>
);
