import { describe, expect, it } from 'vitest';
import { BOSS_MAX_HEALTH } from '../../src/sim/combat/boss';
import { circleIntersectsRect, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from '../../src/sim/core/geometry';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buyRunOffer } from '../../src/sim/run/economy';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import {
  enterDoorway,
  nearestMvpInteraction,
  tickMvpRun,
  tryInteract,
} from '../../src/sim/run/tickMvpRun';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';
import type { EnemyState } from '../../src/sim/model';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
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

function doorwayRectOf(state: MvpRunState, side: WingDoorSide) {
  const doorway = state.wing.rooms[state.roomIndex]?.doorways.find((entry) => entry.side === side);
  if (!doorway) {
    throw new Error(`Room ${state.roomIndex} has no ${side} doorway`);
  }
  return doorway.rect;
}

/** Stands the player inside the current room's doorway and runs the command. */
function walkThrough(state: MvpRunState, side: WingDoorSide) {
  const rect = doorwayRectOf(state, side);
  state.room.combat.player.x = rect.x + rect.width / 2;
  state.room.combat.player.y = rect.y + rect.height / 2;
  return enterDoorway(state, side);
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
    const result = walkThrough(state, 'east');
    if (!result.accepted) {
      throw new Error(`Failed to walk into ${roomId}: ${result.reason}`);
    }
  }
}

function hangerAt(x: number, y: number): EnemyState {
  return {
    id: 900,
    kind: 'hanger',
    x,
    y,
    health: 8,
    radius: 14,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
  };
}

describe('mvp run start state', () => {
  it('starts in the service corridor with the mop, $30, and a room-zero checkpoint', () => {
    const state = createMvpRun(11);

    expect(state.status).toBe('playing');
    expect(state.roomIndex).toBe(0);
    expect(state.room.roomId).toBe('service_corridor');
    expect(state.wing.rooms[0]?.id).toBe('service_corridor');
    expect(state.startingCash).toBe(30);
    expect(state.startingCash).toBe(state.wing.startingCash);
    expect(state.cash).toBe(30);
    expect(state.heat).toBe(0);
    expect(state.suspicion).toBe(0);
    expect(state.carried).toEqual([]);
    expect(state.summary).toBeNull();
    expect(state.paused).toBe(false);
    expect(state.tick).toBe(0);
    expect(state.checkpoint).toEqual({ roomIndex: 0, tick: 0 });
    expect(state.clearedRooms).toEqual([]);

    const leaves = state.inventory.inventory.filter((node) => node.kind === 'leaf');
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.itemDefinitionId).toBe('janitor_mop');
    expect(leaves[0]?.acquisitionKind).toBe('purchased');
    expect(state.inventory.selectedPrimaryInstanceId).toBe(leaves[0]?.instanceId);
    expect(state.inventory.revision).toBe(0);
    expect(state.room.combat.selectedPrimaryInstanceId).toBe(leaves[0]?.instanceId);
    expect(state.room.combat.compiledLoadout.primary.definitionId).toBe('janitor_mop');
    expect(state.room.combat.compiledLoadout.primary.delivery).toBe('direct');

    const offerIds = state.wing.rooms.flatMap((room) => room.offers.map((offer) => offer.id));
    expect(Object.keys(state.offerStatus).sort()).toEqual([...offerIds].sort());
    for (const offerId of offerIds) {
      expect(state.offerStatus[offerId]).toBe('available');
    }

    expect(state.room.combat.enemies).toHaveLength(0);
    expect(state.room.cleared).toBe(true);
    expect(state.room.enteredFrom).toBe('west');
    expect(state.room.variantId).toBe(state.wing.rooms[0]?.variantId);
    expect(state.room.combat.walls).toEqual(state.wing.rooms[0]?.walls);
  });

  it('sanitizes a non-integer seed instead of throwing out of construction', () => {
    expect(() => createMvpRun(1.5)).not.toThrow();
    const truncated = createMvpRun(1.5);
    expect(truncated.seed).toBe(1);
    expect(truncated.wing).toEqual(createMvpRun(1).wing);
    expect(createMvpRun(-3.7).seed).toBe(-3);
    expect(() => createMvpRun(Number.NaN)).not.toThrow();
    expect(createMvpRun(Number.NaN).seed).toBe(0);
    expect(createMvpRun(Number.POSITIVE_INFINITY).seed).toBe(0);
    expect(createMvpRun(Number.NEGATIVE_INFINITY).seed).toBe(0);
  });
});

