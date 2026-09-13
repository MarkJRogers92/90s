import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { createBenchRun } from '../../src/sim/bench/createBenchRun';
import {
  acquireLateModifier,
  cancelFusion,
  confirmFusion,
  openFusionPreview,
  transferBenchRoom,
} from '../../src/sim/bench/commands';
import { SERVICE_DOORWAY, TEST_BAY_ANCHORS, testBayEnemies } from '../../src/sim/bench/scenarios';
import { tickBenchRun } from '../../src/sim/bench/tickBenchRun';
import type { BenchInputFrame, BenchRunState } from '../../src/sim/bench/types';
import { isPlayerProjectile } from '../../src/sim/effects/playerProjectiles';
import { MAX_BEHAVIOR_TRACE_ENTRIES } from '../../src/sim/effects/constants';

function baseFrame(): BenchInputFrame {
  return { moveX: 0, moveY: 0, aimX: 760, aimY: 240, fire: false, interact: false, recall: false };
}

function pressE(state: BenchRunState): void {
  tickBenchRun(state, { ...baseFrame(), interact: true });
}

function snapshotFusion(state: BenchRunState): string {
  return JSON.stringify(state.fusion);
}

describe('bench run full loop', () => {
  it('creates the three approved scenarios with $10 cash and in-range spawns', () => {
    const clean = createBenchRun('clean-soaker');
    expect(clean.fusion.cash).toBe(10);
    expect(clean.fusion.revision).toBe(0);
    expect(clean.fusion.selectedPrimaryInstanceId).toBe('soaker');
    expect(clean.activeRoom).toBe('service');
    expect(clean.carrier.mode).toBe('independent');
    expect(clean.preview).toBeNull();
    expect(clean.paused).toBe(false);

    const stolen = createBenchRun('stolen-popper');
    expect(stolen.fusion.cash).toBe(10);
    expect(stolen.fusion.selectedPrimaryInstanceId).toBe('popper');

    const mop = createBenchRun('unsupported-mop');
    expect(mop.fusion.cash).toBe(10);
    expect(mop.fusion.selectedPrimaryInstanceId).toBe('mop');

    for (const state of [clean, stolen, mop]) {
      const distance = Math.hypot(state.combat.player.x - 240, state.combat.player.y - 240);
      expect(distance).toBeLessThanOrEqual(110);
    }
  });

  it('rejects unknown scenario IDs', () => {
    expect(() => createBenchRun('unknown' as never)).toThrow();
  });

  it('opens the clean preview on the first E press with the exact $4 fee', () => {
    const state = createBenchRun('clean-soaker');
    pressE(state);
    expect(state.preview).not.toBeNull();
    expect(state.preview?.fee).toBe(4);
    expect(state.preview?.primaryProvenance).toBe('purchased');
    expect(state.preview?.carrierProvenance).toBe('purchased');
    expect(state.paused).toBe(true);
    const combatTick = state.combat.tick;
    const carrierX = state.carrier.x;
    tickBenchRun(state, baseFrame());
    expect(state.combat.tick).toBe(combatTick);
    expect(state.carrier.x).toBe(carrierX);
  });

  it('previews the stolen fee at the full $6', () => {
    const state = createBenchRun('stolen-popper');
    pressE(state);
    expect(state.preview?.fee).toBe(6);
    expect(state.paused).toBe(true);
  });

  it('rejects the unsupported mop preview without changing authoritative state', () => {
    const state = createBenchRun('unsupported-mop');
    const before = snapshotFusion(state);
    pressE(state);
    expect(state.preview).toBeNull();
    expect(state.paused).toBe(false);
    expect(state.recentChange).toMatch(/projectile primary/);
    expect(snapshotFusion(state)).toBe(before);
    confirmFusion(state);
    expect(snapshotFusion(state)).toBe(before);
    expect(state.carrier.mode).toBe('independent');
  });

  it('cancels the preview without touching inventory, cash, or revision', () => {
    const state = createBenchRun('clean-soaker');
    pressE(state);
    expect(state.preview).not.toBeNull();
    const before = snapshotFusion(state);
    cancelFusion(state);
    expect(state.preview).toBeNull();
    expect(state.paused).toBe(false);
    expect(snapshotFusion(state)).toBe(before);
    expect(state.fusion.cash).toBe(10);
    expect(state.carrier.mode).toBe('independent');
  });

  it('confirms the clean fusion once and refreshes projection plus compiled combat', () => {
    const state = createBenchRun('clean-soaker');
    openFusionPreview(state);
    confirmFusion(state);
    expect(state.preview).toBeNull();
    expect(state.paused).toBe(false);
    expect(state.fusion.cash).toBe(6);
    expect(state.fusion.revision).toBe(1);
    expect(state.fusion.selectedPrimaryInstanceId).toBe('emitter-mount-1');
    expect(state.carrier.mode).toBe('emitter');
    expect(state.combat.selectedPrimaryInstanceId).toBe('emitter-mount-1');
    expect(state.combat.compiledLoadout.sourceItemIds).toContain('pump_soaker');
    expect(state.combat.compiledLoadout.sourceItemIds).not.toContain('rc_car');
    const cashAfter = state.fusion.cash;
    confirmFusion(state);
    expect(state.fusion.cash).toBe(cashAfter);
    expect(state.fusion.revision).toBe(1);
  });

  it('confirms the stolen fusion for the full $6 with retained provenance', () => {
    const state = createBenchRun('stolen-popper');
    openFusionPreview(state);
    expect(state.preview?.fee).toBe(6);
    confirmFusion(state);
    expect(state.fusion.cash).toBe(4);
    const composite = state.fusion.inventory.find((node) => node.kind === 'composite');
    if (composite?.kind !== 'composite') {
      throw new Error('Expected a fused composite.');
    }
    expect(composite.primary.acquisitionKind).toBe('stolen');
    expect(state.combat.compiledLoadout.sourceItemIds).toContain('party_popper');
  });

  it('passes state.tick as the fusion createdTick', () => {
    const state = createBenchRun('clean-soaker');
    for (let index = 0; index < 7; index += 1) {
      tickBenchRun(state, baseFrame());
    }
    openFusionPreview(state);
    confirmFusion(state);
    const composite = state.fusion.inventory.find((node) => node.kind === 'composite');
    if (composite?.kind !== 'composite') {
      throw new Error('Expected a fused composite.');
    }
    expect(composite.createdTick).toBe(7);
  });

  it('acquires late Gel Pens after fusion with one revision bump and no in-flight mutation', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    state.combat.enemies = [];
    openFusionPreview(state);
    confirmFusion(state);
    tickBenchRun(state, { ...baseFrame(), aimX: 600, aimY: 100, fire: true });
    const inFlight = state.combat.projectiles.filter(isPlayerProjectile);
    expect(inFlight.length).toBeGreaterThan(0);
    const payloadBefore = JSON.stringify(inFlight.map((shot) => shot.payload));
    const revisionBefore = state.fusion.revision;
    acquireLateModifier(state);
    expect(state.fusion.revision).toBe(revisionBefore + 1);
    expect(state.combat.compiledLoadout.sourceItemIds).toContain('gel_pens');
    const payloadAfter = JSON.stringify(
      state.combat.projectiles.filter(isPlayerProjectile).map((shot) => shot.payload),
    );
    expect(payloadAfter).toBe(payloadBefore);
    for (let index = 0; index < 24; index += 1) {
      tickBenchRun(state, baseFrame());
    }
    tickBenchRun(state, { ...baseFrame(), aimX: 600, aimY: 100, fire: true });
    const fresh = state.combat.projectiles.filter(isPlayerProjectile);
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.some((shot) => shot.payload.sourceItemIds.includes('gel_pens'))).toBe(true);
  });

  it('transfers through the fixed doorway with cleared transients and rebuilt encounter', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.projectiles.push({
      id: 999, x: 100, y: 100, previousX: 100, previousY: 100,
      velocityX: 0, velocityY: 0, radius: 4, remainingTicks: 10,
      faction: 'enemy', damage: 1,
    });
    state.combat.surfaces.push({ id: 1, kind: 'wet', x: 100, y: 100, radius: 48, remainingTicks: 100, rootActionId: 1, sourceItemIds: ['pump_soaker'] });
    state.combat.player.x = SERVICE_DOORWAY.x + 4;
    state.combat.player.y = SERVICE_DOORWAY.y + 10;
    const transferred = transferBenchRoom(state);
    expect(transferred).toBe(true);
    expect(state.activeRoom).toBe('test_bay');
    expect(state.combat.projectiles).toEqual([]);
    expect(state.combat.surfaces).toEqual([]);
    expect(state.combat.enemies).toEqual(testBayEnemies());
    expect(state.combat.player.x).toBe(TEST_BAY_ANCHORS.player.x);
    expect(state.combat.player.y).toBe(TEST_BAY_ANCHORS.player.y);
    expect(state.carrier.x).toBe(TEST_BAY_ANCHORS.carrier.x);
    expect(state.carrier.y).toBe(TEST_BAY_ANCHORS.carrier.y);
    expect(state.carrier.mode).toBe('independent');
  });

  it('preserves emitter mode across the doorway and fires from the car afterwards', () => {
    const state = createBenchRun('clean-soaker');
    openFusionPreview(state);
    confirmFusion(state);
    state.combat.enemies = [];
    state.combat.walls = [];
    state.combat.player.x = SERVICE_DOORWAY.x + 4;
    state.combat.player.y = SERVICE_DOORWAY.y + 10;
    tickBenchRun(state, baseFrame());
    expect(state.activeRoom).toBe('test_bay');
    expect(state.carrier.mode).toBe('emitter');
    const playerBeforeX = state.combat.player.x;
    tickBenchRun(state, {
      ...baseFrame(), moveX: 1, moveY: 0,
      aimX: state.carrier.x + 60, aimY: state.carrier.y, fire: true,
    });
    expect(state.combat.player.x).toBeGreaterThan(playerBeforeX);
    const shots = state.combat.projectiles.filter(isPlayerProjectile);
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      const origin = shot.sampledPath[0];
      if (!origin) {
        throw new Error('Expected the shot to record its firing origin.');
      }
      expect(
        Math.hypot(origin.x - state.carrier.x, origin.y - state.carrier.y),
      ).toBeLessThanOrEqual(4 + 1e-6);
    }
  });

  it('restarts into a completely fresh state', () => {
    const state = createBenchRun('clean-soaker');
    pressE(state);
    tickBenchRun(state, { ...baseFrame(), recall: true });
    const fresh = createBenchRun('clean-soaker');
    expect(fresh).toEqual(createBenchRun('clean-soaker'));
    expect(fresh.tick).toBe(0);
    expect(fresh.preview).toBeNull();
    expect(fresh.paused).toBe(false);
    expect(fresh.heldActions).toEqual({ interact: false, recall: false });
    expect(fresh.carrier.mode).toBe('independent');
    expect(fresh.combat.projectiles).toEqual([]);
    expect(state.preview).not.toBeNull();
  });

  it('leaves the catalog roster untouched', () => {
    expect(ITEM_CATALOG.map((definition) => definition.id)).toContain('rc_car');
    expect(ITEM_CATALOG.map((definition) => definition.id)).toContain('party_popper');
  });

  it('rejects the late pickup before fusion with byte-equivalent fusion and combat state', () => {
    const state = createBenchRun('clean-soaker');
    const fusionBefore = JSON.stringify(state.fusion);
    const combatInventoryBefore = JSON.stringify(state.combat.inventory);
    const combatLoadoutBefore = JSON.stringify(state.combat.compiledLoadout);
    const revisionBefore = state.fusion.revision;
    const projectileCountBefore = state.combat.projectiles.length;
    acquireLateModifier(state);
    expect(state.recentChange).toMatch(/fusion/i);
    expect(JSON.stringify(state.fusion)).toBe(fusionBefore);
    expect(state.fusion.revision).toBe(revisionBefore);
    expect(JSON.stringify(state.combat.inventory)).toBe(combatInventoryBefore);
    expect(JSON.stringify(state.combat.compiledLoadout)).toBe(combatLoadoutBefore);
    expect(state.combat.projectiles.length).toBe(projectileCountBefore);
    expect(state.combat.compiledLoadout.sourceItemIds).not.toContain('gel_pens');
  });

  it('freezes shared combat on the frame preview opens, even with fire and movement', () => {
    const state = createBenchRun('clean-soaker');
    state.combat.walls = [];
    state.combat.enemies = [];
    const playerX = state.combat.player.x;
    const playerY = state.combat.player.y;
    const combatTickBefore = state.combat.tick;
    const projectileCountBefore = state.combat.projectiles.length;
    tickBenchRun(state, { moveX: 1, moveY: 0, aimX: 600, aimY: 240, fire: true, interact: true, recall: false });
    expect(state.preview).not.toBeNull();
    expect(state.paused).toBe(true);
    expect(state.combat.tick).toBe(combatTickBefore);
    expect(state.combat.projectiles.length).toBe(projectileCountBefore);
    expect(state.combat.player.x).toBe(playerX);
    expect(state.combat.player.y).toBe(playerY);
    tickBenchRun(state, { moveX: 1, moveY: 0, aimX: 600, aimY: 240, fire: true, interact: false, recall: false });
    expect(state.combat.tick).toBe(combatTickBefore);
    expect(state.combat.player.x).toBe(playerX);
    expect(state.combat.player.y).toBe(playerY);
    expect(state.combat.projectiles.length).toBe(projectileCountBefore);
  });

  it('shares one bounded trace between wrapper and combat', () => {
    const state = createBenchRun('clean-soaker');
    expect(state.behaviorTrace).toBe(state.combat.behaviorTrace);
    state.combat.walls = [];
    state.combat.enemies = [];
    tickBenchRun(state, { ...baseFrame(), aimX: 600, aimY: 100, fire: true });
    openFusionPreview(state);
    expect(state.preview).not.toBeNull();
    const combined = state.behaviorTrace;
    expect(combined.length).toBeGreaterThan(0);
    expect(combined.some((entry) => entry.includes('preview'))).toBe(true);
    expect(combined.some((entry) => entry.includes('root'))).toBe(true);
    expect(state.combat.behaviorTrace).toBe(state.behaviorTrace);
    const flood = createBenchRun('clean-soaker');
    flood.combat.walls = [];
    flood.combat.enemies = [];
    for (let index = 0; index < 60; index += 1) {
      tickBenchRun(flood, { ...baseFrame(), aimX: 600, aimY: 100, fire: true });
    }
    openFusionPreview(flood);
    confirmFusion(flood);
    acquireLateModifier(flood);
    for (let index = 0; index < 40; index += 1) {
      flood.combat.player.x = 912 + 4;
      flood.combat.player.y = 210;
      transferBenchRoom(flood);
      flood.combat.player.x = 4;
      flood.combat.player.y = 210;
      transferBenchRoom(flood);
    }
    expect(flood.behaviorTrace.length).toBeLessThanOrEqual(MAX_BEHAVIOR_TRACE_ENTRIES);
    expect(flood.behaviorTrace.length).toBeGreaterThan(0);
    expect(flood.combat.behaviorTrace).toBe(flood.behaviorTrace);
  });
});
