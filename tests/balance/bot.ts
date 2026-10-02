/**
 * The balance bot: a scripted janitor that plays Night Shift through the same
 * `tickMvpRun` input the keyboard feeds, so a seeded night can be replayed
 * thousands of times without a browser or a human.
 *
 * It is a measuring stick, not a good player. The skill levels bracket the
 * difficulty: `naive` walks up to the nearest monster and swings; `dodger`
 * also sidesteps (and dashes from) any monster that is winding up; `pro` also
 * steps out of the way of incoming shots and backs off while its swing
 * recovers; `expert` plays like `pro` but checks every heading against every
 * charge lane, slam and shot together before it moves (see danger.ts). If even
 * the naive bot wins every night, the game is too easy; if the expert loses
 * every night, it is too hard. The honest answer lives between them, and a
 * human is somewhere in that band.
 *
 * Left out on purpose: stealing, the Bench Warrant, the arcade cabinet and the
 * secret room. Each is a policy to add once the baseline is trusted.
 */
import { calmWalker } from '../../src/sim/combat/walker';
import type { EnemyState, Vec2 } from '../../src/sim/model';
import { definitionFor } from '../../src/sim/items/registry';
import { RUN_INTERACTION_RANGE, runOfferPrice } from '../../src/sim/run/economy';
import { hasLivingEnemies } from '../../src/sim/run/rooms';
import { INTERIOR_EXIT, STORE_ENTRANCE_Y, activeStore, roomStores, storeEntrance } from '../../src/sim/run/storeInterior';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';
import { SHORTCUT_HATCH, SHORTCUT_REACH, shortcutHere } from '../../src/sim/run/shortcut';
import { runWeaponSlots } from '../../src/sim/run/weapons';
import type { WingOffer } from '../../src/sim/wing/types';
import { dangersOf, escapeFrom, MODELLED_KINDS, type Danger, type Escape } from './danger';
import { Navigator } from './path';

export type BotSkill = 'naive' | 'dodger' | 'pro' | 'expert';
/** `none` never enters a store; `buy` visits every store and buys the dearest thing it can pay for. */
export type BotShop = 'none' | 'buy';
/** `long` always takes the doors; `shortcut` crawls through the staff passage whenever the wing has one. */
export type BotRoute = 'long' | 'shortcut';
export type BotOptions = {
  readonly skill: BotSkill;
  readonly shop: BotShop;
  readonly route?: BotRoute;
  /**
   * The expert's reaction delay, in ticks (60 a second): a hazard is unknown to
   * it until it has been in view this long, as it is to a person who has to
   * notice a wind-up and decide which way to go. 0 (the default) sees
   * everything at once.
   */
  readonly reaction?: number;
  /** Whether the expert uses the dash to get out of trouble (default yes). */
  readonly dashes?: boolean;
};

export type BotMemory = {
  /** Where the janitor was a short while ago, to notice being wedged on a prop. */
  anchor: Vec2 | null;
  anchorTick: number;
  /** Ticks left on a sideways shuffle that gets the janitor off whatever it caught on. */
  wiggleTicks: number;
  wiggleSign: 1 | -1;
  /** Stores already shopped, as `seed:room:store`, so each is visited once. */
  visited: Set<string>;
  readonly nav: Navigator;
  /** Total health left across the room's enemies, and the tick it last changed: a fight that goes nowhere. */
  enemyHealth: number;
  enemyHealthTick: number;
  /** The expert's way out chosen last tick, kept while it is still as good as any (see danger.ts). */
  escape: Escape | null;
  /** The tick each danger was first in view, by `Danger.key`, for the reaction delay. */
  seen: Map<string, number>;
  /** Which rule chose the last fight move (for analysis: shot, wind-up, retreat, unjam or approach). */
  branch: string;
};

export const newBotMemory = (): BotMemory => ({ anchor: null, anchorTick: 0, wiggleTicks: 0, wiggleSign: 1, visited: new Set(), nav: new Navigator(), enemyHealth: -1, enemyHealthTick: 0, escape: null, seen: new Map(), branch: '' });

const IDLE: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** How far a ranged weapon is trusted to carry (projectile lifetimes vary), and the width a clear line must have: the widest shot (radius 10) plus a pixel, a swing's thin arc. */
const RANGED_REACH = 170;
const SHOT_RADIUS = 11;
const SWING_RADIUS = 4;
/** A wind-up this close is worth leaving the way of. */
const DODGE_RANGE = 150;
/** A dash only helps when the blow is nearly on the janitor. */
const DASH_RANGE = 95;
/** How soon (ticks) a shot must arrive to be worth dodging, and the extra clearance wanted. */
const SHOT_LOOKAHEAD = 40;
const SHOT_MARGIN = 14;
/** Hit and run: back off when a monster is this close and the swing has not recovered. */
const RETREAT_RANGE = 52;
/** A fight with no damage dealt for this long is jammed (a monster wedged on a pillar corner): circle it to open a line. */
const JAMMED_TICKS = 600;
/** Ticks between checks for being stuck, and how little movement counts as stuck. */
const STUCK_WINDOW = 24;
const STUCK_DISTANCE = 2;
const WIGGLE_TICKS = 22;

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

