import { describe, expect, it } from 'vitest';
import { MAX_SECURITY_HEAT } from '../../src/sim/shop/types';
import {
  parseCheckpoint,
  restoreMvpRun,
  serializeCheckpoint,
} from '../../src/sim/run/checkpoint';
import type { MvpCheckpoint } from '../../src/sim/run/checkpoint';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buyRunOffer } from '../../src/sim/run/economy';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { EnemyState } from '../../src/sim/model';
import type { WingDoorSide, WingRoomId } from '../../src/sim/wing/types';

const input = (overrides: Partial<MvpInputFrame> = {}): MvpInputFrame => ({
  moveX: 0,
  moveY: 0,
  aimX: 900,
  aimY: 240,
  fire: false,
  interact: false,
  steal: false,
  recall: false,
  ...overrides,
});

function advance(state: MvpRunState, count: number, overrides: Partial<MvpInputFrame> = {}): void {
  for (let index = 0; index < count; index += 1) {
    tickMvpRun(state, input(overrides));
  }
}

function walkThrough(state: MvpRunState, side: WingDoorSide): void {
  const doorway = state.wing.rooms[state.roomIndex]?.doorways.find((entry) => entry.side === side);
  if (!doorway) {
    throw new Error(`Room ${state.roomIndex} has no ${side} doorway`);
  }
  state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
  state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;
  const result = enterDoorway(state, side);
  if (!result.accepted) {
    throw new Error(`Could not walk ${side}: ${result.reason}`);
  }
}

function clearCurrentRoom(state: MvpRunState): void {
  state.room.combat.enemies = [];
  advance(state, 1);
}

function walkToRoom(state: MvpRunState, roomId: WingRoomId): void {
  while (state.wing.rooms[state.roomIndex]?.id !== roomId) {
    const room = state.wing.rooms[state.roomIndex]!;
    if (room.enemySpawns.length > 0) {
      clearCurrentRoom(state);
    }
    walkThrough(state, 'east');
  }
}

function roundTrip(checkpoint: MvpCheckpoint): unknown {
  return JSON.parse(JSON.stringify(checkpoint));
}

function freshCheckpoint(seed = 31): MvpCheckpoint {
  const state = createMvpRun(seed);
  walkThrough(state, 'east');
  const offer = state.wing.rooms[1]!.offers[0]!;
  expect(buyRunOffer(state, offer.id).accepted).toBe(true);
  walkThrough(state, 'east');
  return serializeCheckpoint(state);
}

function leaf(instanceId: string, itemDefinitionId = 'janitor_mop'): InventoryLeaf {
  return {
    kind: 'leaf',
    instanceId,
    itemDefinitionId,
    acquisitionKind: 'purchased',
    sourceLocationId: 'test-store',
    sourceStockId: 'test-offer',
    acquisitionTick: 0,
  };
}

