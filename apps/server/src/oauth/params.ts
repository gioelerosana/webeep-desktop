/*
 * Lettura dei parametri delle richieste OAuth (query string per GET, form per POST).
 * Un parametro ripetuto è sempre un errore: non si sceglie quello "giusto".
 */
import { PKCE_VALUE_PATTERN } from './constants.js';

/** Valore del parametro, o undefined se assente o ripetuto. */
export const singleValue = (params: URLSearchParams, name: string): string | undefined => {
  const values = params.getAll(name);
  return values.length === 1 ? values[0] : undefined;
};

export const isRepeated = (params: URLSearchParams, name: string): boolean => params.getAll(name).length > 1;

/** Vero se `value` è un code_verifier o un code_challenge con lunghezza e alfabeto della RFC 7636. */
export const isPkceValue = (value: string): boolean => PKCE_VALUE_PATTERN.test(value);

/** Corpo JSON come valore sconosciuto; null se non è JSON valido (la validazione decide l'errore). */
export const readJsonBody = async (request: Request): Promise<unknown> => {
  try {
    const value: unknown = await request.json();
    return value;
  } catch {
    // Un corpo non JSON non è un errore del server: diventa un errore di validazione del chiamante.
    return null;
  }
};
