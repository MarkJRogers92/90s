/**
 * Round 59: where a room's loose decor stands.
 *
 * The owner's review: decor looked dropped at random. Every piece now has a
 * reason to be where it is, in one of five places:
 * - mounted on the back wall's pillars between the shopfronts (a camera up
 *   high, the restroom sign at eye level, the extinguisher at the foot);
 * - against the wall, flanking each shopfront or wall panel;
 * - along the bottom railing;
 * - in a side-wall corner, clear of the doors, as a small cluster;
 * - dropped just in front of a piece of furniture (a tray by the booths).
 * Each room picks from its floor's kit for its role; the picks are a stable
 * hash of the room, so a room always dresses the same way.
 */
import type { Rect } from '../../../sim/model';
import type { WingRoomDefinition } from '../../../sim/wing/types';
import type { FloorNumber } from '../../../sim/wing/floorSpecs';
import { SECRET_MACHINE } from '../../../sim/run/secretRoom';
import { SHORTCUT_HATCH } from '../../../sim/run/shortcut';

/** What the decor needs from the dressing: kept structural so this module stays a leaf. */
export type DecorProp = {
  readonly id: string;
  readonly prop: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly flipX?: boolean;
};

type Size = { readonly width: number; readonly height: number };

export type DecorKit = {
  /** Mounted on the pillars between shopfronts, in turn. */
  readonly mounts: readonly string[];
  /** Stood against the back wall, flanking each shopfront or panel, in turn. */
  readonly wall: readonly string[];
  /** Along the bottom railing, in turn. */
  readonly rail: readonly string[];
  /** One small cluster per corner: north-west, north-east, south-west, south-east. */
  readonly corners: readonly (readonly string[])[];
  /** Dropped in front of furniture. */
  readonly clutter: readonly string[];
};

type Role = WingRoomDefinition['id'];

const MALL: Readonly<Record<Role, DecorKit>> = {
  service_corridor: {
    mounts: ['restroomSign', 'cctv', 'arrowSign', 'extinguisher'],
    wall: ['palm', 'payphone', 'vending', 'palm', 'directory', 'palm'],
    rail: ['bench', 'planterLong', 'bench', 'kiddieRide'],
    corners: [['palm'], ['palm'], ['bunny'], ['bin', 'wetFloor']],
    clutter: ['mallMap', 'droppedBags'],
  },
  storefront_a: {
    mounts: ['cctv', 'arrowSign', 'extinguisher'],
    wall: ['palm', 'atm', 'palm', 'bin'],
    rail: ['bench', 'bin', 'bench'],
    corners: [['palm'], ['palm'], ['bin'], ['spillKit', 'wetFloor']],
    clutter: ['droppedBags', 'mallMap'],
  },
  storefront_b: {
    mounts: ['restroomSign', 'cctv', 'arrowSign'],
    wall: ['palm', 'payphone', 'palm', 'bin'],
    rail: ['planterLong', 'bench', 'bin'],
    corners: [['palm'], ['palm'], ['bin', 'wetFloor'], ['bin']],
    clutter: ['mallMap', 'droppedBags'],
  },
  food_court: {
    mounts: ['restroomSign', 'extinguisher', 'cctv'],
    wall: ['trayReturn', 'trashBank', 'vending', 'condiments', 'vending'],
    rail: ['bin', 'planterLong', 'bin'],
    corners: [['vending'], ['vending'], ['busTub', 'bin'], ['spillKit', 'wetFloor']],
    clutter: ['foodTray', 'busTub', 'foodTray'],
  },
  back_hall: {
    mounts: ['alarmPoint', 'extinguisher', 'cctv'],
    wall: ['lockerRow', 'janitorCart', 'keyCabinet', 'floorBuffer'],
    // No still shopping carts: carts roll in a fight (combat/props.ts), so a parked one would mislead.
    rail: ['barricade', 'crates'],
    corners: [['spillKit', 'wetFloor'], ['cableReel'], ['barricade'], ['bin']],
    clutter: ['ceilingTile', 'cableReel', 'busTub'],
  },
  security_office: {
    mounts: ['cctv', 'alarmPoint', 'extinguisher'],
    wall: ['confiscationCage', 'filingCabinets', 'keyCabinet', 'waterCooler', 'atm'],
    rail: ['bin'],
    corners: [['waterCooler'], ['keyCabinet'], ['bin'], ['spillKit']],
    clutter: ['mallMap', 'ceilingTile'],
  },
};

