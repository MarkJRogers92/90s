/**
 * The authoritative fixed-step update for the M5 MVP run.
 *
 * Deterministic tick stage order:
 *   1. held-action update;
 *   2. interaction/shopping (the Bench Warrant preview pauses the run here);
 *   3. carrier presence sync (the inventory decides whether a car exists);
 *   4. transition check;
 *   5. carrier update (independent seek and bump, or fused steering);
 *   6. combat tick (delegated to the shared `RunState` tick, fired from the
 *      fused carrier when the run owns one), then leash enforcement, tokens,
 *      and the Loss Prevention stalker (see stalker.ts);
 *   7. store boundary evaluation (exit crossing secures carried thefts and
 *      ends the store alarm, then the alarm counts down, drops or lifts the
 *      shutter; see heist.ts);
 *   8. room-clear evaluation (marks the room cleared and checkpoints it);
 *   9. terminal evaluation (publishes the win or death summary).
 *
 * The run owns movement cadence, contextual commands, transitions, the
 * economy, and the terminal outcome; Phaser only draws the result and converts
 * input. Room-local enemies, projectiles, surfaces, and the car are rebuilt
 * from the seed whenever the room changes and never carry across a doorway.
 */
import { compositeLeaves } from '../fusion/inventory';
import { circleIntersectsRect } from '../core/geometry';
import { cycleRunWeapon, selectRunWeaponSlot } from './weapons';
import { collectTokens, dropTokensForDeaths, markLivingEnemies } from './tokens';
import { collectItemDrops, dropItemsForDeaths } from './drops';
import { SPRINKLER_WET_TICKS, wingEventFor } from './wingEvents';
import { applyWet } from '../effects/statuses';
import { stepCombo } from './combo';
import { freezeDeep } from '../items/types';
import { LOCKER_SOURCE_LOCATION, roomClearHeal, runDashCooldown, runMaxHealth } from './perks';
import { ASSOCIATE_MOP_INSTANCE_ID } from './createMvpRun';
import type { Rect, Vec2 } from '../model';
import { crossedStoreExit } from '../shop/tickWingRun';
import { tickRun } from '../tickRun';
import type { WingDoorSide, WingRoomDefinition, WingStoreInstance } from '../wing/types';
import { openRunWorkbench } from './bench';
import { isBossKind } from '../combat/boss';
import {
  carrierAttackContext,
  enforceRunCarrierLeash,
  parkRunCarrier,
  recallRunCarrier,
  syncRunCarrier,
  updateRunCarrier,
} from './carrier';
import {
  buildRoomCombatState,
  clearRoomEnemies,
  hasLivingEnemies,
} from './rooms';
import {
  RUN_INTERACTION_RANGE,
  blockedRunReason,
  buyRunOffer,
  itemDefinitionName,
  publishRunFeedback,
  runOfferPrice,
  secureRunThefts,
  storeDefinitionOf,
} from './economy';
import { endStoreAlarm, stealRunOffer, updateStoreAlarm } from './heist';
import { layLow, wantedStars } from './wanted';
import { updateStalker } from './stalker';
import { nearArcadeCabinet, playArcadeCabinet, updateStoreTwist } from './storeTwists';
import { dropRunWeapon } from './resale';
import { activeStore, checkStoreEntrance, enterStore, leaveStore, roomStores, storeEntranceNear } from './storeInterior';
import type {
  MvpCommandResult,
  MvpInputFrame,
  MvpInteraction,
  MvpRunState,
} from './types';
import { spendCharge } from './perks';

/** Second Wind: one heart, and two seconds to get clear. */
export const SECOND_WIND_HEALTH = 2;
const SECOND_WIND_INVULNERABILITY = 120;

const NOTHING_NEARBY_LABEL = 'Nothing to interact with here.';

/** Clears persistent interaction levels after blur, pause, or a transition. */
export function clearMvpHeldActions(state: MvpRunState): void {
  state.heldActions = { interact: false, steal: false, recall: false };
}

