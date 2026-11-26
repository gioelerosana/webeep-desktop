/*
 * Schema dello stato in chiaro (docs/SERVER.md §3.1). Il JSON cifrato deve passare
 * `stateFileSchema`: se non passa, lo stato è considerato illeggibile.
 *
 * Versioni: la 2 è quella corrente (`deviceTokenHash`, login Authentik). La 1 si legge
 * e si converte alla 2 con `deviceTokenHash: null`; la scrittura usa sempre la 2.
 */
import { z } from 'zod';

export const STATE_VERSION = 2;
export const LEGACY_STATE_VERSION = 1;
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

const stateFieldsV1 = {
  webeep: webeepSessionSchema.nullable(),
  clients: z.array(oauthClientSchema),
  refreshTokens: z.array(refreshTokenSchema),
};

const stateV1Schema = z.object({
  version: z.literal(LEGACY_STATE_VERSION),
  ...stateFieldsV1,
});

const stateV2Schema = z.object({
  version: z.literal(STATE_VERSION),
  ...stateFieldsV1,
  /** SHA-256 esadecimale del deviceToken; `null` se nessun dispositivo è collegato. */
  deviceTokenHash: z.string().length(SHA256_HEX_LENGTH).nullable(),
});

export type WebeepSession = z.infer<typeof webeepSessionSchema>;
export type OAuthClient = z.infer<typeof oauthClientSchema>;
export type RefreshTokenRecord = z.infer<typeof refreshTokenSchema>;
/** Stato in chiaro (versione 2). Trattarlo come immutabile: le modifiche passano da `StateManager.update`. */
export type WebeepState = z.infer<typeof stateV2Schema>;

/**
 * Formato in chiaro accettato dal lettore: v2, oppure v1 convertita alla v2 con nessun
 * dispositivo collegato. La conversione è solo in memoria: il file cambia alla prima scrittura.
 */
export const stateFileSchema = z.union([
  stateV2Schema,
  stateV1Schema.transform((legacy): WebeepState => ({ ...legacy, version: STATE_VERSION, deviceTokenHash: null })),
]);

export const initialState = (): WebeepState => ({
  version: STATE_VERSION,
  webeep: null,
  deviceTokenHash: null,
  clients: [],
  refreshTokens: [],
});
