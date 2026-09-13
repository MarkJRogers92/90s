/**
 * Renderer-only projections of authoritative run state.
 *
 * Everything here is a pure function over `RunState` fields the simulation has
 * already written: no Phaser, no DOM, no mutation, and no gameplay decisions.
 * The Phaser entity view asks these helpers "what should I draw?" and keeps
 * damage, movement, statuses, and chaining in `src/sim`.
 */

import type { AttackDelivery } from '../../sim/items/types';

/**
 * One conductive feedback identity read from the behaviour trace.
 *
 * `key` names the *full* authoritative trace event (including the root action
 * that produced it), so the view can tell a genuinely new event from the same
 * event re-observed on a later frame.
 */
export type ConductiveFeedbackEvent = {
  readonly key: string;
  /** Every enemy the event names, in trace order. */
  readonly targetIds: readonly number[];
  /** Root action that produced the event, or `null` when the line omits it. */
  readonly rootActionId: number | null;
};

/**
 * Whether the compiled primary should draw the direct mop arc and head.
 *
 * `attackActiveTicks` is set for *every* accepted primary attack, including a
 * projectile delivery such as the Soaker. The mop swing is a direct-attack
 * visual, so the compiled delivery has to gate it too: only a direct primary
 * shows the arc.
 */
export function shouldDrawDirectAttackArc(
  attackActiveTicks: number,
  delivery: AttackDelivery,
): boolean {
  return attackActiveTicks > 0 && delivery === 'direct';
}

/** `conductive chain (root rN): visited [10, 11] (range 150, hop damage 2)` */
const CONDUCTIVE_CHAIN_TRACE = /conductive chain \(root r(\d+)\): visited \[([0-9,\s]*)\]/;

/** `weak discharge on target 7: 1 damage (range 220)` */
const WEAK_DISCHARGE_TRACE = /weak discharge on target (\d+)/;

function parseTargetIds(raw: string): number[] {
  return raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

/**
 * The latest authoritative conductive feedback event in the behaviour trace.
 *
 * Returns `null` when the trace names no conductive event. Prose limit lines
 * such as `conductive chain skipped: ...` are not feedback and are ignored.
 *
 * The key is derived from the whole trace line plus an explicit root identity,
 * rather than from the target IDs and the line length. Two chains that reach
 * the same targets and happen to be the same length but descend from different
 * root actions are therefore distinct events, while an unchanged trace keeps
 * the same key so the renderer does not treat it as new.
 */
export function latestConductiveFeedback(
  trace: readonly string[],
): ConductiveFeedbackEvent | null {
  let latest: ConductiveFeedbackEvent | null = null;
  for (const line of trace) {
    const chain = CONDUCTIVE_CHAIN_TRACE.exec(line);
    if (chain) {
      const rootActionId = Number.parseInt(chain[1] ?? '', 10);
      const targetIds = parseTargetIds(chain[2] ?? '');
      if (targetIds.length > 0 && Number.isFinite(rootActionId)) {
        latest = {
          key: `chain:r${rootActionId}:${line}`,
          targetIds: Object.freeze(targetIds),
          rootActionId,
        };
      }
      continue;
    }

    const discharge = WEAK_DISCHARGE_TRACE.exec(line);
    if (discharge && discharge[1] !== undefined) {
      const targetId = Number.parseInt(discharge[1], 10);
      if (Number.isFinite(targetId)) {
        latest = {
          key: `discharge:${line}`,
          targetIds: Object.freeze([targetId]),
          rootActionId: null,
        };
      }
    }
  }
  return latest;
}
