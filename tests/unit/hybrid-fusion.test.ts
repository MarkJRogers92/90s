import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { compileLoadout } from '../../src/sim/items/compileLoadout';
import { validateCatalog } from '../../src/sim/items/validateCatalog';
import {
  HYBRID_BASE_FEE,
  fusionPairFor,
  hybridDefinition,
  hybridDefinitionId,
  hybridParts,
} from '../../src/sim/fusion/hybrid';
import { definitionFor } from '../../src/sim/items/registry';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import {
  cancelRunFusionPreview,
  confirmRunFusionPreview,
  openRunWorkbench,
  pickWorkbenchItem,
} from '../../src/sim/run/bench';
import { runPurchaseDiscount } from '../../src/sim/run/economy';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { runWeaponSlots } from '../../src/sim/run/weapons';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const byId = (id: string) => ITEM_CATALOG.find((definition) => definition.id === id)!;
const NON_CARRIERS = ITEM_CATALOG.filter((definition) => !definition.capabilities?.includes('emitter_carrier'));

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function leaf(itemDefinitionId: string, acquisitionKind: 'purchased' | 'stolen' = 'purchased'): InventoryLeaf {
  return { kind: 'leaf', instanceId: `t-${itemDefinitionId}`, itemDefinitionId, acquisitionKind, sourceLocationId: 'test', sourceStockId: `t-${itemDefinitionId}`, acquisitionTick: 0 };
}

/** A shift standing at the service corridor bench, owning the given extras. */
function atBench(...items: InventoryLeaf[]): MvpRunState {
  const run = createMvpRun(5);
  run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, ...items], cash: 40, revision: run.inventory.revision + 1 };
  run.cash = 40;
  const kiosk = run.wing.rooms[0]!.benchKiosk!;
  run.room.combat.player.x = kiosk.x;
  run.room.combat.player.y = kiosk.y;
  return run;
}

describe('which pairs fuse, and into what', () => {
  it('the RC car still takes a shooter as an Emitter Mount, and refuses anything else', () => {
    expect(fusionPairFor(byId('pump_soaker'), byId('rc_car'))).toMatchObject({ recipe: 'emitter_mount' });
    expect(fusionPairFor(byId('rc_car'), byId('janitor_mop'))).toMatchObject({ recipe: null });
  });

  it('every other pair of items fuses into a hybrid', () => {
    for (const a of NON_CARRIERS) {
      for (const b of NON_CARRIERS) {
        if (a.id === b.id) continue;
        expect(fusionPairFor(a, b).recipe, `${a.id} + ${b.id}`).toBe('hybrid');
      }
    }
  });

  it('a weapon is always the base, whichever order they were picked in', () => {
    expect(fusionPairFor(byId('gel_pens'), byId('pump_soaker'))).toMatchObject({ baseId: 'pump_soaker', ingredientId: 'gel_pens' });
    // Melee beats ranged: the swing stays, and it also throws the shot.
    expect(fusionPairFor(byId('pump_soaker'), byId('janitor_mop'))).toMatchObject({ baseId: 'janitor_mop', ingredientId: 'pump_soaker' });
  });

  it('every hybrid is a valid catalog item that compiles as a loadout', () => {
    for (const a of NON_CARRIERS) {
      for (const b of NON_CARRIERS) {
        if (a.id === b.id) continue;
        const pair = fusionPairFor(a, b);
        const hybrid = hybridDefinition(pair.baseId!, pair.ingredientId!);
        expect(() => validateCatalog([...ITEM_CATALOG, hybrid]), hybrid.id).not.toThrow();
        const instances = [{ instanceId: 'mop', itemId: 'janitor_mop' }, { instanceId: 'h', itemId: hybrid.id }];
        const primary = hybrid.base ? 'h' : 'mop';
        expect(() => compileLoadout([...ITEM_CATALOG, hybrid], instances, primary), hybrid.id).not.toThrow();
      }
    }
  });

  it('ids round-trip, and the registry knows hybrids by id', () => {
    const id = hybridDefinitionId('pump_soaker', 'plasma_globe');
    expect(hybridParts(id)).toEqual({ baseId: 'pump_soaker', ingredientId: 'plasma_globe' });
    expect(definitionFor(id)?.name).toBe('Storm Soaker');
    expect(definitionFor('pump_soaker')?.name).toBe('Pump-Action Soaker');
    expect(hybridParts('pump_soaker')).toBeNull();
  });
});