const UPPER: Readonly<Record<Role, DecorKit>> = {
  ...MALL,
  service_corridor: {
    mounts: ['arrowSign', 'cctv', 'restroomSign'],
    wall: ['palm', 'directory', 'planterLong', 'palm'],
    rail: ['bench', 'planterLong', 'bench'],
    corners: [['palm'], ['palm'], ['bunny'], ['bin']],
    clutter: ['droppedBags'],
  },
  food_court: {
    mounts: ['extinguisher', 'restroomSign', 'cctv'],
    wall: ['popcornCart', 'vending', 'trashBank', 'vending'],
    rail: ['bench', 'bin'],
    corners: [['popcornCart'], ['vending'], ['bin'], ['busTub']],
    clutter: ['foodTray', 'droppedBags'],
  },
  back_hall: {
    mounts: ['alarmPoint', 'extinguisher', 'cctv'],
    wall: ['barricade', 'keyCabinet', 'floorBuffer'],
    rail: ['barricade'],
    corners: [['spillKit', 'wetFloor'], ['cableReel'], ['bin'], ['barricade']],
    clutter: ['ceilingTile'],
  },
  security_office: {
    mounts: ['cctv', 'extinguisher'],
    wall: ['filingCabinets', 'waterCooler', 'keyCabinet', 'atm'],
    rail: ['bin'],
    corners: [['waterCooler'], ['keyCabinet'], ['bin'], ['bin']],
    clutter: ['mallMap'],
  },
};

const AFTER_DARK: Readonly<Record<Role, DecorKit>> = {
  ...MALL,
  service_corridor: {
    mounts: ['restroomSign', 'cctv', 'extinguisher'],
    wall: ['trayReturn', 'trashBank', 'vending', 'condiments'],
    rail: ['bin', 'bin'],
    corners: [['busTub'], ['vending'], ['spillKit', 'wetFloor'], ['bin']],
    clutter: ['foodTray', 'busTub', 'foodTray', 'droppedBags'],
  },
  storefront_a: {
    mounts: ['restroomSign', 'cctv'],
    wall: ['trayReturn', 'gumballStand', 'condiments'],
    rail: ['bin', 'bench'],
    corners: [['busTub'], ['bin'], ['spillKit'], ['foodTray']],
    clutter: ['foodTray'],
  },
  storefront_b: {
    mounts: ['cctv', 'extinguisher'],
    wall: ['trashBank', 'vending', 'trayReturn'],
    rail: ['bench', 'bin'],
    corners: [['bin'], ['busTub'], ['foodTray'], ['spillKit', 'wetFloor']],
    clutter: ['foodTray', 'busTub'],
  },
  food_court: {
    mounts: ['cctv', 'extinguisher'],
    wall: ['clawMachine', 'arcadeCabinet', 'clawMachine', 'atm'],
    rail: ['kiddieRide', 'bin'],
    corners: [['arcadeCabinet'], ['clawMachine'], ['bin'], ['gumballStand']],
    clutter: ['mallMap', 'droppedBags'],
  },
  back_hall: {
    mounts: ['alarmPoint', 'extinguisher', 'cctv'],
    wall: ['palletStack', 'keyCabinet', 'janitorCart'],
    rail: ['barricade', 'palletStack'],
    corners: [['cableReel'], ['spillKit'], ['barricade'], ['crates']],
    clutter: ['ceilingTile', 'busTub'],
  },
  security_office: {
    mounts: ['cctv', 'alarmPoint'],
    wall: ['filingCabinets', 'confiscationCage', 'keyCabinet'],
    rail: [],
    corners: [['waterCooler'], ['keyCabinet'], ['bin'], ['bin']],
    clutter: ['mallMap'],
  },
};

const ROOF_KIT: DecorKit = {
  mounts: ['alarmPoint', 'extinguisher'],
  wall: ['ventStack', 'satelliteDish', 'acUnit'],
  rail: ['barricade', 'crates'],
  corners: [['cableReel'], ['ventStack'], ['barricade'], ['bin']],
  clutter: ['ceilingTile'],
};

