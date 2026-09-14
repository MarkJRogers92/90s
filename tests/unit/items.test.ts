import { describe, expect, it } from 'vitest';
import {
  ITEM_CATALOG,
  M2_M3_ITEM_CATALOG,
  M4_ITEM_CATALOG,
} from '../../src/sim/items/catalog';
import { compileLoadout } from '../../src/sim/items/compileLoadout';
import { validateCatalog } from '../../src/sim/items/validateCatalog';
import type {
  ItemDefinition,
  ItemEffectSpec,
  ItemInstance,
} from '../../src/sim/items/types';

const M2_ITEM_IDS = [
  'janitor_mop',
  'pump_soaker',
  'bubble_bath',
  'plasma_globe',
  'vhs_rewinder',
  'extension_cord',
  'gel_pens',
  'wide_nozzle',
];

const M4_ITEM_IDS = [
  'janitor_mop',
  'pump_soaker',
  'bubble_bath',
  'plasma_globe',
  'vhs_rewinder',
  'extension_cord',
  'gel_pens',
  'wide_nozzle',
  'receipt_wallet',
  'fanny_pack',
  'rc_car',
  'party_popper',
];

const M5_ITEM_IDS = [
  ...M4_ITEM_IDS,
  'bottle_rocket_pack',
  'fire_extinguisher',
  'paint_marker',
  'foam_ball_blaster',
  'slushie_cup',
  'broken_broom_handle',
  'box_cutter',
  'grease_gun',
  'anti_static_strap',
  'car_battery',
  'needle_nozzle',
  'heavy_duty_spring',
];

function owned(entries: readonly (readonly [string, string])[]): ItemInstance[] {
  return entries.map(([instanceId, itemId]) => ({ instanceId, itemId }));
}

function definitionOf(itemId: string): ItemDefinition {
  const definition = ITEM_CATALOG.find((candidate) => candidate.id === itemId);
  if (!definition) {
    throw new Error(`Missing test fixture definition ${itemId}`);
  }
  return definition;
}

function allEightInstances(): ItemInstance[] {
  return owned(M2_ITEM_IDS.map((itemId) => [`${itemId}-a`, itemId]));
}

function compile(instances: readonly ItemInstance[], selected: string) {
  return compileLoadout(ITEM_CATALOG, instances, selected);
}

describe('item catalog', () => {
  it('defines the twenty-four-item M5 roster in author order', () => {
    expect(ITEM_CATALOG.map((definition) => definition.id)).toEqual(M5_ITEM_IDS);
  });

  it('keeps unique definition IDs with the M4 roster first in stable order', () => {
    const ids = ITEM_CATALOG.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 12)).toEqual(M4_ITEM_IDS);
  });

  it('freezes the M2/M3 subset to the original eight items', () => {
    expect(M2_M3_ITEM_CATALOG).toHaveLength(8);
    expect(M2_M3_ITEM_CATALOG.map((definition) => definition.id)).toEqual(M2_ITEM_IDS);
    expect(M2_M3_ITEM_CATALOG.map((definition) => definition.id)).toEqual(
      ITEM_CATALOG.slice(0, 8).map((definition) => definition.id),
    );
    expect(Object.isFrozen(M2_M3_ITEM_CATALOG)).toBe(true);
    for (const definition of M2_M3_ITEM_CATALOG) {
      expect(Object.isFrozen(definition)).toBe(true);
    }
  });

  it('freezes the M4 subset to the original twelve items', () => {
    expect(M4_ITEM_CATALOG).toHaveLength(12);
    expect(M4_ITEM_CATALOG.map((definition) => definition.id)).toEqual(M4_ITEM_IDS);
    expect(M4_ITEM_CATALOG.map((definition) => definition.id)).toEqual(
      ITEM_CATALOG.slice(0, 12).map((definition) => definition.id),
    );
    expect(Object.isFrozen(M4_ITEM_CATALOG)).toBe(true);
    for (const definition of M4_ITEM_CATALOG) {
      expect(Object.isFrozen(definition)).toBe(true);
    }
  });

  it('freezes the catalog, every definition, and every nested effect', () => {
    expect(Object.isFrozen(ITEM_CATALOG)).toBe(true);
    for (const definition of ITEM_CATALOG) {
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.effects)).toBe(true);
      for (const effect of definition.effects) {
        expect(Object.isFrozen(effect)).toBe(true);
      }
    }

    const payload = definitionOf('pump_soaker').effects[0];
    expect(payload?.kind).toBe('projectile_payload');
    const onHit = (payload as { onHit: object }).onHit;
    expect(Object.isFrozen(onHit)).toBe(true);
  });

  it('keeps the mop a direct attack with no composable effects', () => {
    const mop = definitionOf('janitor_mop');
    expect(mop.base?.delivery).toBe('direct');
    expect(mop.base?.range).toBeGreaterThan(0);
    expect(mop.effects).toEqual([]);
  });

  it('defines the soaker as a projectile that applies Wet on hit', () => {
    const soaker = definitionOf('pump_soaker');
    expect(soaker.base?.delivery).toBe('projectile');
    expect(soaker.base?.speed).toBeGreaterThan(0);
    expect(soaker.effects).toHaveLength(1);
    expect(soaker.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      sourceItemId: 'pump_soaker',
      onHit: { status: 'wet', ticks: 180 },
    });
  });
});

