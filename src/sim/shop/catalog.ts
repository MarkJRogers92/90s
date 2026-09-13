/**
 * The authored M3 wing: two small stores opening onto a lower public corridor
 * inside the fixed 960x480 mall.
 *
 * Every number here is literal content rather than a central rule. Walls are
 * geometry the player collides with; store exits are the public thresholds a
 * carried theft must cross to be secured; security sight zones are per-store
 * sweeps. The wing is deep-frozen and validated at module load so a bad
 * definition fails immediately instead of reaching the authoritative state.
 */
import { M2_M3_ITEM_CATALOG } from '../items/catalog';
import { freezeDeep } from '../items/types';
import type { Rect } from '../model';
import type { MallExitDefinition, StoreDefinition, WingDefinition } from './types';
import { validateWing } from './validateWing';

const WING_WIDTH = 960;
const WING_HEIGHT = 480;
const WALL_THICKNESS = 10;
const STORE_DOOR_WIDTH = 96;
const DEGREES_TO_RADIANS = Math.PI / 180;

/** Homestyle Goods: the cheaper, left-hand store. */
const HOMESTYLE_BOUNDS: Rect = { x: 40, y: 60, width: 400, height: 240 };
/** Future Hobby: the pricier, right-hand store. */
const FUTURE_BOUNDS: Rect = { x: 520, y: 60, width: 400, height: 240 };

/**
 * Four walls plus a split front wall leave one public doorway on the store's
 * front (bottom) edge. The doorway is the store exit.
 */
function storeWalls(bounds: Rect): Rect[] {
  const { x, y, width, height } = bounds;
  const doorLeft = x + (width - STORE_DOOR_WIDTH) / 2;
  const doorRight = doorLeft + STORE_DOOR_WIDTH;
  const frontY = y + height - WALL_THICKNESS;
  return [
    { x, y, width, height: WALL_THICKNESS },
    { x, y, width: WALL_THICKNESS, height },
    { x: x + width - WALL_THICKNESS, y, width: WALL_THICKNESS, height },
    { x, y: frontY, width: doorLeft - x, height: WALL_THICKNESS },
    { x: doorRight, y: frontY, width: x + width - doorRight, height: WALL_THICKNESS },
  ];
}

function storeExit(storeId: string, label: string, bounds: Rect) {
  return {
    id: `${storeId}-exit`,
    label,
    bounds: {
      x: bounds.x + (bounds.width - STORE_DOOR_WIDTH) / 2,
      y: bounds.y + bounds.height - WALL_THICKNESS,
      width: STORE_DOOR_WIDTH,
      height: WALL_THICKNESS,
    },
  };
}

/**
 * One inward-facing camera on the inner face of the back wall, sweeping 55
 * degrees either side of straight down and reaching the whole selling floor.
 */
function storeSightZone(bounds: Rect) {
  return {
    origin: { x: bounds.x + bounds.width / 2, y: bounds.y + WALL_THICKNESS },
    range: 180,
    arcDegrees: 70,
    centerRadians: Math.PI / 2,
    sweepRadians: 55 * DEGREES_TO_RADIANS,
    sweepTicksPerEndpoint: 180,
  };
}

function store(
  id: string,
  name: string,
  bounds: Rect,
  offerIds: readonly string[],
): StoreDefinition {
  return {
    id,
    name,
    bounds,
    resetPoint: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height + 40 },
    exit: storeExit(id, `${name} door`, bounds),
    sightZone: storeSightZone(bounds),
    offerIds,
  };
}

const MALL_EXIT: MallExitDefinition = {
  id: 'orchard-gate-exit',
  label: 'Orchard Gate',
  bounds: { x: 430, y: 460, width: 100, height: 20 },
};

/** Store IDs, offer IDs, and prices are stable content, not runtime guesses. */
export const M3_WING: WingDefinition = freezeDeep({
  id: 'orchard-gate-two-store-wing',
  name: 'Orchard Gate Wing',
  width: WING_WIDTH,
  height: WING_HEIGHT,
  startingCash: 30,
  bounds: { x: 0, y: 0, width: WING_WIDTH, height: WING_HEIGHT },
  playerSpawn: { x: 480, y: 390 },
  walls: [...storeWalls(HOMESTYLE_BOUNDS), ...storeWalls(FUTURE_BOUNDS)],
  mallExit: MALL_EXIT,
  stores: [
    store('homestyle', 'Homestyle Goods', HOMESTYLE_BOUNDS, [
      'homestyle-mop',
      'homestyle-bubble-bath',
      'homestyle-extension-cord',
      'homestyle-gel-pens',
    ]),
    store('future', 'Future Hobby', FUTURE_BOUNDS, [
      'future-soaker',
      'future-globe',
      'future-rewinder',
      'future-nozzle',
    ]),
  ],
  offers: [
    { id: 'homestyle-mop', storeId: 'homestyle', itemDefinitionId: 'janitor_mop', position: { x: 140, y: 150 }, price: 10 },
    { id: 'homestyle-bubble-bath', storeId: 'homestyle', itemDefinitionId: 'bubble_bath', position: { x: 340, y: 150 }, price: 14 },
    { id: 'homestyle-extension-cord', storeId: 'homestyle', itemDefinitionId: 'extension_cord', position: { x: 140, y: 230 }, price: 12 },
    { id: 'homestyle-gel-pens', storeId: 'homestyle', itemDefinitionId: 'gel_pens', position: { x: 340, y: 230 }, price: 8 },
    { id: 'future-soaker', storeId: 'future', itemDefinitionId: 'pump_soaker', position: { x: 620, y: 150 }, price: 18 },
    { id: 'future-globe', storeId: 'future', itemDefinitionId: 'plasma_globe', position: { x: 820, y: 150 }, price: 22 },
    { id: 'future-rewinder', storeId: 'future', itemDefinitionId: 'vhs_rewinder', position: { x: 620, y: 230 }, price: 24 },
    { id: 'future-nozzle', storeId: 'future', itemDefinitionId: 'wide_nozzle', position: { x: 820, y: 230 }, price: 16 },
  ],
} satisfies WingDefinition);

// Fail fast: authored content is validated once, before any run exists.
validateWing(M3_WING, M2_M3_ITEM_CATALOG);
