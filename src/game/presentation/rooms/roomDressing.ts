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
import { CONCOURSE_FURNITURE, INTERIOR_BOUNDS, INTERIOR_EXIT, STORE_ENTRANCE_XS, roomStores } from '../../../sim/run/storeInterior';
import type { WingStoreInstance } from '../../../sim/wing/types';
import type { FloorStyle, NeonSignSpec } from '../neon/proceduralTextures';
import type { PointLight } from '../lighting/LightingLayer';

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
} as const;
export type FacadeId = keyof typeof FACADE_TEXTURES;

export const PROP_TEXTURES = {
  fountain: { key: 'neon:prop:globe-fountain', file: 'props/globe-fountain.png', width: 134, height: 105 },
  bunny: { key: 'neon:prop:bunny-mascot', file: 'props/bunny-mascot.png', width: 33, height: 91 },
  tableSet: { key: 'neon:prop:food-table-set', file: 'props/food-table-set.png', width: 61, height: 61 },
  planter: { key: 'neon:prop:planter-straight', file: 'props/planter-straight.png', width: 120, height: 52 },
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
  // Round 31: PixelLab animate_image strips (9 frames, frame 0 the original sprite).
  arcadeCabinet: { key: 'neon:prop:arcade-cabinet-anim', file: 'props/arcade-cabinet-anim.png', width: 27, height: 59, frames: 9 },
  clawMachine: { key: 'neon:prop:claw-machine-anim', file: 'props/claw-machine-anim.png', width: 32, height: 57, frames: 9 },
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
  readonly lights: readonly PointLight[];
  readonly neonStrips: readonly NeonStrip[];
  /** Elliptical floor inlays, e.g. around the atrium fountain. */
  readonly neonRings: readonly NeonRing[];
  /** Floor-level neon signs (hanging banners, floor logos). */
  readonly floorSigns: ReadonlyArray<NeonSignSpec & { readonly x: number; readonly y: number }>;
  readonly storeZone: { readonly bounds: Rect; readonly floor: FloorStyle; readonly accent: number } | null;
  /** Shoppers and staff wander the room (the opening only). */
  readonly civilians: boolean;
};

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
 * Covers one authored collision rectangle with props chosen by its shape,
 * so blocked space always looks like something solid.
 */
function coverWall(wall: Rect, index: number, theme: RoomThemeId): DressingProp[] {
  const cx = wall.x + wall.width / 2;
  const base = wall.y + wall.height;
  const horizontal = wall.width >= wall.height * 2;
  const vertical = wall.height >= wall.width * 2;
  const id = (suffix: string) => `wall-${index}-${suffix}`;

  if (vertical) {
    // Tall bars become a column of pillars (back hall) or directory boards and palms.
    const count = Math.max(1, Math.round(wall.height / 60));
    const step = wall.height / count;
    return Array.from({ length: count }, (_, i) => {
      const y = wall.y + step * (i + 1) - 2;
      if (theme === 'back_hall') {
        return { id: id(`pillar-${i}`), prop: 'pillar' as const, x: cx, y, width: wall.width + 6, height: 99, covers: wall };
      }
      const prop: PropId = i % 2 === 0 ? 'palm' : 'planter';
      return prop === 'palm'
        ? { id: id(`palm-${i}`), prop, x: cx, y, width: 40, height: 61, covers: wall }
        : { id: id(`planter-${i}`), prop, x: cx, y, width: wall.width + 16, height: 40, covers: wall };
    });
  }

  if (horizontal) {
    switch (theme) {
      case 'food_court': {
        const count = Math.max(1, Math.round(wall.width / 144));
        const step = wall.width / count;
        return Array.from({ length: count }, (_, i) => ({
          id: id(`booth-${i}`), prop: 'booth' as const, x: wall.x + step * (i + 0.5), y: base + 4,
          width: step + 4, height: Math.max(34, wall.height + 12), covers: wall,
        }));
      }
      case 'security_office': {
        const count = Math.max(1, Math.round(wall.width / 72));
        const step = wall.width / count;
        return Array.from({ length: count }, (_, i) => ({
          id: id(`desk-${i}`), prop: 'securityDesk' as const, x: wall.x + step * (i + 0.5), y: base + 4,
          width: step + 6, height: wall.height + 20, covers: wall,
        }));
      }
      case 'back_hall':
        return [{ id: id('crates'), prop: 'crates', x: cx, y: base + 4, width: wall.width + 8, height: wall.height + 40, covers: wall }];
      default: {
        // Concourse and storefront bars: planter boxes with a bench in front.
        const count = Math.max(1, Math.round(wall.width / 72));
        const step = wall.width / count;
        return Array.from({ length: count }, (_, i) => ({
          id: id(`planter-${i}`), prop: 'planter' as const, x: wall.x + step * (i + 0.5), y: base + 6,
          width: step + 8, height: wall.height + 26, covers: wall,
        }));
      }
    }
  }

  // Squarish blocks.
  switch (theme) {
    case 'food_court':
      return [{ id: id('tables'), prop: 'tableSet', x: cx, y: base + 8, width: Math.max(wall.width, 56) + 12, height: wall.height + 28, covers: wall }];
    case 'security_office':
      return [{ id: id('desk'), prop: 'securityDesk', x: cx, y: base + 4, width: wall.width + 8, height: wall.height + 18, covers: wall }];
    default:
      return [{ id: id('crates'), prop: 'crates', x: cx, y: base + 4, width: wall.width + 8, height: wall.height + 34, covers: wall }];
  }
}

