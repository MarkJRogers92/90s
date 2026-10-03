import { describe, expect, it } from 'vitest';
import { buildGameHudModel } from '../../src/game/ui/gameHudModel';
import { DASH_TICKS } from '../../src/sim/combat/dash';
import type { FusionInventoryNode, HybridComposite, InventoryLeaf } from '../../src/sim/fusion/types';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { NO_PERKS, runMaxHealth } from '../../src/sim/run/perks';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpInputFrame } from '../../src/sim/run/types';
import { selectRunWeaponSlot } from '../../src/sim/run/weapons';

const IDLE: MvpInputFrame = {
  moveX: 0, moveY: 0, aimX: 900, aimY: 240, fire: false,
  interact: false, steal: false, recall: false,
};

function leaf(instanceId: string, itemDefinitionId: string, stolen = false): InventoryLeaf {
  return {
    kind: 'leaf', instanceId, itemDefinitionId,
    acquisitionKind: stolen ? 'stolen' : 'purchased',
    sourceLocationId: 'test', sourceStockId: instanceId, acquisitionTick: 0,
  };
}

function freezeDeep(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(freezeDeep);
}

describe('authoritative HUD readiness', () => {
  it.each([
    { ticks: -6, tenths: 0 },
    { ticks: 0, tenths: 0 },
    { ticks: 1, tenths: 1 },
    { ticks: 5, tenths: 1 },
    { ticks: 6, tenths: 1 },
    { ticks: 7, tenths: 2 },
    { ticks: 60, tenths: 10 },
    { ticks: 61, tenths: 11 },
  ])('rounds $ticks remaining ticks up to $tenths tenths without negative time', ({ ticks, tenths }) => {
    const run = createMvpRun(7);
    run.room.combat.player.attackCooldownTicks = ticks;
    run.room.combat.player.dashCooldownTicks = ticks;
    expect(buildGameHudModel(run).readiness).toEqual({
      attackTenths: tenths, dashTenths: tenths, dashing: false,
    });
  });

  it('treats absent optional dash fields as ready without adding them to the player', () => {
    const run = createMvpRun(7);
    delete run.room.combat.player.dashTicks;
    delete run.room.combat.player.dashCooldownTicks;
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 0, dashTenths: 0, dashing: false });
    expect(run.room.combat.player).not.toHaveProperty('dashTicks');
    expect(run.room.combat.player).not.toHaveProperty('dashCooldownTicks');
  });

  it('distinguishes an active dash from recovery through the real simulation', () => {
    const run = createMvpRun(7);
    tickMvpRun(run, { ...IDLE, moveX: 1, dash: true });
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 0, dashTenths: 10, dashing: true });
    for (let tick = 1; tick < DASH_TICKS; tick += 1) tickMvpRun(run, IDLE);
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 0, dashTenths: 8, dashing: false });
    for (let tick = 0; tick < 46; tick += 1) tickMvpRun(run, IDLE);
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 0, dashTenths: 0, dashing: false });
  });

  it.each([-1, 0, 1])('uses dashTicks %s alone for the active flag, even with no recovery timer', (dashTicks) => {
    const run = createMvpRun(7);
    run.room.combat.player.dashTicks = dashTicks;
    run.room.combat.player.dashCooldownTicks = 0;
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 0, dashTenths: 0, dashing: dashTicks > 0 });
  });

  it.each([
    { cut: 0, ticks: 57, tenths: 10 },
    { cut: 10, ticks: 47, tenths: 8 },
    { cut: 20, ticks: 37, tenths: 7 },
  ])('reads the actual dash timer after a $cut-tick perk reduction', ({ cut, ticks, tenths }) => {
    const run = createMvpRun(7, { perks: { ...NO_PERKS, dashCooldownCut: cut } });
    tickMvpRun(run, { ...IDLE, moveX: 1, dash: true });
    expect(run.room.combat.player.dashCooldownTicks).toBe(ticks);
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 0, dashTenths: tenths, dashing: true });
    for (let tick = 0; tick < 6; tick += 1) tickMvpRun(run, IDLE);
    expect(buildGameHudModel(run).readiness.dashTenths).toBe(tenths - 1);
  });

  it('keeps one shared attack recovery when switching weapons mid-recovery', () => {
    const run = createMvpRun(7, { perks: { ...NO_PERKS, lockerItemId: 'pump_soaker' } });
    tickMvpRun(run, { ...IDLE, fire: true });
    const firedTicks = run.room.combat.player.attackCooldownTicks;
    expect(firedTicks).toBeGreaterThan(0);
    expect(buildGameHudModel(run).readiness?.attackTenths).toBe(Math.ceil(firedTicks / 6));
    expect(selectRunWeaponSlot(run, 1).accepted).toBe(true);
    expect(run.room.combat.compiledLoadout.primary.definitionId).toBe('janitor_mop');
    expect(run.room.combat.player.attackCooldownTicks).toBe(firedTicks);
    const switched = buildGameHudModel(run);
    expect(switched.readiness.attackTenths).toBe(Math.ceil(firedTicks / 6));
    expect(switched.weapons.find((weapon) => weapon.selected)?.itemDefinitionId).toBe('janitor_mop');
    for (const weapon of switched.weapons) {
      expect(weapon).not.toHaveProperty('readiness');
      expect(weapon).not.toHaveProperty('attackTenths');
    }
    for (let tick = 0; tick < 6; tick += 1) tickMvpRun(run, IDLE);
    expect(buildGameHudModel(run).readiness.attackTenths).toBe(Math.ceil(firedTicks / 6) - 1);
  });

  it('freezes quantized readiness while paused and resumes on simulation ticks', () => {
    const run = createMvpRun(7);
    run.room.combat.player.attackCooldownTicks = 18;
    run.room.combat.player.dashCooldownTicks = 30;
    run.room.combat.player.dashTicks = 6;
    run.paused = true;
    const before = buildGameHudModel(run).readiness;
    expect(before).toEqual({ attackTenths: 3, dashTenths: 5, dashing: true });
    for (let tick = 0; tick < 120; tick += 1) {
      tickMvpRun(run, IDLE);
      expect(buildGameHudModel(run).readiness).toEqual(before);
    }
    expect(run.tick).toBe(0);
    run.paused = false;
    for (let tick = 0; tick < 6; tick += 1) tickMvpRun(run, IDLE);
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 2, dashTenths: 4, dashing: false });
  });

  it.each(['won', 'dead'] as const)('keeps the authoritative timers when the run is %s', (status) => {
    const run = createMvpRun(7);
    run.room.combat.player.attackCooldownTicks = 7;
    run.room.combat.player.dashCooldownTicks = 19;
    run.status = status;
    for (let tick = 0; tick < 12; tick += 1) tickMvpRun(run, IDLE);
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 2, dashTenths: 4, dashing: false });
  });

  it('reads rebuilt room timers without carrying recovery from the previous room', () => {
    const run = createMvpRun(7);
    run.room.combat.player.attackCooldownTicks = 17;
    run.room.combat.player.dashCooldownTicks = 31;
    run.room.combat.player.dashTicks = 3;
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 3, dashTenths: 6, dashing: true });
    const previousRoom = run.roomIndex;
    expect(enterDoorway(run, 'east').accepted).toBe(true);
    expect(run.roomIndex).not.toBe(previousRoom);
    expect(buildGameHudModel(run).readiness).toEqual({ attackTenths: 0, dashTenths: 0, dashing: false });
  });

  it('uses a fresh run on restart and does not retain a prior readiness snapshot', () => {
    const run = createMvpRun(7);
    run.tick = 500;
    run.room.combat.player.attackCooldownTicks = 17;
    run.room.combat.player.dashCooldownTicks = 31;
    const before = buildGameHudModel(run).readiness;
    const restarted = createMvpRun(7);
    expect(buildGameHudModel(restarted).readiness).toEqual({ attackTenths: 0, dashTenths: 0, dashing: false });
    expect(before).toEqual({ attackTenths: 3, dashTenths: 6, dashing: false });
  });
});