describe('what a hybrid does', () => {
  it('two shooters merge their spreads and hit harder', () => {
    const hybrid = hybridDefinition('party_popper', 'bottle_rocket_pack');
    const payloads = hybrid.effects.filter((effect) => effect.kind === 'projectile_payload');
    expect(payloads).toHaveLength(1);
    const payload = payloads[0]!;
    if (payload.kind !== 'projectile_payload') throw new Error('payload');
    expect(payload.angularOffsetsRadians.length).toBeGreaterThan(3);
    expect(payload.damage).toBeGreaterThan(3);
    expect(payload.sourceItemId).toBe(hybrid.id);
  });

  it('a shooter plus water makes water shots, so Wet and chains still work', () => {
    const hybrid = hybridDefinition('party_popper', 'pump_soaker');
    const payload = hybrid.effects.find((effect) => effect.kind === 'projectile_payload');
    expect(payload).toMatchObject({ payloadKind: 'water', onHit: { status: 'wet' } });
  });

  it('a modifier fused into a weapon is overclocked', () => {
    const hybrid = hybridDefinition('pump_soaker', 'gel_pens');
    const sticky = hybrid.effects.find((effect) => effect.kind === 'status_modifier');
    expect(sticky).toBeDefined();
    if (sticky?.kind !== 'status_modifier') return;
    expect(sticky.ticks).toBeGreaterThan(90);
    expect(sticky.sourceItemId).toBe(hybrid.id);
    const chain = hybridDefinition('pump_soaker', 'plasma_globe').effects.find((effect) => effect.kind === 'conductive_reaction');
    if (chain?.kind !== 'conductive_reaction') throw new Error('chain');
    expect(chain.maxAdditionalTargets).toBeGreaterThan(3);
  });

  it('a melee weapon fused with a shooter keeps its swing and also fires', () => {
    const hydro = hybridDefinition('janitor_mop', 'pump_soaker');
    expect(hydro.name).toBe('Hydro Mop');
    expect(hydro.base?.delivery).toBe('direct');
    const loadout = compileLoadout([...ITEM_CATALOG, hydro], [{ instanceId: 'h', itemId: hydro.id }], 'h');
    expect(loadout.effects.some((effect) => effect.kind === 'projectile_payload')).toBe(true);
  });

  it('unnamed pairs still get a readable name', () => {
    expect(hybridDefinition('box_cutter', 'vhs_rewinder').name).toBe('Rewinding Cutter');
  });
});

