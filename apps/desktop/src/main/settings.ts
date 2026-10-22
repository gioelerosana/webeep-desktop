/*
 * Impostazioni utente in `userData/settings.json`, validate in lettura: un
 * file corrotto o di una versione vecchia ricade sui default invece di
 * bloccare l'avvio.
 */
import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Settings } from '../shared/ipc.js';

const SETTINGS_FILE = 'settings.json';
const DOWNLOAD_FOLDER_NAME = 'WeBeep';
const JSON_INDENT = 2;

const settingsSchema = z.object({
  downloadDir: z.string().min(1),
  theme: z.enum(['system', 'light', 'dark']),
});

const settingsPath = (): string => join(app.getPath('userData'), SETTINGS_FILE);

const defaultSettings = (): Settings => ({
  downloadDir: join(app.getPath('downloads'), DOWNLOAD_FOLDER_NAME),
  theme: 'system',
});

let cached: Settings | undefined;

const readStoredSettings = async (): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf8'));
  } catch {
    // File mancante o JSON rotto: si riparte dai default, che verranno riscritti al primo salvataggio.
    return {};
  }
};

export const getSettings = async (): Promise<Settings> => {
  if (cached) return cached;
  const parsed = settingsSchema.partial().safeParse(await readStoredSettings());
  cached = { ...defaultSettings(), ...(parsed.success ? parsed.data : {}) };
  return cached;
};

export const updateSettings = async (patch: Partial<Settings>): Promise<Settings> => {
  const next = settingsSchema.parse({ ...(await getSettings()), ...patch });
  await writeFile(settingsPath(), JSON.stringify(next, null, JSON_INDENT));
  cached = next;
  return next;
};
