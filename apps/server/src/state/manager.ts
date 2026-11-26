/*
 * Accesso allo stato: una cache in memoria, cifratura e scritture in fila.
 *
 * Ogni modifica passa da `update`, che parte solo quando la precedente è finita:
 * le scritture avvengono una alla volta, nell'ordine di arrivo. Se la scrittura su
 * disco fallisce, la cache non cambia e l'errore arriva a chi ha chiamato.
 */
import { decryptState, encryptState, importStateKey } from './codec.js';
import { initialState, type WebeepState } from './schema.js';
import type { StateStore } from './store.js';

export type StateManager = {
  /** Stato corrente (da non mutare). Al primo uso decifra lo stato su disco. */
  readonly read: () => Promise<WebeepState>;
  /** Applica `mutate` allo stato, lo salva cifrato e restituisce il nuovo stato. */
  readonly update: (mutate: (state: WebeepState) => WebeepState) => Promise<WebeepState>;
};

export type StateManagerOptions = {
  readonly store: StateStore;
  /** Chiave AES-256 di 32 byte, da `WEBEEP_SECRET_KEY`. */
  readonly secretKey: Uint8Array<ArrayBuffer>;
};

export const createStateManager = async (options: StateManagerOptions): Promise<StateManager> => {
  const key = await importStateKey(options.secretKey);
  let current: WebeepState | null = null;
  // Coda delle operazioni: ogni operazione parte dopo la precedente.
  let tail: Promise<void> = Promise.resolve();

  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const result = (async (): Promise<T> => {
      await tail;
      return task();
    })();
    // La coda non deve interrompersi se un'operazione fallisce: l'errore resta a chi ha chiamato.
    tail = (async (): Promise<void> => {
      try {
        await result;
      } catch {
        // Errore già restituito al chiamante tramite `result`.
      }
    })();
    return result;
  };

  const load = async (): Promise<WebeepState> => {
    if (current !== null) return current;
    const bytes = await options.store.get();
    current = bytes === null ? initialState() : await decryptState(key, bytes);
    return current;
  };

  return {
    read: () => serialize(load),
    update: (mutate) =>
      serialize(async () => {
        const before = await load();
        const next = mutate(before);
        await options.store.put(await encryptState(key, next));
        current = next;
        return next;
      }),
  };
};
