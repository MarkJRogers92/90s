/**
 * Inventory revision to compiled loadout refresh.
 *
 * The run owns one fusion inventory of provenance-bearing leaves and Emitter
 * Mount composites. Every purchase, secured theft, or fusion bumps the
 * inventory revision and calls this, so the next attack uses the newly owned
 * behaviour while shots already in flight keep their spawn-time specification.
 */
import { projectFusionInventory } from '../fusion/inventory';
import { ITEM_CATALOG } from '../items/catalog';
import { compileLoadout } from '../items/compileLoadout';
import type { ItemInstance } from '../items/types';
import type { MvpRunState } from './types';

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

/** Projects the run inventory and writes the compiled behaviour into the room. */
export function refreshRunLoadout(state: MvpRunState): void {
  const projected = projectFusionInventory(state.inventory);
  state.room.combat.inventory = projected.instances.map((instance) => ({ ...instance }));
  state.room.combat.selectedPrimaryInstanceId = projected.selectedPrimaryInstanceId;
  state.room.combat.compiledLoadout = compileLoadout(
    ITEM_CATALOG,
    runCompilerInstances(projected.instances, projected.selectedPrimaryInstanceId),
    projected.selectedPrimaryInstanceId,
  );
}