function currentRoom(state: MvpRunState): WingRoomDefinition {
  return state.wing.rooms[state.roomIndex]!;
}

function distanceToPoint(first: Vec2, second: Vec2): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function distanceToRect(point: Vec2, rect: Rect): number {
  const closestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function rejected(reason: string): MvpCommandResult {
  return { accepted: false, reason };
}

/** The nearest available offer in the current room, within interaction range. */
export function nearestRunOffer(state: MvpRunState) {
  // The shelves are inside the store; from the concourse only the doors are.
  const store = activeStore(state);
  if (store === null) return undefined;
  const player = state.room.combat.player;
  return currentRoom(state)
    .offers.filter(
      (offer) =>
        offer.storeId === store.templateId &&
        (state.offerStatus[offer.id] ?? 'available') === 'available' &&
        distanceToPoint(player, offer.position) <= RUN_INTERACTION_RANGE,
    )
    .sort((first, second) => {
      const difference =
        distanceToPoint(player, first.position) - distanceToPoint(player, second.position);
      if (difference !== 0) {
        return difference;
      }
      return first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
    })[0];
}

function doorwayLabel(state: MvpRunState, side: WingDoorSide): string {
  const destinationIndex = side === 'east' ? state.roomIndex + 1 : state.roomIndex - 1;
  const destination = state.wing.rooms[destinationIndex];
  return destination ? `Door to the ${destination.name}` : 'Sealed doorway';
}

/**
 * The reason a doorway is closed, or null when the player may use it.
 *
 * Both doorways of a room that authors enemy spawns stay shut until every
 * enemy in it is down, so a fight cannot be walked out of in either direction.
 * The security office seals its west door permanently on entry. Safe rooms
 * (the service corridor and both storefronts) author no spawns, so their
 * doorways are always passable.
 */
function doorwayLockReason(state: MvpRunState, side: WingDoorSide): string | null {
  const room = currentRoom(state);
  if (side === 'west' && room.id === 'security_office') {
    return 'The office door sealed behind you.';
  }
  if (room.enemySpawns.length > 0 && hasLivingEnemies(state.room.combat)) {
    return 'The door is locked until every enemy in the room is down.';
  }
  return null;
}

/**
 * The single contextual interaction the run would act on: the nearest offer,
 * doorway, or Bench Warrant kiosk inside interaction range, ordered by
 * distance and then by a stable identifier.
 */
export function nearestMvpInteraction(state: MvpRunState): MvpInteraction {
  const room = currentRoom(state);
  const player = state.room.combat.player;
  const candidates: { distance: number; key: string; interaction: MvpInteraction }[] = [];

  const offer = nearestRunOffer(state);
  if (offer) {
    candidates.push({
      distance: distanceToPoint(player, offer.position),
      key: `offer:${offer.id}`,
      interaction: {
        kind: 'offer',
        offerId: offer.id,
        label: `${itemDefinitionName(offer.itemDefinitionId)} — $${runOfferPrice(state, offer)}`,
      },
    });
  }

  for (const doorway of room.doorways) {
    const distance = distanceToRect(player, doorway.rect);
    if (distance > RUN_INTERACTION_RANGE) {
      continue;
    }
    const lockedReason = doorwayLockReason(state, doorway.side);
    candidates.push({
      distance,
      key: `door:${doorway.side}`,
      interaction: {
        kind: 'door',
        side: doorway.side,
        label: doorwayLabel(state, doorway.side),
        locked: lockedReason !== null,
        lockedReason,
      },
    });
  }

  const shop = storeEntranceNear(state, RUN_INTERACTION_RANGE);
  const shopStore = shop === null ? undefined : roomStores(room)[shop];
  if (shop !== null && shopStore) {
    candidates.push({
      distance: Math.max(0, player.y - 26),
      key: `store:${shop}`,
      interaction: { kind: 'store', storeIndex: shop, label: `Enter the ${shopStore.name}` },
    });
  }

  if (nearArcadeCabinet(state)) {
    candidates.push({ distance: 0, key: 'cabinet', interaction: { kind: 'cabinet', label: 'Arcade cabinet' } });
  }

  if (room.benchKiosk) {
    const distance = distanceToPoint(player, room.benchKiosk);
    if (distance <= RUN_INTERACTION_RANGE) {
      candidates.push({
        distance,
        key: 'bench',
        interaction: { kind: 'bench', label: 'Bench Warrant kiosk' },
      });
    }
  }

  if (candidates.length === 0) {
    return { kind: 'none', label: NOTHING_NEARBY_LABEL };
  }

  candidates.sort((first, second) => {
    if (first.distance !== second.distance) {
      return first.distance - second.distance;
    }
    return first.key < second.key ? -1 : first.key > second.key ? 1 : 0;
  });
  return candidates[0]!.interaction;
}

/** Acts on the nearest contextual interaction, or rejects with the reason. */
export function tryInteract(state: MvpRunState): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const interaction = nearestMvpInteraction(state);
  switch (interaction.kind) {
    case 'offer':
      return buyRunOffer(state, interaction.offerId);
    case 'door':
      return enterDoorway(state, interaction.side);
    case 'bench':
      return openRunWorkbench(state);
    case 'store':
      return enterStore(state, interaction.storeIndex);
    case 'cabinet':
      return playArcadeCabinet(state);
    default:
      return rejected(NOTHING_NEARBY_LABEL);
  }
}

