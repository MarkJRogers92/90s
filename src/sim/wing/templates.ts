/**
 * Authored M5 wing content.
 *
 * Rooms are 960x480 local interiors. Walls use the M3 ten-unit thickness and
 * doorways use the M3 ninety-six-unit width. Every value here is authored
 * content; the generator only selects among these bounded variants and bands.
 */
import type { Rect, Vec2 } from '../model';
import type { StoreSightZone } from '../shop/types';
import type { FloorNumber } from './floorSpecs';
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

type SlotKinds = 'h' | 's' | 'hs';
const KINDS: Readonly<Record<SlotKinds, readonly AuthoredEnemyKind[]>> = { h: ['hanger'], s: ['spitter'], hs: ['hanger', 'spitter'] };

/** A variant's spawn slots, named `<variant>-<n>`, from [x, y, kinds] triples. */
function slots(variant: string, entries: ReadonlyArray<readonly [number, number, SlotKinds]>): AuthoredSpawnSlot[] {
  return entries.map(([x, y, kinds], index) => ({ slotId: `${variant}-${index + 1}`, x, y, kinds: KINDS[kinds] }));
}

const ENTRY: Vec2 = { x: 110, y: 240 };
const BENCH: Vec2 = { x: 480, y: 60 };

/** A safe first room: no monsters, the Bench Warrant at the back wall. */
function safeRoom(id: string, interiorWalls: readonly Rect[], slotPoints: ReadonlyArray<readonly [number, number]>): AuthoredRoomVariant {
  return { id, interiorWalls, playerEntry: ENTRY, bossAnchor: null, spawnSlots: slots(id, slotPoints.map(([x, y]) => [x, y, 'hs'] as const)), enemyCount: { min: 0, max: 0 }, benchKiosk: BENCH };
}

function fightRoom(id: string, interiorWalls: readonly Rect[], entries: ReadonlyArray<readonly [number, number, SlotKinds]>, enemyCount: AuthoredEnemyCountBand, bench = false): AuthoredRoomVariant {
  return { id, interiorWalls, playerEntry: ENTRY, bossAnchor: null, spawnSlots: slots(id, entries), enemyCount, benchKiosk: bench ? BENCH : null };
}

/**
 * Round 58: floors 2-4 lay their rooms out their own way (floor 1 keeps
 * ROOM_VARIANTS). Each floor's shapes suit what stands there: the Upper
 * Level's atrium wells and cinema queues, the Food Court After Dark's tables,
 * arcade rows and loading-dock pallets, the Roof's skylights, ducts, HVAC
 * units and water-tower legs. Fight bands match floor 1's for the same room,
 * so a floor gets no more monsters than before, only somewhere new to fight.
 */
