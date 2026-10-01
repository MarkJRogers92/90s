/**
 * What the in-canvas HUD shows, derived from authoritative run state.
 *
 * Pure: no Phaser, no DOM. The HUD renderer draws this model and nothing else,
 * so every heart, checkbox and minimap cell is traceable to a simulation field
 * and the whole thing is unit-testable.
 */
import { compositeLeaves, isCleanPart } from '../../sim/fusion/inventory';
import { runMaxHealth } from '../../sim/run/perks';
import { bossConfigFor, bossPhaseForHealth, isBossKind } from '../../sim/combat/boss';
import { PLAYER_MAX_HEALTH } from '../../sim/run/rooms';
import type { MvpRunState } from '../../sim/run/types';
import type { WingRoomId } from '../../sim/wing/types';
import {
  itemDefinitionName,
  runCarryLimit,
  runOfferPrice,
  runOwnsCapability,
} from '../../sim/run/economy';
import { ITEM_CATALOG } from '../../sim/items/catalog';
import { COMBO_MILESTONE, COMBO_WINDOW_TICKS, comboBonusFor } from '../../sim/run/combo';
import { blueLightOfferId, roomEventFor } from '../../sim/run/roomEvents';
import { CLEARANCE_PRICE_SCALE, wingEventFor } from '../../sim/run/wingEvents';
import { alarmTicksFor } from '../../sim/run/heist';
import { hotHeatFloor, hotItemCount, isHotNode, wantedStars } from '../../sim/run/wanted';
import { STALKER_MIN_STARS } from '../../sim/run/stalker';
import { activeStore, roomStores } from '../../sim/run/storeInterior';
import { nearestMvpInteraction } from '../../sim/run/tickMvpRun';
import { runPassiveItems, runWeaponSlots } from '../../sim/run/weapons';
import { itemBlurb } from './itemBlurbs';
import { floorNumberOf, floorSpec, type FloorNumber } from '../../sim/wing/floorSpecs';
import { signatureName } from '../../sim/fusion/hybrid';
import { PAIR_DEAL_SCALE, holdsPairPartner } from '../../sim/run/economy';
import type { WingOffer } from '../../sim/wing/types';

export type HeartState = 'full' | 'half' | 'empty';

export type HudObjective = { readonly text: string; readonly done: boolean };

export type HudAlarm = {
  readonly secondsLeft: number;
  readonly shutter: 'open' | 'closed' | 'lifted';
  readonly store: string;
};

export type HudRoomCell = {
  readonly id: WingRoomId;
  readonly short: string;
  readonly state: 'cleared' | 'current' | 'ahead';
  readonly boss: boolean;
  readonly store: boolean;
};

export type HudSlot = {
  readonly instanceId: string;
  readonly itemDefinitionId: string;
  readonly selected: boolean;
  readonly fused: boolean;
  readonly stolen: boolean;
  /** Stolen and still unfused: +1 damage, and it keeps the janitor wanted. */
  readonly hot: boolean;
};

export type HudWeapon = {
  readonly slot: number;
  readonly instanceId: string;
  readonly itemDefinitionId: string;
  readonly name: string;
  readonly selected: boolean;
  readonly fused: boolean;
  readonly hot: boolean;
};

export type HudPassive = { readonly instanceId: string; readonly itemDefinitionId: string; readonly name: string };

/** What pressing a key would do right now, spelled out with the key. */
export type HudOfferDetail = {
  readonly itemDefinitionId: string;
  readonly blurb: string;
  readonly kind: 'WEAPON' | 'PASSIVE';
  /** Why you cannot buy, or what stealing it will cost. */
  readonly note: string;
  readonly canBuy: boolean;
  /** A recipe-hint half: what the pair makes, and the deal once it applies. */
  readonly pair?: string;
};

export type HudPrompt = {
  readonly keys: ReadonlyArray<{ key: string; action: string; disabled?: boolean }>;
  readonly subject: string;
  readonly detail?: HudOfferDetail;
} | null;