describe('HUD passive provenance', () => {
  it('exposes fusion and hot stamps from top-level inventory nodes only', () => {
    const run = createMvpRun(7);
    const nodes: FusionInventoryNode[] = [
      leaf('clean-wallet', 'receipt_wallet'),
      leaf('hot-fanny', 'fanny_pack', true),
      {
        kind: 'composite', instanceId: 'fused-kit', recipeId: 'hybrid', createdTick: 1, transactionId: 'kit-tx',
        primary: leaf('kit-wallet', 'receipt_wallet', true), carrier: leaf('kit-fanny', 'fanny_pack'),
      },
      {
        kind: 'composite', instanceId: 'mounted-emitter', recipeId: 'emitter_mount', createdTick: 1, transactionId: 'emitter-tx',
        primary: leaf('emitter-popper', 'party_popper'), carrier: leaf('emitter-car', 'rc_car'),
      },
    ];
    run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, ...nodes] };
    expect(buildGameHudModel(run).passives).toEqual([
      expect.objectContaining({ instanceId: 'clean-wallet', fused: false, hot: false }),
      expect.objectContaining({ instanceId: 'hot-fanny', fused: false, hot: true }),
      expect.objectContaining({ instanceId: 'fused-kit', fused: true, hot: false }),
    ]);
  });
});