describe('M4 payload schema', () => {
  it('tags the soaker payload as a single straight water shot', () => {
    const soaker = definitionOf('pump_soaker');
    expect(soaker.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      payloadKind: 'water',
      angularOffsetsRadians: [0],
      onHit: { status: 'wet', ticks: 180 },
    });
  });

  it('declares emitter_carrier only on the RC Car', () => {
    const carriers = ITEM_CATALOG.filter((definition) =>
      (definition.capabilities ?? []).includes('emitter_carrier'),
    ).map((definition) => definition.id);
    expect(carriers).toEqual(['rc_car']);
  });

  it('keeps the wallet and fanny pack free of combat effects', () => {
    for (const itemId of ['receipt_wallet', 'fanny_pack', 'rc_car']) {
      expect(definitionOf(itemId).effects).toEqual([]);
    }
  });

  it('defines the party popper as a three-prong physical projectile primary', () => {
    const popper = definitionOf('party_popper');
    expect(popper.base).toMatchObject({
      delivery: 'projectile',
      damage: 2,
      cooldownTicks: 30,
      speed: 4.2,
    });
    const degreesToRadians = Math.PI / 180;
    expect(popper.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      payloadKind: 'physical',
      damage: 2,
      speed: 4.2,
      radius: 4,
      lifetimeTicks: 55,
      onHit: null,
    });
    const offsets = (popper.effects[0] as { angularOffsetsRadians: readonly number[] })
      .angularOffsetsRadians;
    expect([...offsets]).toEqual([
      -8 * degreesToRadians,
      0,
      8 * degreesToRadians,
    ]);
  });
});

describe('M5 capabilities', () => {
  it('declares shop_discount only on the Receipt Wallet', () => {
    expect(definitionOf('receipt_wallet').capabilities).toEqual(['shop_discount']);
    const discounted = ITEM_CATALOG.filter((definition) =>
      (definition.capabilities ?? []).includes('shop_discount'),
    ).map((definition) => definition.id);
    expect(discounted).toEqual(['receipt_wallet']);
  });

  it('declares smuggle_pouch only on the Reinforced Fanny Pack', () => {
    expect(definitionOf('fanny_pack').capabilities).toEqual(['smuggle_pouch']);
    const pouches = ITEM_CATALOG.filter((definition) =>
      (definition.capabilities ?? []).includes('smuggle_pouch'),
    ).map((definition) => definition.id);
    expect(pouches).toEqual(['fanny_pack']);
  });

  it('keeps emitter_carrier only on the RC Car', () => {
    const carriers = ITEM_CATALOG.filter((definition) =>
      (definition.capabilities ?? []).includes('emitter_carrier'),
    ).map((definition) => definition.id);
    expect(carriers).toEqual(['rc_car']);
  });

  it('accepts the shipped catalog with all three capabilities', () => {
    expect(() => validateCatalog(ITEM_CATALOG)).not.toThrow();
  });

  it('rejects an unknown capability while keeping the M5 capabilities valid', () => {
    const strange = structuredClone(definitionOf('receipt_wallet')) as ItemDefinition;
    (strange as { capabilities: unknown }).capabilities = ['flies'];
    expect(() => validateCatalog([strange])).toThrow(/receipt_wallet/);
  });
});

