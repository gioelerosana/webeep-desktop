/*
 * Storage dello stato: vede solo byte già cifrati (docs/SERVER.md §1). La cifratura
 * sta nel nucleo (`codec.ts`), quindi un altro adattatore sostituisce solo questo file.
 */
export type StateStore = {
  /** Byte dello stato cifrato, oppure null se lo stato non è ancora mai stato scritto. */
  readonly get: () => Promise<Uint8Array | null>;
  /** Sostituisce lo stato cifrato in modo atomico: se fallisce, resta il valore precedente. */
  readonly put: (bytes: Uint8Array) => Promise<void>;
};
