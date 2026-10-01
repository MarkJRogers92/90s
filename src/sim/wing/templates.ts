/**
 * Authored M5 wing content.
 *
 * Rooms are 960x480 local interiors. Walls use the M3 ten-unit thickness and
 * doorways use the M3 ninety-six-unit width. Every value here is authored
 * content; the generator only selects among these bounded variants and bands.
 */
import type { Rect, Vec2 } from '../model';
import type { StoreSightZone } from '../shop/types';
import type { WingRoomRole } from './types';
import { ALL_ROSTER, STORE_STOCK } from '../items/storeRoster';

export const ROOM_WIDTH = 960;
export const ROOM_HEIGHT = 480;
export const WALL_THICKNESS = 10;
export const DOORWAY_WIDTH = 96;
export const DOORWAY_Y = (ROOM_HEIGHT - DOORWAY_WIDTH) / 2;

export const ROOM_BOUNDS: Rect = {
  x: 0,
  y: 0,
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
};

/**
 * The Opening Concourse's atrium fountain basin. It is authored collision so
 * the room's centrepiece is solid: shoppers, and the player, walk around it.
 * It sits south of the west-east door lane (y 192-288), so the straight walk
 * through the first room stays open. The opening room spawns no enemies, so
 * this changes no fight.
 */
export const OPENING_FOUNTAIN: Rect = { x: 425, y: 316, width: 110, height: 52 };

export type AuthoredEnemyKind = 'hanger' | 'spitter';

export type AuthoredSpawnSlot = {
  readonly slotId: string;
  readonly x: number;
  readonly y: number;
  readonly kinds: readonly AuthoredEnemyKind[];
};

export type AuthoredEnemyCountBand = {
  readonly min: number;
  readonly max: number;
};

export type AuthoredRoomVariant = {
  readonly id: string;
  readonly interiorWalls: readonly Rect[];
  readonly playerEntry: Vec2;
  readonly bossAnchor: Vec2 | null;
  readonly spawnSlots: readonly AuthoredSpawnSlot[];
  readonly enemyCount: AuthoredEnemyCountBand;
  readonly benchKiosk: Vec2 | null;
};

export type CombatRoomRole =
  | 'service_corridor'
  | 'food_court'
  | 'back_hall';

export const COMBAT_ROOM_ROLES: readonly CombatRoomRole[] = [
  'service_corridor',
  'food_court',
  'back_hall',
];

export const REGULAR_COMBAT_ROOM_ROLES: readonly CombatRoomRole[] =
  COMBAT_ROOM_ROLES;

export const STOREFRONT_ROLES: readonly WingRoomRole[] = [
  'storefront_a',
  'storefront_b',
];

export const ROOM_NAMES: Readonly<Record<WingRoomRole, string>> = {
  // Floor 1's boss wing: the night opens in the first wing's Opening Concourse (round 45).
  service_corridor: 'East Concourse',
  storefront_a: 'West Storefront',
  food_court: 'Food Court',
  storefront_b: 'East Storefront',
  back_hall: 'Back Hall',
  security_office: 'Security Office',
};

/** The upper level reuses the wing's shape under new names. */
export const FLOOR_TWO_ROOM_NAMES: Readonly<Record<WingRoomRole, string>> = {
  service_corridor: 'Escalator Landing',
  storefront_a: 'Upper West Shops',
  food_court: 'Cinema Lobby',
  storefront_b: 'Upper East Shops',
  back_hall: 'Parking Stairwell',
  security_office: 'Management Suite',
};

/** The top floor: a closed food court, arcade and service areas after hours. */
export const FLOOR_THREE_ROOM_NAMES: Readonly<Record<WingRoomRole, string>> = {
  service_corridor: 'Food Court Seating',
  storefront_a: 'Pizza Counter',
  food_court: 'Arcade',
  storefront_b: 'Kitchen Back',
  back_hall: 'Loading Dock',
  security_office: "Owner's Suite",
};

