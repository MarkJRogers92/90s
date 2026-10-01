import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buyRunOffer } from '../../src/sim/run/economy';
import { openRunWorkbench, pickWorkbenchItem } from '../../src/sim/run/bench';
import { buildBenchCardModel } from '../../src/game/ui/benchCardModel';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { activeStore, enterStore, interiorWalls, leaveStore } from '../../src/sim/run/storeInterior';
import { SAMPLE_BOWL } from '../../src/sim/run/storeTwists';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { moveCircle } from '../../src/sim/combat/movement';
import type { EnemyState } from '../../src/sim/model';
import type { MvpRunState } from '../../src/sim/run/types';

const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** Walks east, room by room, until the janitor stands in the room `id`. */
function walkTo(state: MvpRunState, id: string): void {
  while (state.wing.rooms[state.roomIndex]!.id !== id) {
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = door.rect.x + door.rect.width / 2;
    state.room.combat.player.y = door.rect.y + door.rect.height / 2;
    expect(enterDoorway(state, 'east').accepted).toBe(true);
  }
}

/** A holiday-district first wing, standing in front of the Candy Cauldron. */
function atTheCauldron(): MvpRunState {
  for (let seed = 1; seed < 400; seed += 1) {
    const state = createMvpRun(seed, { part: 1 });
    if (state.wing.district !== 'holiday') continue;
    walkTo(state, state.wing.rooms.find((room) => room.store !== null)!.id);
    return state;
  }
  throw new Error('no holiday district');
}

function sampleVisit(state: MvpRunState): number {
  expect(enterStore(state, 0).accepted).toBe(true);
  expect(activeStore(state)?.templateId).toBe('candy-cauldron');
  state.room.combat.player.x = SAMPLE_BOWL.x;
  state.room.combat.player.y = SAMPLE_BOWL.y;
  tickMvpRun(state, idle);
  const health = state.room.combat.player.health;
  leaveStore(state);
  return health;
}

describe('review fixes (round 52)', () => {
  it('a mop hit cannot knock a guard through the closed shutter, and the lockdown can still end', () => {
    const state = createMvpRun(7);
    walkTo(state, state.wing.rooms[1]!.id);
    expect(enterStore(state, 0).accepted).toBe(true);
    const store = activeStore(state)!;
    const exit = store.exit.bounds;
    state.alarm = { storeId: store.templateId, roomIndex: state.roomIndex, ticksLeft: 0, shutter: 'closed' };
    state.room.combat.walls = [...interiorWalls(store), { ...exit }];
    const player = state.room.combat.player;
    player.x = exit.x + exit.width / 2;
    player.y = exit.y - 60;
    const guard: EnemyState = { id: 999, kind: 'mannequin', x: player.x, y: exit.y - 15, health: 20, radius: 14, phase: 'recover', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 };
    state.room.combat.enemies = [guard];
    tickMvpRun(state, { ...idle, aimX: guard.x, aimY: guard.y, fire: true });
    expect(guard.health).toBeLessThan(20);
    expect(guard.y + guard.radius).toBeLessThanOrEqual(exit.y);
    for (let tick = 0; tick < 600 && guard.health > 0; tick += 1) {
      player.x = guard.x;
      player.y = guard.y - 40;
      tickMvpRun(state, { ...idle, aimX: guard.x, aimY: guard.y, fire: true });
    }
    expect(guard.health).toBeLessThanOrEqual(0);
    tickMvpRun(state, idle);
    expect(state.alarm?.shutter).toBe('lifted');
  });

  it('a long shove stops at a thin wall, and open-floor knockback still goes the whole way', () => {
    const wall = { x: 100, y: 0, width: 4, height: 400 };
    expect(moveCircle({ x: 80, y: 200 }, 14, 48, 0, [wall]).x).toBeLessThanOrEqual(100 - 14);
    expect(moveCircle({ x: 300, y: 200 }, 14, 48, 0, [wall]).x).toBe(348);
    expect(moveCircle({ x: 300, y: 200 }, 14, 3, -2, [wall])).toEqual({ x: 303, y: 198 });
  });

  it('the bench pages past sixteen things, so every owned item can be picked', () => {
    const state = createMvpRun(7);
    state.cash = 1000;
    state.inventory = { ...state.inventory, cash: 1000 };
    for (const offer of state.wing.rooms.flatMap((room) => room.offers)) expect(buyRunOffer(state, offer.id).accepted).toBe(true);
    const owned = state.inventory.inventory.length;
    expect(owned).toBeGreaterThan(16);
    expect(openRunWorkbench(state).accepted).toBe(true);
    const first = buildBenchCardModel(state)!;
    expect(first.pageCount).toBe(Math.ceil(owned / 9));
    const seen = new Set<string>();
    for (let page = 0; page < first.pageCount; page += 1) {
      const card = buildBenchCardModel(state, page)!;
      expect(card.page).toBe(page);
      // Every tile on every page has its own number key.
      expect(card.tiles.map((tile) => tile.key)).toEqual(card.tiles.map((_, index) => index + 1));
      card.tiles.forEach((tile) => seen.add(tile.instanceId));
    }
    expect(seen.size).toBe(owned);

    // Pick one item off the last page and one off the first: the pair shows either way.
    const last = buildBenchCardModel(state, first.pageCount - 1)!;
    pickWorkbenchItem(state, last.tiles[0]!.instanceId);
    pickWorkbenchItem(state, first.tiles[0]!.instanceId);
    const card = buildBenchCardModel(state, 0)!;
    expect(card.picked.first?.instanceId).toBe(last.tiles[0]!.instanceId);
    expect(card.picked.second?.instanceId).toBe(first.tiles[0]!.instanceId);

    // A page past the end (after items go) falls back to the last real page.
    expect(buildBenchCardModel(state, 99)!.page).toBe(first.pageCount - 1);
  });

  it('the Candy Cauldron gives one sample a wing, through leaving, coming back, and a save', () => {
    const state = atTheCauldron();
    state.room.combat.player.health = 3;
    expect([sampleVisit(state), sampleVisit(state), sampleVisit(state)]).toEqual([4, 4, 4]);

    // A save made after the sample keeps it had.
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resumed = restoreMvpRun(parsed.checkpoint);
    resumed.room.combat.player.health = 3;
    expect(sampleVisit(resumed)).toBe(3);

    // An older save without the field loads, with the sample still there.
    const { samplesTaken: _dropped, ...older } = JSON.parse(JSON.stringify(serializeCheckpoint(state))) as Record<string, unknown>;
    const old = parseCheckpoint(older);
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    const oldRun = restoreMvpRun(old.checkpoint);
    oldRun.room.combat.player.health = 3;
    expect(sampleVisit(oldRun)).toBe(4);

    // The same wing on a fresh night has its sample back.
    const fresh = atTheCauldron();
    fresh.room.combat.player.health = 3;
    expect(sampleVisit(fresh)).toBe(4);
  });
});
