/**
 * The janitor's career: what carries over from one night shift to the next.
 *
 * Every shift pays out Pay Stubs. They are spent in the Break Room on perks
 * (Seniority, Dental Plan, Coffee Break) and on weapons kept in the employee
 * locker. Shifts that clear a floor earn a polaroid for the Employee of the
 * Month wall. This is all pure data kept in this browser only; the simulation
 * never sees any of it except the clamped `ShiftPerks` a shift starts with.
 */
import { itemDefinitionName } from '../../sim/run/economy';
import { LOCKER_ITEM_IDS, NO_PERKS, type ShiftPerks } from '../../sim/run/perks';

export type PerkId = 'seniority' | 'dental' | 'coffee';

export type PerkDefinition = {
  readonly id: PerkId;
  readonly name: string;
  /** What one level does, as the Break Room card says it. */
  readonly perLevel: string;
  /** Price of each level in Pay Stubs; the length is the number of levels. */
  readonly costs: readonly number[];
};

export const PERKS: readonly PerkDefinition[] = [
  { id: 'seniority', name: 'SENIORITY', perLevel: 'Start every shift with +$5 in the float.', costs: [6, 14, 26] },
  { id: 'dental', name: 'DENTAL PLAN', perLevel: '+1 heart of maximum health.', costs: [18, 40] },
  { id: 'coffee', name: 'COFFEE BREAK', perLevel: 'Every cleared room patches you up an extra half heart.', costs: [22] },
];

export type LockerDefinition = { readonly itemId: string; readonly name: string; readonly cost: number; readonly blurb: string };

export const LOCKER_ITEMS: readonly LockerDefinition[] = [
  { itemId: 'pump_soaker', cost: 8, blurb: 'Long-range water stream. Soaked targets conduct.' },
  { itemId: 'foam_ball_blaster', cost: 14, blurb: 'Bouncy foam volleys that knock things back.' },
  { itemId: 'party_popper', cost: 20, blurb: 'A confetti spread that shreds up close.' },
  { itemId: 'paint_marker', cost: 26, blurb: 'Fast darts that mark whatever they tag.' },
]
  .map((item) => ({ ...item, name: itemDefinitionName(item.itemId).toUpperCase() }))
  .filter((item) => LOCKER_ITEM_IDS.includes(item.itemId));

export type PolaroidPhoto = 'dawn' | 'foodcourt' | 'boss' | 'escalator';

export type Polaroid = {
  readonly score: number;
  /** True when the janitor clocked out (beat the top floor). */
  readonly won: boolean;
  readonly seconds: number;
  readonly kills: number;
  readonly bestCombo: number;
  readonly mall: number;
  /** The shift's calendar day, YYYY-MM-DD. */
  readonly date: string;
  readonly photo: PolaroidPhoto;
};

export type Career = {
  readonly version: 1;
  readonly stubs: number;
  readonly lifetimeStubs: number;
  readonly shifts: number;
  readonly floorClears: number;
  readonly clockOuts: number;
  readonly kills: number;
  readonly bestCombo: number;
  readonly perks: Readonly<Record<PerkId, number>>;
  readonly lockerOwned: readonly string[];
  readonly lockerEquipped: string | null;
  /** Best photos first. */
  readonly wall: readonly Polaroid[];
};

/** How many polaroids fit on the wall. */
export const WALL_SIZE = 9;

export function newCareer(): Career {
  return {
    version: 1,
    stubs: 0,
    lifetimeStubs: 0,
    shifts: 0,
    floorClears: 0,
    clockOuts: 0,
    kills: 0,
    bestCombo: 0,
    perks: { seniority: 0, dental: 0, coffee: 0 },
    lockerOwned: [],
    lockerEquipped: null,
    wall: [],
  };
}

/** How one finished shift went, as the end card scored it. */
export type ShiftResult = {
  readonly score: number;
  /** Clocked out: the top floor's boss (the Mall Owner) is down. */
  readonly won: boolean;
  /** Loss Prevention is down (true on any floor-2 or floor-3 shift). */
  readonly floorCleared: boolean;
  /** The Mall Manager is down (true on any floor-3 shift). Absent means false. */
  readonly floorTwoCleared?: boolean;
  readonly kills: number;
  readonly bestCombo: number;
  readonly seconds: number;
  readonly mall: number;
};

