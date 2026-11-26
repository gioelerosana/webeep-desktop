/*
 * Schema dello stato in chiaro (docs/SERVER.md §3.1). Il JSON cifrato deve passare
 * questo schema: se non passa, lo stato è considerato illeggibile.
 */
import { z } from 'zod';

export const STATE_VERSION = 1;
// Lunghezza esadecimale di un SHA-256.
const SHA256_HEX_LENGTH = 64;

export const webeepSessionSchema = z.object({
  siteUrl: z.string().min(1),
  token: z.string().min(1),
  privateToken: z.string().optional(),
});

export const oauthClientSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().optional(),
  redirectUris: z.array(z.string()),
  /** Millisecondi epoch. */
  createdAt: z.number(),
});

export const refreshTokenSchema = z.object({
  /** SHA-256 esadecimale del refresh token: il token in chiaro non si salva mai. */
  hash: z.string().length(SHA256_HEX_LENGTH),
  clientId: z.string().min(1),
  /** Millisecondi epoch. */
  expiresAt: z.number(),
});

export const stateSchema = z.object({
  version: z.literal(STATE_VERSION),
  webeep: webeepSessionSchema.nullable(),
  clients: z.array(oauthClientSchema),
  refreshTokens: z.array(refreshTokenSchema),
});

export type WebeepSession = z.infer<typeof webeepSessionSchema>;
export type OAuthClient = z.infer<typeof oauthClientSchema>;
export type RefreshTokenRecord = z.infer<typeof refreshTokenSchema>;
/** Stato in chiaro. Trattarlo come immutabile: le modifiche passano da `StateManager.update`. */
export type WebeepState = z.infer<typeof stateSchema>;

export const initialState = (): WebeepState => ({
  version: STATE_VERSION,
  webeep: null,
  clients: [],
  refreshTokens: [],
});
