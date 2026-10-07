/**
 * Room dressing: what a room looks like, as plain data.
 *
 * The simulation authors each room as collision rectangles, doorways, spawn
 * points and (for storefronts) a store zone. This planner turns one
 * `WingRoomDefinition` into a presentation plan — which storefronts line the
 * back wall, which props sit on the collision rectangles, where light falls,
 * what the neon says, and how dark the room is. It never invents collision:
 * every solid-looking prop is placed on an authored wall, and free-standing
 * decor keeps to the room's edges.
 *
 * Rooms are themed by role rather than hand-painted one by one, so a new room
 * variant is dressed automatically, and a new room role only needs one theme
 * entry here. The renderer (`MallRoomView`) draws whatever this returns.
 */
import type { Rect } from '../../../sim/model';
import type { WingRoomDefinition } from '../../../sim/wing/types';
import { BACK_HALL_DAMAGED_VENDING, INTERIOR_BOUNDS, roomFurniture, type ConcourseFurniture, INTERIOR_EXIT, STORE_ENTRANCE_XS, roomStores } from '../../../sim/run/storeInterior';
import type { WingStoreInstance } from '../../../sim/wing/types';
import { OPENING_FOUNTAIN } from '../../../sim/wing/templates';
import type { FloorStyle, NeonSignSpec } from '../neon/proceduralTextures';
import type { PointLight } from '../lighting/LightingLayer';
import type { FloorNumber } from '../../../sim/wing/floorSpecs';
import type { DistrictId } from '../../../sim/wing/districts';
import { SECRET_STORE_INDEX } from '../../../sim/run/secretRoom';
import { roomDecor } from './roomDecor';

/* ------------------------------------------------------------------------ */
/* Stage geometry                                                             */
/* ------------------------------------------------------------------------ */

/** The playfield is 960x480; the band above it shows the back wall in 3/4. */
export const STAGE_TOP = -120;
export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 600;
/** Storefront panels stand on the top wall; their bottom edge is this line. */
export const FACADE_BASE_Y = 40;
export const FACADE_HEIGHT = 160;
/** Doorway lanes that free-standing props must never block. */
export const DOOR_LANE = { top: 176, bottom: 304, depth: 70 } as const;

/* ------------------------------------------------------------------------ */
/* Texture registry for the dressing layer                                    */
/* ------------------------------------------------------------------------ */

export const FACADE_TEXTURES = {
  video: { key: 'neon:facade:video-store', file: 'facades/video-store.png', width: 288 },
  music: { key: 'neon:facade:music-store', file: 'facades/music-store.png', width: 288 },
  electronics: { key: 'neon:facade:electronics-store', file: 'facades/electronics-store.png', width: 320 },
  arcade: { key: 'neon:facade:arcade', file: 'facades/arcade.png', width: 288 },
  boutique: { key: 'neon:facade:boutique', file: 'facades/boutique.png', width: 288 },
  cinema: { key: 'neon:facade:cinema-concession', file: 'facades/cinema-concession.png', width: 288 },
  pizza: { key: 'neon:facade:pizza-counter', file: 'facades/pizza-counter.png', width: 256 },
  burger: { key: 'neon:facade:burger-counter', file: 'facades/burger-counter.png', width: 256 },
  wok: { key: 'neon:facade:wok-counter', file: 'facades/wok-counter.png', width: 256 },
  security: { key: 'neon:facade:security-office', file: 'facades/security-office.png', width: 288 },
  service: { key: 'neon:facade:back-hall-wall', file: 'facades/back-hall-wall.png', width: 288 },
  sports: { key: 'neon:facade:sports-locker', file: 'facades/sports-locker.png', width: 288 },
  hardware: { key: 'neon:facade:hardware-hut', file: 'facades/hardware-hut.png', width: 288 },
  toys: { key: 'neon:facade:toy-box', file: 'facades/toy-box.png', width: 288 },
  radio: { key: 'neon:facade:radio-shed', file: 'facades/radio-shed.png', width: 288 },
  // Round 39: the Roof's back walls (no shops up here).
  roofHvac: { key: 'neon:facade:roof-hvac', file: 'facades/roof-hvac.png', width: 288 },
  roofBillboard: { key: 'neon:facade:roof-billboard', file: 'facades/roof-billboard.png', width: 288 },
  roofTower: { key: 'neon:facade:roof-water-tower', file: 'facades/roof-water-tower.png', width: 288 },
  roofAccess: { key: 'neon:facade:roof-access', file: 'facades/roof-access.png', width: 288 },
  // Round 50: the districts (Retro Diffusion, 288x160): the eight district shopfronts and their back walls.
  candyCauldron: { key: 'neon:facade:candy-cauldron', file: 'facades/candy-cauldron.png', width: 288 },
  noveltyNook: { key: 'neon:facade:novelty-nook', file: 'facades/novelty-nook.png', width: 288 },
  glamSnaps: { key: 'neon:facade:glam-snaps', file: 'facades/glam-snaps.png', width: 288 },
  hairAffair: { key: 'neon:facade:hair-affair', file: 'facades/hair-affair.png', width: 288 },
  petPalace: { key: 'neon:facade:pet-palace', file: 'facades/pet-palace.png', width: 288 },
  greenThumb: { key: 'neon:facade:green-thumb', file: 'facades/green-thumb.png', width: 288 },
  skateShack: { key: 'neon:facade:skate-shack', file: 'facades/skate-shack.png', width: 288 },
  cocoaHut: { key: 'neon:facade:cocoa-hut', file: 'facades/cocoa-hut.png', width: 288 },
  santaSet: { key: 'neon:facade:santa-set', file: 'facades/santa-set.png', width: 288 },
  holidayWindow: { key: 'neon:facade:holiday-window', file: 'facades/holiday-window.png', width: 288 },
  perfumeCounter: { key: 'neon:facade:perfume-counter', file: 'facades/perfume-counter.png', width: 288 },
  fittingRooms: { key: 'neon:facade:fitting-rooms', file: 'facades/fitting-rooms.png', width: 288 },
  aquariumWall: { key: 'neon:facade:aquarium-wall', file: 'facades/aquarium-wall.png', width: 288 },
  kennelWall: { key: 'neon:facade:kennel-wall', file: 'facades/kennel-wall.png', width: 288 },
  rinkBoards: { key: 'neon:facade:rink-boards', file: 'facades/rink-boards.png', width: 288 },
  // Round 55: the floor-exclusive stores (placeholder recolours of existing fronts until redrawn).
  shadeStation: { key: 'neon:facade:shade-station', file: 'facades/shade-station.png', width: 288 },
  pageTurner: { key: 'neon:facade:page-turner', file: 'facades/page-turner.png', width: 288 },
  pretzelPit: { key: 'neon:facade:pretzel-pit', file: 'facades/pretzel-pit.png', width: 288 },
  frostyFreeze: { key: 'neon:facade:frosty-freeze', file: 'facades/frosty-freeze.png', width: 288 },
  antennaAnnex: { key: 'neon:facade:antenna-annex', file: 'facades/antenna-annex.png', width: 288 },
  pawnPalace: { key: 'neon:facade:pawn-palace', file: 'facades/pawn-palace.png', width: 288 },
  zamboniGarage: { key: 'neon:facade:zamboni-garage', file: 'facades/zamboni-garage.png', width: 288 },
} as const;
export type FacadeId = keyof typeof FACADE_TEXTURES;