/**
 * Moves the run through one doorway.
 *
 * Both doorways of a room that authors enemy spawns stay locked until every
 * enemy in it is down, the security office seals permanently once entered, and
 * the destination room is rebuilt deterministically with the player's health
 * carried over.
 */
export function enterDoorway(state: MvpRunState, side: WingDoorSide): MvpCommandResult {
  const blocked = blockedRunReason(state);
  if (blocked) {
    return rejected(blocked);
  }

  const room = currentRoom(state);
  const doorway = room.doorways.find((entry) => entry.side === side);
  if (!doorway) {
    return rejected(`There is no ${side} door in the ${room.name}.`);
  }
  const lockedReason = doorwayLockReason(state, side);
  if (lockedReason) {
    return rejected(lockedReason);
  }

  const destinationIndex = side === 'east' ? state.roomIndex + 1 : state.roomIndex - 1;
  const destination = state.wing.rooms[destinationIndex];
  if (!destination) {
    return rejected('That doorway does not lead anywhere.');
  }

  const enteringFrom = side === 'east' ? ('west' as const) : ('east' as const);
  const health = state.room.combat.player.health;
  const combat = buildRoomCombatState(
    state.wing,
    destinationIndex,
    enteringFrom,
    state.inventory,
    state.seed,
    wantedStars(state.heat),
  );
  // The wrapped room tracks the run's tick so a room boundary is exactly
  // reproducible and a restored checkpoint resumes on the same tick.
  combat.tick = state.tick;
  combat.player.health = health;
  combat.behaviorTrace = state.behaviorTrace;
  if (state.clearedRooms.includes(destination.id)) {
    clearRoomEnemies(combat);
  }

  state.roomIndex = destinationIndex;
  state.room = {
    roomId: destination.id,
    variantId: destination.variantId,
    combat,
    cleared: !hasLivingEnemies(combat),
    enteredFrom: enteringFrom,
    tokens: [],
    interior: false,
    storeIndex: 0,
    twist: null,
  };
  state.checkpoint = { roomIndex: destinationIndex, tick: state.tick };
  state.alarm = null;
  // Loss Prevention does not walk through the door with you; he follows.
  state.stalker = null;
  clearMvpHeldActions(state);
  // The car follows the shift through the doorway by being re-parked at the
  // destination's deterministic spot, never by carrying a position across.
  parkRunCarrier(state);

  // A room already called "The ..." (a district's, round 50) keeps its own article.
  const message = `Entered ${/^the /i.test(destination.name) ? destination.name : `the ${destination.name}`}.`;
  publishRunFeedback(state, message);
  return { accepted: true, message };
}