describe('M5 projectile primaries', () => {
  it('defines the bottle rocket pack as a two-prong physical projectile primary', () => {
    const pack = definitionOf('bottle_rocket_pack');
    expect(pack.base).toMatchObject({
      delivery: 'projectile',
      damage: 3,
      cooldownTicks: 36,
      speed: 5.0,
    });
    expect(pack.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      sourceItemId: 'bottle_rocket_pack',
      payloadKind: 'physical',
      damage: 3,
      speed: 5.0,
      radius: 3,
      lifetimeTicks: 45,
      onHit: null,
    });
    const offsets = (pack.effects[0] as { angularOffsetsRadians: readonly number[] })
      .angularOffsetsRadians;
    expect([...offsets]).toHaveLength(2);
  });

  it('defines the fire extinguisher as a water projectile that applies Wet 240', () => {
    const extinguisher = definitionOf('fire_extinguisher');
    expect(extinguisher.base).toMatchObject({
      delivery: 'projectile',
      damage: 1,
      cooldownTicks: 30,
      speed: 2.6,
    });
    expect(extinguisher.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      sourceItemId: 'fire_extinguisher',
      payloadKind: 'water',
      damage: 1,
      speed: 2.6,
      radius: 10,
      lifetimeTicks: 70,
      onHit: { status: 'wet', ticks: 240 },
    });
  });

  it('defines the paint marker as a single physical projectile primary', () => {
    const marker = definitionOf('paint_marker');
    expect(marker.base).toMatchObject({
      delivery: 'projectile',
      damage: 2,
      cooldownTicks: 18,
      speed: 6.0,
    });
    expect(marker.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      sourceItemId: 'paint_marker',
      payloadKind: 'physical',
      damage: 2,
      speed: 6.0,
      radius: 3,
      lifetimeTicks: 40,
      onHit: null,
    });
    const offsets = (marker.effects[0] as { angularOffsetsRadians: readonly number[] })
      .angularOffsetsRadians;
    expect([...offsets]).toEqual([0]);
  });

  it('defines the foam ball blaster as a three-prong physical projectile with a 14-degree spread', () => {
    const blaster = definitionOf('foam_ball_blaster');
    expect(blaster.base).toMatchObject({
      delivery: 'projectile',
      damage: 1,
      cooldownTicks: 20,
      speed: 5.5,
    });
    expect(blaster.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      sourceItemId: 'foam_ball_blaster',
      payloadKind: 'physical',
      damage: 1,
      speed: 5.5,
      radius: 3,
      lifetimeTicks: 45,
      onHit: null,
    });
    const degreesToRadians = Math.PI / 180;
    const offsets = (blaster.effects[0] as { angularOffsetsRadians: readonly number[] })
      .angularOffsetsRadians;
    expect([...offsets]).toEqual([-14 * degreesToRadians, 0, 14 * degreesToRadians]);
  });

  it('defines the slushie cup as a water projectile that applies Wet 120', () => {
    const cup = definitionOf('slushie_cup');
    expect(cup.base).toMatchObject({
      delivery: 'projectile',
      damage: 2,
      cooldownTicks: 26,
      speed: 3.6,
    });
    expect(cup.effects[0]).toMatchObject({
      kind: 'projectile_payload',
      sourceItemId: 'slushie_cup',
      payloadKind: 'water',
      damage: 2,
      speed: 3.6,
      radius: 5,
      lifetimeTicks: 60,
      onHit: { status: 'wet', ticks: 120 },
    });
  });
});