export const PROP_TEXTURES = {
  fountain: { key: 'neon:prop:globe-fountain', file: 'props/globe-fountain.png', width: 134, height: 105 },
  bunny: { key: 'neon:prop:bunny-mascot', file: 'props/bunny-mascot.png', width: 33, height: 91 },
  tableSet: { key: 'neon:prop:food-table-set', file: 'props/food-table-set.png', width: 61, height: 61 },
  planter: { key: 'neon:prop:planter-straight', file: 'props/planter-straight.png', width: 120, height: 52 },
  planterLong: { key: 'neon:prop:planter-long', file: 'props/planter-long.png', width: 85, height: 55 },
  benchKiosk: { key: 'neon:prop:bench-kiosk', file: 'props/bench-kiosk.png', width: 73, height: 83 },
  crates: { key: 'neon:prop:crate-stack', file: 'props/crate-stack.png', width: 75, height: 86 },
  securityDesk: { key: 'neon:prop:security-desk', file: 'props/security-desk.png', width: 80, height: 45 },
  booth: { key: 'neon:prop:booth-row', file: 'props/booth-row.png', width: 143, height: 38 },
  pillar: { key: 'neon:prop:concrete-pillar', file: 'props/concrete-pillar.png', width: 24, height: 99 },
  cart: { key: 'neon:prop:shopping-cart', file: 'legacy-props/shopping-cart.png', width: 36, height: 33 },
  // Round 35: the themed stores' twists.
  pitchingMachine: { key: 'neon:prop:pitching-machine', file: 'props/pitching-machine.png', width: 30, height: 56 },
  windUpToy: { key: 'neon:prop:wind-up-toy', file: 'props/wind-up-toy.png', width: 19, height: 26 },
  listeningBooth: { key: 'neon:prop:listening-booth', file: 'props/listening-booth.png', width: 44, height: 69 },
  pizzaOven: { key: 'neon:prop:pizza-oven', file: 'props/pizza-oven.png', width: 72, height: 67 },
  // Round 53: the props you can knock over (PixelLab pixflux).
  sodaMachine: { key: 'neon:prop:soda-machine', file: 'props/soda-machine.png', width: 44, height: 78 },
  sodaMachineBroken: { key: 'neon:prop:soda-machine-broken', file: 'props/soda-machine-broken.png', width: 57, height: 86 },
  rackOfClothes: { key: 'neon:prop:rack-of-clothes', file: 'props/rack-of-clothes.png', width: 60, height: 75 },
  mallCart: { key: 'neon:prop:mall-cart', file: 'props/mall-cart.png', width: 37, height: 44 },
  // Round 54: a rack lying on its side (Forge + Aseprite), drawn for east and west falls.
  rackToppled: { key: 'neon:prop:rack-toppled', file: 'props/rack-toppled.png', width: 120, height: 70 },
  // Round 58: the other floors' own furniture (PixelLab create_map_object, trimmed).
  storeShelf: { key: 'neon:prop:store-shelf-unit', file: 'props/store-shelf-unit.png', width: 46, height: 69 },
  displayTable: { key: 'neon:prop:display-table', file: 'props/display-table.png', width: 51, height: 42 },
  cashCounter: { key: 'neon:prop:cash-counter', file: 'props/cash-counter.png', width: 60, height: 56 },
  popcornCart: { key: 'neon:prop:popcorn-cart', file: 'props/popcorn-cart.png', width: 38, height: 70 },
  velvetRope: { key: 'neon:prop:velvet-rope', file: 'props/velvet-rope.png', width: 89, height: 39 },
  airHockey: { key: 'neon:prop:air-hockey', file: 'props/air-hockey.png', width: 58, height: 35 },
  satelliteDish: { key: 'neon:prop:satellite-dish', file: 'props/satellite-dish.png', width: 39, height: 54 },
  palletStack: { key: 'neon:prop:pallet-stack', file: 'props/pallet-stack.png', width: 54, height: 50 },
  roofPipes: { key: 'neon:prop:roof-pipes', file: 'props/roof-pipes.png', width: 104, height: 17 },
  // Round 59: the Pixel Forge environment batch (art/pixel-forge/dead-mall-24-assets-20261006), trimmed.
  shoeTower: { key: 'neon:prop:forge-shoebox', file: 'props/forge-shoebox.png', width: 44, height: 61 },
  hatSpinner: { key: 'neon:prop:forge-hat-spinner', file: 'props/forge-hat-spinner.png', width: 45, height: 62 },
  sunglassStand: { key: 'neon:prop:forge-sunglasses', file: 'props/forge-sunglasses.png', width: 27, height: 45 },
  cassetteBin: { key: 'neon:prop:forge-cassette-bin', file: 'props/forge-cassette-bin.png', width: 46, height: 45 },
  perfumeStand: { key: 'neon:prop:forge-perfume', file: 'props/forge-perfume.png', width: 37, height: 45 },
  giftWrap: { key: 'neon:prop:forge-gift-wrap', file: 'props/forge-gift-wrap.png', width: 60, height: 45 },
  espresso: { key: 'neon:prop:forge-espresso', file: 'props/forge-espresso.png', width: 45, height: 37 },
  hotdogGrill: { key: 'neon:prop:forge-hotdog', file: 'props/forge-hotdog.png', width: 46, height: 30 },
  waffleIron: { key: 'neon:prop:forge-waffle', file: 'props/forge-waffle.png', width: 20, height: 30 },
  foodTray: { key: 'neon:prop:forge-food-tray', file: 'props/forge-food-tray.png', width: 30, height: 25 },
  busTub: { key: 'neon:prop:forge-bus-tub', file: 'props/forge-bus-tub.png', width: 30, height: 29 },
  spillKit: { key: 'neon:prop:forge-spill-kit', file: 'props/forge-spill-kit.png', width: 28, height: 37 },
  turnstile: { key: 'neon:prop:forge-turnstile', file: 'props/forge-turnstile.png', width: 44, height: 44 },
  cctv: { key: 'neon:prop:forge-cctv', file: 'props/forge-cctv.png', width: 30, height: 29 },
  alarmPoint: { key: 'neon:prop:forge-alarm', file: 'props/forge-alarm.png', width: 22, height: 29 },
  keyCabinet: { key: 'neon:prop:forge-key-cabinet', file: 'props/forge-key-cabinet.png', width: 38, height: 44 },
  barricade: { key: 'neon:prop:forge-barricade', file: 'props/forge-barricade.png', width: 62, height: 35 },
  extinguisher: { key: 'neon:prop:forge-extinguisher', file: 'props/forge-extinguisher.png', width: 22, height: 37 },
  restroomSign: { key: 'neon:prop:forge-restroom-sign', file: 'props/forge-restroom-sign.png', width: 44, height: 20 },
  arrowSign: { key: 'neon:prop:forge-arrow-sign', file: 'props/forge-arrow-sign.png', width: 42, height: 20 },
  droppedBags: { key: 'neon:prop:forge-bags', file: 'props/forge-bags.png', width: 38, height: 30 },
  mallMap: { key: 'neon:prop:forge-map', file: 'props/forge-map.png', width: 30, height: 22 },
  cableReel: { key: 'neon:prop:forge-extension-reel', file: 'props/forge-extension-reel.png', width: 38, height: 38 },
  ceilingTile: { key: 'neon:prop:forge-ceiling-tile', file: 'props/forge-ceiling-tile.png', width: 38, height: 30 },
  // Round 31: PixelLab animate_image strips (9 frames, frame 0 the original sprite).
  arcadeCabinet: { key: 'neon:prop:arcade-cabinet-anim', file: 'props/arcade-cabinet-anim.png', width: 27, height: 59, frames: 9 },
  clawMachine: { key: 'neon:prop:claw-machine-anim', file: 'props/claw-machine-anim.png', width: 32, height: 57, frames: 9 },
  // Untrimmed cells: preserve the authored floor pivot, not the canvas bottom.
  damagedVending: {
    key: 'neon:prop:damaged-vending-flicker', file: 'props/damaged-vending-flicker.png', width: 96, height: 96, frames: 4,
    pivot: { x: 48, y: 89 }, bounds: { x: 27, y: 9, width: 44, height: 81 },
  },
  vending: { key: 'neon:prop:vending-machine', file: 'legacy-props/vending-machine.png', width: 22, height: 38 },
  payphone: { key: 'neon:prop:payphone', file: 'legacy-props/payphone.png', width: 31, height: 63 },
  atm: { key: 'neon:prop:atm', file: 'legacy-props/atm.png', width: 29, height: 47 },
  wetFloor: { key: 'neon:prop:wet-floor-sign', file: 'legacy-props/wet-floor-sign.png', width: 19, height: 16 },
  kiddieRide: { key: 'neon:prop:kiddie-ride', file: 'legacy-props/kiddie-ride.png', width: 41, height: 31 },
  gondola: { key: 'neon:prop:store-gondola', file: 'legacy-props/store-gondola.png', width: 30, height: 46 },
  clothingRack: { key: 'neon:prop:clothing-rack', file: 'legacy-props/clothing-rack.png', width: 36, height: 34 },
  vhsShelf: { key: 'neon:prop:vhs-shelf', file: 'legacy-props/vhs-shelf.png', width: 48, height: 30 },
  checkout: { key: 'neon:prop:checkout-counter', file: 'legacy-props/checkout-counter.png', width: 32, height: 29 },
  palm: { key: 'neon:prop:potted-palm', file: 'legacy-props/potted-palm.png', width: 38, height: 58 },
  bench: { key: 'neon:prop:mall-bench', file: 'legacy-props/mall-bench.png', width: 56, height: 30 },
  bin: { key: 'neon:prop:rubbish-bin', file: 'legacy-props/rubbish-bin.png', width: 19, height: 25 },
  directory: { key: 'neon:prop:mall-directory', file: 'legacy-props/mall-directory.png', width: 17, height: 54 },
  drinkingFountain: { key: 'neon:prop:drinking-fountain', file: 'legacy-props/drinking-fountain.png', width: 20, height: 22 },
  condiments: { key: 'neon:prop:condiment-stand', file: 'legacy-props/condiment-stand.png', width: 41, height: 36 },
  // Round 28: concourse life once the stores moved inside (sizes are the cropped art).
  seatingIsland: { key: 'neon:prop:seating-island', file: 'props/seating-island.png', width: 91, height: 70 },
  pretzelCart: { key: 'neon:prop:pretzel-cart', file: 'props/pretzel-cart.png', width: 51, height: 56 },
  massageChairs: { key: 'neon:prop:massage-chairs', file: 'props/massage-chairs.png', width: 79, height: 50 },
  photoBooth: { key: 'neon:prop:photo-booth', file: 'props/photo-booth.png', width: 30, height: 81 },
  gumballStand: { key: 'neon:prop:gumball-stand', file: 'props/gumball-stand.png', width: 35, height: 54 },
  saleSign: { key: 'neon:prop:sale-sign-board', file: 'props/sale-sign.png', width: 36, height: 60 },
  // Round 29: the back hall, security office and food court.
  janitorCart: { key: 'neon:prop:janitor-cart', file: 'props/janitor-cart.png', width: 36, height: 56 },
  lockerRow: { key: 'neon:prop:locker-row', file: 'props/locker-row.png', width: 90, height: 57 },
  floorBuffer: { key: 'neon:prop:floor-buffer', file: 'props/floor-buffer.png', width: 30, height: 57 },
  confiscationCage: { key: 'neon:prop:confiscation-cage', file: 'props/confiscation-cage.png', width: 64, height: 75 },
  filingCabinets: { key: 'neon:prop:filing-cabinets', file: 'props/filing-cabinets.png', width: 48, height: 46 },
  waterCooler: { key: 'neon:prop:water-cooler', file: 'props/water-cooler.png', width: 21, height: 55 },
  trayReturn: { key: 'neon:prop:tray-return', file: 'props/tray-return.png', width: 38, height: 54 },
  trashBank: { key: 'neon:prop:trash-bank', file: 'props/trash-bank.png', width: 69, height: 39 },
  // Round 39: the Roof's stand-ins for mall props that dress collision.
  acUnit: { key: 'neon:prop:roof-ac-unit', file: 'props/roof-ac-unit.png', width: 65, height: 53 },
  skylight: { key: 'neon:prop:roof-skylight', file: 'props/roof-skylight.png', width: 118, height: 92 },
  ventStack: { key: 'neon:prop:roof-vent-stack', file: 'props/roof-vent-stack.png', width: 59, height: 64 },
} as const;
export type PropId = keyof typeof PROP_TEXTURES;

/* ------------------------------------------------------------------------ */
/* Plan types                                                                 */
/* ------------------------------------------------------------------------ */

export type DressingFacade = {
  readonly id: string;
  readonly facade: FacadeId;
  /** Left edge in world units; the panel's bottom sits on FACADE_BASE_Y. */
  readonly x: number;
  readonly sign: (NeonSignSpec & { readonly x: number; readonly y: number }) | null;
  /** Colour of the light the lit shop window throws onto the concourse. */
  readonly spill: number;
};

export type DressingProp = {
  readonly id: string;
  readonly prop: PropId;
  /** Base centre: where the object meets the floor. */
  readonly x: number;
  readonly y: number;
  /** Optional display size override (world units); preserves aspect otherwise. */
  readonly width?: number;
  readonly height?: number;
  readonly flipX?: boolean;
  /** Set when this prop dresses an authored collision rectangle. */
  readonly covers?: Rect;
};

/** What an extruded block is made of (round 58): drawn to fit its collision exactly. */
export type BlockMaterial = 'planterBed' | 'concrete' | 'duct' | 'balustrade' | 'steel' | 'counter' | 'shelving' | 'ballPit' | 'freezer' | 'partition';

/**
 * A long bar running away from the camera, drawn as a 3/4 box fitted to its
 * collision rectangle: sprites face the camera and cannot be turned, so a
 * north-south bar is a raised bed, a curb or a duct with sprites stood on it.
 */
export type DressingBlock = {
  readonly id: string;
  readonly material: BlockMaterial;
  readonly covers: Rect;
  /** How tall the front face stands, in world units. */
  readonly lift: number;
};

export type NeonStrip = {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color: number;
};

export type NeonRing = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly color: number };

export type DressingPlan = {
  readonly themeId: RoomThemeId;
  /** Player-facing area name shown on arrival. */
  readonly areaName: string;
  readonly floor: FloorStyle;
  readonly ambient: number;
  readonly facades: readonly DressingFacade[];
  readonly props: readonly DressingProp[];
  readonly blocks: readonly DressingBlock[];
  readonly lights: readonly PointLight[];
  readonly neonStrips: readonly NeonStrip[];
  /** Elliptical floor inlays, e.g. around the atrium fountain. */
  readonly neonRings: readonly NeonRing[];
  /** Floor-level neon signs (hanging banners, floor logos). */
  readonly floorSigns: ReadonlyArray<NeonSignSpec & { readonly x: number; readonly y: number }>;
  readonly storeZone: { readonly bounds: Rect; readonly floor: FloorStyle; readonly accent: number } | null;
  /** Shoppers and staff wander the room (the opening only). */
  readonly civilians: boolean;
  /** Whether the floor is polished enough to mirror the back-wall neon (round 58: never carpet, concrete or gravel). */
  readonly signReflections: boolean;
};

/** A room's look before the floor decides whether it reflects. */
type RoomLook = Omit<DressingPlan, 'signReflections'>;

const POLISHED_FLOORS: ReadonlySet<FloorStyle> = new Set<FloorStyle>(['terrazzo', 'checker', 'linoleum', 'ice']);

export type RoomThemeId =
  | 'opening_concourse'
  | 'storefront'
  | 'food_court'
  | 'back_hall'
  | 'security_office'
  | 'store_interior';

/* ------------------------------------------------------------------------ */
/* Palette                                                                    */
/* ------------------------------------------------------------------------ */

export const NEON = {
  cyan: 0x3ff0ff,
  magenta: 0xff3fc8,
  pink: 0xff6fa8,
  yellow: 0xffd84a,
  orange: 0xff8a3a,
  green: 0x6aff8a,
  red: 0xff3a4a,
  blue: 0x4a7dff,
  violet: 0xa46bff,
  warm: 0xffc88a,
  fluorescent: 0xe8f4ff,
} as const;

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------ */

function isPerimeter(wall: Rect): boolean {
  return wall.x <= 0 || wall.y <= 0 || wall.x + wall.width >= STAGE_WIDTH || wall.y + wall.height >= 480;
}

export function interiorWalls(room: WingRoomDefinition): Rect[] {
  return room.walls.filter((wall) => !isPerimeter(wall));
}

/**
 * Lays out a run of storefront panels across the back wall, with the
 * remaining width shared out as dark structural pillars between them.
 */
function facadeRow(
  entries: ReadonlyArray<{ facade: FacadeId; sign: NeonSignSpec | null; spill: number }>,
): DressingFacade[] {
  const used = entries.reduce((sum, entry) => sum + FACADE_TEXTURES[entry.facade].width, 0);
  const gap = Math.max(0, Math.floor((STAGE_WIDTH - used) / (entries.length + 1)));
  let x = gap;
  return entries.map((entry, index) => {
    const width = FACADE_TEXTURES[entry.facade].width;
    const facade: DressingFacade = {
      id: `facade-${index}-${entry.facade}`,
      facade: entry.facade,
      x,
      sign: entry.sign ? { ...entry.sign, x: x + width / 2, y: FACADE_BASE_Y - FACADE_HEIGHT + 30 } : null,
      spill: entry.spill,
    };
    x += width + gap;
    return facade;
  });
}

function sign(text: string, color: number, subtitle?: string, subtitleColor?: number, scale = 3): NeonSignSpec {
  return {
    text,
    color: css(color),
    scale,
    ...(subtitle ? { subtitle } : {}),
    ...(subtitleColor !== undefined ? { subtitleColor: css(subtitleColor) } : {}),
  };
}

/** Warm light pooled in front of each lit shop window. */
function facadeSpillLights(facades: readonly DressingFacade[]): PointLight[] {
  return facades.flatMap((facade) => {
    const width = FACADE_TEXTURES[facade.facade].width;
    const cx = facade.x + width / 2;
    const lights: PointLight[] = [
      // The window itself, so the panel art stays readable in a dark room.
      { x: cx, y: FACADE_BASE_Y - 70, radius: width * 0.72, color: facade.spill, intensity: 0.85, squash: 0.55 },
      // The pool it throws across the floor.
      { x: cx, y: FACADE_BASE_Y + 34, radius: width * 0.62, color: facade.spill, intensity: 0.55, squash: 0.42 },
    ];
    if (facade.sign) {
      lights.push({
        x: facade.sign.x,
        y: facade.sign.y,
        radius: 120,
        color: parseInt(facade.sign.color.slice(1), 16),
        intensity: 0.7,
        squash: 0.5,
        flicker: 'pulse',
      });
    }
    return lights;
  });
}

