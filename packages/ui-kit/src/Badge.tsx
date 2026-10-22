/*
 * Badge: stato, conteggi, etichette brevi. Gli stati sono tinte (8% chiaro,
 * 16% scuro, via `--tint-strength`) dietro il testo `*-foreground`, mai fill
 * pieni. Accompagna sempre il colore con una parola.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'error' | 'info' | 'success' | 'warning';
export type BadgeSize = 'sm' | 'default' | 'lg';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly variant?: BadgeVariant;
  readonly size?: BadgeSize;
};

const VARIANTS: Readonly<Record<BadgeVariant, string>> = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border-input bg-background text-foreground',
  // Classi scritte per intero: Tailwind non vede le stringhe composte a runtime.
  error: 'bg-[color-mix(in_srgb,var(--error)_var(--tint-strength),transparent)] text-error-foreground',
  info: 'bg-[color-mix(in_srgb,var(--info)_var(--tint-strength),transparent)] text-info-foreground',
  success: 'bg-[color-mix(in_srgb,var(--success)_var(--tint-strength),transparent)] text-success-foreground',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_var(--tint-strength),transparent)] text-warning-foreground',
};

const SIZES: Readonly<Record<BadgeSize, string>> = {
  sm: 'h-4 min-w-4 px-[3px] text-3xs',
  default: 'h-[18px] min-w-[18px] px-[3px] text-xs',
  lg: 'h-[22px] min-w-[22px] px-[5px] text-sm',
};

export const Badge = ({ variant = 'default', size = 'default', className, ...rest }: BadgeProps): ReactNode => (
  <span
    className={cn(
      'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-sm border border-transparent font-medium [&_svg]:size-3',
      VARIANTS[variant],
      SIZES[size],
      className,
    )}
    {...rest}
  />
);