export type GameHudModel = {
  readonly hearts: readonly HeartState[];
  readonly cash: number;
  readonly heat: number;
  /** Wanted stars, 0 to 5. */
  readonly wanted: number;
  /** The live store alarm, for the big banner. */
  readonly alarm: HudAlarm | null;
  readonly objectives: readonly HudObjective[];
  readonly rooms: readonly HudRoomCell[];
  readonly hotbar: readonly HudSlot[];
  readonly carriedCount: number;
  readonly boss: { readonly health: number; readonly max: number; readonly phase: number; readonly name: string } | null;
  /** Which floor of the night (1 is the ground floor). */
  readonly floor: FloorNumber;
  readonly enemiesLeft: number;
  readonly weapons: readonly HudWeapon[];
  readonly passives: readonly HudPassive[];
  readonly equipped: { readonly name: string; readonly blurb: string } | null;
  readonly prompt: HudPrompt;
  /** The live Cleanup Combo, once it is worth showing (2+). */
  readonly combo: { readonly count: number; readonly remaining: number; readonly nextBonusAt: number; readonly nextBonus: number } | null;
};

const GROUND_SHORT_NAMES: Readonly<Record<WingRoomId, string>> = {
  service_corridor: 'CONCOURSE',
  storefront_a: 'WEST SHOPS',
  food_court: 'FOOD COURT',
  storefront_b: 'EAST SHOPS',
  back_hall: 'SERVICE HALL',
  security_office: 'SECURITY',
};

const UPSTAIRS_SHORT_NAMES: Readonly<Record<WingRoomId, string>> = {
  service_corridor: 'LANDING',
  storefront_a: 'WEST WING',
  food_court: 'CINEMA',
  storefront_b: 'EAST WING',
  back_hall: 'STAIRWELL',
  security_office: 'MANAGEMENT',
};

const TOP_FLOOR_SHORT_NAMES: Readonly<Record<WingRoomId, string>> = {
  service_corridor: 'SEATING',
  storefront_a: 'PIZZA',
  food_court: 'ARCADE',
  storefront_b: 'KITCHEN',
  back_hall: 'DOCK',
  security_office: "OWNER'S",
};

const ROOF_SHORT_NAMES: Readonly<Record<WingRoomId, string>> = {
  service_corridor: 'ACCESS',
  storefront_a: 'SKYLIGHTS',
  food_court: 'HVAC',
  storefront_b: 'BILLBOARD',
  back_hall: 'TOWER',
  security_office: 'HELIPAD',
};

/**
 * A first wing (round 45): its map names from the floor table (the first word
 * of each), the last room marked LOCKDOWN, and the Lockdown objectives.
 */
function firstWingHud(floor: FloorNumber): { readonly short: Readonly<Record<WingRoomId, string>>; readonly reach: string; readonly boss: string } {
  const names = floorSpec(floor).firstWingNames;
  const short = Object.fromEntries(Object.entries(names).map(([id, name]) => [id, id === 'security_office' ? 'LOCKDOWN' : name.split(' ')[0]!.toUpperCase()])) as Record<WingRoomId, string>;
  return { short, reach: 'REACH THE LOCKDOWN', boss: 'SURVIVE THE LOCKDOWN' };
}

/** Each floor's map names and its two objectives: reach the boss, then beat it. */
const FLOOR_HUD: Readonly<Record<FloorNumber, { readonly short: Readonly<Record<WingRoomId, string>>; readonly reach: string; readonly boss: string }>> = {
  1: { short: GROUND_SHORT_NAMES, reach: 'REACH SECURITY', boss: 'STOP LOSS PREVENTION' },
  2: { short: UPSTAIRS_SHORT_NAMES, reach: 'REACH MANAGEMENT', boss: 'FIRE THE MANAGER' },
  3: { short: TOP_FLOOR_SHORT_NAMES, reach: 'REACH THE OWNER', boss: 'TAKE DOWN THE OWNER' },
  4: { short: ROOF_SHORT_NAMES, reach: 'REACH THE HELIPAD', boss: 'STOP THE DEVELOPER' },
};

export function heartsFor(health: number, maxHealth = PLAYER_MAX_HEALTH): HeartState[] {
  const hearts: HeartState[] = [];
  for (let i = 0; i < Math.ceil(maxHealth / 2); i += 1) {
    const remaining = health - i * 2;
    hearts.push(remaining >= 2 ? 'full' : remaining === 1 ? 'half' : 'empty');
  }
  return hearts;
}

