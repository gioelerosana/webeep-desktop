/*
 * Implementazione di `StateStore` su file (adattatore Node: usa node:fs, quindi
 * il nucleo non lo importa mai).
 *
 * Scrittura atomica: si scrive `state.bin.part`, si fa `fsync`, poi si rinomina su
 * `state.bin`. Un errore lascia intatto il file precedente.
 */
import { access, mkdir, open, readFile, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { StateStore } from './store.js';

const STATE_FILE_NAME = 'state.bin';
const PART_SUFFIX = '.part';
const STATE_FILE_MODE = 0o600;
const DATA_DIR_MODE = 0o700;
const NOT_FOUND_CODE = 'ENOENT';

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === NOT_FOUND_CODE;

/** Crea la directory dei dati (0700) se manca, e verifica che sia scrivibile. Lancia se non lo è. */
export const prepareDataDir = async (dataDir: string): Promise<void> => {
  await mkdir(dataDir, { recursive: true, mode: DATA_DIR_MODE });
  await access(dataDir, constants.W_OK);
};

export const createFileStateStore = (dataDir: string): StateStore => {
  const statePath = join(dataDir, STATE_FILE_NAME);
  const partPath = `${statePath}${PART_SUFFIX}`;

  return {
    get: async () => {
      try {
        return new Uint8Array(await readFile(statePath));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    put: async (bytes) => {
      const handle = await open(partPath, 'w', STATE_FILE_MODE);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(partPath, statePath);
    },
  };
};
