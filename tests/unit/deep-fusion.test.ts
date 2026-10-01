import { describe, expect, it } from 'vitest';
import {
  MAX_FUSION_PARTS,
  hybridDefinition,
  hybridDefinitionId,
  hybridFee,
  hybridParts,
} from '../../src/sim/fusion/hybrid';
import { compositeLeaves, fusionPartCount, isValidFusionInventoryState } from '../../src/sim/fusion/inventory';
import { definitionFor } from '../../src/sim/items/registry';
import { validateCatalog } from '../../src/sim/items/validateCatalog';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { confirmRunFusionPreview, openRunWorkbench, pickWorkbenchItem, cancelRunFusionPreview } from '../../src/sim/run/bench';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { hotItemCount } from '../../src/sim/run/wanted';
import type { FusionInventoryNode, InventoryLeaf } from '../../src/sim/fusion/types';
import type { MvpRunState } from '../../src/sim/run/types';

function leaf(itemDefinitionId: string, acquisitionKind: 'purchased' | 'stolen' = 'purchased'): InventoryLeaf {
  return { kind: 'leaf', instanceId: `t-${itemDefinitionId}`, itemDefinitionId, acquisitionKind, sourceLocationId: 'test', sourceStockId: `t-${itemDefinitionId}`, acquisitionTick: 0 };
}

function atBench(...items: InventoryLeaf[]): MvpRunState {
  const run = createMvpRun(5);
  run.inventory = { ...run.inventory, inventory: [...run.inventory.inventory, ...items], cash: 200, revision: run.inventory.revision + 1 };
  run.cash = 200;
  const kiosk = run.wing.rooms[0]!.benchKiosk!;
  run.room.combat.player.x = kiosk.x;
  run.room.combat.player.y = kiosk.y;
  return run;
}

/** The instance id of the owned top-level node whose ingredients include `itemId`. */
function nodeWith(run: MvpRunState, itemId: string): FusionInventoryNode {
  const node = run.inventory.inventory.find((entry) =>
    entry.kind === 'leaf' ? entry.itemDefinitionId === itemId : compositeLeaves(entry).some((part) => part.itemDefinitionId === itemId),
  );
  if (!node) throw new Error(`nothing owned holds ${itemId}`);
  return node;
}

function fuse(run: MvpRunState, firstItem: string, secondItem: string) {
  const opened = openRunWorkbench(run);
  if (!opened.accepted) throw new Error(opened.reason);
  pickWorkbenchItem(run, nodeWith(run, firstItem).instanceId);
  pickWorkbenchItem(run, nodeWith(run, secondItem).instanceId);
  if (run.preview === null) {
    const reason = run.workbench?.message ?? 'no preview';
    cancelRunFusionPreview(run);
    return { accepted: false as const, reason };
  }
  return confirmRunFusionPreview(run);
}