/** Floor 4, the Roof: the finale, out under the night sky above the dead mall. */
export const ROOF_ROOM_NAMES: Readonly<Record<WingRoomRole, string>> = {
  service_corridor: 'Roof Access',
  storefront_a: 'Skylight Walk',
  food_court: 'HVAC Yard',
  storefront_b: 'Billboard Deck',
  back_hall: 'Water Tower',
  security_office: 'Helipad',
};

export const ROOM_VARIANTS: Readonly<
  Record<CombatRoomRole, readonly [AuthoredRoomVariant, AuthoredRoomVariant]>
> = {
  service_corridor: [
    {
      id: 'service-corridor-utility-row',
      interiorWalls: [
        { x: 260, y: 70, width: 140, height: 30 },
        { x: 560, y: 380, width: 140, height: 30 },
        OPENING_FOUNTAIN,
      ],
      playerEntry: { x: 110, y: 240 },
      bossAnchor: null,
      spawnSlots: [
        { slotId: 'corridor-utility-hanger-west', x: 180, y: 120, kinds: ['hanger'] },
        { slotId: 'corridor-utility-mixed-east', x: 780, y: 120, kinds: ['hanger', 'spitter'] },
        { slotId: 'corridor-utility-spitter-west', x: 180, y: 360, kinds: ['spitter'] },
        { slotId: 'corridor-utility-mixed-south', x: 780, y: 360, kinds: ['hanger', 'spitter'] },
      ],
      enemyCount: { min: 0, max: 0 },
      benchKiosk: { x: 480, y: 60 },
    },
    {
      id: 'service-corridor-locker-aisles',
      interiorWalls: [
        { x: 180, y: 110, width: 30, height: 260 },
        { x: 750, y: 110, width: 30, height: 260 },
        OPENING_FOUNTAIN,
      ],
      playerEntry: { x: 110, y: 240 },
      bossAnchor: null,
      spawnSlots: [
        { slotId: 'corridor-locker-hanger-north', x: 480, y: 120, kinds: ['hanger'] },
        { slotId: 'corridor-locker-mixed-east', x: 600, y: 240, kinds: ['hanger', 'spitter'] },
        { slotId: 'corridor-locker-spitter-south', x: 480, y: 360, kinds: ['spitter'] },
        { slotId: 'corridor-locker-mixed-west', x: 360, y: 240, kinds: ['hanger', 'spitter'] },
      ],
      enemyCount: { min: 0, max: 0 },
      benchKiosk: { x: 480, y: 60 },
    },
  ],
  food_court: [
    {
      id: 'food-court-scattered-tables',
      interiorWalls: [
        { x: 220, y: 120, width: 120, height: 40 },
        { x: 620, y: 120, width: 120, height: 40 },
        { x: 220, y: 320, width: 120, height: 40 },
        { x: 620, y: 320, width: 120, height: 40 },
      ],
      playerEntry: { x: 110, y: 240 },
      bossAnchor: null,
      spawnSlots: [
        { slotId: 'food-court-tables-mixed-west', x: 180, y: 240, kinds: ['hanger', 'spitter'] },
        { slotId: 'food-court-tables-hanger-east', x: 780, y: 240, kinds: ['hanger'] },
        { slotId: 'food-court-tables-spitter-north', x: 480, y: 120, kinds: ['spitter'] },
        { slotId: 'food-court-tables-mixed-south', x: 480, y: 360, kinds: ['hanger', 'spitter'] },
      ],
      enemyCount: { min: 3, max: 4 },
      benchKiosk: null,
    },
    {
      id: 'food-court-counter-row',
      interiorWalls: [
        { x: 300, y: 100, width: 360, height: 30 },
        { x: 300, y: 350, width: 360, height: 30 },
      ],
      playerEntry: { x: 110, y: 240 },
      bossAnchor: null,
      spawnSlots: [
        { slotId: 'food-court-counter-hanger-northwest', x: 180, y: 120, kinds: ['hanger'] },
        { slotId: 'food-court-counter-mixed-northeast', x: 780, y: 120, kinds: ['hanger', 'spitter'] },
        { slotId: 'food-court-counter-spitter-southwest', x: 180, y: 360, kinds: ['spitter'] },
        { slotId: 'food-court-counter-mixed-southeast', x: 780, y: 360, kinds: ['hanger', 'spitter'] },
      ],
      enemyCount: { min: 3, max: 4 },
      benchKiosk: null,
    },
  ],
  back_hall: [
    {
      id: 'back-hall-pillar-pairs',
      interiorWalls: [
        { x: 280, y: 160, width: 30, height: 160 },
        { x: 650, y: 160, width: 30, height: 160 },
      ],
      playerEntry: { x: 110, y: 240 },
      bossAnchor: null,
      spawnSlots: [
        { slotId: 'back-hall-pillars-mixed-northwest', x: 180, y: 120, kinds: ['hanger', 'spitter'] },
        { slotId: 'back-hall-pillars-spitter-northeast', x: 780, y: 120, kinds: ['spitter'] },
        { slotId: 'back-hall-pillars-hanger-southwest', x: 180, y: 360, kinds: ['hanger'] },
        { slotId: 'back-hall-pillars-mixed-southeast', x: 780, y: 360, kinds: ['hanger', 'spitter'] },
      ],
      enemyCount: { min: 3, max: 4 },
      benchKiosk: { x: 480, y: 60 },
    },
    {
      id: 'back-hall-crate-corners',
      interiorWalls: [
        { x: 260, y: 90, width: 80, height: 80 },
        { x: 620, y: 310, width: 80, height: 80 },
      ],
      playerEntry: { x: 110, y: 240 },
      bossAnchor: null,
      spawnSlots: [
        { slotId: 'back-hall-crates-hanger-north', x: 480, y: 120, kinds: ['hanger'] },
        { slotId: 'back-hall-crates-mixed-south', x: 480, y: 360, kinds: ['hanger', 'spitter'] },
        { slotId: 'back-hall-crates-spitter-east', x: 700, y: 120, kinds: ['spitter'] },
        { slotId: 'back-hall-crates-mixed-west', x: 260, y: 360, kinds: ['hanger', 'spitter'] },
      ],
      enemyCount: { min: 3, max: 3 },
      benchKiosk: { x: 480, y: 60 },
    },
  ],
};

