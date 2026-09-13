import { describe, expect, it } from 'vitest';
import {
  latestConductiveFeedback,
  shouldDrawDirectAttackArc,
} from '../../src/game/view/visualState';

/**
 * These are the two rejected M2 Task 4 visual defects, pinned as pure unit
 * tests before the production change:
 *
 * 1. The mop arc/head was drawn for every active primary attack, so firing the
 *    projectile Soaker also flashed a mop swing.
 * 2. Conductive feedback identity was `chain:<targetIds>:<line.length>`, so two
 *    same-length chains on the same targets from different root actions looked
 *    like the same event and the second never re-triggered the flash.
 */

const CHAIN_FROM_ROOT_1 =
  'conductive chain (root r1): visited [10, 11] (range 150, hop damage 2)';
const CHAIN_FROM_ROOT_2 =
  'conductive chain (root r2): visited [10, 11] (range 150, hop damage 2)';

describe('shouldDrawDirectAttackArc', () => {
  it('draws the mop arc/head for an active direct-delivery primary', () => {
    expect(shouldDrawDirectAttackArc(6, 'direct')).toBe(true);
  });

  it('never requests the mop arc/head for an active projectile-delivery primary', () => {
    // Firing the Soaker still sets attackActiveTicks, so the delivery must gate
    // the swing visual rather than the active window alone.
    expect(shouldDrawDirectAttackArc(6, 'projectile')).toBe(false);
  });

  it('draws nothing once the attack window has closed', () => {
    expect(shouldDrawDirectAttackArc(0, 'direct')).toBe(false);
    expect(shouldDrawDirectAttackArc(0, 'projectile')).toBe(false);
  });
});

describe('latestConductiveFeedback', () => {
  it('returns null when no authoritative conductive event exists', () => {
    expect(latestConductiveFeedback([])).toBeNull();
    expect(
      latestConductiveFeedback([
        'root r1: Associate-Issue Mop direct attack',
        'root r1: target 3 took 4 damage, Wet 180, Sticky 0',
      ]),
    ).toBeNull();
  });

  it('reads the visited targets and the root identity of a conductive chain', () => {
    const feedback = latestConductiveFeedback([CHAIN_FROM_ROOT_1]);
    expect(feedback).not.toBeNull();
    expect(feedback?.targetIds).toEqual([10, 11]);
    expect(feedback?.rootActionId).toBe(1);
  });

  it('keeps distinct keys for same-target, same-length chains from different roots', () => {
    // The two rejected lines are deliberately the same length with the same
    // visited target IDs; only the root action identity differs.
    expect(CHAIN_FROM_ROOT_1.length).toBe(CHAIN_FROM_ROOT_2.length);

    const first = latestConductiveFeedback([CHAIN_FROM_ROOT_1]);
    const second = latestConductiveFeedback([CHAIN_FROM_ROOT_1, CHAIN_FROM_ROOT_2]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.key).not.toBe(second?.key);
    expect(second?.rootActionId).toBe(2);
    expect(second?.key).toContain('r2');
  });

  it('keeps the same key while the authoritative trace is unchanged', () => {
    const trace = [CHAIN_FROM_ROOT_1, CHAIN_FROM_ROOT_2];
    const first = latestConductiveFeedback(trace);
    const second = latestConductiveFeedback([...trace]);
    expect(first).not.toBeNull();
    expect(first?.key).toBe(second?.key);
  });

  it('ignores later unrelated trace lines so the renderer does not re-trigger', () => {
    const trace = [CHAIN_FROM_ROOT_1, CHAIN_FROM_ROOT_2];
    const before = latestConductiveFeedback(trace);
    const after = latestConductiveFeedback([
      ...trace,
      'root r3: Bubble-Bath Concentrate projectile attack',
    ]);
    expect(before?.key).toBe(after?.key);
  });

  it('reads a weak discharge and the target it arcs to', () => {
    const feedback = latestConductiveFeedback([
      'weak discharge on target 7: 1 damage (range 220)',
    ]);
    expect(feedback).not.toBeNull();
    expect(feedback?.targetIds).toEqual([7]);
  });

  it('returns the latest matching event across chain and discharge lines', () => {
    const feedback = latestConductiveFeedback([
      CHAIN_FROM_ROOT_1,
      'weak discharge on target 7: 1 damage (range 220)',
    ]);
    expect(feedback?.targetIds).toEqual([7]);
  });
});