function doorwayLights(room: WingRoomDefinition, color: number): PointLight[] {
  return room.doorways.map((doorway) => ({
    x: doorway.side === 'west' ? 26 : STAGE_WIDTH - 26,
    y: doorway.rect.y + doorway.rect.height / 2,
    radius: 110,
    color,
    intensity: 0.6,
    squash: 0.9,
  }));
}

/** A regular grid of ceiling fixtures; `skip` knocks out failing tubes. */
function ceilingGrid(color: number, intensity: number, radius: number, rows: readonly number[], columns: readonly number[], flicker?: (index: number) => PointLight['flicker']): PointLight[] {
  const lights: PointLight[] = [];
  let index = 0;
  for (const y of rows) {
    for (const x of columns) {
      const mode = flicker?.(index);
      lights.push({ x, y, radius, color, intensity, squash: 0.7, ...(mode ? { flicker: mode } : {}) });
      index += 1;
    }
  }
  return lights;
}

/**
 * One way to cover collision: a sprite (tiled along a bar, one scaled copy on
 * a block), or an extruded block of a material fitted to the rectangle, with
 * sprites stood along its top.
 */
export type CoverPiece =
  | { readonly prop: PropId }
  | { readonly material: BlockMaterial; readonly lift?: number; readonly decor?: readonly PropId[]; readonly decorWidth?: number };

/** What covers collision in a room: a long bar, a squarish block, and a bar running away from the camera. */
export type CoverKit = { readonly bar: CoverPiece; readonly block: CoverPiece; readonly column: CoverPiece };

export type CoverKitId = 'concourse' | 'food_court' | 'back_hall' | 'security_office' | 'roof';

const PALM_BED: CoverPiece = { material: 'planterBed', decor: ['palm'], decorWidth: 54 };
const VENTED_DUCT: CoverPiece = { material: 'duct', decor: ['ventStack'], decorWidth: 46 };

export const COVER_KITS: Readonly<Record<CoverKitId, CoverKit>> = {
  concourse: { bar: { prop: 'planter' }, block: { prop: 'crates' }, column: PALM_BED },
  food_court: { bar: { prop: 'booth' }, block: { prop: 'tableSet' }, column: PALM_BED },
  back_hall: { bar: { prop: 'crates' }, block: { prop: 'crates' }, column: { material: 'concrete', decor: ['crates', 'pillar'], decorWidth: 40 } },
  security_office: { bar: { prop: 'securityDesk' }, block: { prop: 'securityDesk' }, column: { material: 'concrete', decor: ['filingCabinets'], decorWidth: 46 } },
  roof: { bar: VENTED_DUCT, block: { prop: 'acUnit' }, column: VENTED_DUCT },
};

/**
 * Round 58: how each floor's own layouts (templates.ts FLOOR_ROOM_VARIANTS)
 * are dressed, by variant id: a kit chosen by each wall's shape, or one piece
 * per interior wall in the layout's order.
 */
const LAYOUT_KITS: Readonly<Record<string, CoverKit | readonly CoverPiece[]>> = {
  // Floor 2, the Upper Level: atrium wells over the floor below, cinema queues, a parking stairwell.
  'escalator-landing-atrium': [{ material: 'balustrade' }, { prop: 'planter' }, { prop: 'planter' }],
  'escalator-landing-galleries': { bar: { material: 'balustrade' }, block: { material: 'balustrade' }, column: PALM_BED },
  'cinema-lobby-queues': { bar: { prop: 'velvetRope' }, block: { prop: 'popcornCart' }, column: PALM_BED },
  'cinema-lobby-concessions': { bar: { material: 'counter', decor: ['condiments', 'popcornCart', 'condiments'], decorWidth: 44 }, block: { prop: 'popcornCart' }, column: PALM_BED },
  'stairwell-columns': { bar: { material: 'concrete' }, block: { material: 'concrete', lift: 56 }, column: { material: 'concrete' } },
  'stairwell-barriers': { bar: { material: 'concrete', lift: 20 }, block: { material: 'concrete' }, column: { material: 'concrete' } },
  // Floor 3, the Food Court After Dark: closed tables and booths, the arcade, the loading dock.
  'seating-tables': { bar: { prop: 'trashBank' }, block: { prop: 'seatingIsland' }, column: PALM_BED },
  'seating-booths': { bar: { prop: 'booth' }, block: { prop: 'tableSet' }, column: PALM_BED },
  'arcade-rows': { bar: { prop: 'arcadeCabinet' }, block: { prop: 'clawMachine' }, column: PALM_BED },
  'arcade-tables': { bar: { prop: 'airHockey' }, block: { prop: 'airHockey' }, column: PALM_BED },
  'dock-pallets': { bar: { prop: 'palletStack' }, block: { prop: 'palletStack' }, column: { material: 'concrete' } },
  'dock-bays': { bar: { prop: 'palletStack' }, block: { prop: 'palletStack' }, column: { material: 'concrete', decor: ['palletStack'], decorWidth: 44 } },
  // Floor 4, the Roof: skylights, ductwork, HVAC and the water tower's legs.
  'roof-access-skylights': { bar: { prop: 'skylight' }, block: { prop: 'satelliteDish' }, column: VENTED_DUCT },
  'roof-access-ducts': [VENTED_DUCT, VENTED_DUCT, { prop: 'skylight' }, { prop: 'ventStack' }],
  'hvac-grid': { bar: VENTED_DUCT, block: { prop: 'acUnit' }, column: VENTED_DUCT },
  'hvac-pipes': { bar: { prop: 'roofPipes' }, block: { prop: 'acUnit' }, column: VENTED_DUCT },
  'tower-legs': { bar: { material: 'steel' }, block: { material: 'steel', lift: 64 }, column: { material: 'steel' } },
  'tower-tanks': { bar: VENTED_DUCT, block: { prop: 'acUnit' }, column: VENTED_DUCT },

  // Round 59: each first wing's rooms, as named (templates.ts FIRST_WING_VARIANTS).
  // Floor 1: the Opening Concourse, Kiosk Alley, the Freight Hall.
  'opening-fountain-plaza': [{ prop: 'fountain' }, PALM_BED, PALM_BED, { prop: 'palm' }, { prop: 'palm' }],
  'opening-twin-gardens': { bar: PALM_BED, block: { prop: 'palm' }, column: PALM_BED },
  'kiosk-alley-rows': [{ prop: 'pretzelCart' }, { prop: 'displayTable' }, { prop: 'pretzelCart' }, { prop: 'displayTable' }, { prop: 'pretzelCart' }, { prop: 'displayTable' }],
  'kiosk-alley-island': {
    bar: { material: 'counter', decor: ['gumballStand', 'displayTable', 'gumballStand'], decorWidth: 40 },
    block: { prop: 'pretzelCart' },
    column: PALM_BED,
  },
  'freight-pallet-rows': { bar: { prop: 'palletStack' }, block: { prop: 'palletStack' }, column: { material: 'concrete', decor: ['crates'], decorWidth: 40 } },
  'freight-dock-lanes': { bar: { material: 'concrete', lift: 20 }, block: { prop: 'palletStack' }, column: { material: 'concrete' } },
  // Floor 2: the Mezzanine, the Gallery Walk, the Elevator Bank.
  'mezzanine-overlook': { bar: { material: 'balustrade' }, block: { prop: 'planterLong' }, column: PALM_BED },
  'mezzanine-wells': { bar: { material: 'balustrade' }, block: { material: 'balustrade' }, column: PALM_BED },
  'gallery-partitions': { bar: { material: 'partition' }, block: { material: 'partition' }, column: { material: 'partition' } },
  'gallery-ropes': [{ prop: 'velvetRope' }, { prop: 'velvetRope' }, { material: 'partition' }, { material: 'partition' }],
  'elevator-shafts': [{ material: 'duct', lift: 48 }, { material: 'duct', lift: 48 }, { material: 'concrete', lift: 56 }, { material: 'concrete', lift: 56 }],
  'elevator-planters': { bar: PALM_BED, block: { prop: 'palm' }, column: PALM_BED },
  // Floor 3: the Snack Bar, the Ball Pit, the Freezer Aisle.
  'snack-bar-counter': [{ material: 'counter', decor: ['popcornCart', 'condiments', 'popcornCart'], decorWidth: 40 }, { prop: 'seatingIsland' }, { prop: 'seatingIsland' }],
  'snack-bar-booths': { bar: { prop: 'booth' }, block: { prop: 'seatingIsland' }, column: PALM_BED },
  'ball-pit-center': { bar: { material: 'ballPit' }, block: { material: 'ballPit' }, column: { material: 'ballPit' } },
  'ball-pit-twin': { bar: { material: 'ballPit' }, block: { material: 'ballPit' }, column: { material: 'ballPit' } },
  'freezer-aisles': { bar: { material: 'freezer' }, block: { material: 'freezer' }, column: { material: 'freezer' } },
  'freezer-islands': { bar: { material: 'freezer' }, block: { material: 'freezer' }, column: { material: 'freezer' } },
  // Floor 4: the Service Ladder, the Duct Maze, the Gravel Yard.
  'ladder-landing': { bar: VENTED_DUCT, block: { prop: 'satelliteDish' }, column: VENTED_DUCT },
  'ladder-skylights': { bar: { prop: 'skylight' }, block: { prop: 'acUnit' }, column: VENTED_DUCT },
  'duct-maze-zigzag': { bar: VENTED_DUCT, block: VENTED_DUCT, column: VENTED_DUCT },
  'duct-maze-grid': { bar: VENTED_DUCT, block: VENTED_DUCT, column: VENTED_DUCT },
  'gravel-yard-units': { bar: { prop: 'roofPipes' }, block: { prop: 'acUnit' }, column: VENTED_DUCT },
  'gravel-yard-pipes': { bar: { prop: 'roofPipes' }, block: { prop: 'ventStack' }, column: VENTED_DUCT },

  // Round 59: the boss rooms and Lockdowns (templates.ts BOSS_ARENAS).
  'customer-service-queue': [{ prop: 'velvetRope' }, { prop: 'velvetRope' }, { prop: 'cashCounter' }, { prop: 'cashCounter' }],
  'mezzanine-office-desks': { bar: { prop: 'securityDesk' }, block: { prop: 'securityDesk' }, column: { material: 'concrete' } },
  'management-boardroom': [{ material: 'counter', lift: 20 }, { prop: 'filingCabinets' }, { prop: 'filingCabinets' }],
  'walk-in-shelves': { bar: { material: 'shelving' }, block: { material: 'shelving' }, column: { material: 'shelving' } },
  'owners-suite-desk': [{ prop: 'securityDesk' }, { material: 'concrete', lift: 56 }, { material: 'concrete', lift: 56 }],
  'elevator-housing-machinery': { bar: VENTED_DUCT, block: { material: 'duct', lift: 40, decor: ['ventStack'], decorWidth: 46 }, column: VENTED_DUCT },
  'helipad-pad': [{ prop: 'acUnit' }, { prop: 'acUnit' }, { prop: 'ventStack' }],
};

/** A prop drawn `width` wide at its own aspect ratio (round 58: nothing is squashed to fit). */
export function atWidth(prop: PropId, width: number): { width: number; height: number } {
  const texture = PROP_TEXTURES[prop];
  return { width: Math.round(width), height: Math.round((width * texture.height) / texture.width) };
}

export type Cover = { readonly props: DressingProp[]; readonly blocks: DressingBlock[] };

const BLOCK_LIFT: Readonly<Record<BlockMaterial, number>> = {
  planterBed: 16, concrete: 22, duct: 18, balustrade: 14, steel: 40, counter: 26, shelving: 44, ballPit: 18, freezer: 24, partition: 44,
};

function isPieceList(layout: CoverKit | readonly CoverPiece[] | undefined): layout is readonly CoverPiece[] {
  return Array.isArray(layout);
}

function pieceFor(kit: CoverKit, wall: Rect): CoverPiece {
  if (wall.height >= wall.width * 2) return kit.column;
  return wall.width >= wall.height * 2 ? kit.bar : kit.block;
}

/**
 * Covers one authored collision rectangle so blocked space always looks like
 * something solid. Every sprite keeps its own proportions: a long bar is tiled
 * with copies, a block takes one scaled copy, and a block material is drawn
 * to the rectangle exactly (with any decor stood along its top). A floor's own
 * layout (LAYOUT_KITS) decides first; otherwise the room's kit does.
 */