/** The boss room composition is fixed, so it is not one of the seeded variants. */
export const SECURITY_OFFICE_VARIANT: AuthoredRoomVariant = {
  id: 'security-office-desk-grid',
  interiorWalls: [
    { x: 330, y: 120, width: 140, height: 40 },
    { x: 330, y: 320, width: 140, height: 40 },
  ],
  playerEntry: { x: 110, y: 240 },
  bossAnchor: { x: 760, y: 240 },
  spawnSlots: [],
  enemyCount: { min: 0, max: 0 },
  benchKiosk: null,
};

export type AuthoredPriceBand = {
  readonly min: number;
  readonly max: number;
};

export const AUTHORED_OFFER_BANDS: Readonly<Record<string, AuthoredPriceBand>> = {
  janitor_mop: { min: 7, max: 13 },
  pump_soaker: { min: 15, max: 19 },
  bubble_bath: { min: 11, max: 15 },
  plasma_globe: { min: 18, max: 26 },
  vhs_rewinder: { min: 19, max: 27 },
  extension_cord: { min: 9, max: 15 },
  gel_pens: { min: 6, max: 10 },
  wide_nozzle: { min: 12, max: 20 },
  receipt_wallet: { min: 4, max: 8 },
  fanny_pack: { min: 10, max: 16 },
  rc_car: { min: 16, max: 24 },
  party_popper: { min: 9, max: 13 },
  bottle_rocket_pack: { min: 16, max: 24 },
  fire_extinguisher: { min: 10, max: 18 },
  paint_marker: { min: 5, max: 9 },
  foam_ball_blaster: { min: 8, max: 12 },
  slushie_cup: { min: 7, max: 11 },
  broken_broom_handle: { min: 8, max: 16 },
  box_cutter: { min: 6, max: 12 },
  grease_gun: { min: 9, max: 17 },
  anti_static_strap: { min: 14, max: 22 },
  car_battery: { min: 20, max: 30 },
  needle_nozzle: { min: 12, max: 22 },
  heavy_duty_spring: { min: 10, max: 20 },
  ...Object.fromEntries(ALL_ROSTER.map((entry) => [entry.definition.id, { ...entry.band }])),
};

