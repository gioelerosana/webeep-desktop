import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Unisce classi condizionali risolvendo i conflitti di Tailwind (l'ultima vince). */
export const cn = (...inputs: readonly ClassValue[]): string => twMerge(clsx(inputs));