describe('checkpoint serialization', () => {
  it('round-trips a run at a room boundary', () => {
    const state = createMvpRun(31);
    walkThrough(state, 'east');
    const offer = state.wing.rooms[1]!.offers[0]!;
    expect(buyRunOffer(state, offer.id).accepted).toBe(true);
    walkThrough(state, 'east');

    const checkpoint = serializeCheckpoint(state);
    expect(checkpoint.version).toBe(1);
    expect(checkpoint.seed).toBe(31);
    expect(checkpoint.roomIndex).toBe(2);
    expect(checkpoint.cash).toBe(state.cash);
    expect(checkpoint.heat).toBe(state.heat);
    expect(checkpoint.playerHealth).toBe(state.room.combat.player.health);
    expect(checkpoint.offerStatus[offer.id]).toBe('consumed');

    const parsed = parseCheckpoint(roundTrip(checkpoint));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.checkpoint).toEqual(checkpoint);

    const restored = restoreMvpRun(parsed.checkpoint);
    expect(serializeCheckpoint(restored)).toEqual(checkpoint);
    expect(restored.status).toBe('playing');
    expect(restored.roomIndex).toBe(2);
    expect(restored.room.roomId).toBe('food_court');
    expect(restored.room.combat.walls).toEqual(state.wing.rooms[2]!.walls);
    expect(restored.room.combat.player.x).toBe(state.wing.rooms[2]!.playerEntry.x);
    expect(restored.room.combat.enemies.map((enemy) => enemy.kind)).toEqual(
      state.room.combat.enemies.map((enemy) => enemy.kind),
    );
    expect(restored.checkpoint).toEqual({ roomIndex: 2, tick: checkpoint.tick });
  });

  it('resumes equivalently to a run played to the same boundary', () => {
    const live = createMvpRun(31);
    walkThrough(live, 'east');
    walkThrough(live, 'east');
    const parsed = parseCheckpoint(roundTrip(serializeCheckpoint(live)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const resumed = restoreMvpRun(parsed.checkpoint);
    for (let index = 0; index < 40; index += 1) {
      tickMvpRun(live, input({ moveX: 1 }));
      tickMvpRun(resumed, input({ moveX: 1 }));
    }

    expect(serializeCheckpoint(resumed)).toEqual(serializeCheckpoint(live));
    expect(resumed.status).toBe(live.status);
    expect(resumed.room.combat.player.x).toBe(live.room.combat.player.x);
    expect(resumed.room.combat.player.y).toBe(live.room.combat.player.y);
    expect(resumed.room.combat.player.health).toBe(live.room.combat.player.health);
    expect(resumed.room.combat.enemies).toEqual(live.room.combat.enemies);
    expect(resumed.tick).toBe(live.tick);
  });

  it('restores a cleared room without enemies', () => {
    const state = createMvpRun(31);
    walkToRoom(state, 'food_court');
    clearCurrentRoom(state);
    walkThrough(state, 'east');
    walkThrough(state, 'west');
    expect(state.roomIndex).toBe(2);
    expect(state.clearedRooms).toContain('food_court');

    const parsed = parseCheckpoint(roundTrip(serializeCheckpoint(state)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.room.combat.enemies).toEqual([]);
    expect(restored.room.cleared).toBe(true);
    expect(restored.clearedRooms).toContain('food_court');
  });
});

describe('checkpoint validation', () => {
  it('rejects an unknown version', () => {
    const checkpoint = freshCheckpoint();
    const parsed = parseCheckpoint({ ...checkpoint, version: 2 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason.length).toBeGreaterThan(0);
      expect(parsed.reason).toMatch(/version/i);
    }
  });

  it('rejects a missing field', () => {
    const checkpoint = freshCheckpoint();
    const { cash, ...missingCash } = checkpoint;
    void cash;
    expect(parseCheckpoint(missingCash).ok).toBe(false);
  });

  it('rejects out-of-range values', () => {
    const checkpoint = freshCheckpoint();
    expect(parseCheckpoint({ ...checkpoint, roomIndex: 42 }).ok).toBe(false);
    expect(parseCheckpoint({ ...checkpoint, roomIndex: -1 }).ok).toBe(false);
    expect(parseCheckpoint({ ...checkpoint, heat: MAX_SECURITY_HEAT + 1 }).ok).toBe(false);
    expect(parseCheckpoint({ ...checkpoint, cash: -5 }).ok).toBe(false);
    expect(parseCheckpoint({ ...checkpoint, suspicion: 101 }).ok).toBe(false);
    expect(parseCheckpoint({ ...checkpoint, playerHealth: 0 }).ok).toBe(false);
    expect(parseCheckpoint({ ...checkpoint, tick: -1 }).ok).toBe(false);
  });

  it('rejects unknown, duplicate, and tampered inventory data', () => {
    const checkpoint = freshCheckpoint();
    const ownedInstanceId = checkpoint.inventory.selectedPrimaryInstanceId;

    const unknownDefinition = {
      ...checkpoint,
      inventory: {
        ...checkpoint.inventory,
        inventory: [...checkpoint.inventory.inventory, leaf('test-unknown', 'not_a_real_item')],
      },
    };
    expect(parseCheckpoint(unknownDefinition).ok).toBe(false);

    const duplicateInstance = {
      ...checkpoint,
      inventory: {
        ...checkpoint.inventory,
        inventory: [...checkpoint.inventory.inventory, leaf(ownedInstanceId)],
      },
    };
    expect(parseCheckpoint(duplicateInstance).ok).toBe(false);

    const tamperedSelection = {
      ...checkpoint,
      inventory: {
        ...checkpoint.inventory,
        selectedPrimaryInstanceId: 'missing-instance',
      },
    };
    expect(parseCheckpoint(tamperedSelection).ok).toBe(false);
  });

  it('round-trips a run that owns the same definition twice', () => {
    const checkpoint = freshCheckpoint();
    const repeatedDefinition = {
      ...checkpoint,
      inventory: {
        ...checkpoint.inventory,
        inventory: [...checkpoint.inventory.inventory, leaf('mvp-second-mop')],
        revision: checkpoint.inventory.revision + 1,
      },
    };

    const parsed = parseCheckpoint(roundTrip(repeatedDefinition));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const restored = restoreMvpRun(parsed.checkpoint);
    expect(restored.inventory.inventory).toHaveLength(
      checkpoint.inventory.inventory.length + 1,
    );
    expect(restored.room.combat.compiledLoadout.primary.definitionId).toBe('janitor_mop');
  });

  it('rejects an offer status that contradicts the carried thefts', () => {
    const checkpoint = freshCheckpoint();
    const offers = Object.keys(checkpoint.offerStatus);
    const unknownOffer = {
      ...checkpoint,
      offerStatus: { ...checkpoint.offerStatus, 'not-an-offer': 'available' },
    };
    expect(parseCheckpoint(unknownOffer).ok).toBe(false);

    const carriedMismatch = {
      ...checkpoint,
      carried: [
        {
          itemDefinitionId: 'janitor_mop',
          sourceStoreId: 'not-a-store',
          sourceOfferId: offers[0]!,
          startedTick: 0,
        },
      ],
    };
    expect(parseCheckpoint(carriedMismatch).ok).toBe(false);
  });

  it('rejects non-objects instead of throwing', () => {
    expect(parseCheckpoint(null).ok).toBe(false);
    expect(parseCheckpoint('nope').ok).toBe(false);
    expect(parseCheckpoint(undefined).ok).toBe(false);
    expect(parseCheckpoint({}).ok).toBe(false);
  });
});

describe('checkpoint terminal semantics', () => {
  it('clears the checkpoint on a win', () => {
    const state = createMvpRun(15);
    walkToRoom(state, 'security_office');
    clearCurrentRoom(state);

    expect(state.status).toBe('won');
    expect(state.checkpoint).toBeNull();
    expect(state.summary?.status).toBe('won');
  });

  it('keeps the checkpoint on death', () => {
    const state = createMvpRun(9);
    walkToRoom(state, 'food_court');
    state.room.combat.player.health = 1;
    const hanger: EnemyState = {
      id: 900,
      kind: 'hanger',
      x: state.room.combat.player.x,
      y: state.room.combat.player.y,
      health: 8,
      radius: 14,
      phase: 'pursue',
      phaseTicks: 0,
      cooldownTicks: 0,
      telegraphAimX: 0,
      telegraphAimY: 0,
    };
    state.room.combat.enemies = [hanger];

    advance(state, 1);

    expect(state.status).toBe('dead');
    expect(state.checkpoint).not.toBeNull();
    expect(state.checkpoint?.roomIndex).toBe(2);
    expect(state.summary?.status).toBe('dead');
  });
});