describe('deterministic room rebuild', () => {
  it('rebuilds the same room state from the same inputs and never carries room entities', () => {
    const state = createMvpRun(23);
    const room = state.wing.rooms[2]!;

    const first = buildRoomCombatState(state.wing, 2, 'west', state.inventory, state.seed);
    const second = buildRoomCombatState(state.wing, 2, 'west', state.inventory, state.seed);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    expect(first.walls).toEqual(room.walls);
    expect(first.projectiles).toEqual([]);
    expect(first.surfaces).toEqual([]);
    expect(first.eventQueue).toEqual([]);
    expect(first.player.x).toBe(room.playerEntry.x);
    expect(first.player.y).toBe(room.playerEntry.y);
    expect(first.player.health).toBe(6);
    expect(first.enemies.map((enemy) => enemy.kind)).toEqual(
      room.enemySpawns.map((spawn) => spawn.kind),
    );
    expect(first.enemies.map((enemy) => enemy.id)).toEqual(
      room.enemySpawns.map((_, index) => index + 1),
    );
    expect(first.nextEntityId).toBe(room.enemySpawns.length + 1);

    const mirrored = buildRoomCombatState(state.wing, 2, 'east', state.inventory, state.seed);
    expect(mirrored.player.x).toBe(PLAYFIELD_WIDTH - room.playerEntry.x);
    expect(mirrored.player.y).toBe(room.playerEntry.y);
  });

  it('spawns every room and both entry sides outside solid geometry', () => {
    const state = createMvpRun(5);

    for (const [roomIndex, room] of state.wing.rooms.entries()) {
      for (const side of ['west', 'east'] as const) {
        const combat = buildRoomCombatState(state.wing, roomIndex, side, state.inventory, state.seed);
        expect(combat.player.x).toBeGreaterThanOrEqual(0);
        expect(combat.player.x).toBeLessThanOrEqual(PLAYFIELD_WIDTH);
        expect(combat.player.y).toBeGreaterThanOrEqual(0);
        expect(combat.player.y).toBeLessThanOrEqual(PLAYFIELD_HEIGHT);
        for (const wall of room.walls) {
          expect(
            circleIntersectsRect(
              combat.player.x,
              combat.player.y,
              combat.player.radius,
              wall,
            ),
          ).toBe(false);
        }
      }
    }
  });

  it('always returns a combat room with only its authored enemies, no projectiles, and no surfaces', () => {
    const state = createMvpRun(7);
    state.room.combat.projectiles.push({
      id: 99,
      x: 10,
      y: 10,
      previousX: 10,
      previousY: 10,
      velocityX: 1,
      velocityY: 0,
      radius: 4,
      remainingTicks: 20,
      faction: 'enemy',
      damage: 1,
    });
    state.room.combat.surfaces.push({
      id: 98,
      kind: 'wet',
      x: 10,
      y: 10,
      radius: 12,
      remainingTicks: 20,
      rootActionId: 1,
      sourceItemIds: [],
    });

    // A real combat room, so the enemy claim is actually exercised.
    const combatIndex = state.wing.rooms.findIndex((room) => room.enemySpawns.length > 0);
    expect(combatIndex).toBeGreaterThanOrEqual(0);
    const combatRoom = state.wing.rooms[combatIndex]!;
    const rebuilt = buildRoomCombatState(
      state.wing,
      combatIndex,
      'west',
      state.inventory,
      state.seed,
    );

    expect(rebuilt.projectiles).toEqual([]);
    expect(rebuilt.surfaces).toEqual([]);
    expect(rebuilt.enemies.length).toBeGreaterThan(0);
    expect(rebuilt.enemies.map((enemy) => enemy.kind)).toEqual(
      combatRoom.enemySpawns.map((spawn) => spawn.kind),
    );
    expect(rebuilt.enemies.map((enemy) => ({ x: enemy.x, y: enemy.y }))).toEqual(
      combatRoom.enemySpawns.map((spawn) => ({ x: spawn.x, y: spawn.y })),
    );
  });
});

