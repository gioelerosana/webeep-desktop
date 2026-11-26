/*
 * Primitive crittografiche del nucleo. Usano solo Web API (`crypto.subtle`,
 * `crypto.getRandomValues`, `TextEncoder`): niente `node:crypto`, così il nucleo
 * resta portabile (docs/SERVER.md §1 e §4.1).
 */

const HEX_RADIX = 16;
const HEX_PAD_LENGTH = 2;
const HEX_PAD_CHAR = '0';
const DEFAULT_RANDOM_BYTES = 32;
const encoder = new TextEncoder();

export const sha256 = async (input: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));

export const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(HEX_RADIX).padStart(HEX_PAD_LENGTH, HEX_PAD_CHAR)).join('');

/** SHA-256 in esadecimale minuscolo: formato degli hash salvati nello stato. */
export const sha256Hex = async (input: string): Promise<string> => toHex(await sha256(input));

/** base64url senza padding (RFC 4648 §5), come richiesto da PKCE e dai token. */
export const toBase64Url = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

export const randomBase64Url = (byteLength: number = DEFAULT_RANDOM_BYTES): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));

/**
 * Confronto a tempo costante: la differenza dei byte si accumula senza uscite anticipate.
 * Si usa sui digest (lunghezza fissa), mai sui valori in chiaro.
 */
export const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.byteLength !== right.byteLength) return false;
  const difference = left.reduce((accumulated, byte, index) => accumulated | (byte ^ (right[index] ?? 0)), 0);
  return difference === 0;
};
