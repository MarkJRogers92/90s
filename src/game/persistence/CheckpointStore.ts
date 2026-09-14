/**
 * Minimal checkpoint storage contract for the M5 MVP run.
 *
 * The store holds exactly one versioned checkpoint as plain JSON and nothing
 * else. Every read validates through `parseCheckpoint`, so the version and
 * shape rules live in `src/sim/run/checkpoint.ts` and never fork between
 * storage backends. The in-memory implementation exists for unit tests and
 * for scenes that run without browser storage.
 */
import {
  parseCheckpoint,
  serializeCheckpoint,
  type MvpCheckpoint,
} from '../../sim/run/checkpoint';
import type { MvpRunState } from '../../sim/run/types';

export type CheckpointReadResult =
  | { readonly ok: true; readonly checkpoint: MvpCheckpoint }
  | { readonly ok: false; readonly reason: string };

export type CheckpointWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface CheckpointStore {
  read(): CheckpointReadResult;
  write(state: MvpRunState): CheckpointWriteResult;
  clear(): void;
}

export class InMemoryCheckpointStore implements CheckpointStore {
  private raw: string | null = null;

  public read(): CheckpointReadResult {
    if (this.raw === null) {
      return { ok: false, reason: 'No checkpoint is stored.' };
    }
    let value: unknown;
    try {
      value = JSON.parse(this.raw);
    } catch {
      return { ok: false, reason: 'The stored checkpoint is not valid JSON.' };
    }
    return parseCheckpoint(value);
  }

  public write(state: MvpRunState): CheckpointWriteResult {
    let raw: string;
    try {
      raw = JSON.stringify(serializeCheckpoint(state));
    } catch {
      return { ok: false, reason: 'The checkpoint could not be serialized.' };
    }
    this.raw = raw;
    return { ok: true };
  }

  public clear(): void {
    this.raw = null;
  }
}