function toward(from: Vec2, to: Vec2): Vec2 {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return length < 1e-6 ? { x: 0, y: 0 } : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

/** Wedged on something: after a while without moving, shuffle sideways to the goal for a moment. */
function steer(state: MvpRunState, memory: BotMemory, goal: Vec2, wantsToMove: boolean): Vec2 {
  const player = state.room.combat.player;
  if (memory.anchor === null || state.tick - memory.anchorTick >= STUCK_WINDOW) {
    if (wantsToMove && memory.anchor !== null && distance(memory.anchor, player) < STUCK_DISTANCE) {
      memory.wiggleTicks = WIGGLE_TICKS;
      memory.wiggleSign = memory.wiggleSign === 1 ? -1 : 1;
    }
    memory.anchor = { x: player.x, y: player.y };
    memory.anchorTick = state.tick;
  }
  if (!wantsToMove) return { x: 0, y: 0 };
  const direction = memory.nav.direction(state.room.combat.walls, player.radius, player, goal) ?? toward(player, goal);
  if (memory.wiggleTicks > 0) {
    memory.wiggleTicks -= 1;
    return { x: -direction.y * memory.wiggleSign, y: direction.x * memory.wiggleSign };
  }
  return direction;
}

/** Damage per second of a definition's own attack: how the bot ranks weapons. */
function weaponScore(itemDefinitionId: string): number {
  const base = definitionFor(itemDefinitionId)?.base;
  return base === undefined ? 0 : (base.damage * 60) / base.cooldownTicks;
}

/** Equips the strongest weapon owned, once; returns the slot to switch to, if any. */
function bestWeaponSlot(state: MvpRunState): number | undefined {
  const weapons = runWeaponSlots(state);
  if (weapons.length < 2) return undefined;
  const best = weapons.reduce((leader, weapon) => (weaponScore(weapon.itemDefinitionId) > weaponScore(leader.itemDefinitionId) ? weapon : leader));
  return best.instanceId === state.inventory.selectedPrimaryInstanceId ? undefined : best.slot;
}

function fight(state: MvpRunState, memory: BotMemory, options: BotOptions): MvpInputFrame {
  const combat = state.room.combat;
  const player = combat.player;
  const living = combat.enemies.filter((enemy) => enemy.health > 0);
  const awake = living.filter((enemy) => !enemy.dormant && !calmWalker(enemy));
  const targets = awake.length > 0 ? awake : living;
  const nearest = targets.reduce<EnemyState | null>((best, enemy) => (best === null || distance(enemy, player) < distance(best, player) ? enemy : best), null);
  if (nearest === null) return IDLE;

  const primary = combat.compiledLoadout.primary;
  const ranged = primary.delivery === 'projectile';
  const reach = ranged ? RANGED_REACH : Math.max(40, primary.range - 14);
  const aim = { aimX: nearest.x, aimY: nearest.y, fire: true };
  // A wall stops a shot and a swing alike, and monsters jam against pillar corners: keep closing until the target is in the open.
  const sees = Navigator.lineClear(combat.walls, ranged ? SHOT_RADIUS : SWING_RADIUS, player, nearest);

  if (options.skill === 'pro') {
    const shot = incomingShot(state);
    if (shot !== null) {
      memory.branch = 'shot';
      const dash = shot.imminent && (player.dashCooldownTicks ?? 0) === 0;
      return { ...IDLE, ...aim, moveX: shot.dodge.x, moveY: shot.dodge.y, dash, ...(bestSlotFrame(state)) };
    }
  }

  if (options.skill !== 'naive') {
    // The expert answers the monsters danger.ts models by lookahead, so the fixed rule leaves them alone.
    const winding = targets.filter((enemy) => enemy.phase === 'telegraph' && distance(enemy, player) < DODGE_RANGE && !(options.skill === 'expert' && MODELLED_KINDS.has(enemy.kind)));
    if (winding.length > 0) {
      memory.branch = 'windup';
      const threat = winding.reduce((best, enemy) => (distance(enemy, player) < distance(best, player) ? enemy : best));
      // Step across the line of the blow, not away along it.
      const away = toward(threat, player);
      const side = { x: -away.y, y: away.x };
      const sign = memory.wiggleSign;
      const move = { x: (side.x * sign + away.x * 0.4), y: (side.y * sign + away.y * 0.4) };
      const dash = distance(threat, player) < DASH_RANGE && (player.dashCooldownTicks ?? 0) === 0;
      return { ...IDLE, ...aim, moveX: move.x, moveY: move.y, dash, ...(bestSlotFrame(state)) };
    }
  }

  const gap = distance(nearest, player);
  const health = living.reduce((sum, enemy) => sum + enemy.health, 0);
  if (health !== memory.enemyHealth) {
    memory.enemyHealth = health;
    memory.enemyHealthTick = state.tick;
  }
  if (state.tick - memory.enemyHealthTick > JAMMED_TICKS) {
    memory.branch = 'unjam';
    const angle = state.tick / 45;
    const around = { x: nearest.x + Math.cos(angle) * 90, y: nearest.y + Math.sin(angle) * 90 };
    const move = steer(state, memory, around, true);
    return { ...IDLE, ...aim, moveX: move.x, moveY: move.y, ...(bestSlotFrame(state)) };
  }
  // Hit and run: while the swing recovers, give the monster room instead of trading blows.
  if ((options.skill === 'pro' || options.skill === 'expert') && !ranged && gap < RETREAT_RANGE && player.attackCooldownTicks > 5) {
    memory.branch = 'retreat';
    const away = toward(nearest, player);
    return { ...IDLE, ...aim, moveX: away.x, moveY: away.y, ...(bestSlotFrame(state)) };
  }
  memory.branch = 'approach';
  const move = steer(state, memory, nearest, gap > reach || !sees);
  return { ...IDLE, ...aim, moveX: move.x, moveY: move.y, ...(bestSlotFrame(state)) };
}

/**
 * The nearest enemy shot that will pass close to the janitor soon, and which
 * way to step to be out of its path (across it, to the side the janitor is
 * already on). `imminent` means it lands within a few ticks: time to dash.
 */
function incomingShot(state: MvpRunState): { readonly dodge: Vec2; readonly imminent: boolean } | null {
  const combat = state.room.combat;
  const player = combat.player;
  let best: { dodge: Vec2; imminent: boolean; when: number } | null = null;
  for (const shot of combat.projectiles) {
    if (shot.faction !== 'enemy') continue;
    const speedSquared = shot.velocityX * shot.velocityX + shot.velocityY * shot.velocityY;
    if (speedSquared < 1e-6) continue;
    const rx = player.x - shot.x;
    const ry = player.y - shot.y;
    const when = Math.max(0, Math.min(shot.remainingTicks, (rx * shot.velocityX + ry * shot.velocityY) / speedSquared));
    if (when > SHOT_LOOKAHEAD) continue;
    const missX = rx - shot.velocityX * when;
    const missY = ry - shot.velocityY * when;
    const miss = Math.hypot(missX, missY);
    if (miss > player.radius + shot.radius + SHOT_MARGIN) continue;
    // Step along the miss vector (away from the shot's line); if dead centre, take either side.
    const speed = Math.sqrt(speedSquared);
    const side = miss < 1e-3 ? { x: -shot.velocityY / speed, y: shot.velocityX / speed } : { x: missX / miss, y: missY / miss };
    if (best === null || when < best.when) best = { dodge: side, imminent: when < 7, when };
  }
  return best === null ? null : { dodge: best.dodge, imminent: best.imminent };
}

function bestSlotFrame(state: MvpRunState): { selectSlot?: number } {
  const slot = bestWeaponSlot(state);
  return slot === undefined ? {} : { selectSlot: slot };
}

/** A rising edge every other tick: the sim acts on a press, not a hold. */
const pulse = (state: MvpRunState): boolean => state.tick % 2 === 0;

function shopInside(state: MvpRunState, memory: BotMemory): MvpInputFrame {
  const store = activeStore(state);
  const room = state.wing.rooms[state.roomIndex]!;
  const player = state.room.combat.player;
  memory.visited.add(`${state.seed}:${state.roomIndex}:${state.room.storeIndex}`);
  const affordable: WingOffer[] =
    store === null
      ? []
      : room.offers
          .filter((offer) => offer.storeId === store.templateId && (state.offerStatus[offer.id] ?? 'available') === 'available')
          .filter((offer) => runOfferPrice(state, offer) <= state.cash)
          .sort((a, b) => runOfferPrice(state, b) - runOfferPrice(state, a) || (a.id < b.id ? -1 : 1));
  const pick = affordable[0];
  if (pick !== undefined) {
    const near = distance(player, pick.position) <= RUN_INTERACTION_RANGE - 6;
    const move = steer(state, memory, pick.position, !near);
    return { ...IDLE, moveX: move.x, moveY: move.y, interact: near && pulse(state), ...(bestSlotFrame(state)) };
  }
  // Nothing more to buy: out through the shop door in the front wall.
  const exit = store?.exit.bounds ?? INTERIOR_EXIT;
  const door = { x: exit.x + exit.width / 2, y: exit.y + exit.height + 20 };
  const move = steer(state, memory, door, true);
  return { ...IDLE, moveX: move.x, moveY: move.y, ...(bestSlotFrame(state)) };
}

/** The next store on this concourse the bot has not shopped yet, or null. */
function unvisitedStore(state: MvpRunState, memory: BotMemory): number | null {
  const room = state.wing.rooms[state.roomIndex]!;
  const stores = roomStores(room);
  for (let index = 0; index < stores.length; index += 1) {
    if (!memory.visited.has(`${state.seed}:${state.roomIndex}:${index}`)) return index;
  }
  return null;
}

function leaveRoom(state: MvpRunState, memory: BotMemory): MvpInputFrame {
  const room = state.wing.rooms[state.roomIndex]!;
  const door = room.doorways.find((doorway) => doorway.side === 'east');
  if (door === undefined) return IDLE;
  const goal = { x: door.rect.x + door.rect.width / 2, y: door.rect.y + door.rect.height / 2 };
  const move = steer(state, memory, goal, true);
  // The sim walks a janitor through a doorway they push into, east-ward.
  return { ...IDLE, moveX: Math.max(move.x, 0.05), moveY: move.y, ...(bestSlotFrame(state)) };
}

/**
 * One tick of the bot's decision, from authoritative state alone. The `expert`
 * decides what it wants exactly as the `pro` does (approach, retreat, shop,
 * walk to the door), then checks that heading against every lane, slam, fuse
 * and shot at once (see danger.ts) and swaps in the safest way if the wanted one
 * would be hit. The check covers every decision, not just fights: a Volatile
 * elite's fuse is still burning after the room has been cleared.
 */
export function botInput(state: MvpRunState, memory: BotMemory, options: BotOptions): MvpInputFrame {
  const wanted = decide(state, memory, options);
  if (options.skill !== 'expert') return wanted;
  const length = Math.hypot(wanted.moveX, wanted.moveY);
  const intended = length > 1e-6 ? { x: wanted.moveX / length, y: wanted.moveY / length } : null;
  const combat = state.room.combat;
  const escape = escapeFrom(combat, knownDangers(memory, dangersOf(combat), combat.tick, options.reaction ?? 0), intended, memory.escape, options.dashes !== false);
  memory.escape = escape;
  if (escape === null) return wanted;
  memory.branch = 'safety';
  return { ...wanted, moveX: escape.heading?.x ?? 0, moveY: escape.heading?.y ?? 0, dash: escape.dash };
}

/**
 * The dangers the expert has had in view for at least `reaction` ticks. A new
 * key starts its clock; one that is gone (it landed, or the monster fell)
 * stops being remembered.
 */
function knownDangers(memory: BotMemory, dangers: readonly Danger[], tick: number, reaction: number): Danger[] {
  const present = new Set(dangers.map((danger) => danger.key));
  for (const key of memory.seen.keys()) if (!present.has(key)) memory.seen.delete(key);
  for (const danger of dangers) if (!memory.seen.has(danger.key)) memory.seen.set(danger.key, tick);
  return dangers.filter((danger) => tick - memory.seen.get(danger.key)! >= reaction);
}

function decide(state: MvpRunState, memory: BotMemory, options: BotOptions): MvpInputFrame {
  if (state.room.interior) return shopInside(state, memory);
  if (hasLivingEnemies(state.room.combat)) return fight(state, memory, options);
  if (options.shop === 'buy') {
    const index = unvisitedStore(state, memory);
    if (index !== null) {
      const door = storeEntrance(index);
      const player = state.room.combat.player;
      // Get to just under the shop door, then push north into it.
      const under = { x: door.x, y: STORE_ENTRANCE_Y + 12 };
      if (Math.abs(player.x - door.x) < 16 && player.y < 70) return { ...IDLE, moveY: -1, ...(bestSlotFrame(state)) };
      const move = steer(state, memory, under, true);
      return { ...IDLE, moveX: move.x, moveY: move.y, ...(bestSlotFrame(state)) };
    }
  }
  if (options.route === 'shortcut' && shortcutHere(state)) {
    // Crawl in: stand just under the hatch and press E.
    const player = state.room.combat.player;
    const under = { x: SHORTCUT_HATCH.x, y: SHORTCUT_HATCH.y + 24 };
    const near = Math.hypot(player.x - SHORTCUT_HATCH.x, player.y - SHORTCUT_HATCH.y) <= SHORTCUT_REACH - 8;
    const move = steer(state, memory, under, !near);
    return { ...IDLE, moveX: move.x, moveY: move.y, interact: near && pulse(state), ...(bestSlotFrame(state)) };
  }
  return leaveRoom(state, memory);
}