export const FLOOR_ROOM_VARIANTS: Readonly<Record<2 | 3 | 4, Readonly<Record<CombatRoomRole, readonly [AuthoredRoomVariant, AuthoredRoomVariant]>>>> = {
  2: {
    service_corridor: [
      safeRoom('escalator-landing-atrium', [
        { x: 370, y: 316, width: 220, height: 56 },
        { x: 200, y: 112, width: 120, height: 28 },
        { x: 640, y: 112, width: 120, height: 28 },
      ], [[150, 120], [810, 120], [180, 390], [780, 390]]),
      safeRoom('escalator-landing-galleries', [
        { x: 220, y: 320, width: 170, height: 50 },
        { x: 570, y: 320, width: 170, height: 50 },
        { x: 240, y: 100, width: 28, height: 110 },
        { x: 692, y: 100, width: 28, height: 110 },
      ], [[150, 130], [810, 130], [130, 400], [830, 400]]),
    ],
    food_court: [
      fightRoom('cinema-lobby-queues', [
        { x: 230, y: 130, width: 190, height: 14 },
        { x: 540, y: 130, width: 190, height: 14 },
        { x: 230, y: 350, width: 190, height: 14 },
        { x: 540, y: 350, width: 190, height: 14 },
      ], [[180, 240, 'hs'], [780, 240, 'h'], [480, 100, 's'], [480, 400, 'hs']], { min: 3, max: 4 }),
      fightRoom('cinema-lobby-concessions', [
        { x: 300, y: 100, width: 360, height: 34 },
        { x: 190, y: 320, width: 40, height: 36 },
        { x: 730, y: 320, width: 40, height: 36 },
      ], [[170, 130, 'h'], [790, 130, 'hs'], [180, 410, 's'], [780, 410, 'hs']], { min: 3, max: 4 }),
    ],
    back_hall: [
      fightRoom('stairwell-columns', [
        { x: 260, y: 110, width: 40, height: 40 },
        { x: 660, y: 110, width: 40, height: 40 },
        { x: 260, y: 330, width: 40, height: 40 },
        { x: 660, y: 330, width: 40, height: 40 },
      ], [[170, 120, 'hs'], [790, 120, 's'], [170, 360, 'h'], [790, 360, 'hs']], { min: 3, max: 4 }, true),
      fightRoom('stairwell-barriers', [
        { x: 200, y: 150, width: 180, height: 24 },
        { x: 580, y: 150, width: 180, height: 24 },
        { x: 390, y: 320, width: 180, height: 24 },
      ], [[480, 130, 'h'], [480, 390, 'hs'], [780, 330, 's'], [240, 260, 'hs']], { min: 3, max: 3 }, true),
    ],
  },
  3: {
    service_corridor: [
      safeRoom('seating-tables', [
        { x: 220, y: 110, width: 60, height: 44 },
        { x: 680, y: 110, width: 60, height: 44 },
        { x: 220, y: 330, width: 60, height: 44 },
        { x: 680, y: 330, width: 60, height: 44 },
        { x: 420, y: 316, width: 120, height: 44 },
      ], [[140, 130], [820, 130], [140, 400], [820, 400]]),
      safeRoom('seating-booths', [
        { x: 200, y: 116, width: 150, height: 34 },
        { x: 610, y: 116, width: 150, height: 34 },
        { x: 200, y: 330, width: 150, height: 34 },
        { x: 610, y: 330, width: 150, height: 34 },
      ], [[480, 150], [480, 380], [140, 240], [820, 240]]),
    ],
    food_court: [
      fightRoom('arcade-rows', [
        { x: 220, y: 104, width: 200, height: 30 },
        { x: 540, y: 104, width: 200, height: 30 },
        { x: 220, y: 346, width: 200, height: 30 },
        { x: 540, y: 346, width: 200, height: 30 },
      ], [[170, 240, 'hs'], [790, 240, 'h'], [480, 90, 's'], [480, 410, 'hs']], { min: 3, max: 4 }),
      fightRoom('arcade-tables', [
        { x: 250, y: 120, width: 76, height: 44 },
        { x: 634, y: 120, width: 76, height: 44 },
        { x: 250, y: 316, width: 76, height: 44 },
        { x: 634, y: 316, width: 76, height: 44 },
      ], [[480, 120, 's'], [480, 360, 'hs'], [180, 340, 'hs'], [790, 140, 'h']], { min: 3, max: 4 }),
    ],
    back_hall: [
      fightRoom('dock-pallets', [
        { x: 230, y: 110, width: 64, height: 52 },
        { x: 650, y: 120, width: 64, height: 52 },
        { x: 440, y: 320, width: 64, height: 52 },
        { x: 700, y: 340, width: 64, height: 52 },
      ], [[160, 120, 'hs'], [820, 110, 's'], [160, 380, 'h'], [840, 420, 'hs']], { min: 3, max: 4 }, true),
      fightRoom('dock-bays', [
        { x: 300, y: 100, width: 28, height: 140 },
        { x: 640, y: 240, width: 28, height: 140 },
        { x: 180, y: 330, width: 64, height: 52 },
        { x: 720, y: 110, width: 64, height: 52 },
      ], [[480, 130, 'h'], [480, 370, 'hs'], [200, 200, 'hs'], [790, 320, 's']], { min: 3, max: 3 }, true),
    ],
  },
  4: {
    service_corridor: [
      safeRoom('roof-access-skylights', [
        { x: 240, y: 316, width: 120, height: 50 },
        { x: 600, y: 316, width: 120, height: 50 },
        { x: 220, y: 110, width: 36, height: 28 },
        { x: 704, y: 110, width: 36, height: 28 },
      ], [[140, 140], [820, 140], [140, 400], [820, 400]]),
      safeRoom('roof-access-ducts', [
        { x: 200, y: 120, width: 200, height: 24 },
        { x: 560, y: 330, width: 200, height: 24 },
        { x: 250, y: 320, width: 110, height: 50 },
        { x: 640, y: 110, width: 40, height: 40 },
      ], [[140, 160], [820, 160], [140, 410], [840, 260]]),
    ],
    food_court: [
      fightRoom('hvac-grid', [
        { x: 230, y: 110, width: 70, height: 46 },
        { x: 660, y: 110, width: 70, height: 46 },
        { x: 230, y: 320, width: 70, height: 46 },
        { x: 660, y: 320, width: 70, height: 46 },
        { x: 445, y: 215, width: 70, height: 46 },
      ], [[480, 110, 's'], [480, 380, 'hs'], [180, 400, 'hs'], [800, 120, 'h']], { min: 3, max: 4 }),
      fightRoom('hvac-pipes', [
        { x: 170, y: 150, width: 250, height: 14 },
        { x: 540, y: 150, width: 250, height: 14 },
        { x: 300, y: 330, width: 360, height: 14 },
      ], [[480, 110, 's'], [170, 240, 'hs'], [790, 240, 'h'], [480, 400, 'hs']], { min: 3, max: 4 }),
    ],
    back_hall: [
      fightRoom('tower-legs', [
        { x: 380, y: 150, width: 32, height: 32 },
        { x: 548, y: 150, width: 32, height: 32 },
        { x: 380, y: 300, width: 32, height: 32 },
        { x: 548, y: 300, width: 32, height: 32 },
      ], [[180, 120, 'hs'], [780, 120, 's'], [180, 360, 'h'], [780, 360, 'hs']], { min: 3, max: 4 }, true),
      fightRoom('tower-tanks', [
        { x: 300, y: 110, width: 28, height: 150 },
        { x: 640, y: 220, width: 28, height: 150 },
        { x: 440, y: 340, width: 70, height: 46 },
      ], [[480, 130, 'h'], [180, 330, 'hs'], [780, 140, 's'], [560, 420, 'hs']], { min: 3, max: 3 }, true),
    ],
  },
};

