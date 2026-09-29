/**
 * Inventory revision to compiled loadout refresh.
 *
 * The run owns one fusion inventory of provenance-bearing leaves and Emitter
 * Mount composites. Every purchase, secured theft, or fusion bumps the
 * inventory revision and calls this, so the next attack uses the newly owned
 * behaviour while shots already in flight keep their spawn-time specification.
 */
import { projectFusionInventory } from '../fusion/inventory';
import type { FusionInventoryState } from '../fusion/types';
import { catalogFor } from '../items/registry';
import { compileLoadout } from '../items/compileLoadout';
import { freezeDeep, type CompiledLoadout, type ItemInstance } from '../items/types';
import type { MvpRunState } from './types';
import { HOT_DAMAGE_BONUS, isHotNode } from './wanted';

/**
 * The compile input for one fusion projection.
 *
 * Compiled behaviour is definition-based, so two owned instances of the same
 * definition contribute exactly one behaviour and the compiler rejects
 * duplicate ownership outright. The run is allowed to own a repeated
 * definition (a storefront may sell an item the shift already started with),
 * so the first instance of each definition is compiled and the selected
 * primary's own instance always wins its definition.
 */
export function runCompilerInstances(
  instances: readonly ItemInstance[],
  selectedPrimaryInstanceId: string,
): ItemInstance[] {
  const byDefinition = new Map<string, ItemInstance>();
  const order: string[] = [];
  for (const instance of instances) {
    const existing = byDefinition.get(instance.itemId);
    if (!existing) {
      byDefinition.set(instance.itemId, instance);
      order.push(instance.itemId);
      continue;
    }
    if (instance.instanceId === selectedPrimaryInstanceId) {
      byDefinition.set(instance.itemId, instance);
    }
  }
  return order.map((itemId) => byDefinition.get(itemId)!);
}

/**
 * Hot goods: an equipped stolen item that has not been fused hits harder, on
 * the swing and on its own shots. The bonus is applied to the compiled output
 * so the authored item definitions stay the same for bought and stolen stock.
 */
function withHotBonus(loadout: CompiledLoadout, inventory: FusionInventoryState, selectedId: string): CompiledLoadout {
  const selected = inventory.inventory.find((node) => node.instanceId === selectedId);
  if (!selected || !isHotNode(selected)) return loadout;
  const definitionId = loadout.primary.definitionId;
  return freezeDeep({
    ...loadout,
    primary: { ...loadout.primary, damage: loadout.primary.damage + HOT_DAMAGE_BONUS },
    effects: loadout.effects.map((effect) =>
      effect.kind === 'projectile_payload' && effect.sourceItemId === definitionId
        ? { ...effect, damage: effect.damage + HOT_DAMAGE_BONUS }
        : effect,
    ),
  });
}

/** The run's one way to turn its inventory into room combat inventory and behaviour. */
export function compileRunLoadout(inventory: FusionInventoryState): {
  readonly instances: ItemInstance[];
  readonly selectedPrimaryInstanceId: string;
  readonly compiledLoadout: CompiledLoadout;
} {
  const projected = projectFusionInventory(inventory);
  const compiled = compileLoadout(
    catalogFor(projected.instances),
    runCompilerInstances(projected.instances, projected.selectedPrimaryInstanceId),
    projected.selectedPrimaryInstanceId,
  );
  return {
    instances: projected.instances.map((instance) => ({ ...instance })),
    selectedPrimaryInstanceId: projected.selectedPrimaryInstanceId,
    compiledLoadout: withHotBonus(compiled, inventory, projected.selectedPrimaryInstanceId),
  };
}

/** Projects the run inventory and writes the compiled behaviour into the room. */
export function refreshRunLoadout(state: MvpRunState): void {
  const compiled = compileRunLoadout(state.inventory);
  state.room.combat.inventory = compiled.instances;
  state.room.combat.selectedPrimaryInstanceId = compiled.selectedPrimaryInstanceId;
  state.room.combat.compiledLoadout = compiled.compiledLoadout;
}
