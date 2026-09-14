import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { InMemoryCheckpointStore } from '../../src/game/persistence/CheckpointStore';
import {
  LocalStorageCheckpointStore,
  MVP_CHECKPOINT_STORAGE_KEY,
} from '../../src/game/persistence/LocalStorageCheckpointStore';

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { entries: Map<string, string> } {
  const entries = new Map<string, string>(Object.entries(initial));
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('private mode');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
}

describe('InMemoryCheckpointStore', () => {
  it('round-trips a fresh run through write and read', () => {
    const store = new InMemoryCheckpointStore();
    const state = createMvpRun(7);
    expect(store.write(state)).toEqual({ ok: true });
    const result = store.read();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.checkpoint).toEqual(serializeCheckpoint(state));
  });
});

describe('LocalStorageCheckpointStore', () => {
  it('writes versioned JSON under the single versioned key', () => {
    const storage = fakeStorage();
    const store = new LocalStorageCheckpointStore(storage);
    const state = createMvpRun(11);
    expect(store.write(state)).toEqual({ ok: true });
    const raw = storage.getItem(MVP_CHECKPOINT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).version).toBe(1);
    const result = store.read();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.checkpoint.seed).toBe(11);
  });

  it('returns a failure reason instead of throwing when storage is unavailable', () => {
    const store = new LocalStorageCheckpointStore(throwingStorage());
    const state = createMvpRun(3);
    const written = store.write(state);
    expect(written.ok).toBe(false);
    if (written.ok) {
      return;
    }
    expect(written.reason.length).toBeGreaterThan(0);
    const read = store.read();
    expect(read.ok).toBe(false);
    if (read.ok) {
      return;
    }
    expect(read.reason.length).toBeGreaterThan(0);
  });

  it('returns a failure reason for corrupt JSON', () => {
    const storage = fakeStorage({ [MVP_CHECKPOINT_STORAGE_KEY]: '{not json' });
    const store = new LocalStorageCheckpointStore(storage);
    const result = store.read();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('returns a failure reason for a version mismatch', () => {
    const state = createMvpRun(5);
    const raw = { ...serializeCheckpoint(state), version: 999 };
    const storage = fakeStorage({ [MVP_CHECKPOINT_STORAGE_KEY]: JSON.stringify(raw) });
    const store = new LocalStorageCheckpointStore(storage);
    const result = store.read();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('clear removes the entry', () => {
    const storage = fakeStorage();
    const store = new LocalStorageCheckpointStore(storage);
    expect(store.write(createMvpRun(9))).toEqual({ ok: true });
    expect(storage.getItem(MVP_CHECKPOINT_STORAGE_KEY)).not.toBeNull();
    store.clear();
    expect(storage.getItem(MVP_CHECKPOINT_STORAGE_KEY)).toBeNull();
    expect(store.read().ok).toBe(false);
  });
});
