/*
 * Campo di testo: wrapper con bordo `input`, raggio 10px, focus con bordo
 * `ring` più anello interno al 24%. `leading` ospita un'icona (es. ricerca).
 */
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from './cn.js';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  readonly leading?: ReactNode;
  readonly mono?: boolean;
  readonly invalid?: boolean;
  readonly wrapperClassName?: string;
  readonly ref?: Ref<HTMLInputElement>;
};

export const Input = ({ leading, mono = false, invalid = false, wrapperClassName, className, ...rest }: InputProps): ReactNode => (
  <div
    aria-invalid={invalid || undefined}
    className={cn(
      'relative inline-flex w-full items-center rounded-lg border border-input bg-[var(--input-surface)] shadow-xs transition-shadow duration-150',
      'focus-within:border-ring focus-within:shadow-[inset_0_0_0_3px_color-mix(in_srgb,var(--ring)_24%,transparent)]',
      invalid && 'border-error/36',
      wrapperClassName,
    )}
  >
    {leading ? <span className="pl-2.5 text-muted-foreground [&_svg]:size-4">{leading}</span> : null}
    <input
      className={cn(
        'h-[30px] w-full min-w-0 rounded-[inherit] border-0 bg-transparent px-[11px] text-sm text-foreground outline-none placeholder:text-muted-foreground',
        mono && 'font-mono tabular-nums',
        leading ? 'pl-2' : undefined,
        className,
      )}
      {...rest}
    />
  </div>
);
