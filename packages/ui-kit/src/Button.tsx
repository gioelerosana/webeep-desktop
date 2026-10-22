/*
 * Bottone del design system T3 Code.
 *
 * Una tabella di varianti invece di classi sparse: `default` (blu pieno) è
 * l'unica azione "fai ora" della vista, `outline` le secondarie, `ghost` le
 * toolbar e la sidebar, `destructive` solo per azioni irreversibili. Il
 * padding è il passo meno 1px di bordo, così tutte le varianti hanno la stessa
 * altezza.
 */
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from './cn.js';
import { Spinner } from './Spinner.js';

export type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'ghost-muted' | 'destructive' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'default' | 'lg' | 'icon-xs' | 'icon-sm' | 'icon';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Icona Lucide prima della label. */
  readonly icon?: ReactNode;
  /** Mostra uno spinner al posto dell'icona e disabilita il bottone. */
  readonly loading?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
};

const BASE =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent font-medium outline-none transition-[box-shadow,scale,background-color] duration-150 active:scale-[0.97] focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] disabled:pointer-events-none disabled:opacity-[var(--opacity-disabled)] [&_svg]:size-4 [&_svg]:shrink-0';

const VARIANTS: Readonly<Record<ButtonVariant, string>> = {
  default:
    'border-primary bg-primary text-primary-foreground shadow-[var(--inset-shadow-control-highlight),0_1px_2px_color-mix(in_srgb,var(--primary)_24%,transparent)] hover:bg-primary/90',
  outline:
    'border-input bg-[var(--outline-surface)] text-foreground shadow-xs hover:bg-accent [&_svg]:text-muted-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
  ghost: 'bg-transparent text-foreground hover:bg-accent [&_svg]:text-muted-foreground',
  'ghost-muted': 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
  destructive: 'border-error bg-error text-white shadow-[var(--inset-shadow-control-highlight)] hover:bg-error/90',
  link: 'h-auto border-0 px-0 text-primary underline-offset-4 hover:underline',
};

const SIZES: Readonly<Record<ButtonSize, string>> = {
  xs: 'h-6 gap-1 px-[7px] text-xs',
  sm: 'h-7 gap-1.5 px-[9px] text-sm',
  default: 'h-8 px-[11px] text-sm',
  lg: 'h-9 px-[13px] text-sm',
  'icon-xs': 'size-6 p-0',
  'icon-sm': 'size-7 p-0',
  icon: 'size-8 p-0',
};

export const Button = ({
  variant = 'default',
  size = 'default',
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps): ReactNode => (
  <button
    type={type}
    disabled={disabled || loading}
    className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
    {...rest}
  >
    {loading ? <Spinner /> : icon}
    {children}
  </button>
);
