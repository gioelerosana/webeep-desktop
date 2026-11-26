import { describe, expect, it } from 'vitest';
import { StateUnreadableError } from './codec.js';
import { createStateManager } from './manager.js';
import type { StateStore } from './store.js';

const KEY = new Uint8Array(32).fill(3);
const IV_BYTES = 12;
const SESSION_TOKEN = 'token-webeep-migrazione';
const DEVICE_HASH = 'a'.repeat(64);
const CLIENT = { clientId: 'client-1', redirectUris: ['http://127.0.0.1:4000/callback'], createdAt: 10 };
const REFRESH = { hash: 'b'.repeat(64), clientId: 'client-1', expiresAt: 20 };

const memoryStore = (initial: Uint8Array | null): StateStore & { readonly bytes: () => Uint8Array | null } => {
  let stored = initial;
  return {
    get: async () => stored,
    put: async (bytes) => {
      stored = bytes;
    },
    bytes: () => stored,
  };
};

// Cifra un JSON qualsiasi con lo stesso formato del nucleo (iv || ciphertext+tag): serve a
// produrre file v1 e file non validi, che il nucleo non scriverebbe mai.
const encryptRaw = async (value: unknown): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey('raw', KEY, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const joined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  joined.set(iv, 0);
  joined.set(ciphertext, iv.byteLength);
  return joined;
};

const legacyV1State = {
  version: 1,
  webeep: { siteUrl: 'https://webeep.polimi.it', token: SESSION_TOKEN },
  clients: [CLIENT],
  refreshTokens: [REFRESH],
};

describe('migrazione dello stato dalla v1 alla v2', () => {
  it('legge una v1 e la espone come v2 con deviceTokenHash nullo, senza perdere sessione, client e refresh token', async () => {
    const store = memoryStore(await encryptRaw(legacyV1State));
    const manager = await createStateManager({ store, secretKey: KEY });

    const state = await manager.read();

    expect(state).toEqual({
      version: 2,
      webeep: legacyV1State.webeep,
      deviceTokenHash: null,
      clients: [CLIENT],
      refreshTokens: [REFRESH],
    });
  });

  it('non riscrive il file alla sola lettura della v1', async () => {
    const original = await encryptRaw(legacyV1State);
    const store = memoryStore(original);
    await (await createStateManager({ store, secretKey: KEY })).read();
    expect(store.bytes()).toBe(original);
  });

  it('alla prima scrittura salva la v2 con il deviceTokenHash impostato', async () => {
    const store = memoryStore(await encryptRaw(legacyV1State));
    const manager = await createStateManager({ store, secretKey: KEY });
    await manager.update((state) => ({ ...state, deviceTokenHash: DEVICE_HASH }));

    const reread = await (await createStateManager({ store, secretKey: KEY })).read();
    expect(reread.version).toBe(2);
    expect(reread.deviceTokenHash).toBe(DEVICE_HASH);
    expect(reread.webeep?.token).toBe(SESSION_TOKEN);
  });

  it('una v2 con deviceTokenHash non valido non è leggibile', async () => {
    const store = memoryStore(
      await encryptRaw({ version: 2, webeep: null, deviceTokenHash: 'non-hex', clients: [], refreshTokens: [] }),
    );
    const manager = await createStateManager({ store, secretKey: KEY });
    await expect(manager.read()).rejects.toBeInstanceOf(StateUnreadableError);
  });

  it('una versione sconosciuta non è leggibile', async () => {
    const store = memoryStore(await encryptRaw({ ...legacyV1State, version: 3 }));
    const manager = await createStateManager({ store, secretKey: KEY });
    await expect(manager.read()).rejects.toBeInstanceOf(StateUnreadableError);
  });
});
