/*
 * Errori del filesystem che il codice tratta come "file assente".
 *
 * `ENOENT` arriva da `readFile`/`readFileSync` quando il file non c'è: per la
 * sessione e per il crash report è lo stato normale al primo avvio, non un
 * errore da propagare.
 */
const MISSING_FILE_CODE = 'ENOENT';

export const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === MISSING_FILE_CODE;