export function coverWall(wall: Rect, index: number, kitId: CoverKitId, variantId?: string): Cover {
  const layout = variantId === undefined ? undefined : LAYOUT_KITS[variantId];
  const piece: CoverPiece = isPieceList(layout) ? layout[index] ?? pieceFor(COVER_KITS[kitId], wall) : pieceFor(layout ?? COVER_KITS[kitId], wall);
  const cx = wall.x + wall.width / 2;
  const base = wall.y + wall.height;
  const id = (suffix: string) => `wall-${index}-${suffix}`;

  if ('material' in piece) {
    const lift = piece.lift ?? BLOCK_LIFT[piece.material];
    const decor = piece.decor ?? [];
    const along = wall.height >= wall.width ? 'y' : 'x';
    const length = along === 'y' ? wall.height : wall.width;
    const count = decor.length === 0 ? 0 : Math.max(along === 'y' ? 2 : 1, Math.round(length / 110) + (along === 'y' ? 1 : 0));
    const props = Array.from({ length: count }, (_, i): DressingProp => {
      const prop = decor[i % decor.length]!;
      // Stood on the block's top face, so lifted with it.
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = along === 'x' ? Math.round(wall.x + 20 + (wall.width - 40) * t) : cx;
      const y = (along === 'y' ? Math.round(wall.y + 26 + (wall.height - 30) * t) : Math.round(wall.y + wall.height * 0.7)) - lift;
      return { id: id(`on-${i}`), prop, x, y, ...atWidth(prop, prop === 'pillar' ? Math.min(wall.width, 40) : piece.decorWidth ?? PROP_TEXTURES[prop].width), covers: wall };
    });
    return { props, blocks: [{ id: id('block'), material: piece.material, covers: wall, lift }] };
  }

  const prop = piece.prop;
  if (wall.width >= wall.height * 2) {
    const count = Math.max(1, Math.round(wall.width / PROP_TEXTURES[prop].width));
    const step = wall.width / count;
    return {
      props: Array.from({ length: count }, (_, i) => ({
        id: id(`bar-${i}`), prop, x: Math.round(wall.x + step * (i + 0.5)), y: base + 4, ...atWidth(prop, step + 8), covers: wall,
      })),
      blocks: [],
    };
  }
  return { props: [{ id: id('block'), prop, x: cx, y: base + 4, ...atWidth(prop, wall.width + 8), covers: wall }], blocks: [] };
}

/** Adds a cover's props and blocks to a room's lists. */
function addCover(props: DressingProp[], blocks: DressingBlock[], cover: Cover): void {
  props.push(...cover.props);
  blocks.push(...cover.blocks);
}

/* ------------------------------------------------------------------------ */
/* Themes                                                                     */
/* ------------------------------------------------------------------------ */

type StoreLook = { facade: FacadeId; neon: number; subtitle: string; floor: FloorStyle; spill: number };

/** Each authored store template gets its own shopfront and interior. */
const STORE_LOOKS: Readonly<Record<string, StoreLook>> = {
  'mall-mart': { facade: 'electronics', neon: NEON.blue, subtitle: 'MORE FOR A BRIGHTER TOMORROW', floor: 'linoleum', spill: 0xdce8ff },
  'cinema-snacks': { facade: 'cinema', neon: NEON.red, subtitle: 'NOW SHOWING', floor: 'carpet', spill: 0xffc070 },
  'arcade-annex': { facade: 'arcade', neon: NEON.cyan, subtitle: 'INSERT COIN', floor: 'carpet', spill: 0x9a7cff },
  'department-outlet': { facade: 'boutique', neon: NEON.pink, subtitle: 'FASHION FOR LESS', floor: 'carpet', spill: 0xff9ad8 },
  // Round 32: the themed stores. Round 33 gave the four that borrowed a front their own PixelLab shopfront.
  'sports-locker': { facade: 'sports', neon: NEON.green, subtitle: 'GAME ON', floor: 'linoleum', spill: 0xb8ffc8 },
  'hardware-hut': { facade: 'hardware', neon: NEON.orange, subtitle: 'DO IT YOURSELF', floor: 'concrete', spill: 0xffc08a },
  'toy-box': { facade: 'toys', neon: NEON.yellow, subtitle: 'KIDS RULE', floor: 'checker', spill: 0xfff09a },
  'radio-shed': { facade: 'radio', neon: NEON.red, subtitle: "YOU'VE GOT QUESTIONS", floor: 'linoleum', spill: 0xff9a9a },
  'spiral-records': { facade: 'music', neon: NEON.magenta, subtitle: 'MUSIC · MOVIES · MORE', floor: 'carpet', spill: 0xff9ae6 },
  'slice-station': { facade: 'pizza', neon: NEON.orange, subtitle: 'HOT N READY', floor: 'checker', spill: 0xffd08a },
  'video-world': { facade: 'video', neon: NEON.cyan, subtitle: 'BE KIND REWIND', floor: 'carpet', spill: 0xffd9a0 },
  // Round 50: the district stores.
  'candy-cauldron': { facade: 'candyCauldron', neon: NEON.pink, subtitle: 'BULK CANDY BY THE POUND', floor: 'checker', spill: 0xffa8dc },
  'novelty-nook': { facade: 'noveltyNook', neon: NEON.violet, subtitle: 'GAGS · GIFTS · GLOW', floor: 'carpet', spill: 0xc89aff },
  'glam-snaps': { facade: 'glamSnaps', neon: NEON.magenta, subtitle: 'PORTRAITS WHILE U WAIT', floor: 'carpet', spill: 0xffd0f0 },
  'hair-affair': { facade: 'hairAffair', neon: NEON.pink, subtitle: 'CUTS · PERMS · TEASE', floor: 'checker', spill: 0xff9ad8 },
  'pet-palace': { facade: 'petPalace', neon: NEON.yellow, subtitle: 'PUPPIES · FISH · BIRDS', floor: 'linoleum', spill: 0xfff0a0 },
  'green-thumb': { facade: 'greenThumb', neon: NEON.green, subtitle: 'GARDEN CENTER', floor: 'concrete', spill: 0xb8ffb0 },
  'skate-shack': { facade: 'skateShack', neon: NEON.cyan, subtitle: 'RENTALS · SHARPENING', floor: 'linoleum', spill: 0xc0e8ff },
  'cocoa-hut': { facade: 'cocoaHut', neon: NEON.orange, subtitle: 'HOT COCOA · PRETZELS', floor: 'checker', spill: 0xffc080 },
  // Round 55: the floor-exclusive stores.
  'shade-station': { facade: 'shadeStation', neon: NEON.yellow, subtitle: 'LOOK COOL · SEE LESS', floor: 'carpet', spill: 0xfff0a0 },
  'page-turner': { facade: 'pageTurner', neon: NEON.violet, subtitle: 'BOOKS · ZINES · PENS', floor: 'carpet', spill: 0xc89aff },
  'pretzel-pit': { facade: 'pretzelPit', neon: NEON.orange, subtitle: 'SALTED · TWISTED', floor: 'checker', spill: 0xffc080 },
  'frosty-freeze': { facade: 'frostyFreeze', neon: NEON.cyan, subtitle: 'FROZEN YOGURT', floor: 'checker', spill: 0xc0f0ff },
  'antenna-annex': { facade: 'antennaAnnex', neon: NEON.green, subtitle: 'DISHES · COILS · RADIOS', floor: 'concrete', spill: 0xb8ffc8 },
  'pawn-palace': { facade: 'pawnPalace', neon: NEON.red, subtitle: 'WE BUY GOLD', floor: 'concrete', spill: 0xffb0a0 },
};

/** The shopfront panel a store template shows on its concourse. */
export function storeFacade(templateId: string): FacadeId {
  return (STORE_LOOKS[templateId] ?? STORE_LOOKS['mall-mart']!).facade;
}

/** Whether a store template has its own dressing (rather than Mall Mart's fallback). */
export function hasStoreLook(templateId: string): boolean {
  return templateId in STORE_LOOKS && templateId in INTERIOR_LOOKS;
}

function openingConcourse(room: WingRoomDefinition): RoomLook {
  const facades = facadeRow([
    { facade: 'video', sign: sign('VIDEO WORLD', NEON.cyan, 'RENT 2 GET 1 FREE', NEON.yellow), spill: 0xffd9a0 },
    { facade: 'electronics', sign: sign('MEGA MART', NEON.blue, 'MORE FOR A BRIGHTER TOMORROW', NEON.red), spill: 0xe6f0ff },
    { facade: 'music', sign: sign('SPIRAL', NEON.magenta, 'MUSIC · MOVIES · MORE', NEON.pink), spill: 0xff9ae6 },
  ]);
  const props: DressingProp[] = [];
  const blocks: DressingBlock[] = [];
  interiorWalls(room).forEach((wall, index) => {
    if (isFountainFootprint(wall)) {
      props.push({ id: 'fountain', prop: 'fountain', x: wall.x + wall.width / 2, y: wall.y + wall.height + 8, width: 150, height: 118, covers: wall });
    } else {
      addCover(props, blocks, coverWall(wall, index, 'concourse', room.variantId));
    }
  });
  const lights: PointLight[] = [
    ...facadeSpillLights(facades),
    ...doorwayLights(room, NEON.cyan),
    ...ceilingGrid(NEON.warm, 0.55, 190, [150, 390], [140, 480, 820]),
    { x: 480, y: 330, radius: 170, color: 0x7fdcff, intensity: 0.7, squash: 0.7 },
  ];
  return {
    themeId: 'opening_concourse',
    areaName: 'CENTRAL CONCOURSE',
    floor: 'terrazzo',
    ambient: 0x5a4a6e,
    facades,
    props,
    blocks,
    lights,
    neonStrips: [],
    neonRings: [],
    floorSigns: [],
    storeZone: null,
    civilians: true,
  };
}

/** How each piece of concourse furniture is drawn: a sprite at a scale, or a fitted block. */
const FURNITURE_ART: Readonly<Record<ConcourseFurniture['kind'], { readonly prop: PropId; readonly scale: number } | { readonly material: BlockMaterial }>> = {
  seatingIsland: { prop: 'seatingIsland', scale: 1.3 },
  pretzelCart: { prop: 'pretzelCart', scale: 1.3 },
  massageChairs: { prop: 'massageChairs', scale: 1.3 },
  photoBooth: { prop: 'photoBooth', scale: 1.3 },
  gumballStand: { prop: 'gumballStand', scale: 1.3 },
  saleSign: { prop: 'saleSign', scale: 1.15 },
  atriumWell: { material: 'balustrade' },
  popcornCart: { prop: 'popcornCart', scale: 1.3 },
  displayTable: { prop: 'displayTable', scale: 1.3 },
  velvetRope: { prop: 'velvetRope', scale: 1.2 },
  trashBank: { prop: 'trashBank', scale: 1.1 },
  trayReturn: { prop: 'trayReturn', scale: 1.25 },
  skylight: { prop: 'skylight', scale: 1 },
  satelliteDish: { prop: 'satelliteDish', scale: 1.25 },
  acUnit: { prop: 'acUnit', scale: 1.15 },
  ventStack: { prop: 'ventStack', scale: 0.9 },
  palletStack: { prop: 'palletStack', scale: 1.2 },
  fountain: { prop: 'fountain', scale: 1.1 },
  planterBed: { material: 'planterBed' },
  counter: { material: 'counter' },
  palm: { prop: 'palm', scale: 1.25 },
  bench: { prop: 'bench', scale: 1.15 },
};


/**
 * A storefront room's concourse. The store itself is inside, through the
 * shop's own door in the back-wall art (see storeInterior.ts), so out here
 * there is only the mall: planters, a bench, a cart, and that door lit up.
 */
function storefront(room: WingRoomDefinition, floor: FloorNumber, part?: 1): RoomLook {
  const stores = roomStores(room);
  // Each shopfront is centred on its door (STORE_ENTRANCE_XS), so walking
  // into the art's doorway is walking into the shop.
  const facades: DressingFacade[] = stores.map((store, index) => {
    const look = STORE_LOOKS[store.templateId] ?? STORE_LOOKS['mall-mart']!;
    const width = FACADE_TEXTURES[look.facade].width;
    const x = Math.round((STORE_ENTRANCE_XS[index] ?? 480) - width / 2);
    return {
      id: `facade-${index}-${look.facade}`,
      facade: look.facade,
      x,
      sign: { ...sign(store.name.toUpperCase(), look.neon, look.subtitle, NEON.yellow), x: x + width / 2, y: FACADE_BASE_Y - FACADE_HEIGHT + 30 },
      spill: look.spill,
    };
  });
  const props: DressingProp[] = [];
  const blocks: DressingBlock[] = [];
  // The furniture's footprints are collision too, but they carry their own art.
  const pieces = roomFurniture(room, floor, part);
  const furniture = pieces.flatMap((piece) => (piece.footprint ? [piece.footprint] : []));
  const isFurniture = (wall: Rect) => furniture.some((rect) => rect.x === wall.x && rect.y === wall.y && rect.width === wall.width && rect.height === wall.height);
  interiorWalls(room).filter((wall) => !isFurniture(wall)).forEach((wall, index) => addCover(props, blocks, coverWall(wall, index, 'concourse', room.variantId)));
  // The furniture the sim stands in the way (concourseFurniture), drawn a
  // little larger than its source art like the rest of the mall's props.
  for (const piece of pieces) {
    const art = FURNITURE_ART[piece.kind];
    if ('material' in art) {
      if (piece.footprint) blocks.push({ id: `concourse-${piece.id}`, material: art.material, covers: piece.footprint, lift: BLOCK_LIFT[art.material] });
      continue;
    }
    props.push({
      id: `concourse-${piece.id}`, prop: art.prop, x: piece.x, y: piece.y, ...atWidth(art.prop, PROP_TEXTURES[art.prop].width * art.scale),
      ...(piece.footprint ? { covers: piece.footprint } : {}),
    });
  }
  const lights: PointLight[] = [
    ...facadeSpillLights(facades),
    ...doorwayLights(room, NEON.violet),
    ...ceilingGrid(NEON.warm, 0.4, 150, [150, 400], [110, 480, 850]),
    // Each open shop door throws its light out across the floor.
    ...stores.map((store, index) => ({
      x: STORE_ENTRANCE_XS[index] ?? 480,
      y: 70,
      radius: 150,
      color: (STORE_LOOKS[store.templateId] ?? STORE_LOOKS['mall-mart']!).spill,
      intensity: 0.8,
      squash: 0.6,
    })),
  ];
  return {
    themeId: 'storefront',
    areaName: room.name.toUpperCase(),
    floor: 'terrazzo',
    ambient: 0x4a3e5c,
    facades,
    props,
    blocks,
    lights,
    neonStrips: [],
    neonRings: [],
    floorSigns: [],
    storeZone: null,
    civilians: false,
  };
}