/* ------------------------------------------------------------------------ */
/* Themes                                                                     */
/* ------------------------------------------------------------------------ */

type StoreLook = { facade: FacadeId; neon: number; subtitle: string; floor: FloorStyle; spill: number; fixture: PropId };

/** Each authored store template gets its own shopfront and interior. */
const STORE_LOOKS: Readonly<Record<string, StoreLook>> = {
  'mall-mart': { facade: 'electronics', neon: NEON.blue, subtitle: 'MORE FOR A BRIGHTER TOMORROW', floor: 'linoleum', spill: 0xdce8ff, fixture: 'gondola' },
  'cinema-snacks': { facade: 'cinema', neon: NEON.red, subtitle: 'NOW SHOWING', floor: 'carpet', spill: 0xffc070, fixture: 'vending' },
  'arcade-annex': { facade: 'arcade', neon: NEON.cyan, subtitle: 'INSERT COIN', floor: 'carpet', spill: 0x9a7cff, fixture: 'arcadeCabinet' },
  'department-outlet': { facade: 'boutique', neon: NEON.pink, subtitle: 'FASHION FOR LESS', floor: 'carpet', spill: 0xff9ad8, fixture: 'clothingRack' },
  // Round 32: the themed stores. Round 33 gave the four that borrowed a front their own PixelLab shopfront.
  'sports-locker': { facade: 'sports', neon: NEON.green, subtitle: 'GAME ON', floor: 'linoleum', spill: 0xb8ffc8, fixture: 'gondola' },
  'hardware-hut': { facade: 'hardware', neon: NEON.orange, subtitle: 'DO IT YOURSELF', floor: 'concrete', spill: 0xffc08a, fixture: 'gondola' },
  'toy-box': { facade: 'toys', neon: NEON.yellow, subtitle: 'KIDS RULE', floor: 'checker', spill: 0xfff09a, fixture: 'gondola' },
  'radio-shed': { facade: 'radio', neon: NEON.red, subtitle: "YOU'VE GOT QUESTIONS", floor: 'linoleum', spill: 0xff9a9a, fixture: 'vhsShelf' },
  'spiral-records': { facade: 'music', neon: NEON.magenta, subtitle: 'MUSIC · MOVIES · MORE', floor: 'carpet', spill: 0xff9ae6, fixture: 'vhsShelf' },
  'slice-station': { facade: 'pizza', neon: NEON.orange, subtitle: 'HOT N READY', floor: 'checker', spill: 0xffd08a, fixture: 'condiments' },
  'video-world': { facade: 'video', neon: NEON.cyan, subtitle: 'BE KIND REWIND', floor: 'carpet', spill: 0xffd9a0, fixture: 'vhsShelf' },
};

/** The shopfront panel a store template shows on its concourse. */
export function storeFacade(templateId: string): FacadeId {
  return (STORE_LOOKS[templateId] ?? STORE_LOOKS['mall-mart']!).facade;
}

/** Whether a store template has its own dressing (rather than Mall Mart's fallback). */
export function hasStoreLook(templateId: string): boolean {
  return templateId in STORE_LOOKS && templateId in INTERIOR_LOOKS;
}

