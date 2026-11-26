/*
 * Testi degli errori dei tool (docs/SERVER.md §6.3). Sono testi fissi, in italiano: nessun
 * messaggio grezzo di Moodle, di rete o di sistema arriva al modello.
 */
import { MoodleApiError, MoodleNetworkError, MoodleResponseShapeError } from '@webeep/moodle-api';

export const NOT_CONNECTED_TEXT = "server non collegato a WeBeep: collega dall'app desktop";
export const SESSION_EXPIRED_TEXT = "sessione WeBeep scaduta: collega di nuovo dall'app desktop";
export const UNREACHABLE_TEXT = 'WeBeep non raggiungibile, riprova più tardi';
export const UNEXPECTED_RESPONSE_TEXT = 'WeBeep ha risposto in modo inatteso';
export const UNEXPECTED_TEXT = 'errore interno del server, riprova più tardi';
export const INVALID_FILE_URL_TEXT = 'URL non valido: sono accettati solo file di WeBeep (pluginfile.php)';
export const FILE_TOO_LARGE_TEXT = 'file troppo grande (massimo 10 MB)';
export const REDIRECT_OUT_OF_WEBEEP_TEXT = 'WeBeep ha reindirizzato il file fuori dal sito: operazione annullata';
export const NOT_A_PAGE_TEXT = 'il modulo indicato non è una pagina';
export const PAGE_NOT_FOUND_TEXT = 'pagina non trovata';
export const INVALID_PARAMS_PREFIX = 'parametri non validi: ';

/** Errore atteso di un tool: il testo è già pronto per il modello. */
export class ToolFailure extends Error {
  override readonly name = 'ToolFailure';

  constructor(text: string) {
    super(text);
  }
}

export type FailureDescription = {
  readonly text: string;
  /** Il token WeBeep non vale più: la sessione va cancellata come in `DELETE /pair`. */
  readonly clearSession: boolean;
  /** Errore non previsto: si registra solo il nome della classe, mai il messaggio. */
  readonly unexpected: boolean;
};

const moodleErrorText = (errorCode: string): string => `WeBeep ha risposto con un errore (codice ${errorCode})`;

/** Traduce un errore in testo per il modello, senza dettagli tecnici. */
export const describeError = (error: unknown): FailureDescription => {
  if (error instanceof ToolFailure) return { text: error.message, clearSession: false, unexpected: false };
  if (error instanceof MoodleApiError) {
    if (error.isAuthError) return { text: SESSION_EXPIRED_TEXT, clearSession: true, unexpected: false };
    return { text: moodleErrorText(error.errorCode), clearSession: false, unexpected: false };
  }
  if (error instanceof MoodleNetworkError) return { text: UNREACHABLE_TEXT, clearSession: false, unexpected: false };
  if (error instanceof MoodleResponseShapeError) {
    return { text: UNEXPECTED_RESPONSE_TEXT, clearSession: false, unexpected: false };
  }
  return { text: UNEXPECTED_TEXT, clearSession: false, unexpected: true };
};
