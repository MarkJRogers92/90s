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
import { LOCKER_ITEM_IDS, NO_PERKS, sanitizePerks, type ShiftPerks } from '../../sim/run/perks';
import { hybridParts, isHybridPair, signatureFusions } from '../../sim/fusion/hybrid';

export type PerkId = 'seniority' | 'dental' | 'coffee' | 'sneakers' | 'shopvac' | 'lookout' | 'pockets' | 'discount' | 'benchtech' | 'penny' | 'secondwind';

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
  { id: 'sneakers', name: 'NEW SNEAKERS', perLevel: 'Your dash comes back a sixth of a second sooner.', costs: [12, 28] },
  { id: 'shopvac', name: 'SHOP-VAC ATTACHMENT', perLevel: 'Loose change slides to you from further away.', costs: [10, 24] },
  // Round 49: more of the night to invest in.
  { id: 'lookout', name: 'LOOKOUT', perLevel: 'Store alarms give you a third of a second longer.', costs: [12, 26] },
  { id: 'pockets', name: 'DEEP POCKETS', perLevel: 'Carry one more stolen item at a time.', costs: [30] },
  { id: 'discount', name: 'EMPLOYEE DISCOUNT', perLevel: '$1 off everything on the shelves.', costs: [16, 34] },
  { id: 'benchtech', name: 'BENCH TECHNICIAN', perLevel: '$2 back on every fusion.', costs: [14, 30] },
  { id: 'penny', name: 'LUCKY PENNY', perLevel: 'Monsters drop a pretzel 10% more often.', costs: [10, 22] },
  { id: 'secondwind', name: 'SECOND WIND', perLevel: 'Once a night, a fatal hit leaves you on one heart instead.', costs: [60] },
];

/** One-night snacks from the vending machine: bought now, eaten on your next shift. */
export type VendingId = 'energy' | 'lunch' | 'coupon' | 'mustache';
export type VendingDefinition = { readonly id: VendingId; readonly name: string; readonly cost: number; readonly blurb: string };
export const VENDING_ITEMS: readonly VendingDefinition[] = [
  { id: 'energy', name: 'ENERGY DRINK', cost: 5, blurb: 'One extra heart for the whole night.' },
  { id: 'lunch', name: 'LUNCH MONEY', cost: 4, blurb: 'Start the night with $15 more.' },
  { id: 'coupon', name: 'FUSION COUPON', cost: 6, blurb: 'Your first fusion of the night is free.' },
  { id: 'mustache', name: 'FAKE MUSTACHE', cost: 8, blurb: 'Lift your first item of the night without an alarm.' },
];
/** How many of one snack the bag holds; each shift eats one of each. */
export const BAG_LIMIT = 9;

export type LockerDefinition = { readonly itemId: string; readonly name: string; readonly cost: number; readonly blurb: string };

export const LOCKER_ITEMS: readonly LockerDefinition[] = [
  { itemId: 'pump_soaker', cost: 8, blurb: 'Long-range water stream. Soaked targets conduct.' },
  { itemId: 'foam_ball_blaster', cost: 14, blurb: 'Bouncy foam volleys that knock things back.' },
  { itemId: 'party_popper', cost: 20, blurb: 'A confetti spread that shreds up close.' },
  { itemId: 'paint_marker', cost: 26, blurb: 'Fast darts that mark whatever they tag.' },
  // Round 49: six more from the shelves.
  { itemId: 'slingshot', cost: 16, blurb: 'Quick, cheap shots from the wrist.' },
  { itemId: 'yo_yo', cost: 18, blurb: 'Out and back: it hits on the way home too.' },
  { itemId: 'dodgeball', cost: 22, blurb: 'A big red ball that knocks them flat.' },
  { itemId: 'garden_hose', cost: 24, blurb: 'A steady stream that soaks everything it touches.' },
  { itemId: 'nail_gun', cost: 30, blurb: 'Rapid nails that punch straight through.' },
  { itemId: 'laser_pointer', cost: 34, blurb: 'A beam across the whole room.' },
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
  /** Vending snacks waiting for the next shift (round 49). */
  readonly bag: Readonly<Record<VendingId, number>>;
  /** Best photos first. */
  readonly wall: readonly Polaroid[];
  /** Every hybrid ever fused, by definition id, sorted. */
  readonly fusionsFound: readonly string[];
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
    perks: { seniority: 0, dental: 0, coffee: 0, sneakers: 0, shopvac: 0, lookout: 0, pockets: 0, discount: 0, benchtech: 0, penny: 0, secondwind: 0 },
    lockerOwned: [],
    lockerEquipped: null,
    bag: { energy: 0, lunch: 0, coupon: 0, mustache: 0 },
    wall: [],
    fusionsFound: [],
  };
}