export type PayLine = { readonly label: string; readonly amount: number };
export type Pay = { readonly total: number; readonly lines: readonly PayLine[] };

export function stubsForShift(result: ShiftResult): Pay {
  const lines: PayLine[] = [{ label: 'SHIFT PAY', amount: 2 }];
  const performance = Math.floor(Math.max(0, result.score) / 200);
  if (performance > 0) lines.push({ label: 'PERFORMANCE', amount: performance });
  if (result.floorCleared) lines.push({ label: 'FLOOR 1 CLEARED', amount: 6 });
  if (result.floorTwoCleared === true || result.won) lines.push({ label: 'FLOOR 2 CLEARED', amount: 9 });
  if (result.won) lines.push({ label: 'CLOCKED OUT', amount: 14 });
  return { total: lines.reduce((sum, line) => sum + line.amount, 0), lines };
}

/** The same night always gets the same snapshot. */
function photoFor(result: ShiftResult): PolaroidPhoto {
  const odd = (Math.abs(Math.trunc(result.mall)) % 2) === 1;
  if (result.won) return odd ? 'foodcourt' : 'dawn';
  return odd ? 'escalator' : 'boss';
}

export type ShiftRecord = {
  readonly career: Career;
  readonly earned: number;
  readonly pay: Pay;
  readonly polaroid: Polaroid | null;
  /** The new polaroid is the best on the wall. */
  readonly employeeOfTheMonth: boolean;
};

export function recordShift(career: Career, result: ShiftResult, date: string): ShiftRecord {
  const pay = stubsForShift(result);
  const polaroid: Polaroid | null = result.floorCleared || result.floorTwoCleared === true || result.won
    ? {
        score: result.score,
        won: result.won,
        seconds: result.seconds,
        kills: result.kills,
        bestCombo: result.bestCombo,
        mall: result.mall,
        date,
        photo: photoFor(result),
      }
    : null;
  const wall = polaroid
    ? [...career.wall, polaroid].sort((a, b) => b.score - a.score).slice(0, WALL_SIZE)
    : career.wall;
  return {
    career: {
      ...career,
      stubs: career.stubs + pay.total,
      lifetimeStubs: career.lifetimeStubs + pay.total,
      shifts: career.shifts + 1,
      floorClears: career.floorClears + (result.floorCleared ? 1 : 0),
      clockOuts: career.clockOuts + (result.won ? 1 : 0),
      kills: career.kills + Math.max(0, result.kills),
      bestCombo: Math.max(career.bestCombo, result.bestCombo),
      wall,
    },
    earned: pay.total,
    pay,
    polaroid,
    employeeOfTheMonth: polaroid !== null && wall[0] === polaroid,
  };
}

export type Purchase = { readonly ok: true; readonly career: Career } | { readonly ok: false; readonly reason: string };

export function perkDefinition(id: PerkId): PerkDefinition {
  return PERKS.find((perk) => perk.id === id)!;
}

/** The price of a perk's next level, or null when it is maxed out. */
export function nextPerkCost(career: Career, id: PerkId): number | null {
  return perkDefinition(id).costs[career.perks[id]] ?? null;
}

export function buyPerk(career: Career, id: PerkId): Purchase {
  const cost = nextPerkCost(career, id);
  if (cost === null) return { ok: false, reason: `${perkDefinition(id).name} is maxed out.` };
  if (career.stubs < cost) return { ok: false, reason: `Need ${cost - career.stubs} more Pay Stubs.` };
  return { ok: true, career: { ...career, stubs: career.stubs - cost, perks: { ...career.perks, [id]: career.perks[id] + 1 } } };
}

/** Buying a locker item also puts it in hand for the next shift. */
export function buyLocker(career: Career, itemId: string): Purchase {
  const item = LOCKER_ITEMS.find((candidate) => candidate.itemId === itemId);
  if (!item) return { ok: false, reason: 'That does not fit in the locker.' };
  if (career.lockerOwned.includes(itemId)) return { ok: false, reason: `${item.name} is already in the locker.` };
  if (career.stubs < item.cost) return { ok: false, reason: `Need ${item.cost - career.stubs} more Pay Stubs.` };
  return {
    ok: true,
    career: { ...career, stubs: career.stubs - item.cost, lockerOwned: [...career.lockerOwned, itemId], lockerEquipped: itemId },
  };
}