/**
 * Round 59: each floor's first wing is laid out as its rooms are named
 * (FloorSpec.firstWingNames), so Kiosk Alley has its kiosks, the Ball Pit its
 * pit and the Duct Maze its ducts, instead of borrowing the boss wing's rooms.
 * Fight bands match the same room's elsewhere on the floor.
 */
export const FIRST_WING_VARIANTS: Readonly<Record<FloorNumber, Readonly<Record<CombatRoomRole, readonly [AuthoredRoomVariant, AuthoredRoomVariant]>>>> = {
  1: {
    service_corridor: [
      safeRoom('opening-fountain-plaza', [
        OPENING_FOUNTAIN,
        { x: 200, y: 330, width: 150, height: 30 },
        { x: 610, y: 330, width: 150, height: 30 },
        { x: 250, y: 112, width: 44, height: 40 },
        { x: 666, y: 112, width: 44, height: 40 },
      ], [[180, 200], [780, 200], [150, 410], [810, 410]]),
      safeRoom('opening-twin-gardens', [
        OPENING_FOUNTAIN,
        { x: 290, y: 120, width: 34, height: 190 },
        { x: 636, y: 120, width: 34, height: 190 },
      ], [[200, 140], [760, 140], [200, 400], [760, 400]]),
    ],
    food_court: [
      fightRoom('kiosk-alley-rows', [
        { x: 210, y: 120, width: 56, height: 40 },
        { x: 452, y: 120, width: 56, height: 40 },
        { x: 694, y: 120, width: 56, height: 40 },
        { x: 210, y: 320, width: 56, height: 40 },
        { x: 452, y: 320, width: 56, height: 40 },
        { x: 694, y: 320, width: 56, height: 40 },
      ], [[340, 240, 'hs'], [790, 240, 'h'], [600, 240, 's'], [480, 410, 'hs']], { min: 3, max: 4 }),
      fightRoom('kiosk-alley-island', [
        { x: 330, y: 210, width: 300, height: 60 },
        { x: 200, y: 110, width: 56, height: 40 },
        { x: 704, y: 330, width: 56, height: 40 },
      ], [[480, 130, 's'], [480, 360, 'hs'], [190, 300, 'hs'], [790, 200, 'h']], { min: 3, max: 4 }),
    ],
    back_hall: [
      fightRoom('freight-pallet-rows', [
        { x: 220, y: 130, width: 64, height: 52 },
        { x: 220, y: 320, width: 64, height: 52 },
        { x: 690, y: 130, width: 64, height: 52 },
        { x: 690, y: 320, width: 64, height: 52 },
        { x: 466, y: 200, width: 28, height: 130 },
      ], [[360, 240, 'hs'], [600, 240, 's'], [820, 130, 'h'], [360, 410, 'hs']], { min: 3, max: 4 }, true),
      fightRoom('freight-dock-lanes', [
        { x: 180, y: 170, width: 240, height: 26 },
        { x: 540, y: 300, width: 240, height: 26 },
        { x: 620, y: 110, width: 64, height: 52 },
        { x: 270, y: 330, width: 64, height: 52 },
      ], [[480, 150, 'h'], [480, 400, 'hs'], [200, 250, 'hs'], [790, 180, 's']], { min: 3, max: 3 }, true),
    ],
  },
  2: {
    service_corridor: [
      safeRoom('mezzanine-overlook', [
        { x: 200, y: 340, width: 560, height: 34 },
        { x: 230, y: 120, width: 48, height: 40 },
        { x: 682, y: 120, width: 48, height: 40 },
      ], [[200, 260], [760, 260], [140, 420], [820, 420]]),
      safeRoom('mezzanine-wells', [
        { x: 180, y: 300, width: 120, height: 48 },
        { x: 420, y: 330, width: 120, height: 48 },
        { x: 660, y: 300, width: 120, height: 48 },
      ], [[200, 150], [760, 150], [480, 230], [480, 420]]),
    ],
    food_court: [
      fightRoom('gallery-partitions', [
        { x: 220, y: 140, width: 180, height: 22 },
        { x: 560, y: 140, width: 180, height: 22 },
        { x: 390, y: 320, width: 180, height: 22 },
      ], [[480, 110, 's'], [190, 240, 'hs'], [790, 240, 'h'], [480, 410, 'hs']], { min: 3, max: 4 }),
      fightRoom('gallery-ropes', [
        { x: 380, y: 180, width: 200, height: 14 },
        { x: 380, y: 300, width: 200, height: 14 },
        { x: 180, y: 110, width: 160, height: 22 },
        { x: 620, y: 350, width: 160, height: 22 },
      ], [[480, 240, 's'], [190, 320, 'hs'], [790, 180, 'h'], [480, 410, 'hs']], { min: 3, max: 4 }),
    ],
    back_hall: [
      fightRoom('elevator-shafts', [
        { x: 290, y: 320, width: 120, height: 56 },
        { x: 550, y: 320, width: 120, height: 56 },
        { x: 250, y: 140, width: 40, height: 40 },
        { x: 670, y: 140, width: 40, height: 40 },
      ], [[480, 220, 'h'], [170, 260, 'hs'], [790, 190, 's'], [480, 420, 'hs']], { min: 3, max: 4 }, true),
      fightRoom('elevator-planters', [
        { x: 330, y: 150, width: 30, height: 180 },
        { x: 600, y: 150, width: 30, height: 180 },
      ], [[480, 240, 'h'], [190, 130, 'hs'], [780, 360, 's'], [800, 140, 'hs']], { min: 3, max: 3 }, true),
    ],
  },
  3: {
    service_corridor: [
      safeRoom('snack-bar-counter', [
        { x: 300, y: 150, width: 360, height: 30 },
        { x: 220, y: 320, width: 60, height: 44 },
        { x: 680, y: 320, width: 60, height: 44 },
      ], [[480, 260], [180, 140], [780, 140], [480, 420]]),
      safeRoom('snack-bar-booths', [
        { x: 180, y: 320, width: 160, height: 34 },
        { x: 400, y: 320, width: 160, height: 34 },
        { x: 620, y: 320, width: 160, height: 34 },
      ], [[200, 160], [760, 160], [480, 230], [480, 420]]),
    ],
    food_court: [
      fightRoom('ball-pit-center', [
        { x: 380, y: 180, width: 200, height: 120 },
      ], [[200, 140, 'hs'], [790, 140, 'h'], [200, 380, 's'], [790, 380, 'hs']], { min: 3, max: 4 }),
      fightRoom('ball-pit-twin', [
        { x: 220, y: 130, width: 160, height: 90 },
        { x: 580, y: 260, width: 160, height: 90 },
      ], [[480, 150, 's'], [480, 330, 'hs'], [190, 330, 'hs'], [790, 160, 'h']], { min: 3, max: 4 }),
    ],
    back_hall: [
      fightRoom('freezer-aisles', [
        { x: 200, y: 170, width: 220, height: 30 },
        { x: 540, y: 170, width: 220, height: 30 },
        { x: 200, y: 320, width: 220, height: 30 },
        { x: 540, y: 320, width: 220, height: 30 },
      ], [[480, 250, 'hs'], [800, 120, 's'], [480, 410, 'hs'], [480, 130, 'h']], { min: 3, max: 4 }, true),
      fightRoom('freezer-islands', [
        { x: 280, y: 140, width: 90, height: 44 },
        { x: 590, y: 140, width: 90, height: 44 },
        { x: 280, y: 310, width: 90, height: 44 },
        { x: 590, y: 310, width: 90, height: 44 },
      ], [[480, 240, 'h'], [190, 240, 'hs'], [790, 400, 's'], [480, 410, 'hs']], { min: 3, max: 3 }, true),
    ],
  },
  4: {
    service_corridor: [
      safeRoom('ladder-landing', [
        { x: 200, y: 330, width: 240, height: 24 },
        { x: 520, y: 330, width: 240, height: 24 },
        { x: 230, y: 130, width: 36, height: 28 },
        { x: 694, y: 130, width: 36, height: 28 },
      ], [[200, 260], [760, 260], [480, 420], [480, 200]]),
      safeRoom('ladder-skylights', [
        { x: 400, y: 300, width: 160, height: 60 },
        { x: 200, y: 140, width: 70, height: 46 },
        { x: 690, y: 140, width: 70, height: 46 },
      ], [[200, 260], [760, 260], [220, 410], [740, 410]]),
    ],
    food_court: [
      fightRoom('duct-maze-zigzag', [
        { x: 180, y: 120, width: 200, height: 24 },
        { x: 356, y: 144, width: 24, height: 110 },
        { x: 580, y: 336, width: 200, height: 24 },
        { x: 580, y: 226, width: 24, height: 110 },
      ], [[480, 240, 'h'], [190, 300, 'hs'], [790, 180, 's'], [480, 420, 'hs']], { min: 3, max: 4 }),
      fightRoom('duct-maze-grid', [
        { x: 260, y: 110, width: 24, height: 130 },
        { x: 676, y: 110, width: 24, height: 130 },
        { x: 420, y: 250, width: 24, height: 130 },
        { x: 516, y: 250, width: 24, height: 130 },
      ], [[480, 130, 's'], [190, 330, 'hs'], [790, 330, 'h'], [480, 420, 'hs']], { min: 3, max: 4 }),
    ],
    back_hall: [
      fightRoom('gravel-yard-units', [
        { x: 220, y: 150, width: 70, height: 46 },
        { x: 670, y: 150, width: 70, height: 46 },
        { x: 445, y: 300, width: 70, height: 46 },
      ], [[480, 220, 'h'], [170, 280, 'hs'], [820, 120, 's'], [800, 380, 'hs']], { min: 3, max: 4 }, true),
      fightRoom('gravel-yard-pipes', [
        { x: 180, y: 180, width: 280, height: 14 },
        { x: 500, y: 300, width: 280, height: 14 },
        { x: 700, y: 120, width: 40, height: 40 },
      ], [[480, 140, 'h'], [200, 330, 'hs'], [780, 220, 's'], [480, 410, 'hs']], { min: 3, max: 3 }, true),
    ],
  },
};

