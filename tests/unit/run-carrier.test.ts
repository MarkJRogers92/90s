/**
 * The M5 run's in-run Remote-Control Car and Bench Warrant fusion.
 *
 * These cover the gap the M5 acceptance list claimed and no browser test
 * proved: that a player can actually buy the car, use it, walk to the kiosk,
 * read a preview, commit an Emitter Mount, and fire from the car.
 */
import { describe, expect, it } from 'vitest';
import { CAR_BUMP_DAMAGE, CAR_LEASH, CAR_RADIUS } from '../../src/sim/carrier/car';
import { isPlayerProjectile } from '../../src/sim/effects/playerProjectiles';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import {
  cancelRunFusionPreview,
  confirmRunFusionPreview,
  openRunFusionPreview,
} from '../../src/sim/run/bench';
import { carrierModeForInventory } from '../../src/sim/run/carrier';
import {
  parseCheckpoint,
  restoreMvpRun,
  serializeCheckpoint,
} from '../../src/sim/run/checkpoint';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';
import type { EnemyState } from '../../src/sim/model';

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

function advance(
  state: MvpRunState,
  count: number,
  overrides: Partial<MvpInputFrame> = {},
): void {
  for (let index = 0; index < count; index += 1) {
    tickMvpRun(state, input(overrides));
  }
}