/** What each store stocks its walls with, beyond the shelves behind the offers. */
/**
 * Round 58: how a shop is fitted out. Each style lines the back wall end to
 * end, fits the side walls with blocks, and stands a display table under every
 * item for sale; shops of one style still differ by floor, light and corners.
 */
type InteriorStyle = 'aisles' | 'boutique' | 'food' | 'arcade' | 'garden' | 'candy';

const INTERIOR_STYLES: Readonly<Record<InteriorStyle, {
  /** Along the back wall, alternating, or null for a counter run the whole width. */
  readonly back: readonly PropId[] | null;
  readonly backWidth: number;
  /** Down both side walls, between the drawn wall and the shop floor. */
  readonly sides: BlockMaterial;
}>> = {
  aisles: { back: ['storeShelf'], backWidth: 58, sides: 'shelving' },
  boutique: { back: ['rackOfClothes'], backWidth: 60, sides: 'shelving' },
  food: { back: null, backWidth: 0, sides: 'counter' },
  arcade: { back: ['arcadeCabinet', 'arcadeCabinet', 'clawMachine'], backWidth: 40, sides: 'counter' },
  garden: { back: ['palm'], backWidth: 52, sides: 'planterBed' },
  candy: { back: ['gumballStand'], backWidth: 44, sides: 'counter' },
};

type InteriorLook = {
  readonly style: InteriorStyle;
  /** For a food counter: what stands on it. */
  readonly counterTop?: readonly PropId[];
  /** A few pieces in the corners. */
  readonly corners: readonly PropId[];
  readonly ambient: number;
};

const INTERIOR_LOOKS: Readonly<Record<string, InteriorLook>> = {
  // No decorative carts: Mall Mart's carts roll (storeTwists.ts), so a still one would mislead.
  'mall-mart': { style: 'aisles', corners: ['bin', 'wetFloor', 'palletStack', 'bin'], ambient: 0x6a6878 },
  'cinema-snacks': { style: 'food', counterTop: ['popcornCart', 'condiments', 'popcornCart'], corners: ['bench', 'bin', 'palm', 'velvetRope'], ambient: 0x5a3e4a },
  'arcade-annex': { style: 'arcade', corners: ['kiddieRide', 'airHockey', 'atm', 'bin'], ambient: 0x3a2e5a },
  'department-outlet': { style: 'boutique', corners: ['bunny', 'palm', 'palm', 'directory'], ambient: 0x5e4a62 },
  'sports-locker': { style: 'aisles', corners: ['bin', 'palm', 'waterCooler', 'bench'], ambient: 0x3e5a4a },
  'hardware-hut': { style: 'aisles', corners: ['floorBuffer', 'palletStack', 'wetFloor', 'janitorCart'], ambient: 0x5a4a3a },
  'toy-box': { style: 'candy', corners: ['kiddieRide', 'bunny', 'clawMachine', 'kiddieRide'], ambient: 0x5a5a3a },
  'radio-shed': { style: 'aisles', corners: ['atm', 'payphone', 'bin', 'waterCooler'], ambient: 0x4a3a3e },
  'spiral-records': { style: 'aisles', corners: ['palm', 'photoBooth', 'bench', 'bin'], ambient: 0x4a2e52 },
  'slice-station': { style: 'food', counterTop: ['pizzaOven', 'condiments', 'pizzaOven'], corners: ['trashBank', 'trayReturn', 'bin', 'drinkingFountain'], ambient: 0x5a3e2e },
  'video-world': { style: 'aisles', corners: ['saleSign', 'bin', 'palm', 'directory'], ambient: 0x2e3e5a },
  // Round 50: the district stores.
  'candy-cauldron': { style: 'candy', corners: ['kiddieRide', 'bin', 'gumballStand', 'saleSign'], ambient: 0x5a3a52 },
  'novelty-nook': { style: 'arcade', corners: ['bunny', 'saleSign', 'photoBooth', 'bin'], ambient: 0x3a2a5a },
  'glam-snaps': { style: 'boutique', corners: ['palm', 'photoBooth', 'bench', 'directory'], ambient: 0x5a3a5a },
  'hair-affair': { style: 'boutique', corners: ['massageChairs', 'waterCooler', 'bench', 'bin'], ambient: 0x5a3a4e },
  'pet-palace': { style: 'aisles', corners: ['palm', 'bin', 'palletStack', 'waterCooler'], ambient: 0x4e4a32 },
  'green-thumb': { style: 'garden', corners: ['planterLong', 'palm', 'palletStack', 'wetFloor'], ambient: 0x2e4a32 },
  'skate-shack': { style: 'aisles', corners: ['bench', 'waterCooler', 'bin', 'saleSign'], ambient: 0x2e3e5a },
  'cocoa-hut': { style: 'food', counterTop: ['condiments', 'pretzelCart', 'condiments'], corners: ['trashBank', 'bench', 'bin', 'palm'], ambient: 0x5a3e2e },
  // Round 55: the floor-exclusive stores.
  'shade-station': { style: 'boutique', corners: ['palm', 'bench', 'directory', 'bin'], ambient: 0x4e4a32 },
  'page-turner': { style: 'aisles', corners: ['bench', 'palm', 'bin', 'directory'], ambient: 0x3a2e52 },
  'pretzel-pit': { style: 'food', counterTop: ['pretzelCart', 'condiments', 'pretzelCart'], corners: ['trashBank', 'trayReturn', 'bin', 'drinkingFountain'], ambient: 0x5a3e2e },
  'frosty-freeze': { style: 'food', counterTop: ['condiments', 'waterCooler', 'condiments'], corners: ['trashBank', 'trayReturn', 'bin', 'waterCooler'], ambient: 0x2e4a5a },
  'antenna-annex': { style: 'aisles', corners: ['satelliteDish', 'payphone', 'palletStack', 'waterCooler'], ambient: 0x2e4a3a },
  'pawn-palace': { style: 'aisles', corners: ['palletStack', 'bin', 'saleSign', 'janitorCart'], ambient: 0x4a3a32 },
};

/** Draw size for a prop stood in a store: a little larger than out on the concourse. */
function sized(prop: PropId, scale = 1.35): { width: number; height: number } {
  const texture = PROP_TEXTURES[prop];
  return { width: Math.round(texture.width * scale), height: Math.round(texture.height * scale) };
}

/**
 * Inside a store: its floor wall to wall, its neon name on the back wall, the
 * back wall lined end to end in the store's style, fitted fixtures down both
 * side walls (in the solid strip outside the shop floor, so nothing looks
 * solid that is not), a display table under every item for sale, tills either
 * side of the door, and the door itself at the bottom (drawn by MallRoomView).
 */
function storeInterior(room: WingRoomDefinition, store: WingStoreInstance | null): RoomLook {
  const look = (store && STORE_LOOKS[store.templateId]) ?? STORE_LOOKS['mall-mart']!;
  const stock = (store && INTERIOR_LOOKS[store.templateId]) ?? INTERIOR_LOOKS['mall-mart']!;
  const style = INTERIOR_STYLES[stock.style];
  const b = INTERIOR_BOUNDS;
  const door = INTERIOR_EXIT;
  const props: DressingProp[] = [];
  const blocks: DressingBlock[] = [];
  // The back wall, stood in the solid band above the shop floor and lined end to end.
  if (style.back) {
    const count = Math.floor((b.width - 16) / style.backWidth);
    const step = (b.width - 16) / count;
    for (let index = 0; index < count; index += 1) {
      const prop = style.back[index % style.back.length]!;
      props.push({ id: `wall-${index}`, prop, x: Math.round(b.x + 8 + step * (index + 0.5)), y: b.y + 4, ...atWidth(prop, step + 3) });
    }
  } else {
    // A food shop's counter runs the whole back wall, with its kitchen on top.
    const counter: Rect = { x: b.x, y: 0, width: b.width, height: b.y };
    blocks.push({ id: 'back-counter', material: 'counter', covers: counter, lift: BLOCK_LIFT.counter });
    (stock.counterTop ?? []).forEach((prop, index, all) => {
      props.push({ id: `counter-top-${index}`, prop, x: Math.round(b.x + (b.width * (index + 1)) / (all.length + 1)), y: b.y - BLOCK_LIFT.counter + 6, ...atWidth(prop, Math.min(PROP_TEXTURES[prop].width * 1.3, 90)) });
    });
  }
  // Down both side walls, in the strip between the drawn wall and the shop floor.
  for (const [side, x] of [['w', 14], ['e', b.x + b.width]] as const) {
    blocks.push({ id: `side-${side}`, material: style.sides, covers: { x, y: b.y + 40, width: b.x - 14, height: door.y - b.y - 60 }, lift: BLOCK_LIFT[style.sides] });
  }
  // A display table under every item for sale, so it reads as on show.
  for (const offer of room.offers.filter((candidate) => candidate.storeId === store?.templateId)) {
    props.push({ id: `fixture-${offer.id}`, prop: 'displayTable', x: offer.position.x, y: offer.position.y - 2, ...atWidth('displayTable', 100) });
  }
  // Tills either side of the door, and the corners.
  props.push(
    { id: 'checkout', prop: 'cashCounter', x: door.x - 56, y: door.y - 4, ...atWidth('cashCounter', 62) },
    { id: 'checkout-2', prop: 'cashCounter', x: door.x + door.width + 56, y: door.y - 4, ...atWidth('cashCounter', 62), flipX: true },
  );
  const corners = [
    { x: b.x + 90, y: b.y + b.height - 30 },
    { x: b.x + 190, y: b.y + b.height - 22 },
    { x: b.x + b.width - 190, y: b.y + b.height - 22 },
    { x: b.x + b.width - 90, y: b.y + b.height - 30 },
  ];
  stock.corners.forEach((prop, i) => props.push({ id: `corner-${i}`, prop, x: corners[i]!.x, y: corners[i]!.y, ...sized(prop, 1.2) }));
  const lights: PointLight[] = [
    // Shop fluorescents: brighter and whiter than the concourse outside.
    ...ceilingGrid(look.spill, 0.62, 170, [130, 320], [200, 480, 760]),
    // The door and its EXIT sign.
    { x: door.x + door.width / 2, y: door.y + 4, radius: 110, color: 0x6aff8a, intensity: 0.55, squash: 0.6 },
  ];
  return {
    themeId: 'store_interior',
    areaName: (store?.name ?? room.name).toUpperCase(),
    floor: look.floor,
    ambient: stock.ambient,
    facades: [],
    props,
    blocks,
    lights,
    neonStrips: [],
    neonRings: [],
    // The store's name in neon across its own back wall.
    floorSigns: [{ ...sign((store?.name ?? 'STORE').toUpperCase(), look.neon, look.subtitle, NEON.yellow, 4), x: 480, y: -64 }],
    storeZone: null,
    civilians: false,
  };
}

/**
 * The secret back room (round 53): bare concrete, stacked stock, lockers and
 * a confiscation cage, one caged work light swinging over it, and a red
 * EMPLOYEES ONLY over the passage out.
 */
function backRoom(): RoomLook {
  const b = INTERIOR_BOUNDS;
  const door = INTERIOR_EXIT;
  const props: DressingProp[] = [];
  const wall: PropId[] = ['crates', 'lockerRow', 'filingCabinets', 'crates', 'confiscationCage', 'lockerRow', 'crates', 'filingCabinets', 'crates', 'lockerRow', 'crates'];
  wall.forEach((prop, index) => props.push({ id: `back-${index}`, prop, x: b.x + 60 + index * 76, y: b.y + 34, ...sized(prop, 1.1) }));
  for (const [side, x] of [['w', b.x + 30], ['e', b.x + b.width - 30]] as const) {
    props.push({ id: `side-${side}-0`, prop: 'crates', x, y: b.y + 170, ...sized('crates', 1.1), flipX: side === 'e' });
    props.push({ id: `side-${side}-1`, prop: side === 'w' ? 'janitorCart' : 'floorBuffer', x, y: b.y + 270, ...sized(side === 'w' ? 'janitorCart' : 'floorBuffer', 1.2), flipX: side === 'e' });
  }
  props.push(
    { id: 'corner-cooler', prop: 'waterCooler', x: door.x - 70, y: door.y - 10, ...sized('waterCooler', 1.2) },
    { id: 'corner-bin', prop: 'bin', x: door.x + door.width + 70, y: door.y - 6, ...sized('bin', 1.3) },
  );
  const lights: PointLight[] = [
    { x: 480, y: 170, radius: 260, color: 0xffe0a0, intensity: 0.55 },
    { x: door.x + door.width / 2, y: door.y + 4, radius: 110, color: 0xff3a3a, intensity: 0.6, squash: 0.6 },
  ];
  return {
    themeId: 'store_interior',
    areaName: 'THE BACK ROOM',
    floor: 'concrete',
    ambient: 0x2a2630,
    facades: [],
    props,
    blocks: [],
    lights,
    neonStrips: [],
    neonRings: [],
    floorSigns: [{ ...sign('EMPLOYEES ONLY', NEON.red, 'NO CUSTOMERS BEYOND THIS POINT', NEON.yellow, 3), x: 480, y: -64 }],
    storeZone: null,
    civilians: false,
  };
}

