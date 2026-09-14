/**
 * Browser checkpoint storage for the M5 MVP run.
 *
 * The checkpoint lives under one versioned `localStorage` key as the exact
 * JSON `serializeCheckpoint` produces; nothing else is ever written. Storage
 * can be missing, blocked, or throwing (private mode, quota, security
 * errors), so every access is guarded and reported as a failure reason
 * instead of throwing into startup. Validation stays in `parseCheckpoint`.
 */
import { parseCheckpoint, serializeCheckpoint } from '../../sim/run/checkpoint';
import type { MvpRunState } from '../../sim/run/types';
import type {
  CheckpointReadResult,
  CheckpointStore,
  CheckpointWriteResult,
} from './CheckpointStore';

export const MVP_CHECKPOINT_STORAGE_KEY = 'dead-mall:mvp-checkpoint:v1';

export type CheckpointStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export class LocalStorageCheckpointStore implements CheckpointStore {
  private readonly storage: CheckpointStorageLike | null;

  public constructor(storage: CheckpointStorageLike | null) {
    this.storage = storage;
  }

  public read(): CheckpointReadResult {
    if (!this.storage) {
      return { ok: false, reason: 'Checkpoint storage is unavailable.' };
    }
    let raw: string | null;
    try {
      raw = this.storage.getItem(MVP_CHECKPOINT_STORAGE_KEY);
    } catch {
      return { ok: false, reason: 'The checkpoint could not be read.' };
    }
    if (raw === null) {
      return { ok: false, reason: 'No checkpoint is stored.' };
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'The stored checkpoint is not valid JSON.' };
    }
    return parseCheckpoint(value);
  }

  public write(state: MvpRunState): CheckpointWriteResult {
    if (!this.storage) {
      return { ok: false, reason: 'Checkpoint storage is unavailable.' };
    }
    let raw: string;
    try {
      raw = JSON.stringify(serializeCheckpoint(state));
    } catch {
      return { ok: false, reason: 'The checkpoint could not be serialized.' };
    }
    try {
      this.storage.setItem(MVP_CHECKPOINT_STORAGE_KEY, raw);
    } catch {
      return { ok: false, reason: 'The checkpoint could not be written.' };
    }
    return { ok: true };
  }

  public clear(): CheckpointWriteResult {
    if (!this.storage) {
      // No storage ever held a checkpoint, so there is nothing left behind.
      return { ok: true };
    }
    try {
      this.storage.removeItem(MVP_CHECKPOINT_STORAGE_KEY);
    } catch {
      return { ok: false, reason: 'The checkpoint could not be cleared.' };
    }
    return { ok: true };
  }
}