describe('fusing things that are already fused', () => {
  it('a two-item hybrid keeps its old id; deeper ones nest and parse back', () => {
    expect(hybridDefinitionId('janitor_mop', 'pump_soaker')).toBe('hybrid__janitor_mop__pump_soaker');
    const inner = hybridDefinitionId('janitor_mop', 'pump_soaker');
    const outer = hybridDefinitionId(inner, 'plasma_globe');
    expect(hybridParts(outer)).toEqual({ baseId: inner, ingredientId: 'plasma_globe' });
    const both = hybridDefinitionId(inner, hybridDefinitionId('bottle_rocket_pack', 'party_popper'));
    expect(hybridParts(both)).toEqual({ baseId: inner, ingredientId: hybridDefinitionId('bottle_rocket_pack', 'party_popper') });
  });

  it('a three- and a four-item hybrid are valid catalog definitions that keep what they were fused from', () => {
    const hydro = hybridDefinitionId('janitor_mop', 'pump_soaker');
    const three = definitionFor(hybridDefinitionId(hydro, 'plasma_globe'))!;
    expect(three).toBeDefined();
    expect(three.base?.delivery).toBe('direct');
    // The Hydro Mop's shot survives, and the globe's chain is added.
    expect(three.effects.some((effect) => effect.kind === 'projectile_payload')).toBe(true);
    expect(three.effects.some((effect) => effect.kind === 'conductive_reaction')).toBe(true);
    const four = definitionFor(hybridDefinitionId(three.id, 'grease_gun'))!;
    expect(four.effects.some((effect) => effect.kind === 'status_modifier')).toBe(true);
    expect(four.effects.some((effect) => effect.kind === 'conductive_reaction')).toBe(true);
    expect(() => validateCatalog([three, four])).not.toThrow();
    // Deeper fusions hit harder.
    expect(four.base!.damage).toBeGreaterThan(three.base!.damage);
    expect(three.base!.damage).toBeGreaterThan(hybridDefinition('janitor_mop', 'pump_soaker').base!.damage);
  });

  it('a fusion costs more the more it holds', () => {
    expect(hybridFee(2, true)).toBeLessThan(hybridFee(3, true));
    expect(hybridFee(3, true)).toBeLessThan(hybridFee(4, true));
    expect(hybridFee(2, false)).toBeGreaterThan(hybridFee(2, true));
  });

  it('at the Bench Warrant: mop + popper, then + globe, then + grease, and a fifth is refused', () => {
    // Mop + popper is not a named pair, so this fusion stops at four (a signature would take five).
    const run = atBench(leaf('party_popper'), leaf('plasma_globe'), leaf('grease_gun'), leaf('box_cutter'));
    expect(fuse(run, 'janitor_mop', 'party_popper').accepted).toBe(true);
    expect(fuse(run, 'janitor_mop', 'plasma_globe').accepted).toBe(true);
    expect(fusionPartCount(nodeWith(run, 'janitor_mop'))).toBe(3);
    expect(fuse(run, 'janitor_mop', 'grease_gun').accepted).toBe(true);
    const four = nodeWith(run, 'janitor_mop');
    expect(fusionPartCount(four)).toBe(MAX_FUSION_PARTS);
    expect(run.inventory.selectedPrimaryInstanceId).toBe(four.instanceId);
    expect(run.room.combat.compiledLoadout.primary.definitionId).toBe(definitionFor(run.room.combat.compiledLoadout.primary.definitionId)!.id);
    const refused = fuse(run, 'janitor_mop', 'box_cutter');
    expect(refused.accepted).toBe(false);
    expect(refused.accepted ? '' : refused.reason).toMatch(/at most 4 items/i);
    expect(isValidFusionInventoryState(run.inventory)).toBe(true);
  });

  it('a fusion holding a signature takes a fifth part (round 43)', () => {
    const run = atBench(leaf('pump_soaker'), leaf('plasma_globe'), leaf('grease_gun'), leaf('box_cutter'));
    expect(fuse(run, 'janitor_mop', 'pump_soaker').accepted).toBe(true);
    expect(fuse(run, 'janitor_mop', 'plasma_globe').accepted).toBe(true);
    expect(fuse(run, 'janitor_mop', 'grease_gun').accepted).toBe(true);
    expect(fuse(run, 'janitor_mop', 'box_cutter').accepted).toBe(true);
    expect(fusionPartCount(nodeWith(run, 'janitor_mop'))).toBe(5);
    expect(isValidFusionInventoryState(run.inventory)).toBe(true);
  });

  it('two hybrids fuse into one four-item weapon', () => {
    const run = atBench(leaf('pump_soaker'), leaf('bottle_rocket_pack'), leaf('party_popper'));
    expect(fuse(run, 'janitor_mop', 'pump_soaker').accepted).toBe(true);
    expect(fuse(run, 'bottle_rocket_pack', 'party_popper').accepted).toBe(true);
    expect(fuse(run, 'janitor_mop', 'party_popper').accepted).toBe(true);
    const node = nodeWith(run, 'party_popper');
    expect(fusionPartCount(node)).toBe(4);
    expect(compositeLeaves(node).map((part) => part.itemDefinitionId).sort()).toEqual(['bottle_rocket_pack', 'janitor_mop', 'party_popper', 'pump_soaker']);
  });

  it('a nested inventory survives a checkpoint round trip', () => {
    const run = atBench(leaf('pump_soaker'), leaf('plasma_globe'));
    fuse(run, 'janitor_mop', 'pump_soaker');
    fuse(run, 'janitor_mop', 'plasma_globe');
    const restored = parseCheckpoint(serializeCheckpoint(run));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const again = restoreMvpRun(restored.checkpoint);
    expect(fusionPartCount(nodeWith(again, 'plasma_globe'))).toBe(3);
    expect(again.room.combat.compiledLoadout.primary.definitionId).toBe(run.room.combat.compiledLoadout.primary.definitionId);
  });

  it('a stolen item fused into an existing hybrid is laundered', () => {
    const run = atBench(leaf('pump_soaker'), leaf('plasma_globe', 'stolen'));
    fuse(run, 'janitor_mop', 'pump_soaker');
    expect(hotItemCount(run)).toBe(1);
    const result = fuse(run, 'janitor_mop', 'plasma_globe');
    expect(result.accepted).toBe(true);
    expect(hotItemCount(run)).toBe(0);
  });

  it('the RC car still only carries a single unfused shooter', () => {
    const run = atBench(leaf('pump_soaker'), leaf('party_popper'), leaf('rc_car'));
    fuse(run, 'pump_soaker', 'party_popper');
    const result = fuse(run, 'pump_soaker', 'rc_car');
    expect(result.accepted).toBe(false);
  });
});
