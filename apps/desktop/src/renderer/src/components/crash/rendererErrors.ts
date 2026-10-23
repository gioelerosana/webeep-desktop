/*
 * Errori del renderer verso il main (`crash:record-renderer-error`). Il main valida
 * la lunghezza e rifiuta l'intera segnalazione se è troppo lunga: qui si tronca prima,
 * con gli stessi limiti di `main/crash-report.ts`, così un errore lungo non si perde.
 */
import type { CrashRendererErrorReport } from '../../../../shared/ipc';
import { isWebRenderer } from '../../lib/http-bridge';
import { invoke } from '../../lib/ipc';

const MAX_RENDERER_MESSAGE_LENGTH = 2000;
const MAX_RENDERER_STACK_LENGTH = 20000;
const UNKNOWN_MESSAGE = 'errore sconosciuto';

/* Si taglia per caratteri, non per unità di codice: come nel main, un taglio tra due surrogati rovina il testo. */
const truncate = (text: string, maxLength: number): string => {
  const characters = Array.from(text);
  return characters.length > maxLength ? characters.slice(0, maxLength).join('') : text;
};

export const toRendererErrorReport = (value: unknown): CrashRendererErrorReport => {
  const message = value instanceof Error ? value.message : String(value);
  const stack = value instanceof Error ? value.stack : undefined;
  return {
    message: truncate(message || UNKNOWN_MESSAGE, MAX_RENDERER_MESSAGE_LENGTH),
    stack: stack === undefined ? undefined : truncate(stack, MAX_RENDERER_STACK_LENGTH),
  };
};

/*
 * Una sola registrazione per sessione, e il flag si imposta PRIMA della chiamata:
 * se l'invio fallisce, l'errore che ne deriva (anche una promessa non gestita)
 * non riapre la registrazione e non crea un ciclo.
 */
let recordedThisSession = false;

/* Chi mostra i crash (il banner) si aggiorna solo dopo un invio riuscito: `main.tsx` lo registra con il query client. */
let onRecorded: (() => void) | null = null;

export const setOnRendererErrorRecorded = (listener: () => void): void => {
  onRecorded = listener;
};

const sendReport = async (report: CrashRendererErrorReport): Promise<void> => {
  try {
    await invoke('crash:record-renderer-error', report);
  } catch (error: unknown) {
    console.error("Impossibile registrare l'errore dell'interfaccia:", error);
    return;
  }
  onRecorded?.();
};

/** Registra un errore del renderer come crash in attesa. Nel browser non si fa: il canale non c'è. */
export const recordRendererError = (value: unknown): void => {
  if (recordedThisSession || isWebRenderer()) return;
  recordedThisSession = true;
  void sendReport(toRendererErrorReport(value));
};