function openingConcourse(room: WingRoomDefinition): DressingPlan {
  const facades = facadeRow([
    { facade: 'video', sign: sign('VIDEO WORLD', NEON.cyan, 'RENT 2 GET 1 FREE', NEON.yellow), spill: 0xffd9a0 },
    { facade: 'electronics', sign: sign('MEGA MART', NEON.blue, 'MORE FOR A BRIGHTER TOMORROW', NEON.red), spill: 0xe6f0ff },
    { facade: 'music', sign: sign('SPIRAL', NEON.magenta, 'MUSIC · MOVIES · MORE', NEON.pink), spill: 0xff9ae6 },
  ]);
  const props: DressingProp[] = [];
  interiorWalls(room).forEach((wall, index) => {
    if (isFountainFootprint(wall)) {
      props.push({ id: 'fountain', prop: 'fountain', x: wall.x + wall.width / 2, y: wall.y + wall.height + 8, width: 150, height: 118, covers: wall });
    } else {
      props.push(...coverWall(wall, index, 'opening_concourse'));
    }
  });
  props.push(
    { id: 'bunny', prop: 'bunny', x: 842, y: 452, width: 40, height: 110 },
    { id: 'directory', prop: 'directory', x: 300, y: 70, width: 22, height: 70 },
    { id: 'palm-nw', prop: 'palm', x: 70, y: 150, width: 44, height: 67 },
    { id: 'palm-sw', prop: 'palm', x: 70, y: 440, width: 44, height: 67 },
    { id: 'palm-ne', prop: 'palm', x: 900, y: 150, width: 44, height: 67 },
    { id: 'bench-s1', prop: 'bench', x: 330, y: 452, width: 64, height: 34 },
    { id: 'bench-s2', prop: 'bench', x: 630, y: 452, width: 64, height: 34 },
    { id: 'cart-1', prop: 'cart', x: 160, y: 72, width: 40, height: 37 },
    { id: 'cart-2', prop: 'cart', x: 188, y: 78, width: 40, height: 37, flipX: true },
    { id: 'bin-1', prop: 'bin', x: 740, y: 70, width: 20, height: 27 },
    { id: 'payphone', prop: 'payphone', x: 930, y: 118, width: 28, height: 57 },
    { id: 'kiddie', prop: 'kiddieRide', x: 180, y: 452, width: 46, height: 35 },
    { id: 'wetfloor', prop: 'wetFloor', x: 560, y: 452, width: 20, height: 17 },
  );
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
    lights,
    neonStrips: [
      { x1: 20, y1: 176, x2: 940, y2: 176, color: NEON.cyan },
    ],
    neonRings: [
      { x: 480, y: 348, width: 236, height: 92, color: NEON.magenta },
      { x: 480, y: 348, width: 262, height: 108, color: NEON.cyan },
    ],
    floorSigns: [],
    storeZone: null,
    civilians: true,
  };
}

/**
 * A storefront room's concourse. The store itself is inside, through the
 * shop's own door in the back-wall art (see storeInterior.ts), so out here
 * there is only the mall: planters, a bench, a cart, and that door lit up.
 */
function storefront(room: WingRoomDefinition): DressingPlan {
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
  // The furniture's footprints are collision too, but they carry their own art.
  const furniture = CONCOURSE_FURNITURE.flatMap((piece) => (piece.footprint ? [piece.footprint] : []));
  const isFurniture = (wall: Rect) => furniture.some((rect) => rect.x === wall.x && rect.y === wall.y && rect.width === wall.width && rect.height === wall.height);
  interiorWalls(room).filter((wall) => !isFurniture(wall)).forEach((wall, index) => props.push(...coverWall(wall, index, 'storefront')));
  props.push(
    { id: 'palm-w', prop: 'palm', x: 70, y: 150, width: 44, height: 67 },
    { id: 'palm-e', prop: 'palm', x: 890, y: 440, width: 44, height: 67 },
    { id: 'palm-c1', prop: 'palm', x: 340, y: 92, width: 40, height: 60 },
    { id: 'bench', prop: 'bench', x: 160, y: 452, width: 64, height: 34 },
    { id: 'cart', prop: 'cart', x: 820, y: 76, width: 40, height: 37 },
    { id: 'bin', prop: 'bin', x: 560, y: 452, width: 20, height: 27 },
  );
  // The furniture the sim stands in the way (CONCOURSE_FURNITURE), drawn a
  // little larger than its source art like the rest of the mall's props.
  for (const piece of CONCOURSE_FURNITURE) {
    const texture = PROP_TEXTURES[piece.kind];
    const scale = piece.kind === 'saleSign' ? 1.15 : 1.3;
    props.push({ id: `concourse-${piece.id}`, prop: piece.kind, x: piece.x, y: piece.y, width: Math.round(texture.width * scale), height: Math.round(texture.height * scale) });
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
    lights,
    neonStrips: [],
    neonRings: [],
    floorSigns: [],
    storeZone: null,
    civilians: false,
  };
}