/**
 * Walks the player through a doorway they have physically reached while moving
 * toward it. A rejected crossing stays silent so the feedback line is not
 * overwritten every tick by a locked door.
 */
function checkDoorwayCrossing(state: MvpRunState, input: MvpInputFrame): void {
  if (input.moveX === 0) {
    return;
  }
  const player = state.room.combat.player;
  for (const doorway of currentRoom(state).doorways) {
    const movingToward = doorway.side === 'east' ? input.moveX > 0 : input.moveX < 0;
    if (!movingToward) {
      continue;
    }
    if (!circleIntersectsRect(player.x, player.y, player.radius, doorway.rect)) {
      continue;
    }
    enterDoorway(state, doorway.side);
    return;
  }
}

/**
 * The recovery a cleared fight pays out, capped at the authored maximum.
 *
 * Published so the player can see why their health moved; clearing a room is
 * the only authored heal in the run.
 */
function healClearedRoom(state: MvpRunState): void {
  const player = state.room.combat.player;
  const before = player.health;
  const cap = runMaxHealth(state);
  player.health = Math.min(cap, player.health + roomClearHeal(state));
  const gained = player.health - before;
  const message =
    gained > 0
      ? `Cleared the ${currentRoom(state).name}; patched up +${gained} health (${player.health}/${cap}).`
      : `Cleared the ${currentRoom(state).name}; already at full health.`;
  publishRunFeedback(state, message);
}

/**
 * The shop door, from inside: walking out through it secures any carried
 * thefts, ends the alarm, and puts the janitor back on the concourse. Then
 * the alarm runs, for a janitor still inside.
 */
function evaluateStoreBoundary(state: MvpRunState, previousPosition: Vec2): void {
  const store: WingStoreInstance | null = activeStore(state);
  if (store) {
    const player = state.room.combat.player;
    if (crossedStoreExit(previousPosition, player, player.radius, storeDefinitionOf(store))) {
      let secured = false;
      if (state.carried.some((theft) => theft.sourceStoreId === store.templateId) && secureRunThefts(state, store, previousPosition).accepted) {
        endStoreAlarm(state, store.templateId);
        secured = true;
      }
      // A clean getaway keeps its own message on the log.
      leaveStore(state, !secured);
      return;
    }
  }
  updateStoreAlarm(state);
}

function evaluateRoomClear(state: MvpRunState): void {
  if (hasLivingEnemies(state.room.combat)) {
    return;
  }
  if (state.room.combat.status === 'won') {
    // The room outcome belongs to the run, not to the wrapped combat state.
    state.room.combat.status = 'playing';
  }
  if (!state.room.cleared) {
    state.room.cleared = true;
    // Only a room that authored a fight pays out recovery. The service corridor
    // and the storefronts author no spawns and are enemy-free the moment they
    // are entered, so healing them would be a free +2 per doorway instead of
    // per fight.
    if (currentRoom(state).enemySpawns.length > 0) {
      healClearedRoom(state);
      // Laying low: a fight cleared is Heat shed, down to the hot-goods floor.
      const shed = layLow(state);
      if (shed > 0) publishRunFeedback(state, `Laying low: -${shed} Heat.`);
    }
    if (state.room.roomId !== 'security_office') {
      state.checkpoint = { roomIndex: state.roomIndex, tick: state.tick };
    }
  }
  if (!state.clearedRooms.includes(state.room.roomId)) {
    state.clearedRooms.push(state.room.roomId);
  }
}