const ROOF: Readonly<Record<Role, DecorKit>> = {
  service_corridor: ROOF_KIT,
  storefront_a: { ...ROOF_KIT, mounts: ['alarmPoint', 'cctv'], wall: ['satelliteDish', 'ventStack', 'crates'] },
  storefront_b: { ...ROOF_KIT, mounts: ['cctv', 'extinguisher'], wall: ['ventStack', 'crates', 'satelliteDish'] },
  food_court: { ...ROOF_KIT, wall: ['acUnit', 'ventStack'], corners: [['cableReel'], ['ventStack'], ['crates'], ['barricade']], clutter: ['ceilingTile', 'cableReel'] },
  back_hall: { ...ROOF_KIT, wall: ['palletStack', 'ventStack', 'keyCabinet'], corners: [['crates'], ['cableReel'], ['barricade'], ['spillKit']] },
  security_office: { mounts: ['alarmPoint'], wall: ['acUnit', 'ventStack'], rail: [], corners: [['barricade'], ['cableReel'], [], []], clutter: [] },
};

const KITS: Readonly<Record<FloorNumber, Readonly<Record<Role, DecorKit>>>> = { 1: MALL, 2: UPPER, 3: AFTER_DARK, 4: ROOF };

/** A floor's kit for a room (a district wing is indoors, so it takes the mall's). */
export function decorKit(floor: FloorNumber, role: Role, district = false): DecorKit {
  return (district ? MALL : KITS[floor])[role];
}

const FACADE_BASE_Y = 40;
const STAGE_WIDTH = 960;
/** Wall mounts by how high on the pillar they hang (their base y). */
const MOUNT_Y: Readonly<Record<string, number>> = { cctv: -78, restroomSign: -30, arrowSign: -30, alarmPoint: 20, extinguisher: 24 };
/** Floor-standing decor is drawn at this share over its native size (wall mounts at native size). */
const DECOR_SCALE = 1.25;
const RAIL_Y = 452;
const RAIL_XS = [150, 330, 630, 810];
const CORNERS: ReadonlyArray<{ x: number; y: number; dir: 1 | -1 }> = [
  { x: 46, y: 150, dir: 1 }, { x: 914, y: 150, dir: -1 }, { x: 46, y: 372, dir: 1 }, { x: 914, y: 372, dir: -1 },
];

/** A stable 0..1 from a string, so a room's picks never change between frames or sessions. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** The dark pillars between shopfronts on the back wall (as MallRoomView draws them). */
export function backWallPillars(facades: ReadonlyArray<{ readonly x: number; readonly width: number }>): Array<{ x: number; width: number }> {
  const pillars: Array<{ x: number; width: number }> = [];
  let cursor = 0;
  for (const facade of [...facades].sort((a, b) => a.x - b.x)) {
    if (facade.x > cursor) pillars.push({ x: cursor, width: facade.x - cursor });
    cursor = facade.x + facade.width;
  }
  if (cursor < STAGE_WIDTH) pillars.push({ x: cursor, width: STAGE_WIDTH - cursor });
  return pillars;
}

export type DecorInput = {
  readonly room: Pick<WingRoomDefinition, 'id' | 'variantId' | 'benchKiosk' | 'mirrored'>;
  readonly floor: FloorNumber;
  readonly part?: 1;
  readonly district?: boolean;
  readonly facades: ReadonlyArray<{ readonly x: number; readonly width: number }>;
  /** Everything solid in the room: the decor keeps off it. */
  readonly covers: readonly Rect[];
  /** A prop's drawn size at a width (keeps its own proportions). */
  readonly sizeAt: (prop: string, width: number) => Size;
  readonly nativeWidth: (prop: string) => number;
};