const DEGREES_TO_RADIANS = Math.PI / 180;

function sightZone(bounds: Rect): StoreSightZone {
  return {
    origin: { x: bounds.x + bounds.width / 2, y: bounds.y + WALL_THICKNESS },
    range: 210,
    arcDegrees: 70,
    centerRadians: Math.PI / 2,
    sweepRadians: 55 * DEGREES_TO_RADIANS,
    sweepTicksPerEndpoint: 180,
  };
}

export type AuthoredStoreOffer = {
  readonly itemDefinitionId: string;
  readonly position: Vec2;
  readonly price: number;
};

export type AuthoredStoreTemplate = {
  readonly id: string;
  readonly name: string;
  readonly bounds: Rect;
  readonly resetPoint: Vec2;
  readonly exit: {
    readonly id: string;
    readonly label: string;
    readonly bounds: Rect;
  };
  readonly sightZone: StoreSightZone;
  readonly offers: readonly AuthoredStoreOffer[];
};

/**
 * Six shelf spots, three across and two deep, inside a store's bounds. Offers
 * take them in turn, so any four in a row (a shift's window of stock) stand
 * on four different spots.
 */
function shelfSpots(bounds: Rect): Vec2[] {
  const xs = [0.22, 0.5, 0.78].map((f) => Math.round(bounds.x + bounds.width * f));
  const ys = [0.27, 0.73].map((f) => Math.round(bounds.y + bounds.height * f));
  return ys.flatMap((y) => xs.map((x) => ({ x, y })));
}

/** Prices each item in its band: mid-band, or its floor for the general store. */
function shelve(bounds: Rect, items: readonly string[], price: 'mid' | 'min' = 'mid'): AuthoredStoreOffer[] {
  const spots = shelfSpots(bounds);
  return items.map((itemDefinitionId, index) => {
    const band = AUTHORED_OFFER_BANDS[itemDefinitionId];
    if (!band) throw new Error(`No price band for ${itemDefinitionId}.`);
    return {
      itemDefinitionId,
      position: { ...spots[index % spots.length]! },
      price: price === 'min' ? band.min : Math.round((band.min + band.max) / 2),
    };
  });
}

const THEMED_BOUNDS: Rect = { x: 240, y: 70, width: 480, height: 300 };

/** A round-32 themed store: the standard shop shape, stocked from STORE_STOCK. */
function themedStore(id: string, name: string): AuthoredStoreTemplate {
  return {
    id,
    name,
    bounds: { ...THEMED_BOUNDS },
    resetPoint: { x: 480, y: 410 },
    exit: {
      id: `${id}-exit`,
      label: `${name} door`,
      bounds: { x: 432, y: 360, width: DOORWAY_WIDTH, height: WALL_THICKNESS },
    },
    sightZone: sightZone(THEMED_BOUNDS),
    offers: shelve(THEMED_BOUNDS, STORE_STOCK[id] ?? []),
  };
}

