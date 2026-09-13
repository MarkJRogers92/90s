import { createEnemyStatusState } from './effects/statuses';
import { ITEM_CATALOG } from './items/catalog';
import { compileLoadout } from './items/compileLoadout';
import type { ItemInstance } from './items/types';
import type { RunState } from './model';

/** The M1 encounter's primary. The interaction lab overrides it explicitly. */
export const DEFAULT_PRIMARY_ITEM_ID = 'janitor_mop';

/**
 * The interaction lab passes the owned item definition IDs and which one is the
 * selected primary. The normal Start shift run owns only the mop.
 */
export type CreateRunOptions = {
  readonly itemIds?: readonly string[];
  readonly selectedItemId?: string;
};

function buildInventory(options: CreateRunOptions): ItemInstance[] {
  const itemIds =
    options.itemIds && options.itemIds.length > 0 ? options.itemIds : [DEFAULT_PRIMARY_ITEM_ID];
  return itemIds.map((itemId) => ({ instanceId: itemId, itemId }));
}

export function createRun(seed: number, options: CreateRunOptions = {}): RunState {
  const inventory = buildInventory(options);
  const selectedPrimaryInstanceId =
    options.selectedItemId ?? inventory[0]?.instanceId ?? DEFAULT_PRIMARY_ITEM_ID;
  const compiledLoadout = compileLoadout(ITEM_CATALOG, inventory, selectedPrimaryInstanceId);

  return {
    seed,
    tick: 0,
    paused: false,
    status: 'playing',
    player: {
      x: 180,
      y: 240,
      health: 6,
      radius: 10,
      facing: { x: 1, y: 0 },
      attackCooldownTicks: 0,
      attackActiveTicks: 0,
      invulnerableTicks: 0,
    },
    enemies: [
      {
        id: 1,
        kind: 'hanger',
        x: 700,
        y: 180,
        health: 8,
        radius: 14,
        phase: 'pursue',
        phaseTicks: 0,
        cooldownTicks: 0,
        telegraphAimX: 0,
        telegraphAimY: 0,
        statuses: createEnemyStatusState(),
      },
      {
        id: 2,
        kind: 'spitter',
        x: 760,
        y: 340,
        health: 8,
        radius: 16,
        phase: 'recover',
        phaseTicks: 45,
        cooldownTicks: 0,
        telegraphAimX: 0,
        telegraphAimY: 0,
        statuses: createEnemyStatusState(),
      },
    ],
    projectiles: [],
    walls: [
      { x: 460, y: 120, width: 40, height: 130 },
      { x: 460, y: 320, width: 40, height: 80 },
    ],
    nextEntityId: 3,
    roomWasPopulated: true,
    rewardGranted: false,
    inventory,
    selectedPrimaryInstanceId,
    compiledLoadout,
    surfaces: [],
    eventQueue: [],
    counters: {
      rootActions: 0,
      gameplayEvents: 0,
      childEventsThisRoot: 0,
      currentRootActionId: null,
      droppedEvents: 0,
      drainedEvents: 0,
    },
    nextEventSequence: 1,
    limitDiagnostics: [],
    recentChange: '',
    behaviorTrace: [],
  };
}
