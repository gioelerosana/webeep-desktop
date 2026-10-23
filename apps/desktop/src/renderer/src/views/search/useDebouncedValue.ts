import { useEffect, useState } from 'react';

/*
 * Restituisce `value` solo quando smette di cambiare per `delayMs`: così una
 * ricerca parte dopo la pausa di digitazione e non a ogni tasto.
 */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
};