describe('equipped fused weapon description', () => {
  const hydroMop = (): HybridComposite => ({
    kind: 'composite', instanceId: 'hydro-mop', recipeId: 'hybrid', createdTick: 1, transactionId: 'hydro-tx',
    primary: leaf('hydro-mop-base', 'janitor_mop'), carrier: leaf('hydro-soaker', 'pump_soaker'),
  });

  function withSelected(node: FusionInventoryNode) {
    const run = createMvpRun(7);
    run.inventory = {
      ...run.inventory,
      inventory: [...run.inventory.inventory, node],
      selectedPrimaryInstanceId: node.instanceId,
    };
    return run;
  }

  it('names Hydro Mop components when the selected composite has no authored blurb', () => {
    const run = withSelected(hydroMop());
    expect(buildGameHudModel(run).equipped).toEqual({
      name: 'HYDRO MOP', blurb: 'ASSOCIATE-ISSUE MOP + PUMP-ACTION SOAKER',
    });
  });

  it('lists nested component leaves in order without mutating the selected inventory tree', () => {
    const nested: HybridComposite = {
      kind: 'composite', instanceId: 'nested-hydro', recipeId: 'hybrid', createdTick: 2, transactionId: 'nested-tx',
      primary: hydroMop(), carrier: leaf('nested-globe', 'plasma_globe'),
    };
    const run = withSelected(nested);
    const before = structuredClone(run);
    freezeDeep(run);
    expect(buildGameHudModel(run).equipped?.blurb).toBe('ASSOCIATE-ISSUE MOP + PUMP-ACTION SOAKER + CRACKED PLASMA GLOBE');
    expect(run).toEqual(before);
  });

  it('preserves an authored blurb for a selected composite instead of replacing it with component names', () => {
    const run = withSelected({
      kind: 'composite', instanceId: 'mounted-popper', recipeId: 'emitter_mount', createdTick: 1, transactionId: 'mount-tx',
      primary: leaf('mounted-primary', 'party_popper'), carrier: leaf('mounted-car', 'rc_car'),
    });
    expect(buildGameHudModel(run).equipped?.blurb).toBe('THREE-WAY CONFETTI BURST');
  });

  it('preserves an ordinary weapon blurb when another inventory weapon is fused', () => {
    const run = withSelected(hydroMop());
    expect(selectRunWeaponSlot(run, 1).accepted).toBe(true);
    expect(buildGameHudModel(run).equipped).toEqual({ name: 'ASSOCIATE-ISSUE MOP', blurb: 'WIDE MELEE SWING' });
  });
});

describe('HUD health and read-only projection', () => {
  it.each([2, 3, 4, 5, 6])('preserves every full, half and empty heart at the supported %s-heart cap', (heartCount) => {
    const run = createMvpRun(7, {
      perks: { ...NO_PERKS, bonusHealth: Math.max(0, (heartCount - 3) * 2) },
      ...(heartCount === 2 ? { rule: 'glass' as const } : {}),
    });
    expect(runMaxHealth(run)).toBe(heartCount * 2);
    for (let health = 0; health <= heartCount * 2; health += 1) {
      run.room.combat.player.health = health;
      const hearts = buildGameHudModel(run).hearts;
      expect(hearts).toHaveLength(heartCount);
      expect(hearts.filter((heart) => heart === 'full')).toHaveLength(Math.floor(health / 2));
      expect(hearts.filter((heart) => heart === 'half')).toHaveLength(health % 2);
      expect(hearts.filter((heart) => heart === 'empty')).toHaveLength(heartCount - Math.ceil(health / 2));
    }
  });

  it('projects a deeply frozen run repeatedly without mutating any authoritative state', () => {
    const run = createMvpRun(7, { perks: { ...NO_PERKS, dashCooldownCut: 20, bonusHealth: 6 } });
    tickMvpRun(run, { ...IDLE, fire: true, dash: true, moveX: 1 });
    run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, leaf('hot-fanny', 'fanny_pack', true)] };
    const before = structuredClone(run);
    freezeDeep(run);
    for (let read = 0; read < 60; read += 1) {
      const model = buildGameHudModel(run);
      expect(model.readiness).toEqual({
        attackTenths: Math.ceil(before.room.combat.player.attackCooldownTicks / 6), dashTenths: 7, dashing: true,
      });
      expect(run).toEqual(before);
    }
  });
});