/** The layouts a floor's room can roll: the first wing's named pair, floor 1's own, or the floor's round-58 pair. */
export function roomVariantsFor(role: CombatRoomRole, floor: FloorNumber, part?: 1): readonly AuthoredRoomVariant[] {
  if (part === 1) return FIRST_WING_VARIANTS[floor][role];
  return floor === 1 ? ROOM_VARIANTS[role] : FLOOR_ROOM_VARIANTS[floor][role];
}

/** Any floor's layout for a room, by id (the wing records only the id). */
export function findRoomVariant(role: CombatRoomRole, id: string): AuthoredRoomVariant | undefined {
  const floors = [1, 2, 3, 4] as const;
  return [
    ROOM_VARIANTS[role],
    ...([2, 3, 4] as const).map((floor) => FLOOR_ROOM_VARIANTS[floor][role]),
    ...floors.map((floor) => FIRST_WING_VARIANTS[floor][role]),
  ].flat().find((variant) => variant.id === id);
}

function arena(id: string, interiorWalls: readonly Rect[]): AuthoredRoomVariant {
  return { id, interiorWalls, playerEntry: ENTRY, bossAnchor: { x: 760, y: 240 }, spawnSlots: [], enemyCount: { min: 0, max: 0 }, benchKiosk: null };
}

