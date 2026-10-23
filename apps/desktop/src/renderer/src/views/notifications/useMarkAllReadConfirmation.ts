import { useEffect, useState } from 'react';

/* Quanto resta armata la conferma: dopo, il pulsante torna normale senza che l'utente faccia nulla. */
const CONFIRM_WINDOW_MS = 4000;
const CANCEL_KEY = 'Escape';

export type MarkAllReadConfirmation = {
  readonly isArmed: boolean;
  /** Primo clic arma la conferma; con la conferma armata, il clic esegue l'azione. */
  readonly press: () => void;
  readonly cancel: () => void;
};

/*
 * Conferma in due passi per un'azione che scrive su WeBeep. Esc e il timeout
 * disarmano senza eseguire; i listener esistono solo mentre la conferma è armata.
 */
export const useMarkAllReadConfirmation = (onConfirm: () => void): MarkAllReadConfirmation => {
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    if (!isArmed) return undefined;
    const timer = window.setTimeout(() => setIsArmed(false), CONFIRM_WINDOW_MS);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === CANCEL_KEY) setIsArmed(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isArmed]);

  const press = (): void => {
    if (!isArmed) {
      setIsArmed(true);
      return;
    }
    setIsArmed(false);
    onConfirm();
  };

  return { isArmed, press, cancel: () => setIsArmed(false) };
};