function foodCourt(room: WingRoomDefinition): RoomLook {
  const facades = facadeRow([
    { facade: 'pizza', sign: sign('PIZZA PALACE', NEON.orange, 'HOT SLICES 99C', NEON.yellow), spill: 0xffb070 },
    { facade: 'wok', sign: sign('WOK N ROLL', NEON.red, 'CHINESE EXPRESS', NEON.yellow), spill: 0xffa060 },
    { facade: 'burger', sign: sign('BURGER ORBIT', NEON.cyan, 'OUT OF THIS WORLD', NEON.orange), spill: 0xa0fff0 },
  ]);
  const props: DressingProp[] = [];
  const blocks: DressingBlock[] = [];
  interiorWalls(room).forEach((wall, index) => addCover(props, blocks, coverWall(wall, index, 'food_court', room.variantId)));
  return {
    themeId: 'food_court',
    areaName: 'FOOD COURT',
    floor: 'checker',
    ambient: 0x3e3448,
    facades,
    props,
    blocks,
    lights: [
      ...facadeSpillLights(facades),
      ...doorwayLights(room, NEON.orange),
      ...ceilingGrid(NEON.warm, 0.5, 160, [180, 380], [200, 480, 760], (i) => (i === 4 ? 'buzz' : undefined)),
    ],
    neonStrips: [],
    neonRings: [],
    floorSigns: [],
    storeZone: null,
    civilians: false,
  };
}

function backHall(room: WingRoomDefinition): RoomLook {
  const facades = facadeRow([
    { facade: 'service', sign: sign('EMPLOYEES ONLY', NEON.red, undefined, undefined, 2), spill: 0xb0c8d0 },
    { facade: 'service', sign: null, spill: 0x90a8b0 },
    { facade: 'service', sign: sign('NO EXIT', NEON.red, undefined, undefined, 2), spill: 0xb0c8d0 },
  ]);
  const props: DressingProp[] = [];
  const blocks: DressingBlock[] = [];
  interiorWalls(room).forEach((wall, index) => {
    const vending = BACK_HALL_DAMAGED_VENDING;
    const base = vending.footprint;
    if (wall.x === base.x && wall.y === base.y && wall.width === base.width && wall.height === base.height) {
      props.push({ id: vending.id, prop: 'damagedVending', x: vending.x, y: vending.y, covers: wall });
    } else addCover(props, blocks, coverWall(wall, index, 'back_hall', room.variantId));
  });
  return {
    themeId: 'back_hall',
    areaName: 'SERVICE HALL B',
    floor: 'concrete',
    ambient: 0x22242e,
    facades,
    props,
    blocks,
    lights: [
      ...facadeSpillLights(facades).map((light) => ({ ...light, intensity: light.intensity * 0.6 })),
      ...doorwayLights(room, NEON.red),
      ...ceilingGrid(0xd8f0ff, 0.62, 150, [140, 360], [160, 480, 800], (i) => (i % 3 === 1 ? 'buzz' : undefined)),
    ],
    neonStrips: [],
    neonRings: [],
    floorSigns: [],
    storeZone: null,
    civilians: false,
  };
}

function securityOffice(room: WingRoomDefinition): RoomLook {
  const facades = facadeRow([
    { facade: 'security', sign: sign('SECURITY', NEON.green, 'LOSS PREVENTION', NEON.red), spill: 0x90ffb0 },
    { facade: 'service', sign: null, spill: 0x80a090 },
    { facade: 'security', sign: sign('AUTHORIZED ONLY', NEON.red, undefined, undefined, 2), spill: 0x90ffb0 },
  ]);
  const props: DressingProp[] = [];
  const blocks: DressingBlock[] = [];
  interiorWalls(room).forEach((wall, index) => addCover(props, blocks, coverWall(wall, index, 'security_office', room.variantId)));
  return {
    themeId: 'security_office',
    areaName: 'SECURITY OFFICE',
    floor: 'linoleum',
    ambient: 0x1c2a24,
    facades,
    props,
    blocks,
    lights: [
      ...facadeSpillLights(facades),
      ...doorwayLights(room, NEON.red),
      ...ceilingGrid(0xb0ffc8, 0.55, 150, [160, 380], [240, 560], (i) => (i === 1 ? 'buzz' : undefined)),
      { x: 760, y: 240, radius: 190, color: NEON.red, intensity: 0.45, squash: 0.8, flicker: 'pulse' },
    ],
    neonStrips: [],
    neonRings: [],
    floorSigns: [],
    storeZone: null,
    civilians: false,
  };
}

/** The opening fountain's authored footprint (floor 1's corridor layouts). */
export function isFountainFootprint(wall: Rect): boolean {
  return wall.x === OPENING_FOUNTAIN.x && wall.y === OPENING_FOUNTAIN.y && wall.width === OPENING_FOUNTAIN.width && wall.height === OPENING_FOUNTAIN.height;
}

/**
 * The upper level restyles each downstairs room: same shape and prop cover
 * (so every collision rectangle stays dressed), new facades, signs, floor,
 * light and neon, so floor 2 reads as a different part of the mall.
 */
function upperFloor(plan: RoomLook, room: WingRoomDefinition): RoomLook {
  switch (room.id) {
    case 'storefront_a':
    case 'storefront_b':
      return { ...plan, floor: 'carpet', ambient: 0x4a4070 };
    case 'service_corridor': {
      const facades = facadeRow([
        { facade: 'cinema', sign: sign('CINEPLEX 6', NEON.red, 'NOW SHOWING', NEON.yellow), spill: 0xffb070 },
        { facade: 'arcade', sign: sign('LASER ZONE', NEON.magenta, 'TAG YOU ARE IT', NEON.cyan), spill: 0xc080ff },
        { facade: 'video', sign: sign('PIXEL PALACE', NEON.cyan, 'HIGH SCORES DAILY', NEON.yellow), spill: 0x8ae0ff },
      ]);
      return {
        ...plan,
        areaName: 'UPPER CONCOURSE',
        floor: 'carpet',
        ambient: 0x4a4478,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.violet), ...ceilingGrid(0xc0a0ff, 0.5, 180, [150, 390], [140, 480, 820])],
        civilians: false,
      };
    }
    case 'food_court': {
      const facades = facadeRow([
        { facade: 'cinema', sign: sign('TICKETS', NEON.yellow, 'ALL SHOWS $3', NEON.red), spill: 0xffc070 },
        { facade: 'cinema', sign: sign('CONCESSIONS', NEON.red, 'BUTTER ON EVERYTHING', NEON.yellow), spill: 0xffa060 },
        { facade: 'cinema', sign: sign('THEATER 3', NEON.cyan, 'MIDNIGHT SHOW', NEON.magenta), spill: 0x90d0ff },
      ]);
      return {
        ...plan,
        areaName: 'CINEMA LOBBY',
        floor: 'carpet',
        ambient: 0x4a2c40,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.red), ...ceilingGrid(0xffb090, 0.5, 160, [180, 380], [200, 480, 760], (i) => (i === 2 ? 'buzz' : undefined))],
      };
    }
    case 'back_hall': {
      const facades = facadeRow([
        { facade: 'service', sign: sign('LEVEL P2', NEON.yellow, undefined, undefined, 2), spill: 0xffb050 },
        { facade: 'service', sign: null, spill: 0xc08040 },
        { facade: 'service', sign: sign('EXIT', NEON.green, undefined, undefined, 2), spill: 0x90ffb0 },
      ]);
      return {
        ...plan,
        areaName: 'PARKING STAIRWELL',
        ambient: 0x23262f,
        facades,
        // Sodium lamps: orange, buzzing, too far apart.
        lights: [...facadeSpillLights(facades).map((light) => ({ ...light, intensity: light.intensity * 0.5 })), ...doorwayLights(room, NEON.orange), ...ceilingGrid(0xffa040, 0.6, 140, [140, 360], [160, 800], () => 'buzz')],
      };
    }
    case 'security_office': {
      const facades = facadeRow([
        { facade: 'security', sign: sign('MANAGEMENT', NEON.yellow, 'OFFICE OF THE GM', NEON.red), spill: 0xffd080 },
        { facade: 'service', sign: sign('CUSTOMER SERVICE', NEON.pink, 'CLOSED', NEON.red, 2), spill: 0xd080a0 },
        { facade: 'security', sign: sign('NO REFUNDS', NEON.red, undefined, undefined, 2), spill: 0xff9080 },
      ]);
      return {
        ...plan,
        areaName: 'MANAGEMENT SUITE',
        floor: 'carpet',
        ambient: 0x2a1622,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.red), ...ceilingGrid(0xffd0a0, 0.5, 150, [160, 380], [240, 560]), { x: 760, y: 240, radius: 200, color: NEON.red, intensity: 0.55, squash: 0.8, flicker: 'pulse' }],
      };
    }
    default:
      return plan;
  }
}

/**
 * Food Court After Dark (floor 3): the same rooms again, but closed for the
 * night. Greasy orange and teal neon over dim warm light, dead menus, dark
 * cabinets and the Owner's gold-and-magenta suite.
 */
function topFloor(plan: RoomLook, room: WingRoomDefinition): RoomLook {
  const teal = 0x2ad8c8;
  switch (room.id) {
    case 'service_corridor': {
      const facades = facadeRow([
        { facade: 'pizza', sign: sign('PIZZA PALACE', NEON.orange, 'CLOSED FOR THE NIGHT', teal), spill: 0xff9a50 },
        { facade: 'wok', sign: sign('WOK N ROLL', NEON.red, 'ORDER UP', teal), spill: 0xff7a40 },
        { facade: 'burger', sign: sign('BURGER ORBIT', teal, 'NOW HIRING. ALWAYS.', NEON.orange), spill: 0x60ffe8 },
      ]);
      return {
        ...plan,
        areaName: 'FOOD COURT SEATING',
        floor: 'checker',
        ambient: 0x3a241e,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.orange), ...ceilingGrid(0xff9a50, 0.55, 190, [150, 390], [140, 480, 820]), { x: 480, y: 330, radius: 170, color: teal, intensity: 0.5, squash: 0.7 }],
        civilians: false,
      };
    }
    case 'storefront_a':
    case 'storefront_b':
      return {
        ...plan,
        floor: 'checker',
        ambient: 0x3e2622,
        lights: [...plan.lights, ...ceilingGrid(0xff9a50, 0.35, 150, [150, 400], [110, 850])],
      };
    case 'food_court': {
      const facades = facadeRow([
        { facade: 'arcade', sign: sign('GAME OVER', NEON.magenta, 'INSERT COIN', NEON.yellow), spill: 0xc080ff },
        { facade: 'arcade', sign: sign('HIGH SCORES', teal, 'AAA 999999', NEON.orange), spill: 0x60ffe8 },
        { facade: 'arcade', sign: sign('TOKENS', NEON.orange, '4 FOR A DOLLAR', teal), spill: 0xff9a50 },
      ]);
      return {
        ...plan,
        areaName: 'ARCADE',
        floor: 'carpet',
        ambient: 0x30244a,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.magenta), ...ceilingGrid(0x9a7cff, 0.5, 170, [180, 380], [200, 480, 760], (i) => (i === 3 ? 'buzz' : undefined))],
      };
    }
    case 'back_hall': {
      const facades = facadeRow([
        { facade: 'service', sign: sign('LOADING DOCK', NEON.orange, undefined, undefined, 2), spill: 0xffa050 },
        { facade: 'service', sign: sign('DOCK 3', teal, undefined, undefined, 2), spill: 0x60d8c8 },
        { facade: 'service', sign: sign('NO EXIT', NEON.red, undefined, undefined, 2), spill: 0xb0c8d0 },
      ]);
      return {
        ...plan,
        areaName: 'LOADING DOCK',
        ambient: 0x232c31,
        facades,
        lights: [...facadeSpillLights(facades).map((light) => ({ ...light, intensity: light.intensity * 0.55 })), ...doorwayLights(room, NEON.orange), ...ceilingGrid(teal, 0.55, 150, [140, 360], [160, 480, 800], (i) => (i % 2 === 1 ? 'buzz' : undefined))],
      };
    }
    case 'security_office': {
      const facades = facadeRow([
        { facade: 'security', sign: sign('THE OWNER', NEON.yellow, 'EST. FOREVER', NEON.magenta), spill: 0xffd060 },
        { facade: 'service', sign: sign('PRIVATE', NEON.magenta, 'STAFF DIE HERE', NEON.orange, 2), spill: 0xd060b0 },
        { facade: 'security', sign: sign('NO TRESPASSING', NEON.red, undefined, undefined, 2), spill: 0xff9080 },
      ]);
      return {
        ...plan,
        areaName: "OWNER'S SUITE",
        floor: 'carpet',
        ambient: 0x2a1a2a,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.yellow), ...ceilingGrid(0xffc870, 0.5, 150, [160, 380], [240, 560]), { x: 760, y: 240, radius: 210, color: NEON.magenta, intensity: 0.55, squash: 0.8, flicker: 'pulse' }],
      };
    }
    default:
      return plan;
  }
}

