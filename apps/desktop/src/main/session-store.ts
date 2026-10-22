/*
 * Persistenza della sessione (token Moodle) cifrata con `safeStorage`.
 *
 * Il token è una credenziale a lunga durata: sta solo nel main process e su
 * disco solo cifrato. Se il sistema non offre cifratura (Linux senza
 * keyring), il token resta in memoria e al riavvio serve un nuovo login:
 * meglio che salvarlo in chiaro.
 */
import { app, safeStorage } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const SESSION_FILE = 'session.bin';
const FILE_MODE_OWNER_ONLY = 0o600;

const storedSessionSchema = z.object({
  siteUrl: z.string(),
  token: z.string(),
  privateToken: z.string().optional(),
});
export type StoredSession = z.infer<typeof storedSessionSchema>;

const sessionPath = (): string => join(app.getPath('userData'), SESSION_FILE);

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export const canPersistSession = (): boolean => safeStorage.isEncryptionAvailable();

export const loadSession = async (): Promise<StoredSession | undefined> => {
  if (!canPersistSession()) return undefined;
  let encrypted: Buffer;
  try {
    encrypted = await readFile(sessionPath());
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
  const parsed = storedSessionSchema.safeParse(JSON.parse(safeStorage.decryptString(encrypted)));
  return parsed.success ? parsed.data : undefined;
};

export const saveSession = async (session: StoredSession): Promise<void> => {
  if (!canPersistSession()) return;
  await writeFile(sessionPath(), safeStorage.encryptString(JSON.stringify(session)), { mode: FILE_MODE_OWNER_ONLY });
};

export const clearSession = async (): Promise<void> => {
  await rm(sessionPath(), { force: true });
};