/** Picks which owned locker item to bring (null leaves the locker shut). */
export function equipLocker(career: Career, itemId: string | null): Career {
  if (itemId !== null && !career.lockerOwned.includes(itemId)) return career;
  return { ...career, lockerEquipped: itemId };
}

export function perksFor(career: Career): ShiftPerks {
  if (career.perks.seniority === 0 && career.perks.dental === 0 && career.perks.coffee === 0 && career.lockerEquipped === null) return NO_PERKS;
  return {
    bonusCash: career.perks.seniority * 5,
    bonusHealth: career.perks.dental * 2,
    clearHealBonus: career.perks.coffee,
    lockerItemId: career.lockerEquipped,
  };
}

function count(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : 0;
}

function parsePolaroid(value: unknown): Polaroid | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const photos: readonly PolaroidPhoto[] = ['dawn', 'foodcourt', 'boss', 'escalator'];
  if (typeof v.score !== 'number' || typeof v.date !== 'string' || !photos.includes(v.photo as PolaroidPhoto)) return null;
  return {
    score: count(v.score),
    won: v.won === true,
    seconds: count(v.seconds),
    kills: count(v.kills),
    bestCombo: count(v.bestCombo),
    mall: typeof v.mall === 'number' && Number.isFinite(v.mall) ? Math.trunc(v.mall) : 0,
    date: v.date.slice(0, 10),
    photo: v.photo as PolaroidPhoto,
  };
}

/** Reads a saved career; anything broken or out of range is repaired, never trusted. */
export function parseCareer(raw: string | null): Career {
  let value: Record<string, unknown>;
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return newCareer();
    value = parsed as Record<string, unknown>;
  } catch {
    return newCareer();
  }
  const perks = (typeof value.perks === 'object' && value.perks !== null ? value.perks : {}) as Record<string, unknown>;
  const lockerOwned = Array.isArray(value.lockerOwned)
    ? [...new Set(value.lockerOwned.filter((id): id is string => typeof id === 'string' && LOCKER_ITEMS.some((item) => item.itemId === id)))]
    : [];
  const equipped = typeof value.lockerEquipped === 'string' && lockerOwned.includes(value.lockerEquipped) ? value.lockerEquipped : null;
  const wall = Array.isArray(value.wall)
    ? value.wall.map(parsePolaroid).filter((p): p is Polaroid => p !== null).sort((a, b) => b.score - a.score).slice(0, WALL_SIZE)
    : [];
  return {
    version: 1,
    stubs: count(value.stubs),
    lifetimeStubs: count(value.lifetimeStubs),
    shifts: count(value.shifts),
    floorClears: count(value.floorClears),
    clockOuts: count(value.clockOuts),
    kills: count(value.kills),
    bestCombo: count(value.bestCombo),
    perks: {
      seniority: count(perks.seniority, perkDefinition('seniority').costs.length),
      dental: count(perks.dental, perkDefinition('dental').costs.length),
      coffee: count(perks.coffee, perkDefinition('coffee').costs.length),
    },
    lockerOwned,
    lockerEquipped: equipped,
    wall,
  };
}

const KEY = 'dead-mall:career:v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export class CareerStore {
  private readonly storage: StorageLike | null;

  public constructor(storage: StorageLike | null) {
    this.storage = storage;
  }

  public load(): Career {
    try {
      return parseCareer(this.storage?.getItem(KEY) ?? null);
    } catch {
      return newCareer();
    }
  }

  public save(career: Career): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(career));
    } catch {
      // Storage refused: the career simply is not remembered.
    }
  }
}

export function browserCareer(): CareerStore {
  try {
    return new CareerStore(window.localStorage);
  } catch {
    return new CareerStore(null);
  }
}

/** Today in the player's own calendar, for the polaroid's date stamp. */
export function localDay(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
