/**
 * Item drops: the mall's monsters are carrying more than loose change.
 *
 * A fallen enemy now and then leaves an item on the floor, picked from
 * everything the stores sell; a glowing Clearance elite does so far more often
 * and sometimes leaves a rare instead. Every boss hands over a rare outright,
 * straight into the inventory, because a boss kill ends the floor.
 *
 * Rares (RARE_ROSTER) are never on a shelf. Picked-up items are `found`:
 * clean like a purchase (no Heat, the clean fusion discount), because nobody
 * can say they were stolen.
 *
 * Floor drops live with the room's tokens and are deliberately not
 * checkpointed, like tokens: the save is taken at a room boundary. What the
 * janitor picks up is ordinary inventory and is checkpointed.
 *
 * Every roll is seeded (luck.ts), so the same shift drops the same things.
 * Pure rules over run data; nothing here reads the renderer.
 */
import type { InventoryLeaf } from '../fusion/types';
import { freshLeafInstanceId } from '../fusion/inventory';
import { isBossKind } from '../combat/boss';
import { ITEM_CATALOG } from '../items/catalog';
import { RARE_ROSTER } from '../items/storeRoster';
import { itemDefinitionName, publishRunFeedback } from './economy';
import { refreshRunLoadout } from './loadout';
import { luck } from './luck';
import { TOKEN_PICKUP_RADIUS, type EnemyMarker, type MallTokenPickup } from './tokens';
import type { MvpRunState } from './types';

/** A regular kill's chance to leave an item. */
export const ITEM_DROP_CHANCE = 0.04;
/** A Clearance elite's chance to leave an item. */
export const ELITE_ITEM_DROP_CHANCE = 0.3;
/** Of an elite's drops, how many are rare. */
export const ELITE_RARE_SHARE = 0.25;

export const RARE_ITEM_IDS: readonly string[] = RARE_ROSTER.map((entry) => entry.definition.id);

/** What a regular drop can be: anything a store could sell, bar the car. */
export const COMMON_DROP_POOL: readonly string[] = ITEM_CATALOG
  .map((item) => item.id)
  .filter((id) => !RARE_ITEM_IDS.includes(id) && id !== 'rc_car' && id !== 'janitor_mop');

/** What a boss can hand over. */
export const BOSS_RARE_POOL: readonly string[] = RARE_ITEM_IDS;

/** Whether this kill leaves an item at all. */
export function rollItemDrop(seed: number, tick: number, enemyId: number, elite: boolean): boolean {
  return luck(seed, 'item-drop', tick, enemyId) < (elite ? ELITE_ITEM_DROP_CHANCE : ITEM_DROP_CHANCE);
}

function pick(pool: readonly string[], seed: number, purpose: string, a: number, b: number): string {
  return pool[Math.floor(luck(seed, purpose, a, b) * pool.length) % pool.length]!;
}

function foundLeaf(state: MvpRunState, itemDefinitionId: string, source: string): InventoryLeaf {
  return {
    kind: 'leaf',
    instanceId: `found-${source}-${state.tick}`,
    itemDefinitionId,
    acquisitionKind: 'found',
    sourceLocationId: 'mall-floor',
    sourceStockId: source,
    acquisitionTick: state.tick,
  };
}

function own(state: MvpRunState, leaf: InventoryLeaf): void {
  // Two finds in one tick, or the same tick in another wing, get distinct ids.
  // Ids inside dropped trees on the floor are reserved too, or a find could
  // reuse one and the pickup would bring back a duplicate.
  const dropped = state.room.tokens.flatMap((pickup) => (pickup.node ? [pickup.node] : []));
  const instanceId = freshLeafInstanceId(state.inventory, leaf.instanceId, dropped);
  state.inventory = {
    ...state.inventory,
    inventory: [...state.inventory.inventory, { ...leaf, instanceId }],
    revision: state.inventory.revision + 1,
  };
  refreshRunLoadout(state);
}

/**
 * For every enemy alive before this tick and gone now: a boss hands over a
 * rare, anything else may leave an item on the floor.
 */
export function dropItemsForDeaths(state: MvpRunState, before: readonly EnemyMarker[]): void {
  const living = new Set(state.room.combat.enemies.filter((enemy) => enemy.health > 0).map((enemy) => enemy.id));
  for (const marker of before) {
    if (living.has(marker.id)) continue;
    if (isBossKind(marker.kind)) {
      const prize = pick(BOSS_RARE_POOL, state.seed, `boss-rare-${marker.kind}`, state.tick, marker.id);
      own(state, foundLeaf(state, prize, `boss-${marker.kind}`));
      publishRunFeedback(state, `RARE FIND: the boss dropped the ${itemDefinitionName(prize)}!`);
      continue;
    }
    if (!rollItemDrop(state.seed, state.tick, marker.id, marker.elite === true)) continue;
    const rare = marker.elite === true && luck(state.seed, 'item-rare', state.tick, marker.id) < ELITE_RARE_SHARE;
    const itemDefinitionId = rare
      ? pick(RARE_ITEM_IDS, state.seed, 'item-rare-pick', state.tick, marker.id)
      : pick(COMMON_DROP_POOL, state.seed, 'item-pick', state.tick, marker.id);
    state.room.tokens.push({
      id: `item-${state.tick}-${marker.id}`,
      kind: 'item',
      itemDefinitionId,
      rare,
      x: marker.x - 14,
      y: marker.y + 4,
      value: 0,
      droppedTick: state.tick,
    });
  }
}

/** Picks up every dropped item under the janitor's feet. */
export function collectItemDrops(state: MvpRunState): void {
  if (!state.room.tokens.some((pickup) => pickup.kind === 'item')) return;
  const player = state.room.combat.player;
  const inReach = (pickup: MallTokenPickup) => Math.hypot(pickup.x - player.x, pickup.y - player.y) <= TOKEN_PICKUP_RADIUS;
  // A dropped item wakes once the janitor has stepped out of reach of it.
  state.room.tokens = state.room.tokens.map((pickup) =>
    pickup.awaitingStepOff && !inReach(pickup) ? { ...pickup, awaitingStepOff: false } : pickup);
  state.room.tokens = state.room.tokens.filter((pickup) => {
    if (pickup.kind !== 'item' || !pickup.itemDefinitionId) return true;
    if (pickup.awaitingStepOff || !inReach(pickup)) return true;
    if (pickup.node) {
      // Something the janitor dropped comes back exactly as it went down,
      // atomically with the receipts detached alongside it. The id counter
      // never moves backwards.
      const held = new Set(state.inventory.committedTransactions.map((record) => record.transactionId));
      const restored = (pickup.detachedTransactions ?? []).filter((record) => !held.has(record.transactionId));
      state.inventory = {
        ...state.inventory,
        inventory: [...state.inventory.inventory, pickup.node],
        committedTransactions: [...state.inventory.committedTransactions, ...restored],
        revision: state.inventory.revision + 1,
      };
      refreshRunLoadout(state);
      publishRunFeedback(state, `Picked up the ${itemDefinitionName(pickup.itemDefinitionId)}.`);
      return false;
    }
    own(state, foundLeaf(state, pickup.itemDefinitionId, pickup.id));
    publishRunFeedback(state, `${pickup.rare ? 'RARE FIND' : 'Found'}: ${itemDefinitionName(pickup.itemDefinitionId)}.`);
    return false;
  });
}