function grantItem(state: MvpRunState, itemDefinitionId: string): void {
  const leaf: InventoryLeaf = {
    kind: 'leaf',
    instanceId: `test-${itemDefinitionId}`,
    itemDefinitionId,
    acquisitionKind: 'purchased',
    sourceLocationId: 'test-store',
    sourceStockId: `test-${itemDefinitionId}-offer`,
    acquisitionTick: state.tick,
  };
  state.inventory = {
    ...state.inventory,
    inventory: [...state.inventory.inventory, leaf],
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
}

function makeEnemy(id: number, x: number, y: number, health = 8): EnemyState {
  return {
    id,
    kind: 'hanger',
    x,
    y,
    health,
    radius: 14,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
  };
}

/** Puts the player on the room-zero Bench Warrant kiosk without moving rooms. */
function standAtKiosk(state: MvpRunState): void {
  const kiosk = state.wing.rooms[state.roomIndex]!.benchKiosk;
  if (!kiosk) {
    throw new Error('room has no Bench Warrant kiosk');
  }
  state.room.combat.player.x = kiosk.x;
  state.room.combat.player.y = kiosk.y;
}

function distanceBetween(
  first: { x: number; y: number },
  second: { x: number; y: number },
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

describe('the run owns a car only while its inventory does', () => {
  it('starts a shift with no car at all', () => {
    const state = createMvpRun(7);

    expect(state.carrier).toBeNull();
    expect(carrierModeForInventory(state.inventory)).toBeNull();
  });

  it('brings an independent car into the run when the car is acquired', () => {
    const state = createMvpRun(7);

    grantItem(state, 'rc_car');
    advance(state, 1);

    expect(state.carrier).not.toBeNull();
    expect(state.carrier?.mode).toBe('independent');
    expect(state.carrier?.radius).toBe(CAR_RADIUS);
    // It parks beside the player, inside the leash, rather than on top of them.
    const distance = distanceBetween(state.carrier!, state.room.combat.player);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThanOrEqual(CAR_LEASH);
  });

  it('seeks and bumps a nearby enemy while independent', () => {
    const state = createMvpRun(7);
    grantItem(state, 'rc_car');
    advance(state, 1);

    const player = state.room.combat.player;
    const enemy = makeEnemy(1, player.x + 60, player.y + 60);
    state.room.combat.enemies = [enemy];
    const healthBefore = enemy.health;

    advance(state, 120);

    expect(enemy.health).toBeLessThan(healthBefore);
    expect(healthBefore - enemy.health).toBeGreaterThanOrEqual(CAR_BUMP_DAMAGE);
    // The leash holds while it works.
    expect(distanceBetween(state.carrier!, state.room.combat.player)).toBeLessThanOrEqual(
      CAR_LEASH + CAR_RADIUS,
    );
  });

  it('does not spawn a car for an item that is not an emitter carrier', () => {
    const state = createMvpRun(7);

    grantItem(state, 'box_cutter');
    advance(state, 1);

    expect(state.carrier).toBeNull();
  });
});

describe('the Bench Warrant preview in the run', () => {
  function runAtKioskWithCarAndPrimary(seed = 7): MvpRunState {
    const state = createMvpRun(seed);
    grantItem(state, 'rc_car');
    grantItem(state, 'party_popper');
    state.inventory = {
      ...state.inventory,
      selectedPrimaryInstanceId: 'test-party_popper',
    };
    refreshRunLoadout(state);
    advance(state, 1);
    standAtKiosk(state);
    return state;
  }

  it('opens from the kiosk, pauses the shift, and names both ingredients', () => {
    const state = runAtKioskWithCarAndPrimary();

    tickMvpRun(state, input({ interact: true }));

    expect(state.preview).not.toBeNull();
    expect(state.paused).toBe(true);
    expect(state.preview?.primaryName).toContain('Party Popper');
    expect(state.preview?.carrierName).toContain('RC Car');
    expect(state.preview?.fee).toBeGreaterThan(0);
    // Nothing has been spent or fused by merely previewing.
    expect(state.inventory.inventory.some((node) => node.kind === 'composite')).toBe(false);
  });

  it('resumes the shift and changes nothing when cancelled', () => {
    const state = runAtKioskWithCarAndPrimary();
    tickMvpRun(state, input({ interact: true }));
    const cashBefore = state.cash;
    const revisionBefore = state.inventory.revision;

    const result = cancelRunFusionPreview(state);

    expect(result.accepted).toBe(true);
    expect(state.preview).toBeNull();
    expect(state.paused).toBe(false);
    expect(state.cash).toBe(cashBefore);
    expect(state.inventory.revision).toBe(revisionBefore);
  });

  it('fuses on confirm, charges the fee once, and promotes the car', () => {
    const state = runAtKioskWithCarAndPrimary();
    tickMvpRun(state, input({ interact: true }));
    const cashBefore = state.cash;
    const revisionBefore = state.inventory.revision;

    const result = confirmRunFusionPreview(state);

    expect(result.accepted).toBe(true);
    expect(state.preview).toBeNull();
    expect(state.paused).toBe(false);
    expect(state.inventory.inventory.some((node) => node.kind === 'composite')).toBe(true);
    expect(state.inventory.revision).toBe(revisionBefore + 1);
    expect(state.cash).toBeLessThan(cashBefore);
    expect(state.inventory.cash).toBe(state.cash);
    expect(state.carrier?.mode).toBe('emitter');
    expect(state.room.combat.compiledLoadout.primary.definitionId).toBe('party_popper');
  });

  it('refuses a commit against inventory the player never previewed', () => {
    const state = runAtKioskWithCarAndPrimary();
    tickMvpRun(state, input({ interact: true }));
    const agreement = state.preview?.transactionId;
    // A purchase between preview and confirm bumps the revision.
    grantItem(state, 'gel_pens');
    const cashBefore = state.cash;

    const result = confirmRunFusionPreview(state);

    expect(result.accepted).toBe(false);
    expect(agreement).toBeDefined();
    expect(state.inventory.inventory.some((node) => node.kind === 'composite')).toBe(false);
    expect(state.cash).toBe(cashBefore);
  });

  it('refuses to open without a car and reports why', () => {
    const state = createMvpRun(7);
    grantItem(state, 'party_popper');
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 'test-party_popper' };
    refreshRunLoadout(state);
    standAtKiosk(state);

    const result = openRunFusionPreview(state);

    expect(result.accepted).toBe(false);
    expect(state.preview).toBeNull();
  });
});

describe('firing from the fused car', () => {
  function fusedRun(seed = 7): MvpRunState {
    const state = createMvpRun(seed);
    grantItem(state, 'rc_car');
    grantItem(state, 'party_popper');
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 'test-party_popper' };
    refreshRunLoadout(state);
    advance(state, 1);
    standAtKiosk(state);
    tickMvpRun(state, input({ interact: true }));
    expect(confirmRunFusionPreview(state).accepted).toBe(true);
    return state;
  }

  it('starts a shot at the car rather than at the player', () => {
    const state = fusedRun();
    const player = state.room.combat.player;
    // Park the car well clear of the player, still inside the leash.
    state.carrier!.x = player.x + 120;
    state.carrier!.y = player.y;
    const carPosition = { x: state.carrier!.x, y: state.carrier!.y };
    state.room.combat.projectiles = [];

    tickMvpRun(state, input({ aimX: carPosition.x + 40, aimY: carPosition.y, fire: true }));

    const shots = state.room.combat.projectiles.filter(isPlayerProjectile);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(distanceBetween(shot, carPosition)).toBeLessThan(
        distanceBetween(shot, state.room.combat.player),
      );
    }
  });

  it('keeps firing from the player while the car is merely independent', () => {
    const state = createMvpRun(7);
    grantItem(state, 'rc_car');
    grantItem(state, 'party_popper');
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 'test-party_popper' };
    refreshRunLoadout(state);
    advance(state, 1);
    const player = state.room.combat.player;
    state.carrier!.x = player.x + 120;
    state.carrier!.y = player.y;
    state.room.combat.projectiles = [];

    tickMvpRun(state, input({ aimX: player.x + 40, aimY: player.y, fire: true }));

    const shots = state.room.combat.projectiles.filter(isPlayerProjectile);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(distanceBetween(shot, player)).toBeLessThan(
        distanceBetween(shot, state.carrier!),
      );
    }
  });
});