export function buildGameHudModel(state: MvpRunState): GameHudModel {
  const room = state.wing.rooms[state.roomIndex];
  const living = state.room.combat.enemies.filter((enemy) => enemy.health > 0);
  const boss = living.find((enemy) => isBossKind(enemy.kind)) ?? null;
  const fightHere = (room?.enemySpawns.length ?? 0) > 0 || room?.bossAnchor != null;

  const floor = floorNumberOf(state.wing);
  const floorHud = state.wing.part === 1 ? firstWingHud(floor) : FLOOR_HUD[floor];
  const objectives: HudObjective[] = [
    {
      text: `${floorHud.reach}  ${state.roomIndex + 1}/${state.wing.rooms.length}`,
      done: state.status === 'won',
    },
  ];
  if (room?.id === 'security_office') {
    objectives.push({ text: floorHud.boss, done: boss === null && state.room.cleared });
  } else if (fightHere) {
    objectives.push({
      text: state.room.cleared ? 'AREA SECURED' : `CLEAR THE AREA  ${living.length} LEFT`,
      done: state.room.cleared,
    });
  } else if (room && roomStores(room).length > 0) {
    const stores = roomStores(room);
    const inside = activeStore(state);
    const shelf = inside ? room.offers.filter((offer) => offer.storeId === inside.templateId) : room.offers;
    const taken = shelf.filter((offer) => (state.offerStatus[offer.id] ?? 'available') !== 'available').length;
    const alarm = state.alarm;
    if (alarm?.shutter === 'open') {
      objectives.push({ text: `GET OUT! SHUTTER IN ${(Math.ceil(alarm.ticksLeft / 6) / 10).toFixed(1)}S`, done: false });
    } else if (alarm?.shutter === 'closed') {
      objectives.push({ text: `LOCKED IN - TAKE DOWN SECURITY  ${living.length} LEFT`, done: false });
    } else if (!inside) {
      const names = stores.map((store) => store.name.toUpperCase()).join(' OR ');
      objectives.push({ text: `STEP INTO ${names}`, done: taken > 0 });
    } else {
      objectives.push({ text: `SHOP OR GRAB & RUN  ${taken}/${shelf.length}`, done: taken > 0 });
    }
  } else if (room?.benchKiosk) {
    objectives.push({ text: 'CHECK THE BENCH WARRANT', done: state.inventory.committedTransactions.length > 0 });
  }
  if (state.room.tokens.length > 0) {
    const worth = state.room.tokens.reduce((sum, token) => sum + token.value, 0);
    objectives.push({ text: `SWEEP UP TOKENS  $${worth}`, done: false });
  }
  const stars = wantedStars(state.heat);
  objectives.push(
    stars === 0
      ? { text: 'STAY OFF THE RADAR', done: true }
      : hotItemCount(state) > 0 && state.heat <= hotHeatFloor(state)
        ? { text: 'HOT GOODS - LAUNDER AT THE BENCH', done: false }
        : stars >= STALKER_MIN_STARS
          ? { text: `LOSS PREVENTION ON YOU - CLEAR FIGHTS TO LAY LOW`, done: false }
          : { text: `WANTED ${'*'.repeat(stars)} - CLEAR FIGHTS TO LAY LOW`, done: false },
  );

  const cleared = new Set(state.clearedRooms);
  const rooms = state.wing.rooms.map((candidate, index): HudRoomCell => ({
    id: candidate.id,
    short: floorHud.short[candidate.id],
    state: index === state.roomIndex ? 'current' : cleared.has(candidate.id) || index < state.roomIndex ? 'cleared' : 'ahead',
    boss: candidate.bossAnchor != null,
    store: candidate.store !== null,
  }));

  const hotbar = state.inventory.inventory.slice(0, 8).map((node): HudSlot => {
    const leaf = compositeLeaves(node)[0]!;
    return {
      instanceId: node.instanceId,
      itemDefinitionId: leaf.itemDefinitionId,
      selected: node.instanceId === state.inventory.selectedPrimaryInstanceId,
      fused: node.kind === 'composite',
      stolen: !isCleanPart(node),
      hot: isHotNode(node),
    };
  });

  const weapons = runWeaponSlots(state).map((weapon): HudWeapon => ({
    ...weapon,
    name: itemDefinitionName(weapon.itemDefinitionId).toUpperCase(),
    selected: weapon.instanceId === state.inventory.selectedPrimaryInstanceId,
    hot: state.inventory.inventory.some((node) => node.instanceId === weapon.instanceId && isHotNode(node)),
  }));
  const equippedWeapon = weapons.find((weapon) => weapon.selected);

  return {
    weapons,
    passives: runPassiveItems(state).map((item) => ({ ...item, name: itemDefinitionName(item.itemDefinitionId).toUpperCase() })),
    equipped: equippedWeapon ? { name: equippedWeapon.name, blurb: itemBlurb(equippedWeapon.itemDefinitionId) } : null,
    prompt: promptFor(state),
    combo: comboFor(state),
    hearts: heartsFor(state.room.combat.player.health, runMaxHealth(state)),
    cash: state.cash,
    heat: state.heat,
    wanted: stars,
    alarm: alarmFor(state),
    objectives,
    rooms,
    hotbar,
    carriedCount: state.carried.length,
    boss: boss
      ? {
        health: boss.health,
        max: bossConfigFor(boss.kind).maxHealth,
        phase: boss.bossPhase ?? bossPhaseForHealth(boss.health, bossConfigFor(boss.kind).maxHealth),
        name: boss.kind === 'developer' ? 'THE DEVELOPER' : boss.kind === 'owner' ? 'THE MALL OWNER' : boss.kind === 'manager' ? 'MALL MANAGER' : 'LOSS PREVENTION',
      }
      : null,
    floor,
    enemiesLeft: living.length,
  };
}

