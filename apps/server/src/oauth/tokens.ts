/*
 * Token e codici: emissione, verifica, rotazione e revoca (docs/SERVER.md §3 e §5.5-5.6).
 * Gli access token e i codici stanno in memoria, come hash SHA-256; i refresh token
 * stanno nello stato cifrato, sempre come hash.
 */
import { randomBase64Url, sha256Hex } from '../crypto.js';
import type { RefreshTokenRecord } from '../state/schema.js';
import {
  ACCESS_TOKEN_TTL_MS,
  BEARER_SCHEME,
  BEARER_SEPARATOR,
  REFRESH_TOKEN_TTL_MS,
  TOKEN_BYTES,
} from './constants.js';
import type { OAuthContext } from './context.js';

/** Toglie dalla mappa le voci scadute: così non cresce senza fine. */
export const pruneExpired = <T extends { readonly expiresAt: number }>(records: Map<string, T>, now: number): void => {
  records.forEach((record, key) => {
    if (record.expiresAt <= now) records.delete(key);
  });
};

const activeRefreshTokens = (records: readonly RefreshTokenRecord[], now: number): RefreshTokenRecord[] =>
  records.filter((record) => record.expiresAt > now);

/** Valore del Bearer, con schema case-insensitive; null se l'header è assente o malformato. */
const parseBearer = (header: string | null): string | null => {
  if (header === null) return null;
  const [scheme, value, ...rest] = header.trim().split(BEARER_SEPARATOR);
  if (scheme === undefined || value === undefined || rest.length > 0) return null;
  return scheme.toLowerCase() === BEARER_SCHEME && value.length > 0 ? value : null;
};

/** Emette un access token, valido 1 ora e solo in memoria. Restituisce il token in chiaro. */
export const issueAccessToken = async (ctx: OAuthContext, clientId: string): Promise<string> => {
  const token = randomBase64Url(TOKEN_BYTES);
  const hash = await sha256Hex(token);
  const now = Date.now();
  pruneExpired(ctx.accessTokens, now);
  ctx.accessTokens.set(hash, { clientId, expiresAt: now + ACCESS_TOKEN_TTL_MS });
  return token;
};

/** Emette un refresh token e salva nello stato solo il suo hash. Scrive su disco prima di restituirlo. */
export const issueRefreshToken = async (ctx: OAuthContext, clientId: string): Promise<string> => {
  const token = randomBase64Url(TOKEN_BYTES);
  const hash = await sha256Hex(token);
  const now = Date.now();
  await ctx.store.update((state) => ({
    ...state,
    refreshTokens: [
      ...activeRefreshTokens(state.refreshTokens, now),
      { hash, clientId, expiresAt: now + REFRESH_TOKEN_TTL_MS },
    ],
  }));
  return token;
};

/**
 * Rotazione del refresh token: il vecchio hash esce dallo stato, ne entra uno nuovo.
 * Il controllo e la sostituzione avvengono nella stessa `update`, che è serializzata: due
 * richieste concorrenti con lo stesso token non possono entrambe riuscire.
 * Restituisce il nuovo token in chiaro, o null se il token non è valido per questo client.
 */
export const rotateRefreshToken = async (
  ctx: OAuthContext,
  presentedHash: string,
  clientId: string,
): Promise<string | null> => {
  const token = randomBase64Url(TOKEN_BYTES);
  const nextHash = await sha256Hex(token);
  const now = Date.now();
  const outcome = { rotated: false };
  await ctx.store.update((state) => {
    const current = state.refreshTokens.find((record) => record.hash === presentedHash);
    const clientKnown = state.clients.some((client) => client.clientId === clientId);
    if (current === undefined || current.clientId !== clientId || current.expiresAt <= now || !clientKnown) {
      return state;
    }
    outcome.rotated = true;
    return {
      ...state,
      refreshTokens: [
        ...activeRefreshTokens(state.refreshTokens, now).filter((record) => record.hash !== presentedHash),
        { hash: nextHash, clientId, expiresAt: now + REFRESH_TOKEN_TTL_MS },
      ],
    };
  });
  return outcome.rotated ? token : null;
};

/** Revoca un refresh token dal suo hash. Non scrive su disco se il token non esiste. */
export const revokeRefreshToken = async (ctx: OAuthContext, hash: string): Promise<void> => {
  const state = await ctx.store.read();
  if (!state.refreshTokens.some((record) => record.hash === hash)) return;
  const now = Date.now();
  await ctx.store.update((current) => ({
    ...current,
    refreshTokens: activeRefreshTokens(current.refreshTokens, now).filter((record) => record.hash !== hash),
  }));
};

/** true se l'header porta un access token valido e non scaduto. */
export const verifyAccessToken = async (ctx: OAuthContext, authorizationHeader: string | null): Promise<boolean> => {
  const token = parseBearer(authorizationHeader);
  if (token === null) return false;
  const hash = await sha256Hex(token);
  const record = ctx.accessTokens.get(hash);
  if (record === undefined) return false;
  if (record.expiresAt <= Date.now()) {
    ctx.accessTokens.delete(hash);
    return false;
  }
  return true;
};

/**
 * Revoca tutto: refresh token nello stato (scritto su disco), access token e codici in
 * memoria. La memoria si svuota per prima: anche se la scrittura fallisce, i token in
 * memoria non restano validi.
 */
export const revokeAllTokens = async (ctx: OAuthContext): Promise<void> => {
  ctx.accessTokens.clear();
  ctx.codes.clear();
  await ctx.store.update((state) => ({ ...state, refreshTokens: [] }));
};