function publishSummary(state: MvpRunState, status: 'won' | 'dead'): void {
  const leaves = state.inventory.inventory.flatMap((node) =>
    compositeLeaves(node),
  );
  state.status = status;
  state.summary = freezeDeep({
    seed: state.seed,
    status,
    roomIndex: state.roomIndex,
    roomsCleared: state.clearedRooms.length,
    purchasedInstanceIds: leaves
      // The issued mop and the locker item were the janitor's own, not bought on shift.
      .filter((leaf) => leaf.acquisitionKind === 'purchased' && leaf.sourceLocationId !== LOCKER_SOURCE_LOCATION && leaf.instanceId !== ASSOCIATE_MOP_INSTANCE_ID)
      .map((leaf) => leaf.instanceId),
    stolenInstanceIds: leaves
      .filter((leaf) => leaf.acquisitionKind === 'stolen')
      .map((leaf) => leaf.instanceId),
    cash: state.cash,
    heat: state.heat,
    tick: state.tick,
  });
  const message =
    status === 'won'
      ? `Night shift survived with $${state.cash} and ${state.heat} Heat.`
      : `The shift ended in the ${currentRoom(state).name}.`;
  publishRunFeedback(state, message);
}

/**
 * True once the boss room's Loss Prevention Manager is down.
 *
 * The run is won by killing the boss, not by emptying the room: the Hangers it
 * summons in phase 3 may still be standing. The boss room is the only room
 * that authors a boss anchor, so no other room can end the run this way.
 */
function bossDefeated(state: MvpRunState): boolean {
  if (currentRoom(state).bossAnchor === null) {
    return false;
  }
  // A first wing's last room is the Lockdown: won when its whole wave is down (round 45).
  if (state.wing.part === 1) return !hasLivingEnemies(state.room.combat);
  return !state.room.combat.enemies.some(
    (enemy) => isBossKind(enemy.kind) && enemy.health > 0,
  );
}

function evaluateTerminal(state: MvpRunState): void {
  // Second Wind (a Break Room perk): the first fatal hit of the night leaves one heart.
  if (state.room.combat.player.health <= 0 && state.status === 'playing' && spendCharge(state, 'secondWinds')) {
    state.room.combat.player.health = SECOND_WIND_HEALTH;
    state.room.combat.player.invulnerableTicks = SECOND_WIND_INVULNERABILITY;
    publishRunFeedback(state, 'SECOND WIND! Back on your feet with one heart.');
  }
  if (state.room.combat.player.health <= 0) {
    if (state.status === 'playing') {
      publishSummary(state, 'dead');
    }
    return;
  }
  if (bossDefeated(state)) {
    state.checkpoint = null;
    if (state.status === 'playing') {
      publishSummary(state, 'won');
    }
  }
}

