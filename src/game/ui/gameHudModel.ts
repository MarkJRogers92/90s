/**
 * What the in-canvas HUD shows, derived from authoritative run state.
 *
 * Pure: no Phaser, no DOM. The HUD renderer draws this model and nothing else,
 * so every heart, checkbox and minimap cell is traceable to a simulation field
 * and the whole thing is unit-testable.
 */
import { runMaxHealth } from '../../sim/run/perks';
import { bossConfigFor, bossPhaseForHealth, isBossKind } from '../../sim/combat/boss';
import { PLAYER_MAX_HEALTH } from '../../sim/run/rooms';
import type { MvpRunState } from '../../sim/run/types';
import type { WingRoomId } from '../../sim/wing/types';
import {
  RUN_SECURED_THEFT_HEAT,
  RUN_SMUGGLE_POUCH_HEAT_REDUCTION,
  itemDefinitionName,
  runCarryLimit,
  runOfferPrice,
  runOwnsCapability,
} from '../../sim/run/economy';
import { ITEM_CATALOG } from '../../sim/items/catalog';
import { COMBO_MILESTONE, COMBO_WINDOW_TICKS, comboBonusFor } from '../../sim/run/combo';
import { blueLightOfferId } from '../../sim/run/roomEvents';
import { nearestMvpInteraction } from '../../sim/run/tickMvpRun';
import { runPassiveItems, runWeaponSlots } from '../../sim/run/weapons';
import { itemBlurb } from './itemBlurbs';

export type HeartState = 'full' | 'half' | 'empty';

export type HudObjective = { readonly text: string; readonly done: boolean };

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
};

export type HudWeapon = {
  readonly slot: number;
  readonly instanceId: string;
  readonly itemDefinitionId: string;
  readonly name: string;
  readonly selected: boolean;
  readonly fused: boolean;
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
  readonly objectives: readonly HudObjective[];
  readonly rooms: readonly HudRoomCell[];
  readonly hotbar: readonly HudSlot[];
  readonly carriedCount: number;
  readonly boss: { readonly health: number; readonly max: number; readonly phase: number; readonly name: string } | null;
  /** 1 downstairs, 2 on the upper level. */
  readonly floor: 1 | 2 | 3;
  readonly enemiesLeft: number;
  readonly weapons: readonly HudWeapon[];
  readonly passives: readonly HudPassive[];
  readonly equipped: { readonly name: string; readonly blurb: string } | null;
  readonly prompt: HudPrompt;
  /** The live Cleanup Combo, once it is worth showing (2+). */
  readonly combo: { readonly count: number; readonly remaining: number; readonly nextBonusAt: number; readonly nextBonus: number } | null;
};

