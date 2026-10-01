/**
 * Grab and run: what happens when the janitor lifts something off a shelf.
 *
 * The M3 sight cone asked the player to stand still and wait for a sweeping
 * camera, which never fit an action game. Now the grab itself sets off the
 * store alarm. The PA announces a five-finger discount, the Bargain Hunters at
 * the door come for the deal, and the display Mannequins at the back wake up.
 * The janitor has ALARM_TICKS to get out through the store door with it.
 *
 * Too slow, and the shutter drops across the door: the janitor is locked in,
 * a second wave arrives, and the security camera adds LOCKDOWN_HEAT. Once
 * every guard is down the shutter lifts, and the door secures the goods as
 * usual. The item is never taken back; the cost is the fight and the Heat.
 *
 * The alarm is room-local, like every enemy: it is not checkpointed, and it
 * ends when the room is left.
 */
import { circleIntersectsRect } from '../core/geometry';
import type { Rect, Vec2 } from '../model';
import type { WingStoreInstance } from '../wing/types';
import { RUN_SECURED_THEFT_HEAT, beginRunTheft, publishRunFeedback, runOwnsCapability } from './economy';
import { hasLivingEnemies, spawnSecurityGuard, type SecurityKind } from './rooms';
import type { MvpCommandResult, MvpRunState } from './types';
import { applyHeatFloor, wantedStars } from './wanted';
export { GETAWAY_CASH_PER_ITEM, GETAWAY_HAUL_BONUS, getawayBonus } from './wanted';
import { activeStore } from './storeInterior';
import { MAX_SECURITY_HEAT } from '../shop/types';
import type { FloorNumber } from '../wing/floorSpecs';

/**
 * Ticks from the grab to the shutter, by floor. The 2026-10-01 playtest got
 * out of every store with 2.6-3.3 s of the old flat 4 s left, so the alarm
 * shrinks floor by floor to 2.5 s on the Roof.
 */
export const ALARM_TICKS_BY_FLOOR: Readonly<Record<FloorNumber, number>> = { 1: 210, 2: 190, 3: 170, 4: 150 };
/** Floor 1's alarm, the one the shutter cues are drawn against. */
export const ALARM_TICKS = ALARM_TICKS_BY_FLOOR[1];
/** What getting locked in on camera adds on top of the theft itself. */
export const LOCKDOWN_HEAT = 20;
/** One secured theft is one star. */
export const RUN_THEFT_HEAT = RUN_SECURED_THEFT_HEAT;
/** Reinforced Fanny Pack: goods in the pouch are noticed later. */
export const SMUGGLE_POUCH_ALARM_BONUS = 90;
/**
 * Ticks a Bargain Hunter at the door waits before its first wind-up, by floor.
 * It was 36 everywhere, so the janitor was out before the first charge;
 * upstairs the Hunters are already lining up a charge as you reach the door.
 */
export const ALARM_GUARD_BEAT_BY_FLOOR: Readonly<Record<FloorNumber, number>> = { 1: 24, 2: 18, 3: 12, 4: 6 };

export type ShutterState = 'open' | 'closed' | 'lifted';

export type StoreAlarm = {
  /** The store template the alarm belongs to. */
  readonly storeId: string;
  readonly roomIndex: number;
  /** Ticks until the shutter drops; 0 once it has. */
  ticksLeft: number;
  shutter: ShutterState;
};

export type GuardSpot = Vec2 & { readonly kind: SecurityKind };

type StoreShape = Pick<WingStoreInstance, 'bounds' | 'exit'>;

/**
 * Where security comes from. The alarm puts Bargain Hunters either side of the
 * door (inside the store) and Mannequins in the back corners; a lockdown sends
 * two more Hunters down the side aisles. A wanted janitor draws one more guard
 * per wave from three stars.
 */
export function alarmSpawnSpots(store: StoreShape, wanted: number, wave: 'alarm' | 'lockdown'): GuardSpot[] {
  const { x, y, width, height } = store.bounds;
  const exit = store.exit.bounds;
  if (wave === 'alarm') {
    const spots: GuardSpot[] = [
      { kind: 'shopper', x: exit.x - 36, y: exit.y - 34 },
      { kind: 'shopper', x: exit.x + exit.width + 36, y: exit.y - 34 },
      { kind: 'mannequin', x: x + 40, y: y + 44 },
      { kind: 'mannequin', x: x + width - 40, y: y + 44 },
    ];
    if (wanted >= 3) spots.push({ kind: 'shopper', x: x + width / 2, y: y + 44 });
    return spots;
  }
  const spots: GuardSpot[] = [
    { kind: 'shopper', x: x + 60, y: y + height / 2 },
    { kind: 'shopper', x: x + width - 60, y: y + height / 2 },
  ];
  if (wanted >= 3) spots.push({ kind: 'mannequin', x: x + width / 2, y: y + height / 2 });
  return spots;
}

