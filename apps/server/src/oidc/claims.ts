/*
 * Lettura del claim `nonce` dall'ID token (docs/SERVER.md §10.2 e §10.4). La firma non si
 * verifica (scelta documentata): il token arriva dal token endpoint in HTTPS, quindi qui
 * si legge solo il payload per confrontare il nonce.
 */
import { z } from 'zod';
import {
  BASE64_BLOCK_LENGTH,
  BASE64_PADDING,
  JWT_PARTS_COUNT,
  JWT_PAYLOAD_INDEX,
  JWT_SEPARATOR,
} from './constants.js';

const idTokenClaimsSchema = z.object({ nonce: z.string() });

/** Decodifica base64url (RFC 4648 §5) in testo UTF-8: `atob` vuole il base64 standard con padding. */
const decodeBase64UrlText = (segment: string): string => {
  const standard = segment.replaceAll('-', '+').replaceAll('_', '/');
  const missing = (BASE64_BLOCK_LENGTH - (standard.length % BASE64_BLOCK_LENGTH)) % BASE64_BLOCK_LENGTH;
  const bytes = Uint8Array.from(atob(standard.padEnd(standard.length + missing, BASE64_PADDING)), (char) =>
    char.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
};

/** Il `nonce` del payload dell'ID token, o null se il token non è leggibile o non lo contiene. */
export const idTokenNonce = (idToken: string): string | null => {
  const parts = idToken.split(JWT_SEPARATOR);
  const payload = parts[JWT_PAYLOAD_INDEX];
  if (parts.length !== JWT_PARTS_COUNT || payload === undefined) return null;
  try {
    const parsed = idTokenClaimsSchema.safeParse(JSON.parse(decodeBase64UrlText(payload)));
    return parsed.success ? parsed.data.nonce : null;
  } catch {
    // Base64 o JSON malformati: per il controllo del nonce equivale a un nonce assente, quindi rifiuto.
    return null;
  }
};