describe('M5 direct primaries and modifiers', () => {
  it('defines the broken broom handle as a direct primary', () => {
    const broom = definitionOf('broken_broom_handle');
    expect(broom.base).toMatchObject({
      delivery: 'direct',
      damage: 5,
      cooldownTicks: 42,
      range: 92,
      speed: 0,
    });
    expect(broom.base?.halfAngleRadians).toBeCloseTo((30 * Math.PI) / 180, 10);
    expect(broom.effects).toEqual([]);
  });

  it('defines the box cutter as a direct primary', () => {
    const cutter = definitionOf('box_cutter');
    expect(cutter.base).toMatchObject({
      delivery: 'direct',
      damage: 3,
      cooldownTicks: 15,
      range: 54,
      speed: 0,
    });
    expect(cutter.base?.halfAngleRadians).toBeCloseTo((25 * Math.PI) / 180, 10);
    expect(cutter.effects).toEqual([]);
  });

  it('defines the grease gun as a stronger Sticky modifier', () => {
    const grease = definitionOf('grease_gun');
    expect(grease.base).toBeUndefined();
    expect(grease.effects[0]).toMatchObject({
      kind: 'status_modifier',
      sourceItemId: 'grease_gun',
      status: 'sticky',
      ticks: 150,
      slowMultiplier: 0.45,
      slowFloor: 0.4,
    });
  });

  it('defines the anti-static strap as a heavier conductive reaction', () => {
    const strap = definitionOf('anti_static_strap');
    expect(strap.base).toBeUndefined();
    expect(strap.effects[0]).toMatchObject({
      kind: 'conductive_reaction',
      sourceItemId: 'anti_static_strap',
      chainStartsPerRoot: 2,
      maxAdditionalTargets: 4,
      baseRange: 110,
      visitsEachTargetOnce: true,
    });
  });

  it('defines the car battery as a longer conductive range with no weak discharge', () => {
    const battery = definitionOf('car_battery');
    expect(battery.base).toBeUndefined();
    expect(battery.effects[0]).toMatchObject({
      kind: 'conductive_range',
      sourceItemId: 'car_battery',
      range: 300,
      weakDischarge: false,
    });
  });

  it('defines the needle nozzle as a narrowing projectile geometry', () => {
    const needle = definitionOf('needle_nozzle');
    expect(needle.base).toBeUndefined();
    expect(needle.effects[0]).toMatchObject({
      kind: 'projectile_geometry',
      sourceItemId: 'needle_nozzle',
      radiusBonus: -1,
      speedMultiplier: 1.35,
    });
  });

  it('defines the heavy-duty spring as a widening projectile geometry', () => {
    const spring = definitionOf('heavy_duty_spring');
    expect(spring.base).toBeUndefined();
    expect(spring.effects[0]).toMatchObject({
      kind: 'projectile_geometry',
      sourceItemId: 'heavy_duty_spring',
      radiusBonus: 3,
      speedMultiplier: 0.75,
    });
  });

  it('accepts a negative geometry radius bonus from the shipped catalog', () => {
    expect(() => validateCatalog([definitionOf('needle_nozzle')])).not.toThrow();
  });
});