/** The room's loose decor, each piece in one of the five places it belongs. */
export function roomDecor(input: DecorInput): DecorProp[] {
  const { room, floor, facades, covers } = input;
  const kit = decorKit(floor, room.id, input.district);
  const salt = `${floor}:${input.part ?? 0}:${room.id}:${room.variantId}:${room.mirrored ? 'm' : ''}`;
  const out: DecorProp[] = [];
  const size = (prop: string, scale = DECOR_SCALE) => input.sizeAt(prop, Math.round(input.nativeWidth(prop) * scale));
  const keepClear = (x: number, y: number, width: number) => {
    const left = x - width / 2, right = x + width / 2;
    if (room.benchKiosk && right > room.benchKiosk.x - 46 && left < room.benchKiosk.x + 46 && y < room.benchKiosk.y + 70) return false;
    for (const spot of [SECRET_MACHINE, SHORTCUT_HATCH]) if (Math.abs(x - spot.x) < 50 + width / 2 && Math.abs(y - spot.y) < 56) return false;
    return !out.some((placed) => placed.y > FACADE_BASE_Y - 4 && Math.abs(placed.y - y) < 40 && left < placed.x + placed.width / 2 + 4 && placed.x - placed.width / 2 - 4 < right);
  };
  const put = (id: string, prop: string, x: number, y: number, s: Size, flipX = false) => {
    if (y > FACADE_BASE_Y && !keepClear(x, y, s.width)) return;
    out.push({ id: `decor-${id}`, prop, x: Math.round(x), y: Math.round(y), width: s.width, height: s.height, ...(flipX ? { flipX } : {}) });
  };

  // 1. Mounted on the pillars between shopfronts (not the strips the side walls cover).
  const pillars = backWallPillars(facades).filter((pillar) => pillar.width >= 14 && pillar.x + pillar.width / 2 > 30 && pillar.x + pillar.width / 2 < STAGE_WIDTH - 30);
  pillars.forEach((pillar, index) => {
    if (kit.mounts.length === 0) return;
    const prop = kit.mounts[(index + Math.floor(hash(`${salt}:mount`) * kit.mounts.length)) % kit.mounts.length]!;
    put(`mount-${index}`, prop, pillar.x + pillar.width / 2, MOUNT_Y[prop] ?? 0, size(prop, 1));
  });

  // 2. Against the wall, flanking each shopfront or wall panel.
  if (kit.wall.length > 0) {
    const flanks = facades.flatMap((facade) => [facade.x + 22, facade.x + facade.width - 22]);
    const start = Math.floor(hash(`${salt}:wall`) * kit.wall.length);
    flanks.forEach((x, index) => {
      if (hash(`${salt}:flank:${index}`) < 0.25) return;
      const prop = kit.wall[(start + index) % kit.wall.length]!;
      const s = size(prop);
      put(`wall-${index}`, prop, x, FACADE_BASE_Y + 26, s, x > STAGE_WIDTH / 2);
    });
  }

  // 3. Along the bottom railing.
  RAIL_XS.forEach((x, index) => {
    if (kit.rail.length === 0 || hash(`${salt}:rail:${index}`) < 0.3) return;
    const prop = kit.rail[index % kit.rail.length]!;
    put(`rail-${index}`, prop, x, RAIL_Y, size(prop));
  });

  // 4. A cluster in each corner by the side walls, clear of the doors.
  CORNERS.forEach((corner, index) => {
    const cluster = kit.corners[index] ?? [];
    cluster.forEach((prop, member) => {
      put(`corner-${index}-${member}`, prop, corner.x + corner.dir * member * 28, corner.y + member * 8, size(prop), corner.dir < 0);
    });
  });

  // 5. Dropped just in front of furniture.
  if (kit.clutter.length > 0) {
    const fronts = [...covers].filter((rect) => rect.y + rect.height < 400).sort((a, b) => hash(`${salt}:c:${a.x},${a.y}`) - hash(`${salt}:c:${b.x},${b.y}`));
    fronts.slice(0, kit.clutter.length).forEach((rect, index) => {
      const prop = kit.clutter[index]!;
      const s = size(prop, 1.1);
      const x = rect.x + rect.width * (0.25 + 0.5 * hash(`${salt}:cx:${index}`));
      const y = rect.y + rect.height + 8 + s.height;
      if (y > 430) return;
      put(`clutter-${index}`, prop, x, y, s, hash(`${salt}:cf:${index}`) < 0.5);
    });
  }
  return out;
}
