/*
 * Errori interni del modulo OIDC. Non portano dettagli: il messaggio non va mai nelle
 * risposte né nei log, perché può contenere URL o dati dell'utente.
 */

/** Authentik non risponde, risponde in modo non valido o la discovery non combacia: 503. */
export class OidcUnavailableError extends Error {
  override readonly name = 'OidcUnavailableError';

  constructor() {
    super('servizio di accesso non disponibile');
  }
}

/** Authentik rifiuta lo scambio o la risposta non è conforme: pagina 400 "accesso non completato". */
export class OidcRejectedError extends Error {
  override readonly name = 'OidcRejectedError';

  constructor() {
    super('accesso non completato');
  }
}

/** Nessun gestore registrato per il purpose del login: errore di avvio del server, non dell'utente. */
export class OidcContinuationMissingError extends Error {
  override readonly name = 'OidcContinuationMissingError';

  constructor() {
    super('continuazione OIDC non registrata');
  }
}