/** What each store stocks its walls with, beyond the shelves behind the offers. */
type InteriorLook = {
  /** Along the back wall, repeated. */
  readonly wall: readonly PropId[];
  /** Stood down both side walls. */
  readonly sides: PropId;
  /** A few pieces in the corners. */
  readonly corners: readonly PropId[];
  readonly ambient: number;
};

const INTERIOR_LOOKS: Readonly<Record<string, InteriorLook>> = {
  // No decorative carts: Mall Mart's carts roll (storeTwists.ts), so a still one would mislead.
  'mall-mart': { wall: ['gondola'], sides: 'gondola', corners: ['bin', 'wetFloor', 'vending', 'bin'], ambient: 0x6a6878 },
  'cinema-snacks': { wall: ['vending', 'condiments'], sides: 'vending', corners: ['bench', 'bin', 'palm', 'drinkingFountain'], ambient: 0x5a3e4a },
  'arcade-annex': { wall: ['arcadeCabinet', 'clawMachine'], sides: 'arcadeCabinet', corners: ['kiddieRide', 'atm', 'clawMachine', 'bin'], ambient: 0x3a2e5a },
  'department-outlet': { wall: ['clothingRack'], sides: 'clothingRack', corners: ['bunny', 'palm', 'palm', 'directory'], ambient: 0x5e4a62 },
  'sports-locker': { wall: ['gondola', 'clothingRack'], sides: 'clothingRack', corners: ['bin', 'palm', 'waterCooler', 'bench'], ambient: 0x3e5a4a },
  'hardware-hut': { wall: ['gondola', 'crates'], sides: 'gondola', corners: ['floorBuffer', 'crates', 'wetFloor', 'janitorCart'], ambient: 0x5a4a3a },
  'toy-box': { wall: ['clawMachine', 'gondola'], sides: 'gondola', corners: ['kiddieRide', 'bunny', 'gumballStand', 'kiddieRide'], ambient: 0x5a5a3a },
  'radio-shed': { wall: ['vhsShelf', 'atm'], sides: 'gondola', corners: ['atm', 'payphone', 'bin', 'waterCooler'], ambient: 0x4a3a3e },
  'spiral-records': { wall: ['vhsShelf'], sides: 'vhsShelf', corners: ['palm', 'photoBooth', 'bench', 'bin'], ambient: 0x4a2e52 },
  'slice-station': { wall: ['vending', 'condiments'], sides: 'vending', corners: ['tableSet', 'trayReturn', 'trashBank', 'drinkingFountain'], ambient: 0x5a3e2e },
  'video-world': { wall: ['vhsShelf'], sides: 'vhsShelf', corners: ['saleSign', 'bin', 'palm', 'directory'], ambient: 0x2e3e5a },
};

/** Draw size for a prop stood in a store: a little larger than out on the concourse. */
function sized(prop: PropId, scale = 1.35): { width: number; height: number } {
  const texture = PROP_TEXTURES[prop];
  return { width: Math.round(texture.width * scale), height: Math.round(texture.height * scale) };
}

/**
 * Inside a store: its floor wall to wall, its neon name on the back wall,
 * the back wall and side walls stocked in the store's own style, a shelf
 * behind every item for sale, checkouts either side of the door, and the
 * door itself at the bottom (drawn by MallRoomView).
 */