describe('room transitions', () => {
  it('preserves run state across a transition and persists consumed offers', () => {
    const state = createMvpRun(9);
    expect(walkThrough(state, 'east').accepted).toBe(true);
    expect(state.roomIndex).toBe(1);
    expect(state.room.roomId).toBe('storefront_a');

    const offer = state.wing.rooms[1]!.offers[0]!;
    const bought = buyRunOffer(state, offer.id);
    expect(bought.accepted).toBe(true);
    expect(state.offerStatus[offer.id]).toBe('consumed');
    const cashAfterPurchase = state.cash;
    const selectedPrimary = state.inventory.selectedPrimaryInstanceId;
    const inventorySize = state.inventory.inventory.length;
    const revisionAfterPurchase = state.inventory.revision;

    state.room.combat.player.health = 4;
    state.heat = 12;
    state.suspicion = 3;

    expect(walkThrough(state, 'east').accepted).toBe(true);
    expect(state.roomIndex).toBe(2);
    expect(state.room.roomId).toBe('food_court');
    expect(state.cash).toBe(cashAfterPurchase);
    expect(state.heat).toBe(12);
    expect(state.suspicion).toBe(3);
    expect(state.inventory.revision).toBe(revisionAfterPurchase);
    expect(state.inventory.selectedPrimaryInstanceId).toBe(selectedPrimary);
    expect(state.inventory.inventory).toHaveLength(inventorySize);
    expect(state.offerStatus[offer.id]).toBe('consumed');
    expect(state.room.combat.player.health).toBe(4);
    expect(state.room.combat.walls).toEqual(state.wing.rooms[2]!.walls);
    expect(state.room.combat.selectedPrimaryInstanceId).toBe(selectedPrimary);
    expect(state.checkpoint).toEqual({ roomIndex: 2, tick: state.tick });

    const purchased = state.inventory.inventory.filter(
      (node) => node.kind === 'leaf' && node.acquisitionKind === 'purchased',
    );
    expect(purchased).toHaveLength(2);
  });

  it('locks both doors while a combat room has enemies and opens them once cleared', () => {
    const state = createMvpRun(9);
    walkToRoom(state, 'food_court');
    expect(state.room.combat.enemies.length).toBeGreaterThan(0);
    expect(state.room.cleared).toBe(false);

    const lockedEast = enterDoorway(state, 'east');
    expect(lockedEast.accepted).toBe(false);
    if (!lockedEast.accepted) {
      expect(lockedEast.reason).toMatch(/locked/i);
    }
    const lockedWest = enterDoorway(state, 'west');
    expect(lockedWest.accepted).toBe(false);
    if (!lockedWest.accepted) {
      expect(lockedWest.reason).toMatch(/locked/i);
    }
    expect(state.roomIndex).toBe(2);

    clearCurrentRoom(state);
    expect(state.room.cleared).toBe(true);
    expect(state.clearedRooms).toContain('food_court');
    expect(state.status).toBe('playing');

    expect(enterDoorway(state, 'west').accepted).toBe(true);
    expect(state.roomIndex).toBe(1);
    expect(walkThrough(state, 'east').accepted).toBe(true);
    expect(state.roomIndex).toBe(2);

    expect(enterDoorway(state, 'east').accepted).toBe(true);
    expect(state.roomIndex).toBe(3);
    expect(state.room.roomId).toBe('storefront_b');

    expect(walkThrough(state, 'west').accepted).toBe(true);
    expect(state.roomIndex).toBe(2);
    expect(state.room.combat.enemies).toHaveLength(0);
    expect(state.room.cleared).toBe(true);
  });

  it('keeps safe rooms fully passable in both directions', () => {
    const state = createMvpRun(9);
    walkThrough(state, 'east');
    expect(state.room.roomId).toBe('storefront_a');
    expect(state.room.combat.enemies).toHaveLength(0);
    expect(enterDoorway(state, 'east').accepted).toBe(true);
    expect(state.roomIndex).toBe(2);
    clearCurrentRoom(state);
    expect(state.room.cleared).toBe(true);
    expect(enterDoorway(state, 'west').accepted).toBe(true);
    expect(state.roomIndex).toBe(1);
    expect(enterDoorway(state, 'west').accepted).toBe(true);
    expect(state.roomIndex).toBe(0);
    expect(state.room.roomId).toBe('service_corridor');
  });

  it('seals the security office on entry and spawns exactly one boss at its anchor', () => {
    const state = createMvpRun(15);
    walkToRoom(state, 'security_office');

    expect(state.roomIndex).toBe(5);
    expect(state.room.roomId).toBe('security_office');
    expect(state.checkpoint).toEqual({ roomIndex: 5, tick: state.tick });
    expect(state.room.cleared).toBe(false);

    const bosses = state.room.combat.enemies.filter((enemy) => enemy.kind === 'lp_manager');
    expect(bosses).toHaveLength(1);
    expect(state.room.combat.enemies).toHaveLength(1);
    const boss = bosses[0]!;
    expect(boss.x).toBe(state.wing.rooms[5]!.bossAnchor?.x);
    expect(boss.y).toBe(state.wing.rooms[5]!.bossAnchor?.y);
    expect(boss.health).toBe(BOSS_MAX_HEALTH);
    expect(boss.phase).toBe('pursue');

    const sealed = enterDoorway(state, 'west');
    expect(sealed.accepted).toBe(false);
    expect(state.roomIndex).toBe(5);
  });

  it('rejects a doorway the room does not have', () => {
    const state = createMvpRun(15);
    const result = enterDoorway(state, 'west');
    expect(result.accepted).toBe(false);
    expect(state.roomIndex).toBe(0);
  });

  it('crosses a doorway the player reaches while moving toward it', () => {
    const state = createMvpRun(9);
    const east = doorwayRectOf(state, 'east');
    state.room.combat.player.x = east.x - 5;
    state.room.combat.player.y = east.y + east.height / 2;

    advance(state, 1, { moveX: 1, recall: true });

    expect(state.roomIndex).toBe(1);
    expect(state.room.roomId).toBe('storefront_a');
    expect(state.heldActions).toEqual({ interact: false, steal: false, recall: false });

    const west = doorwayRectOf(state, 'west');
    state.room.combat.player.x = west.x + 5;
    state.room.combat.player.y = west.y + west.height / 2;
    advance(state, 1, { moveX: -1 });
    expect(state.roomIndex).toBe(0);
    expect(state.room.roomId).toBe('service_corridor');
  });
});