export const STORE_TEMPLATES: readonly AuthoredStoreTemplate[] = [
  {
    id: 'mall-mart',
    name: 'Mall Mart',
    bounds: { x: 250, y: 70, width: 460, height: 300 },
    resetPoint: { x: 480, y: 410 },
    exit: {
      id: 'mall-mart-exit',
      label: 'Mall Mart door',
      bounds: { x: 432, y: 360, width: DOORWAY_WIDTH, height: WALL_THICKNESS },
    },
    sightZone: sightZone({ x: 250, y: 70, width: 460, height: 300 }),
    // Round 32: the general store. A little of everything, always at the
    // bottom of its price band, so it is worth a stop (the playtest skipped it).
    offers: shelve({ x: 250, y: 70, width: 460, height: 300 }, [
      'receipt_wallet', 'fanny_pack', 'rc_car', 'bubble_bath', 'gel_pens', 'wide_nozzle',
      'dodgeball', 'duct_tape', 'yo_yo', 'ketchup_bottle', 'claw_hammer', 'water_balloons',
    ], 'min'),
  },
  {
    id: 'cinema-snacks',
    name: 'Cinema Snacks',
    bounds: { x: 230, y: 90, width: 500, height: 280 },
    resetPoint: { x: 480, y: 410 },
    exit: {
      id: 'cinema-snacks-exit',
      label: 'Cinema Snacks door',
      bounds: { x: 432, y: 360, width: DOORWAY_WIDTH, height: WALL_THICKNESS },
    },
    sightZone: sightZone({ x: 230, y: 90, width: 500, height: 280 }),
    offers: [
      { itemDefinitionId: 'slushie_cup', position: { x: 330, y: 160 }, price: 9 },
      { itemDefinitionId: 'party_popper', position: { x: 480, y: 160 }, price: 11 },
      { itemDefinitionId: 'bubble_bath', position: { x: 630, y: 160 }, price: 13 },
      { itemDefinitionId: 'pump_soaker', position: { x: 330, y: 290 }, price: 17 },
      { itemDefinitionId: 'paint_marker', position: { x: 480, y: 290 }, price: 7 },
      { itemDefinitionId: 'foam_ball_blaster', position: { x: 630, y: 290 }, price: 10 },
    ],
  },
  {
    id: 'arcade-annex',
    name: 'Arcade Annex',
    bounds: { x: 270, y: 80, width: 440, height: 290 },
    resetPoint: { x: 490, y: 410 },
    exit: {
      id: 'arcade-annex-exit',
      label: 'Arcade Annex door',
      bounds: { x: 442, y: 360, width: DOORWAY_WIDTH, height: WALL_THICKNESS },
    },
    sightZone: sightZone({ x: 270, y: 80, width: 440, height: 290 }),
    offers: [
      { itemDefinitionId: 'plasma_globe', position: { x: 360, y: 150 }, price: 22 },
      { itemDefinitionId: 'vhs_rewinder', position: { x: 500, y: 150 }, price: 24 },
      { itemDefinitionId: 'extension_cord', position: { x: 640, y: 150 }, price: 12 },
      { itemDefinitionId: 'bottle_rocket_pack', position: { x: 360, y: 290 }, price: 21 },
      { itemDefinitionId: 'car_battery', position: { x: 500, y: 290 }, price: 26 },
      { itemDefinitionId: 'anti_static_strap', position: { x: 640, y: 290 }, price: 19 },
    ],
  },
  {
    id: 'department-outlet',
    name: 'Department Outlet',
    bounds: { x: 240, y: 70, width: 480, height: 300 },
    resetPoint: { x: 480, y: 410 },
    exit: {
      id: 'department-outlet-exit',
      label: 'Department Outlet door',
      bounds: { x: 432, y: 360, width: DOORWAY_WIDTH, height: WALL_THICKNESS },
    },
    sightZone: sightZone({ x: 240, y: 70, width: 480, height: 300 }),
    offers: [
      { itemDefinitionId: 'fire_extinguisher', position: { x: 350, y: 150 }, price: 14 },
      { itemDefinitionId: 'broken_broom_handle', position: { x: 480, y: 150 }, price: 12 },
      { itemDefinitionId: 'box_cutter', position: { x: 610, y: 150 }, price: 9 },
      { itemDefinitionId: 'grease_gun', position: { x: 350, y: 290 }, price: 13 },
      { itemDefinitionId: 'needle_nozzle', position: { x: 480, y: 290 }, price: 17 },
      { itemDefinitionId: 'heavy_duty_spring', position: { x: 610, y: 290 }, price: 15 },
    ],
  },
  themedStore('sports-locker', 'Sports Locker'),
  themedStore('hardware-hut', 'Hardware Hut'),
  themedStore('toy-box', 'Toy Box'),
  themedStore('radio-shed', 'Radio Shed'),
  themedStore('spiral-records', 'Spiral Records'),
  themedStore('slice-station', 'Slice Station'),
  themedStore('video-world', 'Video World'),
];
