/*
 * Errori del client Moodle.
 *
 * Moodle risponde HTTP 200 anche quando fallisce: l'errore arriva nel corpo
 * come `{ exception, errorcode, message }`. Lo trasformiamo in un'eccezione
 * tipizzata, così chi chiama distingue "token scaduto" da "rete giù" senza
 * ispezionare JSON grezzo.
 */

export type MoodleErrorCode = 'invalidtoken' | 'accessexception' | 'servicerequireslogin' | (string & {});

export class MoodleApiError extends Error {
  override readonly name = 'MoodleApiError';

  constructor(
    readonly errorCode: MoodleErrorCode,
    message: string,
    readonly wsfunction: string,
  ) {
    super(message);
  }

  /** Il token non vale più: serve un nuovo login. */
  get isAuthError(): boolean {
    return this.errorCode === 'invalidtoken' || this.errorCode === 'servicerequireslogin';
  }
}

export class MoodleNetworkError extends Error {
  override readonly name = 'MoodleNetworkError';

  constructor(
    message: string,
    readonly status: number | undefined,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class MoodleResponseShapeError extends Error {
  override readonly name = 'MoodleResponseShapeError';

  constructor(
    readonly wsfunction: string,
    readonly issues: string,
  ) {
    super(`Risposta inattesa da ${wsfunction}: ${issues}`);
  }
}