/** How one finished shift went, as the end card scored it. */
export type ShiftResult = {
  readonly score: number;
  /** Clocked out: the final floor's boss (the Developer, on the Roof) is down. */
  readonly won: boolean;
  /** Loss Prevention is down (true on any floor-2 or floor-3 shift). */
  readonly floorCleared: boolean;
  /** The Mall Manager is down (true on any floor-3 or Roof shift). Absent means false. */
  readonly floorTwoCleared?: boolean;
  /** The Mall Owner is down (true on any Roof shift). Absent means false. */
  readonly floorThreeCleared?: boolean;
  readonly kills: number;
  readonly bestCombo: number;
  readonly seconds: number;
  readonly mall: number;
  /** Wanted stars the shift ended with; each pays a stub. Absent means none. */
  readonly wanted?: number;
  /** Cash the shift ended with; a clock-out turns it into stubs. Absent means none. */
  readonly cash?: number;
  /** Hybrids the shift ended holding, by definition id. */
  readonly fusions?: readonly string[];
};

export type PayLine = { readonly label: string; readonly amount: number };
export type Pay = { readonly total: number; readonly lines: readonly PayLine[] };

/** Round 44: clocking out pays a stub for every this-many dollars left in hand. */
export const LEFTOVER_CASH_PER_STUB = 20;

export function stubsForShift(result: ShiftResult): Pay {
  const lines: PayLine[] = [{ label: 'SHIFT PAY', amount: 2 }];
  const performance = Math.floor(Math.max(0, result.score) / 200);
  if (performance > 0) lines.push({ label: 'PERFORMANCE', amount: performance });
  if (result.floorCleared) lines.push({ label: 'FLOOR 1 CLEARED', amount: 6 });
  if (result.floorTwoCleared === true || result.won) lines.push({ label: 'FLOOR 2 CLEARED', amount: 9 });
  if (result.floorThreeCleared === true || result.won) lines.push({ label: 'FLOOR 3 CLEARED', amount: 12 });
  if (result.won) lines.push({ label: 'CLOCKED OUT', amount: 14 });
  const leftover = result.won ? Math.floor(Math.max(0, result.cash ?? 0) / LEFTOVER_CASH_PER_STUB) : 0;
  if (leftover > 0) lines.push({ label: 'LEFTOVER CASH', amount: leftover });
  const wanted = Math.max(0, Math.min(5, Math.trunc(result.wanted ?? 0)));
  if (wanted > 0) lines.push({ label: 'FIVE-FINGER BONUS', amount: wanted });
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
  const polaroid: Polaroid | null = result.floorCleared || result.floorTwoCleared === true || result.floorThreeCleared === true || result.won
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
      fusionsFound: [...new Set([...career.fusionsFound, ...(result.fusions ?? []).flatMap(fusionSteps)])].sort(),
    },
    earned: pay.total,
    pay,
    polaroid,
    employeeOfTheMonth: polaroid !== null && wall[0] === polaroid,
  };
}

function isRealFusion(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const parts = hybridParts(id);
  return parts !== null && isHybridPair(parts.baseId, parts.ingredientId);
}

/** A fusion and every fusion nested inside it (the steps that built it), real ones only. */
function fusionSteps(id: string): string[] {
  if (!isRealFusion(id)) return [];
  const parts = hybridParts(id)!;
  return [id, ...fusionSteps(parts.baseId), ...fusionSteps(parts.ingredientId)];
}

function pairOf(id: string): string {
  const parts = hybridParts(id)!;
  return [parts.baseId, parts.ingredientId].sort().join('+');
}

export type FusionDiscovery = {
  /** Nothing the career had seen: this fusion, or a step inside it, is new. */
  readonly firstTime: boolean;
  /** The name of the signature this fusion is (its outermost pair), or null. */
  readonly signature: string | null;
  readonly signaturesFound: number;
  readonly signatureTotal: number;
};

/**
 * Logs a fusion the moment the bench makes it, with every fusion nested
 * inside it, so a signature pair that was later fused deeper still counts.
 * The career is returned unchanged (the same object) when nothing is new.
 */
export function discoverFusion(career: Career, fusionId: string): { career: Career; discovery: FusionDiscovery } {
  const steps = fusionSteps(fusionId);
  const known = new Set(career.fusionsFound);
  const fresh = steps.filter((step) => !known.has(step));
  const next = fresh.length === 0 ? career : { ...career, fusionsFound: [...known, ...fresh].sort() };
  const log = fusionLog(next);
  const pair = steps.length > 0 ? pairOf(fusionId) : null;
  const signature = pair ? signatureFusions().find((entry) => [...entry.itemIds].sort().join('+') === pair)?.name ?? null : null;
  return {
    career: next,
    discovery: { firstTime: fresh.length > 0, signature, signaturesFound: log.signaturesFound, signatureTotal: log.signatureTotal },
  };
}

