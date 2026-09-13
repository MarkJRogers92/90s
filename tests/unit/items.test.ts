import { describe, expect, it } from 'vitest';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
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
  it('defines exactly the eight M2 items', () => {
    expect(ITEM_CATALOG.map((definition) => definition.id).sort()).toEqual(
      [...M2_ITEM_IDS].sort(),
    );
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