/** A store's name by template id, among the current room's shops. */
function storeNamed(state: MvpRunState, templateId: string): string | undefined {
  const room = state.wing.rooms[state.roomIndex];
  return room ? roomStores(room).find((store) => store.templateId === templateId)?.name : undefined;
}

function alarmFor(state: MvpRunState): HudAlarm | null {
  const alarm = state.alarm;
  if (alarm === null) return null;
  return {
    secondsLeft: Math.ceil(alarm.ticksLeft / 6) / 10,
    shutter: alarm.shutter,
    store: (storeNamed(state, alarm.storeId) ?? '').toUpperCase(),
  };
}

function comboFor(state: MvpRunState): GameHudModel['combo'] {
  const { combo, lastHitTick } = state.stats;
  if (combo < 2 || state.status !== 'playing') return null;
  // Quantised so the HUD redraws ten times across the window, not sixty.
  const remaining = Math.round(Math.max(0, 1 - (state.tick - lastHitTick) / COMBO_WINDOW_TICKS) * 10) / 10;
  const nextBonusAt = (Math.floor(combo / COMBO_MILESTONE) + 1) * COMBO_MILESTONE;
  return { count: combo, remaining, nextBonusAt, nextBonus: comboBonusFor(nextBonusAt) };
}

/** The store card's pink line for a recipe-hint half (round 44). */
function pairLine(state: MvpRunState, offer: WingOffer): { pair: string } | Record<string, never> {
  if (!offer.pairedWith) return {};
  const name = signatureName(offer.itemDefinitionId, offer.pairedWith);
  if (!name) return {};
  const partner = itemDefinitionName(offer.pairedWith).toUpperCase();
  const deal = holdsPairPartner(state, offer) ? ` - ${Math.round((1 - PAIR_DEAL_SCALE) * 100)}% OFF` : '';
  return { pair: `PAIRS WITH ${partner} -> ${name.toUpperCase()}: +50% DMG${deal}` };
}

function promptFor(state: MvpRunState): HudPrompt {
  if (state.status !== 'playing' || state.paused || state.preview !== null) return null;
  const interaction = nearestMvpInteraction(state);
  switch (interaction.kind) {
    case 'offer': {
      const offer = state.wing.rooms[state.roomIndex]?.offers.find((candidate) => candidate.id === interaction.offerId);
      const subject = interaction.label.toUpperCase().replace(' — ', '  ');
      if (!offer) return { subject, keys: [{ key: 'E', action: 'BUY' }, { key: 'F', action: 'STEAL' }] };
      const price = runOfferPrice(state, offer);
      const short = price - state.cash;
      const handsFull = state.carried.length >= runCarryLimit(state);
      const alarm = state.alarm !== null ? 'ALARM IS ALREADY RINGING' : `ALARM: ${Math.round(alarmTicksFor(state) / 60)}S TO THE DOOR`;
      const note = short > 0
        ? `NEED $${short} MORE - OR GRAB & RUN (${alarm})`
        : handsFull
          ? 'HANDS FULL - CARRY YOUR LOOT OUT FIRST'
          : blueLightOfferId(state) === offer.id
            ? `BLUE LIGHT SPECIAL: HALF PRICE - OR GRAB & RUN`
            : `GRAB & RUN: FREE, +1 STAR - ${alarm}`;
      return {
        subject,
        keys: [{ key: 'E', action: 'BUY', disabled: short > 0 }, { key: 'F', action: 'STEAL', disabled: handsFull }],
        detail: {
          itemDefinitionId: offer.itemDefinitionId,
          blurb: itemBlurb(offer.itemDefinitionId),
          kind: ITEM_CATALOG.find((definition) => definition.id === offer.itemDefinitionId)?.base ? 'WEAPON' : 'PASSIVE',
          note,
          canBuy: short <= 0,
          ...pairLine(state, offer),
        },
      };
    }
    case 'bench':
      return { subject: 'BENCH WARRANT KIOSK', keys: [{ key: 'E', action: 'FUSE' }] };
    case 'store':
      return { subject: interaction.label.toUpperCase(), keys: [{ key: 'E', action: 'ENTER' }] };
    case 'cabinet':
      return { subject: 'ARCADE CABINET - $2 A PLAY', keys: [{ key: 'E', action: 'PLAY', disabled: state.cash < 2 }] };
    case 'door':
      return interaction.locked ? { subject: 'DOOR LOCKED - CLEAR THE ROOM', keys: [] } : null;
    default:
      return null;
  }
}

