import type {
  CompiledLoadout,
  CompiledPrimary,
  ItemDefinition,
  ItemEffectSpec,
  ItemId,
  ItemInstance,
} from './types';
import { freezeDeep, isProjectileOnlyEffectKind, stageIndex } from './types';
import { validateCatalog } from './validateCatalog';

function compareEffects(a: ItemEffectSpec, b: ItemEffectSpec): number {
  const stageDelta = stageIndex(a.stage) - stageIndex(b.stage);
  if (stageDelta !== 0) {
    return stageDelta;
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  if (a.sourceItemId !== b.sourceItemId) {
    return a.sourceItemId < b.sourceItemId ? -1 : 1;
  }
  if (a.kind === b.kind) {
    return 0;
  }
  return a.kind < b.kind ? -1 : 1;
}

function limitedApplicabilityNote(
  definition: ItemDefinition,
  effect: ItemEffectSpec,
  primary: CompiledPrimary,
): string {
  return (
    `${definition.name} (${definition.id}) has limited applicability: ` +
    `${effect.label} only applies to projectile deliveries, but the selected ` +
    `primary ${primary.name} is a direct attack.`
  );
}

function resolveOwnedInstances(
  definitionsById: ReadonlyMap<ItemId, ItemDefinition>,
  instances: readonly ItemInstance[],
  selectedPrimaryInstanceId: string,
): { ownedDefinitions: ItemDefinition[]; primary: CompiledPrimary } {
  const ownedInstanceIds = new Set<string>();
  const ownedItemIds = new Set<ItemId>();
  const ownedDefinitions: ItemDefinition[] = [];
  let primaryDefinition: ItemDefinition | undefined;

  for (const instance of instances) {
    if (ownedInstanceIds.has(instance.instanceId)) {
      throw new Error(`Duplicate item instance ID "${instance.instanceId}"`);
    }
    ownedInstanceIds.add(instance.instanceId);

    const definition = definitionsById.get(instance.itemId);
    if (!definition) {
      throw new Error(
        `Item instance "${instance.instanceId}" references unknown item definition "${instance.itemId}"`,
      );
    }
    if (ownedItemIds.has(instance.itemId)) {
      throw new Error(
        `Duplicate ownership of item "${instance.itemId}"; each owned item instance must be unique`,
      );
    }
    ownedItemIds.add(instance.itemId);
    ownedDefinitions.push(definition);

    if (instance.instanceId === selectedPrimaryInstanceId) {
      primaryDefinition = definition;
    }
  }

  if (!primaryDefinition) {
    throw new Error(`Selected primary instance "${selectedPrimaryInstanceId}" is not owned`);
  }
  if (!primaryDefinition.base) {
    throw new Error(
      `Item "${primaryDefinition.id}" has no attack and cannot be selected as a primary`,
    );
  }

  return {
    ownedDefinitions,
    primary: {
      definitionId: primaryDefinition.id,
      name: primaryDefinition.name,
      ...primaryDefinition.base,
    },
  };
}

/**
 * Resolves owned instances against immutable definitions and returns one
 * deterministic attack specification.
 *
 * The result depends only on the *set* of owned items and the selected primary,
 * never on pickup order or instance IDs, and it is deeply frozen so no consumer
 * can mutate compiled behavior mid-run.
 */
export function compileLoadout(
  definitions: readonly ItemDefinition[],
  instances: readonly ItemInstance[],
  selectedPrimaryInstanceId: string,
): CompiledLoadout {
  validateCatalog(definitions);

  const definitionsById = new Map<ItemId, ItemDefinition>();
  for (const definition of definitions) {
    definitionsById.set(definition.id, definition);
  }

  const { ownedDefinitions, primary } = resolveOwnedInstances(
    definitionsById,
    instances,
    selectedPrimaryInstanceId,
  );

  const effects: ItemEffectSpec[] = [];
  const compatibilityNotes: string[] = [];
  for (const definition of ownedDefinitions) {
    for (const effect of definition.effects) {
      if (primary.delivery === 'direct' && isProjectileOnlyEffectKind(effect.kind)) {
        compatibilityNotes.push(limitedApplicabilityNote(definition, effect, primary));
        continue;
      }
      effects.push(effect);
    }
  }
  effects.sort(compareEffects);
  compatibilityNotes.sort();

  const sourceItemIds = Array.from(
    new Set<ItemId>([
      primary.definitionId,
      ...effects.map((effect) => effect.sourceItemId),
    ]),
  ).sort();

  const trace: string[] = [
    `primary: ${primary.name} (${primary.delivery} attack)`,
    ...effects.map((effect) => effect.label),
    ...compatibilityNotes.map((note) => `limited: ${note}`),
  ];

  return freezeDeep({
    primary,
    effects,
    sourceItemIds,
    compatibilityNotes,
    trace,
  });
}