function storeInterior(room: WingRoomDefinition, store: WingStoreInstance | null): DressingPlan {
  const look = (store && STORE_LOOKS[store.templateId]) ?? STORE_LOOKS['mall-mart']!;
  const stock = (store && INTERIOR_LOOKS[store.templateId]) ?? INTERIOR_LOOKS['mall-mart']!;
  const b = INTERIOR_BOUNDS;
  const door = INTERIOR_EXIT;
  const props: DressingProp[] = [];
  // The back wall, stocked end to end.
  let index = 0;
  for (let x = b.x + 50; x <= b.x + b.width - 50; x += 78) {
    const prop = stock.wall[index % stock.wall.length]!;
    props.push({ id: `wall-${index}`, prop, x, y: b.y + 30, ...sized(prop) });
    index += 1;
  }
  // Down both side walls.
  for (const [side, x] of [['w', b.x + 26], ['e', b.x + b.width - 26]] as const) {
    for (let row = 0; row < 2; row += 1) {
      props.push({ id: `side-${side}-${row}`, prop: stock.sides, x, y: b.y + 150 + row * 100, ...sized(stock.sides), flipX: side === 'e' });
    }
  }
  // A shelf behind every item for sale, so it reads as on display.
  for (const offer of room.offers.filter((candidate) => candidate.storeId === store?.templateId)) {
    props.push({ id: `fixture-${offer.id}`, prop: look.fixture, x: offer.position.x, y: offer.position.y - 12, ...sized(look.fixture, 1.5) });
  }
  // Checkouts either side of the door, and the corners.
  props.push(
    { id: 'checkout', prop: 'checkout', x: door.x - 50, y: door.y - 6, width: 48, height: 42 },
    { id: 'checkout-2', prop: 'checkout', x: door.x + door.width + 50, y: door.y - 6, width: 48, height: 42, flipX: true },
  );
  const corners = [
    { x: b.x + 90, y: b.y + b.height - 30 },
    { x: b.x + 170, y: b.y + b.height - 22 },
    { x: b.x + b.width - 170, y: b.y + b.height - 22 },
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
    lights,
    neonStrips: [
      { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y, color: look.neon },
      { x1: b.x, y1: door.y, x2: door.x, y2: door.y, color: look.neon },
      { x1: door.x + door.width, y1: door.y, x2: b.x + b.width, y2: door.y, color: look.neon },
    ],
    neonRings: [],
    // The store's name in neon across its own back wall.
    floorSigns: [{ ...sign((store?.name ?? 'STORE').toUpperCase(), look.neon, look.subtitle, NEON.yellow, 4), x: 480, y: -64 }],
    storeZone: null,
    civilians: false,
  };
}