const SHORT_NAMES: Readonly<Record<WingRoomId, string>> = {
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

  const objectives: HudObjective[] = [
    {
      text: `${state.wing.floor === 3 ? 'REACH THE OWNER' : state.wing.floor === 2 ? 'REACH MANAGEMENT' : 'REACH SECURITY'}  ${state.roomIndex + 1}/${state.wing.rooms.length}`,
      done: state.status === 'won',
    },
  ];
  if (room?.id === 'security_office') {
    objectives.push({ text: state.wing.floor === 3 ? 'TAKE DOWN THE OWNER' : state.wing.floor === 2 ? 'FIRE THE MANAGER' : 'STOP LOSS PREVENTION', done: boss === null && state.room.cleared });
  } else if (fightHere) {
    objectives.push({
      text: state.room.cleared ? 'AREA SECURED' : `CLEAR THE AREA  ${living.length} LEFT`,
      done: state.room.cleared,
    });
  } else if (room?.store) {
    const taken = room.offers.filter((offer) => (state.offerStatus[offer.id] ?? 'available') !== 'available').length;
    objectives.push({ text: `SHOP OR SHOPLIFT  ${taken}/${room.offers.length}`, done: taken > 0 });
  } else if (room?.benchKiosk) {
    objectives.push({ text: 'CHECK THE BENCH WARRANT', done: state.inventory.committedTransactions.length > 0 });
  }
  if (state.room.tokens.length > 0) {
    const worth = state.room.tokens.reduce((sum, token) => sum + token.value, 0);
    objectives.push({ text: `SWEEP UP TOKENS  $${worth}`, done: false });
  }
  objectives.push({ text: state.heat > 0 ? `LOSE THE HEAT  ${state.heat}` : 'STAY OFF THE RADAR', done: state.heat === 0 });

  const cleared = new Set(state.clearedRooms);
  const rooms = state.wing.rooms.map((candidate, index): HudRoomCell => ({
    id: candidate.id,
    short: (state.wing.floor === 3 ? TOP_FLOOR_SHORT_NAMES : state.wing.floor === 2 ? UPSTAIRS_SHORT_NAMES : SHORT_NAMES)[candidate.id],
    state: index === state.roomIndex ? 'current' : cleared.has(candidate.id) || index < state.roomIndex ? 'cleared' : 'ahead',
    boss: candidate.bossAnchor != null,
    store: candidate.store !== null,
  }));

  const hotbar = state.inventory.inventory.slice(0, 8).map((node): HudSlot => {
    const leaf = node.kind === 'leaf' ? node : node.primary;
    return {
      instanceId: node.instanceId,
      itemDefinitionId: leaf.itemDefinitionId,
      selected: node.instanceId === state.inventory.selectedPrimaryInstanceId,
      fused: node.kind === 'composite',
      stolen: leaf.acquisitionKind === 'stolen',
    };
  });

  const weapons = runWeaponSlots(state).map((weapon): HudWeapon => ({
    ...weapon,
    name: itemDefinitionName(weapon.itemDefinitionId).toUpperCase(),
    selected: weapon.instanceId === state.inventory.selectedPrimaryInstanceId,
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
    objectives,
    rooms,
    hotbar,
    carriedCount: state.carried.length,
    boss: boss
      ? {
        health: boss.health,
        max: bossConfigFor(boss.kind).maxHealth,
        phase: boss.bossPhase ?? bossPhaseForHealth(boss.health, bossConfigFor(boss.kind).maxHealth),
        name: boss.kind === 'owner' ? 'THE MALL OWNER' : boss.kind === 'manager' ? 'MALL MANAGER' : 'LOSS PREVENTION',
      }
      : null,
    floor: state.wing.floor === 3 ? 3 : state.wing.floor === 2 ? 2 : 1,
    enemiesLeft: living.length,
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
      const stealHeat = Math.max(0, RUN_SECURED_THEFT_HEAT - (runOwnsCapability(state, 'smuggle_pouch') ? RUN_SMUGGLE_POUCH_HEAT_REDUCTION : 0));
      const note = short > 0
        ? `NEED $${short} MORE - OR STEAL IT (+${stealHeat} HEAT)`
        : handsFull
          ? 'HANDS FULL - CARRY YOUR LOOT OUT FIRST'
          : blueLightOfferId(state) === offer.id
            ? `BLUE LIGHT SPECIAL: HALF PRICE - OR STEAL (+${stealHeat} HEAT)`
            : `STEAL: FREE, +${stealHeat} HEAT AT THE EXIT`;
      return {
        subject,
        keys: [{ key: 'E', action: 'BUY', disabled: short > 0 }, { key: 'F', action: 'STEAL', disabled: handsFull }],
        detail: {
          itemDefinitionId: offer.itemDefinitionId,
          blurb: itemBlurb(offer.itemDefinitionId),
          kind: ITEM_CATALOG.find((definition) => definition.id === offer.itemDefinitionId)?.base ? 'WEAPON' : 'PASSIVE',
          note,
          canBuy: short <= 0,
        },
      };
    }
    case 'bench':
      return { subject: 'BENCH WARRANT KIOSK', keys: [{ key: 'E', action: 'FUSE' }] };
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