export type FusionLogEntry = {
  readonly name: string;
  readonly found: boolean;
  /** The pair that makes it, shown as silhouettes until it is found. */
  readonly itemIds: readonly [string, string];
};
export type FusionLog = {
  readonly entries: readonly FusionLogEntry[];
  readonly signaturesFound: number;
  readonly signatureTotal: number;
  readonly totalFound: number;
};

/** The signature fusions, named once found and ??? until then. */
export function fusionLog(career: Career): FusionLog {
  const found = new Set(career.fusionsFound.flatMap(fusionSteps).map(pairOf));
  const entries = signatureFusions().map((signature) => {
    const known = found.has([...signature.itemIds].sort().join('+'));
    return { name: known ? signature.name : '???', found: known, itemIds: signature.itemIds };
  });
  return {
    entries,
    signaturesFound: entries.filter((entry) => entry.found).length,
    signatureTotal: entries.length,
    totalFound: career.fusionsFound.length,
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

/** The shift the Break Room sends you on: perks, locker and whatever is in the bag. */
export function perksFor(career: Career): ShiftPerks {
  const { perks, bag } = career;
  if (Object.values(perks).every((level) => level === 0) && career.lockerEquipped === null && Object.values(bag).every((count) => count === 0)) return NO_PERKS;
  const one = (id: VendingId) => (bag[id] > 0 ? 1 : 0);
  return sanitizePerks({
    bonusCash: perks.seniority * 5 + one('lunch') * 15,
    bonusHealth: perks.dental * 2 + one('energy') * 2,
    clearHealBonus: perks.coffee,
    dashCooldownCut: perks.sneakers * 10,
    tokenMagnet: perks.shopvac * 40,
    lockerItemId: career.lockerEquipped,
    alarmBonus: perks.lookout * 20,
    carryBonus: perks.pockets,
    shelfDiscount: perks.discount,
    fusionRebate: perks.benchtech * 2,
    snackBonus: perks.penny * 10,
    secondWinds: perks.secondwind,
    freeFusions: one('coupon'),
    quietGrabs: one('mustache'),
  });
}

/** Buys one vending snack for the bag. */
export function buyVending(career: Career, id: VendingId): Purchase {
  const item = VENDING_ITEMS.find((candidate) => candidate.id === id);
  if (!item) return { ok: false, reason: 'The machine does not sell that.' };
  if (career.bag[id] >= BAG_LIMIT) return { ok: false, reason: `Your bag holds ${BAG_LIMIT} at most.` };
  if (career.stubs < item.cost) return { ok: false, reason: `Need ${item.cost - career.stubs} more Pay Stubs.` };
  return { ok: true, career: { ...career, stubs: career.stubs - item.cost, bag: { ...career.bag, [id]: career.bag[id] + 1 } } };
}

/** Starting a shift: its perks, and the career with one of each snack eaten. */
export function clockIn(career: Career): { readonly career: Career; readonly perks: ShiftPerks } {
  const bag = Object.fromEntries(Object.entries(career.bag).map(([id, count]) => [id, Math.max(0, count - 1)])) as Record<VendingId, number>;
  return { career: { ...career, bag }, perks: perksFor(career) };
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
  const bag = (typeof value.bag === 'object' && value.bag !== null ? value.bag : {}) as Record<string, unknown>;
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
      sneakers: count(perks.sneakers, perkDefinition('sneakers').costs.length),
      shopvac: count(perks.shopvac, perkDefinition('shopvac').costs.length),
      lookout: count(perks.lookout, perkDefinition('lookout').costs.length),
      pockets: count(perks.pockets, perkDefinition('pockets').costs.length),
      discount: count(perks.discount, perkDefinition('discount').costs.length),
      benchtech: count(perks.benchtech, perkDefinition('benchtech').costs.length),
      penny: count(perks.penny, perkDefinition('penny').costs.length),
      secondwind: count(perks.secondwind, perkDefinition('secondwind').costs.length),
    },
    bag: {
      energy: count(bag.energy, BAG_LIMIT),
      lunch: count(bag.lunch, BAG_LIMIT),
      coupon: count(bag.coupon, BAG_LIMIT),
      mustache: count(bag.mustache, BAG_LIMIT),
    },
    lockerOwned,
    lockerEquipped: equipped,
    wall,
    fusionsFound: Array.isArray(value.fusionsFound) ? [...new Set(value.fusionsFound.filter(isRealFusion))].sort() : [],
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