/**
 * Round 59: each floor's boss room (and each first wing's Lockdown room) has
 * its own cover, all of it west of x 600 so the boss and the Lockdown ring
 * around the anchor (760, 240) always have their ground.
 */
export const BOSS_ARENAS: Readonly<Record<FloorNumber, { readonly first: AuthoredRoomVariant; readonly boss: AuthoredRoomVariant | null }>> = {
  1: {
    first: arena('customer-service-queue', [
      { x: 260, y: 150, width: 200, height: 14 },
      { x: 260, y: 330, width: 200, height: 14 },
      { x: 480, y: 120, width: 60, height: 40 },
      { x: 480, y: 320, width: 60, height: 40 },
    ]),
    // Floor 1's boss wing keeps SECURITY_OFFICE_VARIANT (declared below this table).
    boss: null,
  },
  2: {
    first: arena('mezzanine-office-desks', [
      { x: 280, y: 130, width: 70, height: 40 },
      { x: 280, y: 310, width: 70, height: 40 },
      { x: 470, y: 130, width: 70, height: 40 },
      { x: 470, y: 310, width: 70, height: 40 },
    ]),
    boss: arena('management-boardroom', [
      { x: 340, y: 210, width: 220, height: 60 },
      { x: 300, y: 110, width: 48, height: 40 },
      { x: 300, y: 330, width: 48, height: 40 },
    ]),
  },
  3: {
    first: arena('walk-in-shelves', [
      { x: 260, y: 120, width: 240, height: 28 },
      { x: 260, y: 330, width: 240, height: 28 },
    ]),
    boss: arena('owners-suite-desk', [
      { x: 420, y: 150, width: 140, height: 40 },
      { x: 300, y: 320, width: 40, height: 40 },
      { x: 540, y: 320, width: 40, height: 40 },
    ]),
  },
  4: {
    first: arena('elevator-housing-machinery', [
      { x: 320, y: 130, width: 90, height: 50 },
      { x: 480, y: 310, width: 90, height: 50 },
    ]),
    boss: arena('helipad-pad', [
      { x: 300, y: 110, width: 70, height: 46 },
      { x: 300, y: 320, width: 70, height: 46 },
      { x: 480, y: 220, width: 40, height: 40 },
    ]),
  },
};

