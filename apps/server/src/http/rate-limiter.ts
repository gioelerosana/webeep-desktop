/*
 * Rate limiter in memoria, riutilizzabile. Conta i fallimenti per chiave (di solito l'IP).
 *
 * La finestra si apre al primo fallimento e dura `windowMs`; alla sua scadenza il
 * contatore torna a zero. Oltre `max` fallimenti nella finestra la chiave è bloccata.
 * I contatori stanno in memoria: un riavvio li azzera (docs/SERVER.md §9).
 */

export type RateLimiterOptions = {
  readonly windowMs: number;
  /** Fallimenti ammessi nella finestra: alla soglia successiva la chiave è bloccata. */
  readonly max: number;
  /** Orologio, sostituibile nei test. Default: `Date.now`. */
  readonly now?: () => number;
};

export type RateLimiter = {
  /** true se la chiave ha già raggiunto `max` fallimenti nella finestra corrente. */
  readonly isLimited: (key: string) => boolean;
  /** Conta un fallimento per la chiave. */
  readonly recordFailure: (key: string) => void;
};

type FailureWindow = {
  count: number;
  readonly startedAt: number;
};

export const createRateLimiter = (options: RateLimiterOptions): RateLimiter => {
  const now = options.now ?? Date.now;
  const windows = new Map<string, FailureWindow>();

  const isExpired = (window: FailureWindow, instant: number): boolean => instant - window.startedAt >= options.windowMs;

  // Restituisce la finestra attiva della chiave; quella scaduta viene rimossa.
  const activeWindow = (key: string): FailureWindow | undefined => {
    const window = windows.get(key);
    if (window === undefined) return undefined;
    if (isExpired(window, now())) {
      windows.delete(key);
      return undefined;
    }
    return window;
  };

  return {
    isLimited: (key) => (activeWindow(key)?.count ?? 0) >= options.max,
    recordFailure: (key) => {
      const instant = now();
      // Le finestre scadute di altre chiavi si tolgono qui, così la mappa non cresce senza fine.
      windows.forEach((window, otherKey) => {
        if (isExpired(window, instant)) windows.delete(otherKey);
      });
      const window = activeWindow(key);
      if (window === undefined) {
        windows.set(key, { count: 1, startedAt: instant });
      } else {
        window.count += 1;
      }
    },
  };
};