describe('mvp interactions', () => {
  it('reports the nearest offer, door, and bench interaction', () => {
    const state = createMvpRun(9);
    walkThrough(state, 'east');

    const offer = state.wing.rooms[1]!.offers[0]!;
    state.room.combat.player.x = offer.position.x;
    state.room.combat.player.y = offer.position.y;
    expect(nearestMvpInteraction(state)).toMatchObject({ kind: 'offer', offerId: offer.id });

    const bought = tryInteract(state);
    expect(bought.accepted).toBe(true);
    expect(state.offerStatus[offer.id]).toBe('consumed');

    state.room.combat.player.x = 480;
    state.room.combat.player.y = 240;
    const east = doorwayRectOf(state, 'east');
    state.room.combat.player.x = east.x - 20;
    state.room.combat.player.y = east.y + east.height / 2;
    expect(nearestMvpInteraction(state)).toMatchObject({ kind: 'door', side: 'east' });

    const corridor = createMvpRun(9);
    const kiosk = corridor.wing.rooms[0]!.benchKiosk!;
    corridor.room.combat.player.x = kiosk.x;
    corridor.room.combat.player.y = kiosk.y;
    expect(nearestMvpInteraction(corridor)).toMatchObject({ kind: 'bench' });
    expect(tryInteract(corridor).accepted).toBe(true);

    corridor.room.combat.player.x = 480;
    corridor.room.combat.player.y = 240;
    expect(nearestMvpInteraction(corridor)).toMatchObject({ kind: 'none' });
    expect(tryInteract(corridor).accepted).toBe(false);
  });

  it('reports a locked doorway on both sides while the room still has enemies', () => {
    const state = createMvpRun(9);
    walkToRoom(state, 'food_court');
    const east = doorwayRectOf(state, 'east');
    state.room.combat.player.x = east.x - 20;
    state.room.combat.player.y = east.y + east.height / 2;

    const interaction = nearestMvpInteraction(state);

    expect(interaction.kind).toBe('door');
    if (interaction.kind === 'door') {
      expect(interaction.side).toBe('east');
      expect(interaction.locked).toBe(true);
      expect(interaction.lockedReason).not.toBeNull();
    }
    expect(tryInteract(state).accepted).toBe(false);

    const west = doorwayRectOf(state, 'west');
    state.room.combat.player.x = west.x + 20;
    state.room.combat.player.y = west.y + west.height / 2;

    const westInteraction = nearestMvpInteraction(state);

    expect(westInteraction.kind).toBe('door');
    if (westInteraction.kind === 'door') {
      expect(westInteraction.side).toBe('west');
      expect(westInteraction.locked).toBe(true);
      expect(westInteraction.lockedReason).not.toBeNull();
    }
    expect(tryInteract(state).accepted).toBe(false);
  });
});

