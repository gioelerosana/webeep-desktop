/*
 * Cifratura dello stato con AES-256-GCM via `crypto.subtle` (docs/SERVER.md §3.1).
 * Formato su disco: `iv (12 byte) || ciphertext+tag`, con un iv casuale a ogni scrittura.
 */
import { stateSchema, type WebeepState } from './schema.js';

const AES_ALGORITHM = 'AES-GCM';
const IV_BYTES = 12;
// Tag GCM: 128 bit, appeso al ciphertext da `crypto.subtle`.
const TAG_BYTES = 16;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// Messaggio fisso: nessun dettaglio tecnico e nessun valore nella risposta d'errore.
export class StateUnreadableError extends Error {
  override readonly name = 'StateUnreadableError';

  constructor() {
    super('state.bin non leggibile: controlla WEBEEP_SECRET_KEY');
  }
}

export const importStateKey = (secretKey: Uint8Array<ArrayBuffer>): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', secretKey, { name: AES_ALGORITHM }, false, ['encrypt', 'decrypt']);

const concatBytes = (first: Uint8Array, second: Uint8Array): Uint8Array => {
  const joined = new Uint8Array(first.byteLength + second.byteLength);
  joined.set(first, 0);
  joined.set(second, first.byteLength);
  return joined;
};

export const encryptState = async (key: CryptoKey, state: WebeepState): Promise<Uint8Array> => {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = encoder.encode(JSON.stringify(state));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: AES_ALGORITHM, iv }, key, plaintext));
  return concatBytes(iv, ciphertext);
};

/** Decifra e valida lo stato. Chiave errata, file corrotto o schema non valido: `StateUnreadableError`. */
export const decryptState = async (key: CryptoKey, bytes: Uint8Array): Promise<WebeepState> => {
  if (bytes.byteLength <= IV_BYTES + TAG_BYTES) throw new StateUnreadableError();

  // Copie con buffer `ArrayBuffer` esplicito, che `crypto.subtle` accetta.
  const iv = Uint8Array.from(bytes.subarray(0, IV_BYTES));
  const body = Uint8Array.from(bytes.subarray(IV_BYTES));

  const plaintext = await decryptBody(key, iv, body);
  const json = parseJson(plaintext);
  const parsed = stateSchema.safeParse(json);
  if (!parsed.success) throw new StateUnreadableError();
  return parsed.data;
};

// Il fallimento di GCM (chiave o dati sbagliati) diventa l'errore dello stato illeggibile.
const decryptBody = async (
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  body: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> => {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: AES_ALGORITHM, iv }, key, body));
  } catch {
    throw new StateUnreadableError();
  }
};

const parseJson = (plaintext: Uint8Array): unknown => {
  try {
    const text = decoder.decode(plaintext);
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    throw new StateUnreadableError();
  }
};