/**
 * The Roof (floor 4): out under the night sky. Tar-and-gravel underfoot, cold
 * moonlight, sodium lamps at the doors, and the back walls are machinery and
 * sky instead of shops. The Helipad has the Developer's billboard.
 */
const MOON = 0x8aa8ff;
const SODIUM = 0xffa040;

/** Loose clutter that could plausibly be left on a roof; everything else stays downstairs. */
const ROOF_CLUTTER: ReadonlySet<PropId> = new Set<PropId>(['bin', 'crates', 'pillar']);

/**
 * The Roof re-covers every collision rectangle with rooftop machinery (the
 * fountain's basin becomes a skylight), keeps the clutter that belongs up
 * here, and drops the mall's furniture.
 */
function roofCover(props: readonly DressingProp[], room: WingRoomDefinition): Cover {
  const roof: Cover = { props: [], blocks: [] };
  interiorWalls(room).forEach((wall, index) => {
    if (isFountainFootprint(wall)) {
      roof.props.push({ id: 'skylight', prop: 'skylight', x: wall.x + wall.width / 2, y: wall.y + wall.height + 8, ...atWidth('skylight', 150), covers: wall });
    } else addCover(roof.props, roof.blocks, coverWall(wall, index, 'roof', room.variantId));
  });
  roof.props.push(...props.filter((prop) => !prop.covers && ROOF_CLUTTER.has(prop.prop)));
  return roof;
}

function roofLights(room: WingRoomDefinition, facades: readonly DressingFacade[]): PointLight[] {
  return [
    ...facadeSpillLights(facades).map((light) => ({ ...light, intensity: light.intensity * 0.6 })),
    ...doorwayLights(room, SODIUM),
    // Moonlight: wide and dim, so the neon and the tar rings read against it.
    ...ceilingGrid(MOON, 0.5, 300, [200, 400], [200, 760]),
  ];
}

function roofFloor(plan: RoomLook, room: WingRoomDefinition): RoomLook {
  const roof = { floor: 'gravel' as const, ambient: 0x283252, civilians: false };
  switch (room.id) {
    case 'service_corridor': {
      const facades = facadeRow([
        { facade: 'roofHvac', sign: sign('COOLING TOWER 2', NEON.cyan, 'DO NOT TOUCH', NEON.orange, 2), spill: 0x80b0ff },
        { facade: 'roofAccess', sign: sign('ROOF ACCESS', NEON.yellow, 'AUTHORIZED ONLY', NEON.red), spill: 0xffc070 },
        { facade: 'roofHvac', sign: sign('UNIT 3', NEON.cyan, undefined, undefined, 2), spill: 0x80b0ff },
      ]);
      return {
        ...plan, ...roof,
        ...roofCover(plan.props, room),
        areaName: 'ROOF ACCESS',
        facades,
        lights: roofLights(room, facades),
      };
    }
    case 'storefront_a':
    case 'storefront_b':
      return {
        ...plan,
        floor: 'concrete',
        ambient: 0x2a3250,
        lights: [...plan.lights.map((light) => ({ ...light, intensity: light.intensity * 0.8 })), ...ceilingGrid(MOON, 0.3, 240, [180, 400], [240, 720])],
        civilians: false,
      };
    case 'food_court': {
      const facades = facadeRow([
        { facade: 'roofHvac', sign: sign('UNIT A', NEON.cyan, undefined, undefined, 2), spill: 0x80b0ff },
        { facade: 'roofHvac', sign: sign('DANGER', NEON.red, 'HIGH VOLTAGE', NEON.yellow), spill: 0xff8070 },
        { facade: 'roofHvac', sign: sign('UNIT B', NEON.cyan, undefined, undefined, 2), spill: 0x80b0ff },
      ]);
      return {
        ...plan, ...roof,
        ...roofCover(plan.props, room),
        areaName: 'HVAC YARD',
        facades,
        lights: roofLights(room, facades),
      };
    }
    case 'back_hall': {
      const facades = facadeRow([
        { facade: 'roofTower', sign: sign('DEAD MALL', NEON.magenta, 'WATER DEPT', NEON.cyan, 2), spill: 0xc080ff },
        { facade: 'roofHvac', sign: null, spill: 0x80b0ff },
        { facade: 'roofTower', sign: sign('TANK 2', NEON.cyan, undefined, undefined, 2), spill: 0x80b0ff },
      ]);
      return {
        ...plan, ...roof,
        ...roofCover(plan.props, room),
        areaName: 'WATER TOWER',
        ambient: 0x222c46,
        facades,
        lights: [...roofLights(room, facades), ...ceilingGrid(SODIUM, 0.45, 130, [150, 360], [480], () => 'buzz')],
      };
    }
    case 'security_office': {
      const facades = facadeRow([
        { facade: 'roofAccess', sign: sign('HELIPAD', NEON.yellow, 'CLEAR THE PAD', NEON.red), spill: 0xffc070 },
        { facade: 'roofBillboard', sign: sign('COMING SOON', NEON.yellow, 'LUXURY CONDOS', NEON.magenta), spill: 0xffd070 },
        { facade: 'roofHvac', sign: sign('NO TRESPASSING', NEON.red, undefined, undefined, 2), spill: 0xff9080 },
      ]);
      return {
        ...plan, ...roof,
        ...roofCover(plan.props, room),
        areaName: 'HELIPAD',
        facades,
        lights: [...roofLights(room, facades), { x: 760, y: 240, radius: 230, color: NEON.yellow, intensity: 0.45, squash: 0.7, flicker: 'pulse' }],
        // The pad itself: a painted H in a ring, lit from below.
        neonRings: [{ x: 760, y: 240, width: 260, height: 150, color: NEON.yellow }],
        floorSigns: [{ ...sign('H', NEON.yellow, undefined, undefined, 6), x: 760, y: 240 }],
      };
    }
    default:
      return plan;
  }
}

/** How each floor re-dresses the ground floor's plan for a room. */
const FLOOR_DRESSING: Readonly<Record<FloorNumber, (plan: RoomLook, room: WingRoomDefinition) => RoomLook>> = {
  1: (plan) => plan,
  2: (plan, room) => upperFloor(plan, room),
  3: (plan, room) => topFloor(plan, room),
  4: (plan, room) => roofFloor(plan, room),
};

/** A sign's new words: [text, subtitle?]; null leaves that shopfront's sign as it is. */
type SignWords = readonly [string, string?] | null;

/**
 * The first wing's back-wall signs, by floor and room, left to right. Only the
 * words change: the tube colours, shopfronts and light stay the floor's own.
 */
const FIRST_WING_SIGNS: Readonly<Record<FloorNumber, Partial<Record<WingRoomDefinition['id'], readonly SignWords[]>>>> = {
  1: {
    food_court: [['KIOSK ALLEY', 'CASES - CHARMS - KEYS'], ['PRETZEL CART'], ['EARS PIERCED', 'WHILE U WAIT']],
    back_hall: [['FREIGHT', 'DOCK 2'], ['RECEIVING'], ['EXIT']],
    security_office: [['CUSTOMER SERVICE', 'TAKE A NUMBER'], ['LOST & FOUND'], ['NO RETURNS']],
  },
  2: {
    service_corridor: [['MEZZANINE', 'LEVEL 2'], ['SKYBRIDGE', 'WEST'], ['GALLERY', 'THIS WAY']],
    food_court: [['ART GALLERY', 'FINE PRINTS'], ['FRAMES 4 LESS'], ['POSTER PALACE']],
    back_hall: [['ELEVATORS', 'OUT OF ORDER'], ['STAIRS'], ['EXIT']],
    security_office: [['MEZZ OFFICE', 'STAFF ONLY'], ['LOCKDOWN', 'IN EFFECT'], ['NO ENTRY']],
  },
  3: {
    service_corridor: [['SNACK BAR', 'HOT DOGS 99C'], ['NACHOS'], ['SLUSHIES']],
    food_court: [['BALL PIT', 'SOCKS REQUIRED'], ['PARTY ROOM'], ['PRIZES']],
    back_hall: [['FREEZER', 'KEEP CLOSED'], ['ICE'], ['EXIT']],
    security_office: [['WALK-IN', 'KEEP AT 34F'], ['KITCHEN', 'STAFF ONLY'], ['LOCKDOWN']],
  },
  4: {
    service_corridor: [['ROOF ACCESS', 'LADDER'], ['DANGER', 'HIGH VOLTAGE'], ['HARD HATS']],
    food_court: [['HVAC', 'UNIT 4'], ['DUCT 7'], ['CAUTION', 'HOT AIR']],
    back_hall: [['GRAVEL', 'MIND THE EDGE'], ['DRAIN'], ['EXIT']],
    security_office: [['ELEVATOR', 'MACHINE ROOM'], ['AUTHORIZED', 'PERSONNEL'], ['LOCKDOWN']],
  },
};

/** The same shopfronts with new words on their signs, in order of the signs present. */
function relabel(facades: readonly DressingFacade[], words: readonly SignWords[] | undefined): readonly DressingFacade[] {
  if (!words) return facades;
  let next = 0;
  return facades.map((facade) => {
    if (!facade.sign) return facade;
    const replacement = words[next];
    next += 1;
    if (!replacement) return facade;
    const [text, subtitle] = replacement;
    const { subtitle: _old, subtitleColor, ...rest } = facade.sign;
    return { ...facade, sign: { ...rest, text, ...(subtitle ? { subtitle, ...(subtitleColor ? { subtitleColor } : {}) } : {}) } };
  });
}

/** One back-wall panel of a district room: [art, sign, subtitle, neon colour, window light]. */
type DistrictPanel = readonly [FacadeId, string, string | undefined, number, number];
type DistrictRoomLook = { readonly panels: readonly [DistrictPanel, DistrictPanel, DistrictPanel]; readonly floor?: FloorStyle; readonly ambient: number; readonly light: number };

/**
 * Round 50: each district's rooms. Only the walls, floor and light change;
 * the room's furniture is its floor's own, so collision dressing never moves.
 * A room without a look here (the night's Opening Concourse, the storefronts)
 * keeps its floor's dressing under the district's name.
 */
