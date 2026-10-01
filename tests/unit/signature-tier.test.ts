import { describe, expect, it } from 'vitest';
import {
  MAX_FUSION_PARTS,
  SIGNATURE_COOLDOWN_SCALE,
  SIGNATURE_DAMAGE_SCALE,
  SIGNATURE_MAX_PARTS,
  hybridDefinition,
  hybridDefinitionId,
  hybridHighlights,
  isHybridPair,
} from '../../src/sim/fusion/hybrid';
import { definitionFor } from '../../src/sim/items/registry';
import { fusedIconPlan } from '../../src/game/presentation/fusedIcon';
import type { ProjectilePayloadEffect } from '../../src/sim/items/types';

const shot = (id: string) => hybridDefinition(...(id.split('|') as [string, string])).effects
  .find((effect): effect is ProjectilePayloadEffect => effect.kind === 'projectile_payload')!;

describe('the signature tier', () => {
  it('a signature hits half again as hard and swings a fifth faster than the plain rule', () => {
    const mop = definitionFor('janitor_mop')!.base!;
    const soaker = definitionFor('pump_soaker')!.effects.find((effect): effect is ProjectilePayloadEffect => effect.kind === 'projectile_payload')!;
    const hydro = hybridDefinition('janitor_mop', 'pump_soaker');
    expect(hydro.name).toBe('Hydro Mop');
    // A plain melee + ranged fusion swings for base + 1 and slows by 6 ticks.
    expect(hydro.base!.damage).toBe(Math.ceil((mop.damage + 1) * SIGNATURE_DAMAGE_SCALE));
    expect(hydro.base!.cooldownTicks).toBe(Math.max(8, Math.round((mop.cooldownTicks + 6) * SIGNATURE_COOLDOWN_SCALE)));
    expect(shot('janitor_mop|pump_soaker').damage).toBe(Math.ceil(soaker.damage * SIGNATURE_DAMAGE_SCALE));
    expect(SIGNATURE_DAMAGE_SCALE).toBe(1.5);
    expect(SIGNATURE_COOLDOWN_SCALE).toBe(0.8);
  });

  it('beats the same kind of fusion that is not a signature', () => {
    const signature = hybridDefinition('janitor_mop', 'pump_soaker');
    // Same roles (melee + ranged), not a named pair.
    const plain = hybridDefinition('janitor_mop', 'party_popper');
    expect(signature.base!.damage).toBeGreaterThan(plain.base!.damage);
    expect(signature.base!.cooldownTicks).toBeLessThan(plain.base!.cooldownTicks);
  });

  it('does not compound: fusing more onto a signature builds on it once', () => {
    const hydroId = hybridDefinitionId('janitor_mop', 'pump_soaker');
    const hydro = hybridDefinition('janitor_mop', 'pump_soaker');
    const more = hybridDefinition(hydroId, 'gel_pens');
    expect(more.base!.damage).toBeLessThan(Math.ceil(hydro.base!.damage * SIGNATURE_DAMAGE_SCALE));
  });

  it('a fusion holding a signature has room for a fifth part; others stop at four', () => {
    expect(SIGNATURE_MAX_PARTS).toBe(MAX_FUSION_PARTS + 1);
    const hydro = hybridDefinitionId('janitor_mop', 'pump_soaker');
    const three = hybridDefinitionId(hydro, 'gel_pens');
    const four = hybridDefinitionId(three, 'bubble_bath');
    expect(isHybridPair(four, 'grease_gun')).toBe(true);
    const plainTwo = hybridDefinitionId('janitor_mop', 'party_popper');
    const plainThree = hybridDefinitionId(plainTwo, 'gel_pens');
    const plainFour = hybridDefinitionId(plainThree, 'bubble_bath');
    expect(isHybridPair(plainFour, 'grease_gun')).toBe(false);
  });

  it('says so at the bench, and glows its own colour', () => {
    expect(hybridHighlights('janitor_mop', 'pump_soaker')[0]).toMatch(/SIGNATURE.*\+50%/);
    const signatureGlow = fusedIconPlan(hybridDefinitionId('janitor_mop', 'pump_soaker'))!.glow.color;
    const plainGlows = [2, 3, 4].map((parts) => {
      let id = hybridDefinitionId('janitor_mop', 'party_popper');
      if (parts >= 3) id = hybridDefinitionId(id, 'gel_pens');
      if (parts >= 4) id = hybridDefinitionId(id, 'bubble_bath');
      return fusedIconPlan(id)!.glow.color;
    });
    expect(plainGlows).not.toContain(signatureGlow);
  });
});
