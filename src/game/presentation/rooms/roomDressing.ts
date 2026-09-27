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
} as const;
export type FacadeId = keyof typeof FACADE_TEXTURES;

export const PROP_TEXTURES = {
  fountain: { key: 'neon:prop:globe-fountain', file: 'props/globe-fountain.png', width: 134, height: 105 },
  bunny: { key: 'neon:prop:bunny-mascot', file: 'props/bunny-mascot.png', width: 33, height: 91 },
  tableSet: { key: 'neon:prop:food-table-set', file: 'props/food-table-set.png', width: 61, height: 61 },
  planter: { key: 'neon:prop:planter-long', file: 'props/planter-long.png', width: 85, height: 55 },
  crates: { key: 'neon:prop:crate-stack', file: 'props/crate-stack.png', width: 75, height: 86 },
  securityDesk: { key: 'neon:prop:security-desk', file: 'props/security-desk.png', width: 80, height: 45 },
  booth: { key: 'neon:prop:booth-row', file: 'props/booth-row.png', width: 143, height: 38 },
  pillar: { key: 'neon:prop:concrete-pillar', file: 'props/concrete-pillar.png', width: 24, height: 99 },
  cart: { key: 'neon:prop:shopping-cart', file: 'legacy-props/shopping-cart.png', width: 36, height: 33 },
  arcadeCabinet: { key: 'neon:prop:arcade-cabinet', file: 'legacy-props/arcade-cabinet.png', width: 27, height: 59 },
  clawMachine: { key: 'neon:prop:claw-machine', file: 'legacy-props/claw-machine.png', width: 32, height: 57 },
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
  | 'security_office';

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
};

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
      { x1: 20, y1: 324, x2: 940, y2: 324, color: NEON.magenta },
    ],
    floorSigns: [],
    storeZone: null,
    civilians: true,
  };
}

function storefront(room: WingRoomDefinition): DressingPlan {
  const store = room.store;
  const look = (store && STORE_LOOKS[store.templateId]) ?? STORE_LOOKS['mall-mart']!;
  const neighbour: FacadeId = look.facade === 'arcade' ? 'video' : 'arcade';
  const facades = facadeRow([
    { facade: neighbour, sign: null, spill: 0x8a70c0 },
    { facade: look.facade, sign: sign((store?.name ?? 'STORE').toUpperCase(), look.neon, look.subtitle, NEON.yellow), spill: look.spill },
    { facade: 'music', sign: null, spill: 0x9a6aa8 },
  ]);
  const props: DressingProp[] = [];
  interiorWalls(room).forEach((wall, index) => props.push(...coverWall(wall, index, 'storefront')));
  // Fixtures stand behind each offer so the pickup reads as "on the shelf".
  for (const offer of room.offers) {
    const fixture = PROP_TEXTURES[look.fixture];
    props.push({ id: `fixture-${offer.id}`, prop: look.fixture, x: offer.position.x, y: offer.position.y - 10, width: fixture.width + 6, height: fixture.height + 8 });
  }
  if (store) {
    props.push(
      { id: 'checkout', prop: 'checkout', x: store.exit.bounds.x - 30, y: store.exit.bounds.y - 4, width: 40, height: 36 },
      { id: 'checkout-2', prop: 'checkout', x: store.exit.bounds.x + store.exit.bounds.width + 30, y: store.exit.bounds.y - 4, width: 40, height: 36, flipX: true },
    );
  }
  props.push(
    { id: 'palm-w', prop: 'palm', x: 70, y: 150, width: 44, height: 67 },
    { id: 'palm-e', prop: 'palm', x: 890, y: 440, width: 44, height: 67 },
    { id: 'bench', prop: 'bench', x: 160, y: 452, width: 64, height: 34 },
    { id: 'cart', prop: 'cart', x: 820, y: 76, width: 40, height: 37 },
  );
  const lights: PointLight[] = [
    ...facadeSpillLights(facades),
    ...doorwayLights(room, NEON.violet),
    ...ceilingGrid(NEON.warm, 0.4, 150, [150, 400], [110, 850]),
  ];
  if (store) {
    const b = store.bounds;
    lights.push(...ceilingGrid(look.spill, 0.62, 150, [b.y + b.height * 0.3, b.y + b.height * 0.75], [b.x + b.width * 0.25, b.x + b.width * 0.75]));
  }
  return {
    themeId: 'storefront',
    areaName: (store?.name ?? room.name).toUpperCase(),
    floor: 'terrazzo',
    ambient: 0x4a3e5c,
    facades,
    props,
    lights,
    neonStrips: store
      ? [
          { x1: store.bounds.x, y1: store.bounds.y, x2: store.bounds.x + store.bounds.width, y2: store.bounds.y, color: look.neon },
          { x1: store.bounds.x, y1: store.bounds.y + store.bounds.height, x2: store.exit.bounds.x, y2: store.bounds.y + store.bounds.height, color: look.neon },
          { x1: store.exit.bounds.x + store.exit.bounds.width, y1: store.bounds.y + store.bounds.height, x2: store.bounds.x + store.bounds.width, y2: store.bounds.y + store.bounds.height, color: look.neon },
        ]
      : [],
    floorSigns: [],
    storeZone: store ? { bounds: store.bounds, floor: look.floor, accent: look.neon } : null,
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
    floorSigns: [],
    storeZone: null,
    civilians: false,
  };
}

/** The opening fountain's authored footprint (see ROOM_VARIANTS). */
export function isFountainFootprint(wall: Rect): boolean {
  return wall.width >= 90 && wall.width <= 130 && wall.height >= 40 && wall.height <= 70 && Math.abs(wall.x + wall.width / 2 - 480) < 2;
}

export function planRoomDressing(room: WingRoomDefinition): DressingPlan {
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
