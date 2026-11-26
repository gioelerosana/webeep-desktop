import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StateUnreadableError } from './codec.js';
import { createFileStateStore } from './file-store.js';
import { createStateManager } from './manager.js';
import type { StateStore } from './store.js';

const KEY_A = new Uint8Array(32).fill(1);
const KEY_B = new Uint8Array(32).fill(2);
const SECRET_TOKEN = 'token-segreto-di-prova';
const UTF8 = new TextDecoder();

// Store in memoria che conserva solo i byte, come farebbe un adattatore reale.
const createMemoryStore = (): StateStore & { readonly bytes: () => Uint8Array | null } => {
  let stored: Uint8Array | null = null;
  return {
    get: async () => stored,
    put: async (bytes) => {
      stored = bytes;
    },
    bytes: () => stored,
  };
};

describe('stato cifrato', () => {
  it('salva e rilegge lo stato con la stessa chiave, senza il testo in chiaro nel file', async () => {
    const store = createMemoryStore();
    const writer = await createStateManager({ store, secretKey: KEY_A });
    await writer.update((state) => ({
      ...state,
      webeep: { siteUrl: 'https://webeep.polimi.it', token: SECRET_TOKEN },
    }));

    const onDisk = store.bytes();
    expect(onDisk).not.toBeNull();
    expect(UTF8.decode(onDisk ?? new Uint8Array())).not.toContain(SECRET_TOKEN);

    const reader = await createStateManager({ store, secretKey: KEY_A });
    const state = await reader.read();
    expect(state.webeep?.token).toBe(SECRET_TOKEN);
  });

  it('con una chiave errata lo stato non è leggibile', async () => {
    const store = createMemoryStore();
    const writer = await createStateManager({ store, secretKey: KEY_A });
    await writer.update((state) => ({ ...state, webeep: { siteUrl: 'https://webeep.polimi.it', token: SECRET_TOKEN } }));

    const reader = await createStateManager({ store, secretKey: KEY_B });
    await expect(reader.read()).rejects.toBeInstanceOf(StateUnreadableError);
  });

  it('senza file lo stato iniziale è vuoto e non viene scritto alla lettura', async () => {
    const store = createMemoryStore();
    const manager = await createStateManager({ store, secretKey: KEY_A });
    const state = await manager.read();
    expect(state).toEqual({ version: 1, webeep: null, clients: [], refreshTokens: [] });
    expect(store.bytes()).toBeNull();
  });

  it('le scritture concorrenti si applicano una alla volta, nell\'ordine di arrivo', async () => {
    const store = createMemoryStore();
    const manager = await createStateManager({ store, secretKey: KEY_A });
    await Promise.all([
      manager.update((state) => ({ ...state, clients: [...state.clients, { clientId: 'a', redirectUris: [], createdAt: 1 }] })),
      manager.update((state) => ({ ...state, clients: [...state.clients, { clientId: 'b', redirectUris: [], createdAt: 2 }] })),
    ]);
    const state = await manager.read();
    expect(state.clients.map((client) => client.clientId)).toEqual(['a', 'b']);
  });

  it('il file store fa il round-trip su disco', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'webeep-state-'));
    try {
      const store = createFileStateStore(dir);
      const writer = await createStateManager({ store, secretKey: KEY_A });
      await writer.update((state) => ({ ...state, webeep: { siteUrl: 'https://webeep.polimi.it', token: SECRET_TOKEN } }));
      const reader = await createStateManager({ store: createFileStateStore(dir), secretKey: KEY_A });
      expect((await reader.read()).webeep?.token).toBe(SECRET_TOKEN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('createFileStateStore', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'webeep-store-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('restituisce null se state.bin non esiste', async () => {
    expect(await createFileStateStore(dir).get()).toBeNull();
  });
});