/** The boss room's layout for a floor's first wing (its Lockdown) or boss wing. */
export function bossArenaFor(floor: FloorNumber, part?: 1): AuthoredRoomVariant {
  return part === 1 ? BOSS_ARENAS[floor].first : BOSS_ARENAS[floor].boss ?? SECURITY_OFFICE_VARIANT;
}

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

/**
 * Round 50: the district stores. Each only ever opens in its own district's
 * wings (wing/districts.ts), never in the regular shuffle above, so the
 * regular wings draw exactly as before.
 */
export const DISTRICT_STORE_TEMPLATES: readonly AuthoredStoreTemplate[] = [
  themedStore('candy-cauldron', 'Candy Cauldron'),
  themedStore('novelty-nook', 'Novelty Nook'),
  themedStore('glam-snaps', 'Glam Snaps'),
  themedStore('hair-affair', 'Hair Affair'),
  themedStore('pet-palace', 'Pet Palace'),
  themedStore('green-thumb', 'Green Thumb'),
  themedStore('skate-shack', 'Skate Shack'),
  themedStore('cocoa-hut', 'Cocoa Hut'),
];

/**
 * Round 55: the floor-exclusive stores. Floors 2-4 each open one of their own
 * two in storefront_a (wing/generateWing.ts); floor 1 and the regular pool
 * above never change. Like the district stores they stay out of STORE_TEMPLATES.
 */
export const FLOOR_STORE_IDS: Readonly<Partial<Record<FloorNumber, readonly [string, string]>>> = {
  2: ['shade-station', 'page-turner'],
  3: ['pretzel-pit', 'frosty-freeze'],
  4: ['antenna-annex', 'pawn-palace'],
};

export const FLOOR_STORE_TEMPLATES: readonly AuthoredStoreTemplate[] = [
  themedStore('shade-station', 'Shade Station'),
  themedStore('page-turner', 'Page Turner Books'),
  themedStore('pretzel-pit', 'Pretzel Pit'),
  themedStore('frosty-freeze', 'Frosty Freeze'),
  themedStore('antenna-annex', 'Antenna Annex'),
  themedStore('pawn-palace', 'Pawn Palace'),
];

/** Every store that can open anywhere, for lookups by template id. */
export const ALL_STORE_TEMPLATES: readonly AuthoredStoreTemplate[] = [...STORE_TEMPLATES, ...DISTRICT_STORE_TEMPLATES, ...FLOOR_STORE_TEMPLATES];

export function storeTemplate(id: string): AuthoredStoreTemplate | undefined {
  return ALL_STORE_TEMPLATES.find((template) => template.id === id);
}