describe('fusing on shift at the Bench Warrant', () => {
  it('pick two items, see the proposal, fuse: the hybrid replaces both and the fee is paid', () => {
    const run = atBench(leaf('pump_soaker'), leaf('plasma_globe'));
    expect(openRunWorkbench(run).accepted).toBe(true);
    expect(run.workbench).not.toBeNull();
    tickMvpRun(run, idle);
    expect(run.tick).toBe(0);
    pickWorkbenchItem(run, 't-pump_soaker');
    pickWorkbenchItem(run, 't-plasma_globe');
    expect(run.preview).toMatchObject({ recipeId: 'hybrid', fee: HYBRID_BASE_FEE - 2, resultName: 'Storm Soaker' });
    const result = confirmRunFusionPreview(run);
    expect(result.accepted).toBe(true);
    expect(run.cash).toBe(40 - (HYBRID_BASE_FEE - 2));
    expect(run.inventory.inventory.some((node) => node.instanceId === 't-plasma_globe')).toBe(false);
    const hybrid = run.inventory.inventory.find((node) => node.kind === 'composite');
    expect(hybrid).toMatchObject({ recipeId: 'hybrid' });
    expect(run.inventory.selectedPrimaryInstanceId).toBe(hybrid!.instanceId);
    expect(run.room.combat.compiledLoadout.primary.name).toBe('Storm Soaker');
    expect(run.workbench).toBeNull();
    expect(runWeaponSlots(run).some((slot) => slot.itemDefinitionId === hybridDefinitionId('pump_soaker', 'plasma_globe'))).toBe(true);
  });

  it('a stolen ingredient costs the full fee', () => {
    const run = atBench(leaf('pump_soaker', 'stolen'), leaf('gel_pens'));
    openRunWorkbench(run);
    pickWorkbenchItem(run, 't-pump_soaker');
    pickWorkbenchItem(run, 't-gel_pens');
    expect(run.preview?.fee).toBe(HYBRID_BASE_FEE);
  });

  it('picking the same item again puts it back; cancelling changes nothing', () => {
    const run = atBench(leaf('pump_soaker'), leaf('gel_pens'));
    const before = JSON.stringify(run.inventory);
    openRunWorkbench(run);
    pickWorkbenchItem(run, 't-pump_soaker');
    pickWorkbenchItem(run, 't-gel_pens');
    pickWorkbenchItem(run, 't-gel_pens');
    expect(run.preview).toBeNull();
    expect(run.workbench?.secondId).toBeNull();
    cancelRunFusionPreview(run);
    expect(run.workbench).toBeNull();
    expect(JSON.stringify(run.inventory)).toBe(before);
  });

  it('the RC car and a shooter still become an Emitter Mount at the same bench', () => {
    const run = atBench(leaf('party_popper'), leaf('rc_car'));
    openRunWorkbench(run);
    pickWorkbenchItem(run, 't-party_popper');
    pickWorkbenchItem(run, 't-rc_car');
    expect(run.preview?.recipeId).toBe('emitter_mount');
    expect(confirmRunFusionPreview(run).accepted).toBe(true);
    expect(run.carrier?.mode).toBe('emitter');
  });

  it('the fused mop swings and throws water in the same attack', () => {
    const run = atBench(leaf('pump_soaker'));
    openRunWorkbench(run);
    pickWorkbenchItem(run, 'mvp-associate-mop');
    pickWorkbenchItem(run, 't-pump_soaker');
    expect(run.preview).toMatchObject({ resultName: 'Hydro Mop' });
    confirmRunFusionPreview(run);
    const player = run.room.combat.player;
    tickMvpRun(run, { ...idle, fire: true, aimX: player.x + 100, aimY: player.y });
    expect(run.room.combat.projectiles.some((projectile) => projectile.faction === 'player')).toBe(true);
  });

  it('a fused run survives a checkpoint, and a wrong fee is refused', () => {
    const run = atBench(leaf('pump_soaker'), leaf('gel_pens'));
    openRunWorkbench(run);
    pickWorkbenchItem(run, 't-pump_soaker');
    pickWorkbenchItem(run, 't-gel_pens');
    confirmRunFusionPreview(run);
    const saved = JSON.parse(JSON.stringify(serializeCheckpoint(run)));
    const parsed = parseCheckpoint(saved);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).room.combat.compiledLoadout.primary.definitionId).toBe(hybridDefinitionId('pump_soaker', 'gel_pens'));
    saved.inventory.committedTransactions[0].fee = 1;
    expect(parseCheckpoint(saved).ok).toBe(false);
  });

  it('a Receipt Wallet fused into anything takes more off', () => {
    const run = atBench(leaf('receipt_wallet'), leaf('fanny_pack'));
    expect(runPurchaseDiscount(run)).toBe(2);
    openRunWorkbench(run);
    pickWorkbenchItem(run, 't-receipt_wallet');
    pickWorkbenchItem(run, 't-fanny_pack');
    confirmRunFusionPreview(run);
    expect(runPurchaseDiscount(run)).toBe(3);
  });
});

describe('where you can fuse', () => {
  it('the back hall has a second bench, which opens only once the room is clear', () => {
    const run = createMvpRun(5);
    let guard = 0;
    while (run.wing.rooms[run.roomIndex]?.id !== 'back_hall' && guard < 10) {
      guard += 1;
      run.room.combat.enemies = [];
      tickMvpRun(run, idle);
      enterDoorway(run, 'east');
    }
    const kiosk = run.wing.rooms[run.roomIndex]!.benchKiosk!;
    expect(kiosk).not.toBeNull();
    run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, leaf('pump_soaker')], revision: run.inventory.revision + 1 };
    run.room.combat.player.x = kiosk.x;
    run.room.combat.player.y = kiosk.y;
    expect(run.room.combat.enemies.length).toBeGreaterThan(0);
    const refused = openRunWorkbench(run);
    expect(refused.accepted).toBe(false);
    if (!refused.accepted) expect(refused.reason).toMatch(/clear/i);
    run.room.combat.enemies = [];
    expect(openRunWorkbench(run).accepted).toBe(true);
  });
});