describe('catalog validation', () => {
  it('accepts the shipped catalog', () => {
    expect(() => validateCatalog(ITEM_CATALOG)).not.toThrow();
  });

  it('rejects duplicate definition IDs with the offending content ID', () => {
    expect(() => validateCatalog([...ITEM_CATALOG, ITEM_CATALOG[0]!])).toThrow(/janitor_mop/);
  });

  it('rejects non-finite and negative values with the offending content ID', () => {
    const infiniteSpeed = structuredClone(definitionOf('pump_soaker')) as ItemDefinition;
    const payload = infiniteSpeed.effects[0] as { speed: number };
    payload.speed = Number.POSITIVE_INFINITY;
    expect(() => validateCatalog([infiniteSpeed])).toThrow(/pump_soaker/);

    const negativeRadius = structuredClone(definitionOf('pump_soaker')) as ItemDefinition;
    (negativeRadius.effects[0] as { radius: number }).radius = -3;
    expect(() => validateCatalog([negativeRadius])).toThrow(/pump_soaker/);

    const nanDamage = structuredClone(definitionOf('janitor_mop')) as ItemDefinition;
    (nanDamage.base as { damage: number }).damage = Number.NaN;
    expect(() => validateCatalog([nanDamage])).toThrow(/janitor_mop/);
  });

  it('rejects unsupported effect kinds with the offending content ID', () => {
    const invented = structuredClone(definitionOf('bubble_bath')) as ItemDefinition;
    (invented.effects[0] as { kind: string }).kind = 'brew_coffee';
    expect(() => validateCatalog([invented])).toThrow(/brew_coffee/);
    expect(() => validateCatalog([invented])).toThrow(/bubble_bath/);
  });

  it('rejects references that do not match their defining item', () => {
    const mismatched = structuredClone(definitionOf('gel_pens')) as ItemDefinition;
    (mismatched.effects[0] as { sourceItemId: string }).sourceItemId = 'wide_nozzle';
    expect(() => validateCatalog([mismatched])).toThrow(/wide_nozzle/);
    expect(() => validateCatalog([mismatched])).toThrow(/gel_pens/);
  });

  it('rejects an effect stage that does not match its kind', () => {
    const wrongStage = structuredClone(definitionOf('wide_nozzle')) as ItemDefinition;
    (wrongStage.effects[0] as { stage: string }).stage = 'status';
    expect(() => validateCatalog([wrongStage])).toThrow(/wide_nozzle/);
  });

  it('rejects an empty projectile pattern', () => {
    const empty = structuredClone(definitionOf('pump_soaker')) as ItemDefinition;
    (empty.effects[0] as { angularOffsetsRadians: unknown }).angularOffsetsRadians = [];
    expect(() => validateCatalog([empty])).toThrow(/pump_soaker/);
  });

  it('rejects a projectile pattern with more than 16 offsets', () => {
    const crowded = structuredClone(definitionOf('pump_soaker')) as ItemDefinition;
    (crowded.effects[0] as { angularOffsetsRadians: unknown }).angularOffsetsRadians =
      new Array(17).fill(0);
    expect(() => validateCatalog([crowded])).toThrow(/pump_soaker/);
  });

  it('rejects a projectile pattern with non-finite offsets', () => {
    const skewed = structuredClone(definitionOf('pump_soaker')) as ItemDefinition;
    (skewed.effects[0] as { angularOffsetsRadians: unknown }).angularOffsetsRadians = [
      0,
      Number.NaN,
    ];
    expect(() => validateCatalog([skewed])).toThrow(/pump_soaker/);
  });

  it('rejects a physical payload that applies Wet', () => {
    const soggy = structuredClone(definitionOf('party_popper')) as ItemDefinition;
    (soggy.effects[0] as { onHit: unknown }).onHit = { status: 'wet', ticks: 180 };
    expect(() => validateCatalog([soggy])).toThrow(/party_popper/);
  });

  it('rejects an invalid Wet duration', () => {
    const endless = structuredClone(definitionOf('pump_soaker')) as ItemDefinition;
    (endless.effects[0] as { onHit: { ticks: number } }).onHit.ticks = 0;
    expect(() => validateCatalog([endless])).toThrow(/pump_soaker/);
  });

  it('rejects unknown item capabilities', () => {
    const strange = structuredClone(definitionOf('rc_car')) as ItemDefinition;
    (strange as { capabilities: unknown }).capabilities = ['flies'];
    expect(() => validateCatalog([strange])).toThrow(/rc_car/);
  });

  it('rejects duplicate item capabilities', () => {
    const doubled = structuredClone(definitionOf('rc_car')) as ItemDefinition;
    (doubled as { capabilities: unknown }).capabilities = ['emitter_carrier', 'emitter_carrier'];
    expect(() => validateCatalog([doubled])).toThrow(/rc_car/);
  });
});

describe('instance ownership and primary selection', () => {
  it('selects one owned primary and compiles its base attack', () => {
    const compiled = compile(allEightInstances(), 'pump_soaker-a');
    expect(compiled.primary).toEqual({
      definitionId: 'pump_soaker',
      name: definitionOf('pump_soaker').name,
      delivery: 'projectile',
      damage: definitionOf('pump_soaker').base?.damage,
      cooldownTicks: definitionOf('pump_soaker').base?.cooldownTicks,
      range: definitionOf('pump_soaker').base?.range,
      halfAngleRadians: definitionOf('pump_soaker').base?.halfAngleRadians,
      speed: definitionOf('pump_soaker').base?.speed,
    });
    expect(compiled.effects.filter((effect) => effect.kind === 'projectile_payload')).toHaveLength(1);
  });

  it('rejects a selected primary that is not owned', () => {
    const instances = owned([['mop-a', 'janitor_mop']]);
    expect(() => compile(instances, 'soaker-a')).toThrow(/soaker-a/);
    expect(() => compile(instances, 'soaker-a')).toThrow(/owned/);
  });

  it('rejects instances that reference unknown item definitions', () => {
    const instances = owned([
      ['mop-a', 'janitor_mop'],
      ['ghost-a', 'missing_item'],
    ]);
    expect(() => compile(instances, 'mop-a')).toThrow(/missing_item/);
  });

  it('rejects duplicate instance IDs', () => {
    const instances = owned([
      ['mop-a', 'janitor_mop'],
      ['mop-a', 'pump_soaker'],
    ]);
    expect(() => compile(instances, 'mop-a')).toThrow(/mop-a/);
    expect(() => compile(instances, 'mop-a')).toThrow(/duplicate/i);
  });

  it('rejects owning the same item definition twice', () => {
    const instances = owned([
      ['soaker-a', 'pump_soaker'],
      ['soaker-b', 'pump_soaker'],
    ]);
    expect(() => compile(instances, 'soaker-a')).toThrow(/pump_soaker/);
    expect(() => compile(instances, 'soaker-a')).toThrow(/duplicate/i);
  });

  it('rejects selecting an item that has no attack', () => {
    const instances = owned([
      ['soaker-a', 'pump_soaker'],
      ['bath-a', 'bubble_bath'],
    ]);
    expect(() => compile(instances, 'bath-a')).toThrow(/bubble_bath/);
    expect(() => compile(instances, 'bath-a')).toThrow(/primary/i);
  });
});

