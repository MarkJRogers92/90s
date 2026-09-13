/**
 * Instantiates the authoritative M3 wing state from validated content.
 *
 * The factory is the only place runtime availability, provenance, Heat, and
 * suspicion start from zero, so restarting the loop is a fresh call rather than
 * a cleanup of mutated state.
 */
import { M2_M3_ITEM_CATALOG } from '../items/catalog';
import type { ItemDefinition } from '../items/types';
import { M3_WING } from './catalog';
import type { WingDefinition, WingState } from './types';
import { WING_PLAYER_RADIUS } from './types';
import { validateWing } from './validateWing';

/**
 * Creates a fresh shopping run.
 *
 * `seed` is recorded for deterministic replays, and the wing and catalog
 * default to the authored M3 content.
 */
export function createWingRun(
  seed = 0,
  wing: WingDefinition = M3_WING,
  itemDefinitions: readonly ItemDefinition[] = M2_M3_ITEM_CATALOG,
): WingState {
  validateWing(wing, itemDefinitions);

  return {
    seed: Number.isFinite(seed) ? seed : 0,
    tick: 0,
    paused: false,
    status: 'shopping',
    wing,
    itemDefinitions,
    player: {
      x: wing.playerSpawn.x,
      y: wing.playerSpawn.y,
      radius: WING_PLAYER_RADIUS,
      facing: { x: 0, y: 1 },
    },
    startingCash: wing.startingCash,
    cash: wing.startingCash,
    offers: wing.offers.map((offer) => ({ ...offer, status: 'available' as const })),
    inventory: [],
    carried: null,
    heat: 0,
    suspicion: 0,
    sweeps: wing.stores.map((store) => ({
      storeId: store.id,
      facingRadians: store.sightZone.centerRadians,
      direction: 1 as const,
    })),
    nextInstanceId: 1,
    nextEventId: 1,
    heldActions: { interact: false, steal: false },
    recentChange: `Entered ${wing.name} with $${wing.startingCash} in hand.`,
    behaviorTrace: [],
    summary: null,
  };
}