function foodCourt(room: WingRoomDefinition): DressingPlan {
  const facades = facadeRow([
    { facade: 'pizza', sign: sign('PIZZA PALACE', NEON.orange, 'HOT SLICES 99C', NEON.yellow), spill: 0xffb070 },
    { facade: 'wok', sign: sign('WOK N ROLL', NEON.red, 'CHINESE EXPRESS', NEON.yellow), spill: 0xffa060 },
    { facade: 'burger', sign: sign('BURGER ORBIT', NEON.cyan, 'OUT OF THIS WORLD', NEON.orange), spill: 0xa0fff0 },
  ]);
  const props: DressingProp[] = [];
  interiorWalls(room).forEach((wall, index) => props.push(...coverWall(wall, index, 'food_court')));
  props.push(
    { id: 'condiments', prop: 'condiments', x: 480, y: 76, width: 46, height: 40 },
    { id: 'vending-1', prop: 'vending', x: 60, y: 120, width: 26, height: 45 },
    { id: 'vending-2', prop: 'vending', x: 900, y: 120, width: 26, height: 45 },
    { id: 'bin-1', prop: 'bin', x: 120, y: 452, width: 20, height: 27 },
    { id: 'bin-2', prop: 'bin', x: 840, y: 452, width: 20, height: 27 },
    { id: 'palm-s', prop: 'palm', x: 480, y: 456, width: 44, height: 67 },
    { id: 'wetfloor', prop: 'wetFloor', x: 700, y: 88, width: 20, height: 17 },
    // Along the top wall, clear of every seeded seating layout.
    { id: 'tray-return', prop: 'trayReturn', x: 160, y: 98, ...sized('trayReturn', 1.25) },
    { id: 'trash-bank', prop: 'trashBank', x: 800, y: 96, ...sized('trashBank', 1.25) },
  );
  return {
    themeId: 'food_court',
    areaName: 'FOOD COURT',
    floor: 'checker',
    ambient: 0x3e3448,
    facades,
    props,
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

function backHall(room: WingRoomDefinition): DressingPlan {
  const facades = facadeRow([
    { facade: 'service', sign: sign('EMPLOYEES ONLY', NEON.red, undefined, undefined, 2), spill: 0xb0c8d0 },
    { facade: 'service', sign: null, spill: 0x90a8b0 },
    { facade: 'service', sign: sign('NO EXIT', NEON.red, undefined, undefined, 2), spill: 0xb0c8d0 },
  ]);
  const props: DressingProp[] = [];
  interiorWalls(room).forEach((wall, index) => props.push(...coverWall(wall, index, 'back_hall')));
  props.push(
    { id: 'cart-abandoned', prop: 'cart', x: 820, y: 452, width: 40, height: 37, flipX: true },
    { id: 'wetfloor', prop: 'wetFloor', x: 130, y: 90, width: 20, height: 17 },
    { id: 'bin', prop: 'bin', x: 900, y: 80, width: 20, height: 27 },
    // Alex's own cart by the wet-floor sign, the staff lockers, the buffer.
    { id: 'janitor-cart', prop: 'janitorCart', x: 186, y: 104, ...sized('janitorCart', 1.3) },
    { id: 'lockers', prop: 'lockerRow', x: 640, y: 82, ...sized('lockerRow', 1.3) },
    { id: 'buffer', prop: 'floorBuffer', x: 832, y: 152, ...sized('floorBuffer', 1.25) },
  );
  return {
    themeId: 'back_hall',
    areaName: 'SERVICE HALL B',
    floor: 'concrete',
    ambient: 0x22242e,
    facades,
    props,
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

function securityOffice(room: WingRoomDefinition): DressingPlan {
  const facades = facadeRow([
    { facade: 'security', sign: sign('SECURITY', NEON.green, 'LOSS PREVENTION', NEON.red), spill: 0x90ffb0 },
    { facade: 'service', sign: null, spill: 0x80a090 },
    { facade: 'security', sign: sign('AUTHORIZED ONLY', NEON.red, undefined, undefined, 2), spill: 0x90ffb0 },
  ]);
  const props: DressingProp[] = [];
  interiorWalls(room).forEach((wall, index) => props.push(...coverWall(wall, index, 'security_office')));
  props.push(
    { id: 'atm', prop: 'atm', x: 900, y: 110, width: 30, height: 49 },
    { id: 'bin', prop: 'bin', x: 70, y: 452, width: 20, height: 27 },
    // Everything the janitor's colleagues ever took back, under lock and key.
    { id: 'confiscated', prop: 'confiscationCage', x: 172, y: 116, ...sized('confiscationCage', 1.2) },
    { id: 'files', prop: 'filingCabinets', x: 640, y: 92, ...sized('filingCabinets', 1.3) },
    { id: 'cooler', prop: 'waterCooler', x: 72, y: 156, ...sized('waterCooler', 1.3) },
  );
  return {
    themeId: 'security_office',
    areaName: 'SECURITY OFFICE',
    floor: 'linoleum',
    ambient: 0x1c2a24,
    facades,
    props,
    lights: [
      ...facadeSpillLights(facades),
      ...doorwayLights(room, NEON.red),
      ...ceilingGrid(0xb0ffc8, 0.55, 150, [160, 380], [240, 560], (i) => (i === 1 ? 'buzz' : undefined)),
      { x: 760, y: 240, radius: 190, color: NEON.red, intensity: 0.45, squash: 0.8, flicker: 'pulse' },
    ],
    neonStrips: [
      { x1: 20, y1: 60, x2: 940, y2: 60, color: NEON.green },
      { x1: 580, y1: 110, x2: 940, y2: 110, color: NEON.red },
      { x1: 580, y1: 370, x2: 940, y2: 370, color: NEON.red },
    ],
    neonRings: [],
    floorSigns: [],
    storeZone: null,
    civilians: false,
  };
}

/** The opening fountain's authored footprint (see ROOM_VARIANTS). */
export function isFountainFootprint(wall: Rect): boolean {
  return wall.width >= 90 && wall.width <= 130 && wall.height >= 40 && wall.height <= 70 && Math.abs(wall.x + wall.width / 2 - 480) < 2;
}

/**
 * The upper level restyles each downstairs room: same shape and prop cover
 * (so every collision rectangle stays dressed), new facades, signs, floor,
 * light and neon, so floor 2 reads as a different part of the mall.
 */
function upperFloor(plan: DressingPlan, room: WingRoomDefinition): DressingPlan {
  switch (room.id) {
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
        ambient: 0x3a3462,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.violet), ...ceilingGrid(0xc0a0ff, 0.5, 180, [150, 390], [140, 480, 820])],
        neonStrips: [{ x1: 20, y1: 176, x2: 940, y2: 176, color: NEON.violet }],
        neonRings: plan.neonRings.map((ring, i) => ({ ...ring, color: i === 0 ? NEON.cyan : NEON.violet })),
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
        ambient: 0x3a2030,
        facades,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.red), ...ceilingGrid(0xffb090, 0.5, 160, [180, 380], [200, 480, 760], (i) => (i === 2 ? 'buzz' : undefined))],
        neonStrips: [{ x1: 20, y1: 176, x2: 940, y2: 176, color: NEON.yellow }],
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
        ambient: 0x16181f,
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
        neonStrips: [
          { x1: 20, y1: 60, x2: 940, y2: 60, color: NEON.yellow },
          { x1: 580, y1: 110, x2: 940, y2: 110, color: NEON.red },
          { x1: 580, y1: 370, x2: 940, y2: 370, color: NEON.red },
        ],
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
function topFloor(plan: DressingPlan, room: WingRoomDefinition): DressingPlan {
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
        neonStrips: [{ x1: 20, y1: 176, x2: 940, y2: 176, color: NEON.orange }, { x1: 20, y1: 304, x2: 940, y2: 304, color: teal }],
        neonRings: plan.neonRings.map((ring, i) => ({ ...ring, color: i === 0 ? NEON.orange : teal })),
        civilians: false,
      };
    }
    case 'storefront_a':
    case 'storefront_b':
      return {
        ...plan,
        ambient: 0x3e2622,
        lights: [...plan.lights, ...ceilingGrid(0xff9a50, 0.35, 150, [150, 400], [110, 850])],
        neonStrips: [...plan.neonStrips, { x1: 20, y1: 60, x2: 940, y2: 60, color: teal }],
      };
    case 'food_court': {
      const facades = facadeRow([
        { facade: 'arcade', sign: sign('GAME OVER', NEON.magenta, 'INSERT COIN', NEON.yellow), spill: 0xc080ff },
        { facade: 'arcade', sign: sign('HIGH SCORES', teal, 'AAA 999999', NEON.orange), spill: 0x60ffe8 },
        { facade: 'arcade', sign: sign('TOKENS', NEON.orange, '4 FOR A DOLLAR', teal), spill: 0xff9a50 },
      ]);
      const props = [
        ...plan.props,
        { id: 'cab-1', prop: 'arcadeCabinet' as const, x: 60, y: 300, width: 32, height: 70 },
        { id: 'cab-2', prop: 'arcadeCabinet' as const, x: 900, y: 300, width: 32, height: 70 },
        { id: 'claw-1', prop: 'clawMachine' as const, x: 60, y: 400, width: 38, height: 68 },
        { id: 'claw-2', prop: 'clawMachine' as const, x: 900, y: 400, width: 38, height: 68 },
      ];
      return {
        ...plan,
        areaName: 'ARCADE',
        floor: 'carpet',
        ambient: 0x241a3a,
        facades,
        props,
        lights: [...facadeSpillLights(facades), ...doorwayLights(room, NEON.magenta), ...ceilingGrid(0x9a7cff, 0.5, 170, [180, 380], [200, 480, 760], (i) => (i === 3 ? 'buzz' : undefined))],
        neonStrips: [{ x1: 20, y1: 176, x2: 940, y2: 176, color: NEON.magenta }, { x1: 20, y1: 304, x2: 940, y2: 304, color: teal }],
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
        ambient: 0x1a2226,
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
        neonStrips: [
          { x1: 20, y1: 60, x2: 940, y2: 60, color: NEON.yellow },
          { x1: 580, y1: 110, x2: 940, y2: 110, color: NEON.magenta },
          { x1: 580, y1: 370, x2: 940, y2: 370, color: NEON.magenta },
        ],
      };
    }
    default:
      return plan;
  }
}

export function planRoomDressing(room: WingRoomDefinition, floor: 1 | 2 | 3 = 1, insideStore: number | null = null): DressingPlan {
  // A shop looks like itself on any floor.
  const shop = insideStore === null ? undefined : roomStores(room)[insideStore];
  if (shop) return storeInterior(room, shop);
  const plan = planFloorOneRoom(room);
  return floor === 3 ? topFloor(plan, room) : floor === 2 ? upperFloor(plan, room) : plan;
}

function planFloorOneRoom(room: WingRoomDefinition): DressingPlan {
  switch (room.id) {
    case 'service_corridor':
      return openingConcourse(room);
    case 'storefront_a':
    case 'storefront_b':
      return storefront(room);
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