const DISTRICT_LOOKS: Readonly<Record<DistrictId, Partial<Record<WingRoomDefinition['id'], DistrictRoomLook>>>> = {
  holiday: {
    food_court: { panels: [['holidayWindow', 'WINTER WONDERLAND', undefined, NEON.cyan, 0xc8e8ff], ['santaSet', 'PHOTOS WITH SANTA', '$9.99', NEON.red, 0xffc890], ['holidayWindow', 'TOYLAND', 'OPEN LATE', NEON.green, 0xc8ffd0]], floor: 'checker', ambient: 0x2a1a24, light: NEON.red },
    back_hall: { panels: [['service', 'STOCKROOM', 'TOYS', NEON.green, 0xc0ffc8], ['holidayWindow', 'RETURNS', undefined, NEON.red, 0xffb0a0], ['service', 'EXIT', undefined, NEON.green, 0x90ffb0]], floor: 'concrete', ambient: 0x1a1a22, light: NEON.green },
    security_office: { panels: [['holidayWindow', 'NORTH POLE', undefined, NEON.cyan, 0xc8e8ff], ['santaSet', "SANTA'S WORKSHOP", 'NAUGHTY LIST', NEON.red, 0xffc890], ['holidayWindow', 'NICE LIST', 'EMPTY', NEON.green, 0xc8ffd0]], floor: 'carpet', ambient: 0x2a141c, light: NEON.red },
  },
  glamour: {
    service_corridor: { panels: [['perfumeCounter', 'FRAGRANCES', undefined, NEON.pink, 0xffc8e8], ['perfumeCounter', 'COSMETICS', 'FREE MAKEOVERS', NEON.magenta, 0xffd0f0], ['fittingRooms', 'NEW ARRIVALS', undefined, NEON.violet, 0xd8b8ff]], floor: 'terrazzo', ambient: 0x2a1a2a, light: NEON.pink },
    food_court: { panels: [['perfumeCounter', 'MAKEOVERS', undefined, NEON.magenta, 0xffd0f0], ['fittingRooms', 'GLAMOUR', 'BIG HAIR SALE', NEON.pink, 0xffc8e8], ['perfumeCounter', 'LIP GLOSS', undefined, NEON.violet, 0xd8b8ff]], floor: 'terrazzo', ambient: 0x2a1626, light: NEON.magenta },
    back_hall: { panels: [['fittingRooms', 'FITTING ROOMS', undefined, NEON.violet, 0xd8b8ff], ['fittingRooms', 'LIMIT 3 ITEMS', undefined, NEON.pink, 0xffc8e8], ['service', 'EXIT', undefined, NEON.green, 0x90ffb0]], floor: 'carpet', ambient: 0x1c1428, light: NEON.violet },
    security_office: { panels: [['perfumeCounter', 'PORTRAITS', undefined, NEON.pink, 0xffd0f0], ['fittingRooms', 'GLAMOUR PORTRAITS', 'SIT PRETTY', NEON.magenta, 0xffc8e8], ['perfumeCounter', 'SAY CHEESE', undefined, NEON.pink, 0xffd0f0]], floor: 'carpet', ambient: 0x2a1424, light: NEON.magenta },
  },
  pets: {
    service_corridor: { panels: [['aquariumWall', 'TROPICAL FISH', undefined, NEON.cyan, 0x90e8ff], ['aquariumWall', 'SALTWATER', 'DO NOT TAP', NEON.blue, 0x90c8ff], ['aquariumWall', 'GOLDFISH', '3 FOR $1', NEON.yellow, 0xfff0a0]], floor: 'linoleum', ambient: 0x142430, light: NEON.cyan },
    food_court: { panels: [['aquariumWall', 'KOI POND', undefined, NEON.cyan, 0x90e8ff], ['kennelWall', 'PLEASE DO NOT', 'FEED THE FISH', NEON.yellow, 0xfff0a0], ['aquariumWall', 'AQUARIUM', undefined, NEON.blue, 0x90c8ff]], floor: 'linoleum', ambient: 0x142a2a, light: NEON.cyan },
    back_hall: { panels: [['kennelWall', 'KENNELS', undefined, NEON.yellow, 0xffe0a0], ['kennelWall', 'GROOMING', 'WALK-INS', NEON.orange, 0xffc890], ['service', 'EXIT', undefined, NEON.green, 0x90ffb0]], floor: 'concrete', ambient: 0x22201a, light: NEON.yellow },
    security_office: { panels: [['kennelWall', 'AVIARY', undefined, NEON.green, 0xc8ffb0], ['aquariumWall', 'EXOTIC BIRDS', 'AND ONE CAT', NEON.yellow, 0xfff0a0], ['kennelWall', 'STAFF ONLY', undefined, NEON.red, 0xffb0a0]], floor: 'linoleum', ambient: 0x1e2618, light: NEON.green },
  },
  rink: {
    service_corridor: { panels: [['rinkBoards', 'SKATE RENTAL', 'SIZES 1-13', NEON.cyan, 0xc8e8ff], ['zamboniGarage', 'ICE TIME', '8PM - CLOSE', NEON.blue, 0xb0d0ff], ['rinkBoards', 'NO CHECKING', undefined, NEON.red, 0xffb0b0]], floor: 'linoleum', ambient: 0x18243a, light: NEON.cyan },
    storefront_a: { panels: [['rinkBoards', 'RINKSIDE', undefined, NEON.cyan, 0xc8e8ff], ['rinkBoards', 'SNACKS', undefined, NEON.orange, 0xffc890], ['rinkBoards', 'SKATES', undefined, NEON.cyan, 0xc8e8ff]], ambient: 0x1a2438, light: NEON.cyan },
    food_court: { panels: [['rinkBoards', 'HOME', undefined, NEON.red, 0xffb0b0], ['rinkBoards', 'PUBLIC SKATE', 'ALL AGES', NEON.cyan, 0xc8e8ff], ['rinkBoards', 'GUEST', undefined, NEON.blue, 0xb0d0ff]], floor: 'ice', ambient: 0x2a3a52, light: NEON.cyan },
    storefront_b: { panels: [['rinkBoards', 'BLEACHERS', undefined, NEON.blue, 0xb0d0ff], ['rinkBoards', 'GO TEAM', undefined, NEON.yellow, 0xfff0a0], ['rinkBoards', 'BLEACHERS', undefined, NEON.blue, 0xb0d0ff]], ambient: 0x1a2438, light: NEON.blue },
    back_hall: { panels: [['zamboniGarage', 'ZAMBONI', 'KEEP CLEAR', NEON.orange, 0xffc890], ['service', 'ICE PLANT', undefined, NEON.cyan, 0xc8e8ff], ['zamboniGarage', 'GARAGE 2', undefined, NEON.yellow, 0xfff0a0]], floor: 'concrete', ambient: 0x141c2a, light: NEON.blue },
    security_office: { panels: [['rinkBoards', 'PENALTY', undefined, NEON.red, 0xffb0b0], ['rinkBoards', 'BOX', 'TWO MINUTES', NEON.red, 0xffb0b0], ['rinkBoards', 'NO FIGHTING', undefined, NEON.yellow, 0xfff0a0]], floor: 'ice', ambient: 0x2a3650, light: NEON.red },
  },
};

/** A room of a district wing: its floor's furniture under the district's walls, floor and light. */
function districtRoom(base: RoomLook, room: WingRoomDefinition, district: DistrictId): RoomLook {
  const look = DISTRICT_LOOKS[district][room.id];
  const named = { ...base, areaName: room.name.toUpperCase() };
  if (!look) return named;
  // Storefront rooms keep their shops' own fronts; only the light and floor take the district's colour.
  if (room.store !== null) {
    return { ...named, ambient: look.ambient, ...(look.floor ? { floor: look.floor } : {}), civilians: false };
  }
  const facades = facadeRow(look.panels.map(([facade, text, subtitle, color, spill]) => ({ facade, sign: sign(text, color, subtitle, subtitle ? NEON.warm : undefined, text.length > 12 ? 2 : 3), spill })));
  return {
    ...named,
    ...(look.floor ? { floor: look.floor } : {}),
    ambient: look.ambient,
    facades,
    lights: [...facadeSpillLights(facades), ...doorwayLights(room, look.light), ...ceilingGrid(look.light, 0.4, 150, [160, 380], [240, 480, 720])],
    neonStrips: [],
    civilians: false,
  };
}

export function planRoomDressing(room: WingRoomDefinition, floor: FloorNumber = 1, insideStore: number | null = null, part?: 1, district?: DistrictId): DressingPlan {
  const look = lookOf(room, floor, insideStore, part, district);
  const inside = look.themeId === 'store_interior';
  const testRoom = room.variantId === 'prop-test' || room.variantId === 'prop-test-return';
  // Round 59: loose decor stands in its places on the room's own walls (roomDecor.ts).
  const decor: DressingProp[] = inside || testRoom ? [] : roomDecor({
    room, floor, ...(part ? { part } : {}), district: district !== undefined,
    facades: look.facades.map((facade) => ({ x: facade.x, width: FACADE_TEXTURES[facade.facade].width })),
    covers: [...look.props.flatMap((prop) => (prop.covers ? [prop.covers] : [])), ...look.blocks.map((block) => block.covers)],
    sizeAt: (prop, width) => atWidth(prop as PropId, width),
    nativeWidth: (prop) => PROP_TEXTURES[prop as PropId].width,
  }).map((piece) => ({ ...piece, prop: piece.prop as PropId }));
  const props = inside
    ? look.props
    : [...look.props, ...decor].filter((prop) => prop.covers || (!overWall(prop, interiorWalls(room)) && !doorwayLaneBlocked(prop.x, prop.y)));
  // An atrium well glows with the lit level below it.
  const wells = look.blocks.filter((block) => block.material === 'balustrade').map((block): PointLight => ({
    x: block.covers.x + block.covers.width / 2, y: block.covers.y + block.covers.height / 2 - block.lift,
    radius: Math.max(block.covers.width, block.covers.height) * 0.75, color: 0x7ab8ff, intensity: 0.55, squash: 0.5,
  }));
  return { ...look, props, lights: [...look.lights, ...wells], signReflections: POLISHED_FLOORS.has(look.floor) };
}

/**
 * Round 58: whether a free-standing prop would be drawn over a collision
 * rectangle or just behind it. Decor is placed per room, and a floor's own
 * layout (or the furniture) may stand there, so it gives way.
 */
function overWall(prop: DressingProp, walls: readonly Rect[]): boolean {
  const texture = PROP_TEXTURES[prop.prop];
  const width = prop.width ?? texture.width;
  const height = prop.height ?? texture.height;
  const left = prop.x - width / 2;
  const top = prop.y - height;
  return walls.some((wall) => left < wall.x + wall.width && wall.x < left + width && top < wall.y + wall.height + 4 && wall.y - 40 < prop.y);
}

function lookOf(room: WingRoomDefinition, floor: FloorNumber, insideStore: number | null, part: 1 | undefined, district: DistrictId | undefined): RoomLook {
  if (room.variantId === 'prop-test' || room.variantId === 'prop-test-return') {
    return { ...openingConcourse(room), areaName: room.name.toUpperCase(), props: [], blocks: [], neonRings: [], civilians: false };
  }
  // Round 53: through the suspicious vending machine.
  if (insideStore === SECRET_STORE_INDEX) return backRoom();
  // A shop looks like itself on any floor.
  const shop = insideStore === null ? undefined : roomStores(room)[insideStore];
  if (shop) return storeInterior(room, shop);
  // Round 59: a flipped room is dressed the right way round, then the dressing is flipped with it.
  if (room.mirrored) return mirrorLook(lookOf(unmirrored(room), floor, null, part, district), room);
  // The Skate Arena (round 50) is indoors under the skylight, so it starts from the mall's furniture, not the Roof's.
  if (district) return districtRoom(district === 'rink' ? planFloorOneRoom(room) : FLOOR_DRESSING[floor](planFloorOneRoom(room), room), room, district);
  const plan = FLOOR_DRESSING[floor](planFloorOneRoom(room, floor, part), room);
  // A first wing (round 45) dresses like its floor but titles each room by the wing's
  // own names, and (round 48) hangs its own signs on the same shopfronts. Its boss room
  // is not the Helipad, so it paints no landing ring on the floor.
  return part === 1
    ? { ...plan, areaName: room.name.toUpperCase(), facades: relabel(plan.facades, FIRST_WING_SIGNS[floor][room.id]), neonRings: [], floorSigns: [] }
    : plan;
}

/** Things that stand where they stand whichever way the room is flipped. */
const ANCHORED_PROP_IDS: ReadonlySet<string> = new Set([BACK_HALL_DAMAGED_VENDING.id]);

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const flipRect = (rect: Rect): Rect => ({ ...rect, x: STAGE_WIDTH - rect.x - rect.width });

/** The room as authored: its flipped walls flipped back (anchored fixtures stay put). */
function unmirrored(room: WingRoomDefinition): WingRoomDefinition {
  const { mirrored: _flipped, ...rest } = room;
  return {
    ...rest,
    walls: room.walls.map((wall) => (sameRect(wall, BACK_HALL_DAMAGED_VENDING.footprint) || isPerimeter(wall) ? wall : flipRect(wall))),
  };
}

/**
 * Flips a room's dressing left to right to match its flipped walls: every
 * prop, block and floor ring, each cover pointing at the room's own wall. The
 * back wall (shopfronts, signs) and the lights stay as they are.
 */
function mirrorLook(look: RoomLook, room: WingRoomDefinition): RoomLook {
  const actual = (rect: Rect) => {
    const flipped = flipRect(rect);
    return room.walls.find((wall) => sameRect(wall, flipped)) ?? flipped;
  };
  return {
    ...look,
    props: look.props.map((prop) => (ANCHORED_PROP_IDS.has(prop.id) ? prop : {
      ...prop,
      x: STAGE_WIDTH - prop.x,
      flipX: !prop.flipX,
      ...(prop.covers ? { covers: actual(prop.covers) } : {}),
    })),
    blocks: look.blocks.map((block) => ({ ...block, covers: actual(block.covers) })),
    neonRings: look.neonRings.map((ring) => ({ ...ring, x: STAGE_WIDTH - ring.x })),
  };
}

/** A room's mall dressing before its floor restyles it; storefronts stand their wing's own furniture. */
function planFloorOneRoom(room: WingRoomDefinition, floor: FloorNumber = 1, part?: 1): RoomLook {
  switch (room.id) {
    case 'service_corridor':
      return openingConcourse(room);
    case 'storefront_a':
    case 'storefront_b':
      return storefront(room, floor, part);
    case 'food_court':
      return foodCourt(room);
    case 'back_hall':
      return backHall(room);
    case 'security_office':
      return securityOffice(room);
  }
}

/** Every texture the dressing layer can request, for the scene preloader. */
export function dressingTextureFiles(): Array<{ key: string; url: string }> {
  return [
    ...Object.values(FACADE_TEXTURES).map((t) => ({ key: t.key, url: `/assets/neon/${t.file}` })),
    ...Object.values(PROP_TEXTURES).map((t) => ({ key: t.key, url: `/assets/neon/${t.file}` })),
  ];
}

export function doorwayLaneBlocked(x: number, y: number): boolean {
  const inRows = y > DOOR_LANE.top && y < DOOR_LANE.bottom;
  return inRows && (x < DOOR_LANE.depth || x > STAGE_WIDTH - DOOR_LANE.depth);
}