/** Applies exactly one deterministic run tick. */
export function tickMvpRun(state: MvpRunState, input: MvpInputFrame): void {
  if (state.status !== 'playing') {
    return;
  }
  if (state.paused || state.preview !== null || state.workbench !== null) {
    // An open Bench Warrant preview always halts the run, not only while it has
    // set `paused`. Otherwise clearing `paused` from outside the sim (the
    // scene's Escape handler does exactly that) would resume live combat behind
    // a panel that still claims the preview is open.
    state.heldActions = {
      interact: input.interact,
      steal: input.steal,
      recall: input.recall,
    };
    return;
  }

  state.tick += 1;

  // 1. Held-action update.
  const interactPressed = input.interact && !state.heldActions.interact;
  const stealPressed = input.steal && !state.heldActions.steal;
  const recallPressed = input.recall && !state.heldActions.recall;
  state.heldActions = {
    interact: input.interact,
    steal: input.steal,
    recall: input.recall,
  };

  // 2. Interaction and shopping.
  state.recentChange = '';
  let preserveActionFeedback = false;
  if (interactPressed) {
    const interaction = tryInteract(state);
    preserveActionFeedback = !interaction.accepted;
    if (!interaction.accepted) {
      // An interaction refusal is edge-triggered, so it happens once per press
      // and cannot spam. Publishing it keeps a key that does nothing from
      // reading as a broken key, which is what a silent rejection looks like.
      publishRunFeedback(state, interaction.reason);
    }
    // Opening the Bench Warrant preview pauses the shift for this tick and the
    // ones after it, so the proposal is read rather than played past.
    if (state.preview !== null || state.workbench !== null) {
      return;
    }
  } else if (stealPressed) {
    const offer = nearestRunOffer(state);
    if (offer) {
      const theft = stealRunOffer(state, offer.id);
      preserveActionFeedback = !theft.accepted;
      if (!theft.accepted) {
        publishRunFeedback(state, theft.reason);
      }
    }
  } else if (recallPressed) {
    recallRunCarrier(state);
  }
  // Weapon switching is a discrete event from the adapter (a number key, Q or
  // the wheel), so it needs no held-state edge detection.
  if (input.selectSlot !== undefined && input.selectSlot > 0) {
    selectRunWeaponSlot(state, input.selectSlot);
  } else if (input.cycleWeapon !== undefined && input.cycleWeapon !== 0) {
    cycleRunWeapon(state, input.cycleWeapon);
  } else if (input.drop === true) {
    dropRunWeapon(state);
  }

  // 3. Carrier presence follows the inventory, so a purchase in stage 2 brings
  //    the car into the run on the same tick it is bought.
  syncRunCarrier(state);

  // 4. Transition check: the room's doorways, and the shop door on its back wall.
  checkDoorwayCrossing(state, input);
  checkStoreEntrance(state, input.moveY);

  // 5. Carrier update: independent seek and bump, or fused pointer steering.
  updateRunCarrier(state, input);

  // 6. Combat tick, fired from the fused carrier when the run owns one.
  const previousPosition = {
    x: state.room.combat.player.x,
    y: state.room.combat.player.y,
  };
  // Sprinklers (a floor event): everyone is soaked before the blows land, so they conduct.
  if (wingEventFor(state.wing) === 'sprinklers') {
    for (const enemy of state.room.combat.enemies) if (enemy.health > 0) applyWet(enemy, SPRINKLER_WET_TICKS);
  }
  const livingBeforeCombat = markLivingEnemies(state);
  const healthBeforeCombat = state.room.combat.player.health;
  tickRun(
    state.room.combat,
    {
      moveX: input.moveX,
      moveY: input.moveY,
      aimX: input.aimX,
      aimY: input.aimY,
      fire: input.fire,
      dash: input.dash === true,
    },
    carrierAttackContext(state),
    { dashCooldownTicks: runDashCooldown(state) },
  );
  enforceRunCarrierLeash(state);

  // 6b. Mall Tokens: fallen monsters drop change; the janitor sweeps it up.
  dropTokensForDeaths(state, livingBeforeCombat);
  // Round 32: now and then an item, and from every boss a rare.
  dropItemsForDeaths(state, livingBeforeCombat);
  // 6c. Cleanup Combo: blows landed, kills, and whether the janitor was hurt.
  {
    const after = new Map(state.room.combat.enemies.map((enemy) => [enemy.id, enemy.health]));
    let hits = 0;
    let kills = 0;
    for (const marker of livingBeforeCombat) {
      const now = after.get(marker.id);
      if (now === undefined || now <= 0) kills += marker.health > 0 ? 1 : 0;
      if ((now ?? 0) < marker.health) hits += 1;
    }
    stepCombo(state, { hits, kills, hurt: state.room.combat.player.health < healthBeforeCombat });
  }
  collectTokens(state);
  collectItemDrops(state);
  // 6d. The store's twist: butter, rolling carts, waking displays.
  updateStoreTwist(state, previousPosition);
  // 6e. Loss Prevention: a four-star janitor is hunted from room to room.
  updateStalker(state);

  // 7. Store boundary evaluation.
  evaluateStoreBoundary(state, previousPosition);

  // 8. Room-clear evaluation.
  evaluateRoomClear(state);

  // 9. Terminal evaluation.
  evaluateTerminal(state);
}