/** How long this janitor has from the grab to the shutter. */
export function alarmTicksFor(state: MvpRunState): number {
  return ALARM_TICKS_BY_FLOOR[state.wing.floor ?? 1] + (runOwnsCapability(state, 'smuggle_pouch') ? SMUGGLE_POUCH_ALARM_BONUS : 0);
}

function currentStore(state: MvpRunState): WingStoreInstance | null {
  return activeStore(state);
}

function sendGuards(state: MvpRunState, store: WingStoreInstance, wave: 'alarm' | 'lockdown'): void {
  const combat = state.room.combat;
  for (const spot of alarmSpawnSpots(store, wantedStars(state.heat), wave)) {
    const id = combat.nextEntityId;
    combat.nextEntityId += 1;
    combat.enemies.push(spawnSecurityGuard(spot.kind, id, spot.x, spot.y, ALARM_GUARD_BEAT_BY_FLOOR[state.wing.floor ?? 1]));
  }
}

function sameRect(first: Rect, second: Rect): boolean {
  return first.x === second.x && first.y === second.y && first.width === second.width && first.height === second.height;
}

function insideStore(point: Vec2, bounds: Rect): boolean {
  return point.x > bounds.x && point.x < bounds.x + bounds.width && point.y > bounds.y && point.y < bounds.y + bounds.height;
}

/**
 * Takes an offer off the shelf and, on the first grab in this store, sounds
 * the alarm. A second grab during the alarm (the Fanny Pack's second hand)
 * neither restarts the clock nor calls more guards.
 */
export function stealRunOffer(state: MvpRunState, offerId: string): MvpCommandResult {
  const theft = beginRunTheft(state, offerId);
  if (!theft.accepted) return theft;
  const store = currentStore(state);
  if (store === null || state.alarm !== null) return theft;
  state.alarm = { storeId: store.templateId, roomIndex: state.roomIndex, ticksLeft: alarmTicksFor(state), shutter: 'open' };
  sendGuards(state, store, 'alarm');
  const message = `ALARM! Five-finger discount in ${store.name}: get out the door before the shutter drops.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/** The door secured the goods: the alarm is over (its guards are not). */
export function endStoreAlarm(state: MvpRunState, storeId: string): void {
  if (state.alarm?.storeId === storeId && !state.carried.some((theft) => theft.sourceStoreId === storeId)) {
    state.alarm = null;
  }
}

/** Advances the alarm one tick: the countdown, the shutter, and the lift. */
export function updateStoreAlarm(state: MvpRunState): void {
  const alarm = state.alarm;
  if (alarm === null) return;
  const store = currentStore(state);
  if (alarm.roomIndex !== state.roomIndex || store === null || store.templateId !== alarm.storeId) {
    state.alarm = null;
    return;
  }
  const combat = state.room.combat;
  const exit = store.exit.bounds;
  if (alarm.shutter === 'open') {
    if (alarm.ticksLeft > 0) alarm.ticksLeft -= 1;
    if (alarm.ticksLeft > 0) return;
    const player = combat.player;
    // Never drop a shutter on the janitor: it waits for the doorway to clear.
    if (circleIntersectsRect(player.x, player.y, player.radius, exit)) return;
    if (!insideStore(player, store.bounds)) {
      state.alarm = null;
      return;
    }
    alarm.shutter = 'closed';
    combat.walls.push({ ...exit });
    state.heat = Math.min(MAX_SECURITY_HEAT, state.heat + LOCKDOWN_HEAT);
    applyHeatFloor(state);
    sendGuards(state, store, 'lockdown');
    publishRunFeedback(state, `SHUTTER DOWN: locked in ${store.name} with security (+${LOCKDOWN_HEAT} Heat).`);
    return;
  }
  if (alarm.shutter === 'closed' && !hasLivingEnemies(combat)) {
    alarm.shutter = 'lifted';
    combat.walls = combat.walls.filter((wall) => !sameRect(wall, exit));
    publishRunFeedback(state, `Security is down. The ${store.name} shutter lifts.`);
  }
}