describe('recall and room changes', () => {
  function fusedRun(seed = 7): MvpRunState {
    const state = createMvpRun(seed);
    grantItem(state, 'rc_car');
    grantItem(state, 'party_popper');
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 'test-party_popper' };
    refreshRunLoadout(state);
    advance(state, 1);
    standAtKiosk(state);
    tickMvpRun(state, input({ interact: true }));
    expect(confirmRunFusionPreview(state).accepted).toBe(true);
    return state;
  }

  it('refuses recall until the car is fused, then sends it home', () => {
    const state = createMvpRun(7);
    grantItem(state, 'rc_car');
    advance(state, 1);

    tickMvpRun(state, input({ recall: true }));
    expect(state.carrier?.recalling).toBe(false);
    expect(state.recentChange).toContain('after Emitter Mount fusion');
  });

  it('edge-triggers recall once and brings the car within recall distance', () => {
    const state = fusedRun();
    const player = state.room.combat.player;
    state.carrier!.x = player.x + 150;
    state.carrier!.y = player.y;

    tickMvpRun(state, input({ recall: true }));
    expect(state.carrier?.recalling).toBe(true);

    advance(state, 200);

    expect(distanceBetween(state.carrier!, state.room.combat.player)).toBeLessThan(CAR_LEASH);
  });

  it('re-parks the car in the destination room instead of carrying its position', () => {
    const state = fusedRun();
    const doorway = state.wing.rooms[0]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = doorway.rect.x + doorway.rect.width / 2;
    state.room.combat.player.y = doorway.rect.y + doorway.rect.height / 2;

    const result = enterDoorway(state, 'east');

    expect(result.accepted).toBe(true);
    expect(state.carrier).not.toBeNull();
    expect(state.carrier?.mode).toBe('emitter');
    const distance = distanceBetween(state.carrier!, state.room.combat.player);
    expect(distance).toBeLessThanOrEqual(CAR_LEASH);
  });

  it('drops the car when the inventory no longer carries one', () => {
    const state = createMvpRun(7);
    grantItem(state, 'rc_car');
    advance(state, 1);
    expect(state.carrier).not.toBeNull();

    state.inventory = {
      ...state.inventory,
      inventory: state.inventory.inventory.filter(
        (node) => node.instanceId !== 'test-rc_car',
      ),
      revision: state.inventory.revision + 1,
    };
    advance(state, 1);

    expect(state.carrier).toBeNull();
  });
});

describe('checkpoints re-derive the car', () => {
  it('restores an unfused shift with an independent car', () => {
    const state = createMvpRun(7);
    grantItem(state, 'rc_car');
    advance(state, 1);

    const parsed = parseCheckpoint(serializeCheckpoint(state));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const restored = restoreMvpRun(parsed.checkpoint);

    expect(carrierModeForInventory(restored.inventory)).toBe('independent');
    expect(restored.carrier?.mode).toBe('independent');
    expect(distanceBetween(restored.carrier!, restored.room.combat.player)).toBeLessThanOrEqual(
      CAR_LEASH,
    );
  });

  it('restores a fused shift with the car already steering the shots', () => {
    const state = createMvpRun(7);
    grantItem(state, 'rc_car');
    grantItem(state, 'party_popper');
    state.inventory = { ...state.inventory, selectedPrimaryInstanceId: 'test-party_popper' };
    refreshRunLoadout(state);
    advance(state, 1);
    standAtKiosk(state);
    tickMvpRun(state, input({ interact: true }));
    expect(confirmRunFusionPreview(state).accepted).toBe(true);

    const parsed = parseCheckpoint(serializeCheckpoint(state));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const restored = restoreMvpRun(parsed.checkpoint);

    expect(restored.carrier?.mode).toBe('emitter');
    expect(restored.room.combat.compiledLoadout.primary.definitionId).toBe('party_popper');
  });
});
