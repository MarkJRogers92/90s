/**
 * What the in-canvas HUD shows, derived from authoritative run state.
 *
 * Pure: no Phaser, no DOM. The HUD renderer draws this model and nothing else,
 * so every heart, checkbox and minimap cell is traceable to a simulation field
 * and the whole thing is unit-testable.
 */
import { BOSS_MAX_HEALTH, bossPhaseForHealth } from '../../sim/combat/boss';
import { PLAYER_MAX_HEALTH } from '../../sim/run/rooms';
import type { MvpRunState } from '../../sim/run/types';
import type { WingRoomId } from '../../sim/wing/types';

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

export type GameHudModel = {
  readonly hearts: readonly HeartState[];
  readonly cash: number;
  readonly heat: number;
  readonly objectives: readonly HudObjective[];
  readonly rooms: readonly HudRoomCell[];
  readonly hotbar: readonly HudSlot[];
  readonly carriedCount: number;
  readonly boss: { readonly health: number; readonly max: number; readonly phase: number } | null;
  readonly enemiesLeft: number;
};

const SHORT_NAMES: Readonly<Record<WingRoomId, string>> = {
  service_corridor: 'CONCOURSE',
  storefront_a: 'WEST SHOPS',
  food_court: 'FOOD COURT',
  storefront_b: 'EAST SHOPS',
  back_hall: 'SERVICE HALL',
  security_office: 'SECURITY',
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
  const boss = living.find((enemy) => enemy.kind === 'lp_manager') ?? null;
  const fightHere = (room?.enemySpawns.length ?? 0) > 0 || room?.bossAnchor != null;

  const objectives: HudObjective[] = [
    {
      text: `REACH SECURITY  ${state.roomIndex + 1}/${state.wing.rooms.length}`,
      done: state.status === 'won',
    },
  ];
  if (room?.id === 'security_office') {
    objectives.push({ text: 'STOP LOSS PREVENTION', done: boss === null && state.room.cleared });
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
  objectives.push({ text: state.heat > 0 ? `LOSE THE HEAT  ${state.heat}` : 'STAY OFF THE RADAR', done: state.heat === 0 });

  const cleared = new Set(state.clearedRooms);
  const rooms = state.wing.rooms.map((candidate, index): HudRoomCell => ({
    id: candidate.id,
    short: SHORT_NAMES[candidate.id],
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

  return {
    hearts: heartsFor(state.room.combat.player.health),
    cash: state.cash,
    heat: state.heat,
    objectives,
    rooms,
    hotbar,
    carriedCount: state.carried.length,
    boss: boss ? { health: boss.health, max: BOSS_MAX_HEALTH, phase: boss.bossPhase ?? bossPhaseForHealth(boss.health) } : null,
    enemiesLeft: living.length,
  };
}