/** The pickup log's line width in characters, and how many lines one message may take. */
export const LOG_LINE_CHARS = 34;

/** Wraps a log message at word boundaries onto at most two lines; a longer one ends on "...". */
export function wrapLogText(text: string, width = LOG_LINE_CHARS, maxLines = 2): string[] {
  const lines: string[] = [];
  let line = '';
  const words = text.split(/\s+/).filter(Boolean);
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]!;
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      continue;
    }
    if (lines.length === maxLines - 1) {
      // Last line: end on the last whole word that leaves room for the ellipsis.
      let cut = line;
      while (cut.length + 3 > width && cut.includes(' ')) cut = cut.slice(0, cut.lastIndexOf(' '));
      lines.push(`${cut.replace(/[.,:;]$/, '')}...`);
      return lines;
    }
    lines.push(line || word.slice(0, width));
    line = line ? word : '';
  }
  if (line) lines.push(line);
  return lines;
}

/** How long the full objectives and map stay open after entering a room, and after a change. */
export const HUD_ROOM_OPEN_TICKS = 60 * 5;
export const HUD_CHANGE_OPEN_TICKS = 60 * 4;

/**
 * Whether the top HUD shows its full panels or collapses to corner chips, so
 * the storefront art stays visible while nothing new needs reading.
 */
export function hudExpanded(input: {
  readonly tick: number;
  readonly roomEnteredTick: number;
  readonly objectivesChangedTick: number;
  readonly peek: boolean;
  readonly paused: boolean;
  readonly playing: boolean;
}): boolean {
  if (input.peek || input.paused || !input.playing) return true;
  return input.tick - input.roomEnteredTick < HUD_ROOM_OPEN_TICKS || input.tick - input.objectivesChangedTick < HUD_CHANGE_OPEN_TICKS;
}

/** The one objective the collapsed chip keeps in view: the first still to do. */
export function collapsedObjective(model: GameHudModel): string | undefined {
  return model.objectives.find((objective) => !objective.done)?.text;
}

/**
 * The room title card's second line. A floor event (round 47) names itself on
 * every card of its wing; otherwise a room event, otherwise the room count.
 */
export function roomTitleSubtitle(state: MvpRunState): { readonly text: string; readonly color: string } {
  const wingEvent = wingEventFor(state.wing);
  if (wingEvent === 'outage') return { text: 'POWER OUTAGE - STAY IN YOUR FLASHLIGHT', color: '#ff5a6a' };
  if (wingEvent === 'sprinklers') return { text: 'SPRINKLERS ON - EVERYTHING CONDUCTS', color: '#6ad8ff' };
  if (wingEvent === 'clearance') {
    return { text: `CLEARANCE SALE - ${Math.round((1 - CLEARANCE_PRICE_SCALE) * 100)}% OFF, MORE SHOPPERS`, color: '#ffd23f' };
  }
  const event = roomEventFor(state, state.roomIndex);
  if (event === 'blackout') return { text: 'BLACKOUT - STAY IN YOUR FLASHLIGHT', color: '#ff5a6a' };
  if (event === 'blue_light') return { text: 'BLUE LIGHT SPECIAL - ONE ITEM HALF PRICE', color: '#6a9aff' };
  return { text: `SHIFT ROOM ${state.roomIndex + 1} OF ${state.wing.rooms.length}`, color: '#3ff0ff' };
}