describe('deterministic loadout compilation', () => {
  it('is invariant to pickup order and to instance IDs', () => {
    const instancesA = owned([
      ['soaker-a', 'pump_soaker'],
      ['bath-a', 'bubble_bath'],
      ['globe-a', 'plasma_globe'],
      ['cord-a', 'extension_cord'],
      ['pens-a', 'gel_pens'],
      ['rewinder-a', 'vhs_rewinder'],
      ['nozzle-a', 'wide_nozzle'],
      ['mop-a', 'janitor_mop'],
    ]);
    const instancesB = owned([
      ['nozzle-b', 'wide_nozzle'],
      ['rewinder-b', 'vhs_rewinder'],
      ['pens-b', 'gel_pens'],
      ['cord-b', 'extension_cord'],
      ['globe-b', 'plasma_globe'],
      ['bath-b', 'bubble_bath'],
      ['soaker-b', 'pump_soaker'],
      ['mop-b', 'janitor_mop'],
    ]);

    expect(compileLoadout(ITEM_CATALOG, instancesA, 'soaker-a')).toEqual(
      compileLoadout(ITEM_CATALOG, instancesB, 'soaker-b'),
    );
    expect(compile(instancesA, 'soaker-a').trace).toEqual(compile(instancesB, 'soaker-b').trace);
  });

  it('sorts effects by semantic stage, priority, and content ID', () => {
    const compiled = compile(allEightInstances(), 'pump_soaker-a');
    expect(compiled.effects.map((effect) => effect.sourceItemId)).toEqual([
      'pump_soaker',
      'bubble_bath',
      'gel_pens',
      'plasma_globe',
      'extension_cord',
      'vhs_rewinder',
      'wide_nozzle',
    ]);
  });

  it('returns frozen output that cannot be mutated', () => {
    const compiled = compile(allEightInstances(), 'pump_soaker-a');
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.primary)).toBe(true);
    expect(Object.isFrozen(compiled.effects)).toBe(true);
    expect(Object.isFrozen(compiled.sourceItemIds)).toBe(true);
    expect(Object.isFrozen(compiled.compatibilityNotes)).toBe(true);
    expect(Object.isFrozen(compiled.trace)).toBe(true);
    expect(compiled.effects.every((effect) => Object.isFrozen(effect))).toBe(true);

    expect(() => {
      (compiled.trace as unknown as string[]).push('mutated');
    }).toThrow(TypeError);
    expect(() => {
      (compiled.primary as { delivery: string }).delivery = 'direct';
    }).toThrow(TypeError);
    expect(() => {
      (compiled.effects[0] as { priority: number }).priority = 99;
    }).toThrow(TypeError);
  });

  it('reports sorted unique source IDs for the compiled behavior', () => {
    const compiled = compile(allEightInstances(), 'pump_soaker-a');
    expect(compiled.sourceItemIds).toEqual([
      'bubble_bath',
      'extension_cord',
      'gel_pens',
      'plasma_globe',
      'pump_soaker',
      'vhs_rewinder',
      'wide_nozzle',
    ]);
    expect(compiled.compatibilityNotes).toEqual([]);
  });

  it('does not expose authored definitions through the compiled output', () => {
    const mutableDefinitions = structuredClone(ITEM_CATALOG) as ItemDefinition[];
    const compiled = compileLoadout(
      mutableDefinitions,
      owned([['soaker-a', 'pump_soaker']]),
      'soaker-a',
    );

    const soaker = mutableDefinitions.find((definition) => definition.id === 'pump_soaker');
    if (!soaker) {
      throw new Error('test fixture missing pump_soaker');
    }
    (soaker as { name: string }).name = 'Mutated Soaker';
    (soaker.effects[0] as { radius: number }).radius = 999;

    expect(compiled.primary.name).not.toBe('Mutated Soaker');
    expect(compiled.effects[0]).toMatchObject({ radius: 6 });
  });

  it('keeps the mop direct when a rewinder is owned and explains the limitation', () => {
    const instances = owned([
      ['mop-a', 'janitor_mop'],
      ['rewinder-a', 'vhs_rewinder'],
    ]);
    const compiled = compile(instances, 'mop-a');

    expect(compiled.primary.delivery).toBe('direct');
    expect(compiled.effects.map((effect) => effect.kind)).not.toContain('trajectory_replay');
    expect(compiled.compatibilityNotes.join(' ')).toMatch(/Rewinder.*projectile/i);
    expect(compiled.compatibilityNotes.join(' ')).toMatch(/mop/i);
    expect(compiled.trace.join(' ')).toMatch(/limited/i);
  });

  it('keeps every effect that applies to a direct primary', () => {
    const instances = owned([
      ['mop-a', 'janitor_mop'],
      ['globe-a', 'plasma_globe'],
      ['cord-a', 'extension_cord'],
      ['pens-a', 'gel_pens'],
    ]);
    const compiled = compile(instances, 'mop-a');
    expect(compiled.effects.map((effect) => effect.sourceItemId)).toEqual([
      'gel_pens',
      'plasma_globe',
      'extension_cord',
    ]);
    expect(compiled.compatibilityNotes).toEqual([]);
  });

  it('drops projectile-only effects and notes them for a direct primary', () => {
    const instances = owned([
      ['mop-a', 'janitor_mop'],
      ['soaker-a', 'pump_soaker'],
      ['bath-a', 'bubble_bath'],
      ['nozzle-a', 'wide_nozzle'],
    ]);
    const compiled = compile(instances, 'mop-a');
    expect(compiled.effects).toEqual([]);
    expect(compiled.compatibilityNotes.join(' ')).toMatch(/Nozzle.*projectile/i);
    expect(compiled.compatibilityNotes.join(' ')).toMatch(/Soaker.*projectile/i);
    expect(compiled.sourceItemIds).toEqual(['janitor_mop']);
  });

  it('exposes a deterministic behaviour trace that names the compiled steps', () => {
    const compiled = compile(allEightInstances(), 'pump_soaker-a');
    expect(compiled.trace[0]).toMatch(/Pump-Action Soaker/);
    expect(compiled.trace.join(' ')).toMatch(/Wet/);
    expect(compiled.trace.join(' ')).toMatch(/bubble/i);

    const withoutEffects = compile(owned([['mop-a', 'janitor_mop']]), 'mop-a');
    expect(withoutEffects.trace[0]).toMatch(/Associate-Issue Mop/);
    expect(withoutEffects.trace.join(' ')).toMatch(/direct/i);
  });

  it('compiles a loadout where the mop is owned but not selected', () => {
    const compiled = compile(allEightInstances(), 'pump_soaker-a');
    expect(compiled.primary.definitionId).toBe('pump_soaker');
    expect(compiled.effects.map((effect) => effect.sourceItemId)).not.toContain('janitor_mop');
  });
});

describe('effect specifications', () => {
  it('declares every stage in a single canonical order', () => {
    const stages = ITEM_CATALOG.flatMap((definition) =>
      definition.effects.map((effect) => effect.stage),
    );
    expect(new Set(stages)).toEqual(
      new Set(['projectile', 'conversion', 'status', 'reaction', 'trajectory', 'geometry']),
    );
  });

  it('declares finite positive numbers for every authored effect field', () => {
    for (const definition of ITEM_CATALOG) {
      for (const effect of definition.effects) {
        for (const [, value] of Object.entries(effect as Record<string, unknown>)) {
          if (typeof value === 'number') {
            expect(Number.isFinite(value)).toBe(true);
          }
        }
      }
    }
  });

  it('keeps the effect union discriminated by kind', () => {
    const kinds: ItemEffectSpec['kind'][] = ITEM_CATALOG.flatMap((definition) =>
      definition.effects.map((effect) => effect.kind),
    );
    expect(new Set(kinds)).toEqual(
      new Set([
        'projectile_payload',
        'projectile_conversion',
        'status_modifier',
        'conductive_reaction',
        'conductive_range',
        'trajectory_replay',
        'projectile_geometry',
      ]),
    );
  });
});
