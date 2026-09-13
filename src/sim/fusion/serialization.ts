/**
 * Plain-data serialization and validated restore for fusion inventory.
 * Only data crosses the boundary; compiled behavior is rebuilt by callers
 * from the current immutable ITEM_CATALOG via projectFusionInventory.
 */
import { ITEM_CATALOG } from '../items/catalog';
import { freezeDeep } from '../items/types';
import { isValidFusionInventoryState } from './inventory';
import type { FusionInventoryState } from './types';

const KNOWN_DEFINITION_IDS = new Set(ITEM_CATALOG.map((definition) => definition.id));

function collectDefinitionIds(value: unknown, into: string[]): void {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDefinitionIds(entry, into);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['itemDefinitionId'] === 'string') {
    into.push(record['itemDefinitionId']);
  }
  for (const entry of Object.values(record)) {
    collectDefinitionIds(entry, into);
  }
}

export function serializeFusionState(state: FusionInventoryState): string {
  return JSON.stringify(state);
}

export function restoreFusionState(data: unknown): FusionInventoryState {
  let parsed: unknown = data;
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error('Invalid fusion inventory payload: not parseable JSON.');
    }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid fusion inventory payload: expected an object.');
  }
  const ids: string[] = [];
  collectDefinitionIds(parsed, ids);
  if (ids.some((id) => !KNOWN_DEFINITION_IDS.has(id))) {
    throw new Error('Invalid fusion inventory payload: unknown item definition.');
  }
  const candidate = freezeDeep(JSON.parse(JSON.stringify(parsed)));
  if (!isValidFusionInventoryState(candidate as FusionInventoryState)) {
    throw new Error(
      'Invalid fusion inventory payload: duplicate instance ID, dangling selection, invalid component reuse, duplicate transaction, unsupported component, or incoherent composite/ledger.',
    );
  }
  return candidate as FusionInventoryState;
}
