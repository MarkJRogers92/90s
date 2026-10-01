import { describe, expect, it } from 'vitest';
import { fusedIconPlan } from '../../src/game/presentation/fusedIcon';

describe('a fused item looks fused (round 34)', () => {
  it('a plain item has no fused plan', () => {
    expect(fusedIconPlan('pump_soaker')).toBeNull();
  });

  it('a two-item fusion shows the base big and the other item stacked on it', () => {
    expect(fusedIconPlan('hybrid__pump_soaker__plasma_globe')).toMatchObject({
      baseItemId: 'pump_soaker',
      stackedItemIds: ['plasma_globe'],
      parts: 2,
    });
  });

  it('a deeper fusion stacks every other item it holds, in the order they went in', () => {
    const plan = fusedIconPlan('hybrid__(hybrid__(hybrid__pump_soaker__plasma_globe)__gel_pens)__wide_nozzle')!;
    expect(plan.baseItemId).toBe('pump_soaker');
    expect(plan.stackedItemIds).toEqual(['plasma_globe', 'gel_pens', 'wide_nozzle']);
    expect(plan.parts).toBe(4);
  });

  it('the glow grows with the part count', () => {
    // Soaker + popper is not a named pair (a signature glows its own pink).
    const two = fusedIconPlan('hybrid__pump_soaker__party_popper')!.glow;
    const three = fusedIconPlan('hybrid__(hybrid__pump_soaker__party_popper)__gel_pens')!.glow;
    const four = fusedIconPlan('hybrid__(hybrid__(hybrid__pump_soaker__party_popper)__gel_pens)__wide_nozzle')!.glow;
    expect(two.width).toBeLessThan(three.width);
    expect(three.width).toBeLessThan(four.width);
    expect(new Set([two.color, three.color, four.color]).size).toBe(3);
  });

  it('the texture key is stable per fusion, so each is drawn once', () => {
    const id = 'hybrid__pump_soaker__plasma_globe';
    expect(fusedIconPlan(id)!.textureKey).toBe(fusedIconPlan(id)!.textureKey);
    expect(fusedIconPlan(id)!.textureKey).not.toBe(fusedIconPlan('hybrid__plasma_globe__pump_soaker')?.textureKey);
  });
});