describe('terminal outcomes', () => {
  it('wins when the boss dies and clears the checkpoint', () => {
    const state = createMvpRun(15);
    walkToRoom(state, 'security_office');
    clearCurrentRoom(state);

    expect(state.status).toBe('won');
    expect(state.checkpoint).toBeNull();
    expect(state.summary).not.toBeNull();
    expect(state.summary?.status).toBe('won');
    expect(state.summary?.seed).toBe(15);
    expect(state.summary?.roomIndex).toBe(5);
    expect(state.summary?.roomsCleared).toBeGreaterThan(0);
    expect(state.summary?.cash).toBe(state.cash);
    expect(state.summary?.tick).toBe(state.tick);

    const frozen = JSON.stringify(state.summary);
    advance(state, 5);
    expect(JSON.stringify(state.summary)).toBe(frozen);
    expect(state.status).toBe('won');
  });

  it('dies to enemy contact and keeps the checkpoint', () => {
    const state = createMvpRun(9);
    walkToRoom(state, 'food_court');
    state.room.combat.player.health = 1;
    state.room.combat.enemies = [
      hangerAt(state.room.combat.player.x, state.room.combat.player.y),
    ];

    advance(state, 1);

    expect(state.status).toBe('dead');
    expect(state.summary?.status).toBe('dead');
    expect(state.checkpoint).not.toBeNull();
    expect(state.checkpoint?.roomIndex).toBe(2);
  });

  it('wins when the boss dies while its summoned Hangers are still alive', () => {
    const state = createMvpRun(15);
    walkToRoom(state, 'security_office');
    const boss = state.room.combat.enemies.find((enemy) => enemy.kind === 'lp_manager');
    expect(boss).toBeDefined();
    if (!boss) {
      return;
    }

    boss.health = 1;
    advance(state, 1);
    expect(boss.bossPhase).toBe(3);
    expect(
      state.room.combat.enemies.filter((enemy) => enemy.kind === 'hanger'),
    ).toHaveLength(2);
    expect(state.status).toBe('playing');

    boss.health = 0;
    advance(state, 1);

    expect(state.status).toBe('won');
    expect(state.checkpoint).toBeNull();
    expect(state.summary?.status).toBe('won');
    expect(state.summary?.seed).toBe(15);
    expect(state.room.combat.enemies.some((enemy) => enemy.kind === 'hanger')).toBe(true);

    const frozen = JSON.stringify(state.summary);
    advance(state, 5);
    expect(JSON.stringify(state.summary)).toBe(frozen);
    expect(state.status).toBe('won');
  });
});

describe('loadout refresh', () => {
  it('bumps the revision and grows the room inventory when a purchase lands', () => {
    const state = createMvpRun(9);
    walkThrough(state, 'east');
    const offer = state.wing.rooms[1]!.offers[0]!;
    const instanceCountBefore = state.room.combat.inventory.length;

    expect(buyRunOffer(state, offer.id).accepted).toBe(true);

    expect(state.inventory.revision).toBe(1);
    expect(state.room.combat.inventory).toHaveLength(instanceCountBefore + 1);
    expect(
      state.room.combat.inventory.some(
        (instance) => instance.itemId === offer.itemDefinitionId,
      ),
    ).toBe(true);
  });

  it('recompiles the compiled behaviour when a new definition joins the run', () => {
    const state = createMvpRun(9);
    const before = state.room.combat.compiledLoadout.trace.join('|');
    const nozzle: InventoryLeaf = {
      kind: 'leaf',
      instanceId: 'test-wide-nozzle',
      itemDefinitionId: 'wide_nozzle',
      acquisitionKind: 'purchased',
      sourceLocationId: 'test-store',
      sourceStockId: 'test-wide-nozzle-offer',
      acquisitionTick: state.tick,
    };
    state.inventory = {
      ...state.inventory,
      inventory: [...state.inventory.inventory, nozzle],
      revision: state.inventory.revision + 1,
    };

    refreshRunLoadout(state);

    const after = state.room.combat.compiledLoadout.trace.join('|');
    expect(after).not.toBe(before);
    expect(state.room.combat.compiledLoadout.compatibilityNotes).toHaveLength(1);
    expect(state.room.combat.inventory).toHaveLength(2);
  });
});
