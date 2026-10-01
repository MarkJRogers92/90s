import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { runOfferPrice } from '../../src/sim/run/economy';
import { roomEventFor, blueLightOfferId } from '../../src/sim/run/roomEvents';
import { ALARM_TICKS_BY_FLOOR, alarmTicksFor } from '../../src/sim/run/heist';
import { CLEARANCE_PRICE_SCALE, OUTAGE_ALARM_BONUS, WING_EVENTS, wingEventFor, type WingEvent } from '../../src/sim/run/wingEvents';
import { PA_LINES, PaDirector } from '../../src/game/ui/paModel';
import { ascend } from '../../src/sim/run/floors';
import { PlaytestRecorder } from '../../src/game/playtest/recorder';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** The first shift (floor 2-4, boss wing) whose wing has `event`. */
function runWith(event: WingEvent, floor: FloorNumber = 2): MvpRunState {
  for (let seed = 1; seed < 500; seed += 1) {
    const state = createMvpRun(seed, { floor });
    if (wingEventFor(state.wing) === event) return state;
  }
  throw new Error(`no ${event} wing in 500 seeds`);
}

function walkTo(state: MvpRunState, roomIndex: number): void {
  while (state.roomIndex < roomIndex) {
    state.room.combat.enemies = [];
    tickMvpRun(state, idle);
    const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = door.rect.x + door.rect.width / 2;
    state.room.combat.player.y = door.rect.y + door.rect.height / 2;
    expect(enterDoorway(state, 'east').accepted).toBe(true);
  }
}

const fightRoom = (state: MvpRunState) => state.wing.rooms.findIndex((room) => room.enemySpawns.length > 0 && room.bossAnchor === null);

describe('floor events (round 47)', () => {
  it('the night opens clean; later wings usually roll one of three events, the same every time', () => {
    for (let seed = 1; seed < 40; seed += 1) expect(wingEventFor(createMvpRun(seed, { part: 1 }).wing)).toBeNull();
    const seen = new Map<WingEvent | null, number>();
    for (let seed = 1; seed <= 90; seed += 1) {
      const wing = createMvpRun(seed, { floor: 3 }).wing;
      expect(wingEventFor(wing)).toBe(wingEventFor(createMvpRun(seed, { floor: 3 }).wing));
      seen.set(wingEventFor(wing), (seen.get(wingEventFor(wing)) ?? 0) + 1);
    }
    for (const event of WING_EVENTS) expect(seen.get(event) ?? 0).toBeGreaterThan(10);
    expect(seen.get(null) ?? 0).toBeGreaterThan(5);
    expect(seen.get(null) ?? 0).toBeLessThan(45);
  });

  it('a power outage darkens every room but the stores and the boss, and slows the alarm', () => {
    const state = runWith('outage');
    state.wing.rooms.forEach((room, index) => {
      const dark = room.store === null && room.bossAnchor === null;
      expect(roomEventFor(state, index) === 'blackout').toBe(dark);
    });
    expect(alarmTicksFor(state)).toBe(ALARM_TICKS_BY_FLOOR[2] + OUTAGE_ALARM_BONUS);
    expect(OUTAGE_ALARM_BONUS).toBeGreaterThan(0);
  });

  it('sprinklers soak every enemy in every fight', () => {
    const state = runWith('sprinklers');
    walkTo(state, fightRoom(state));
    tickMvpRun(state, idle);
    const living = state.room.combat.enemies.filter((enemy) => enemy.health > 0);
    expect(living.length).toBeGreaterThan(0);
    for (const enemy of living) expect(enemy.statuses?.wetTicks ?? 0).toBeGreaterThan(0);
  });

  it('a clearance sale marks every shelf down, and sends a Bargain Hunter into every fight', () => {
    const state = runWith('clearance');
    const offer = state.wing.rooms.flatMap((room) => room.offers).find((candidate) => candidate.id !== blueLightOfferId(state) && candidate.price > 10)!;
    expect(CLEARANCE_PRICE_SCALE).toBeLessThan(1);
    expect(runOfferPrice(state, offer)).toBe(Math.ceil(offer.price * CLEARANCE_PRICE_SCALE));
    const index = fightRoom(state);
    const shoppers = buildRoomCombatState(state.wing, index, 'west', state.inventory, state.seed).enemies.filter((enemy) => enemy.kind === 'shopper').length;
    const authored = state.wing.rooms[index]!.enemySpawns.filter((spawn) => spawn.kind === 'shopper').length;
    expect(shoppers).toBe(authored + 1);
    // Never in the boss room.
    const boss = state.wing.rooms.findIndex((room) => room.bossAnchor !== null);
    const bossShoppers = buildRoomCombatState(state.wing, boss, 'west', state.inventory, state.seed).enemies.filter((enemy) => enemy.kind === 'shopper').length;
    expect(bossShoppers).toBe(state.wing.rooms[boss]!.enemySpawns.filter((spawn) => spawn.kind === 'shopper').length);
  });

  it('the playtest log says which event a wing had', () => {
    const state = runWith('sprinklers');
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    state.tick += 5;
    state.status = 'dead';
    expect(recorder.observe(state)!.event).toBe('sprinklers');
  });

  it('the PA announces the event as the new wing starts', () => {
    for (let seed = 1; seed < 300; seed += 1) {
      const first = createMvpRun(seed, { part: 1 });
      first.status = 'won';
      const next = ascend(first);
      const event = wingEventFor(next.wing);
      if (event === null) continue;
      const pa = new PaDirector();
      pa.observe(first);
      const line = pa.observe(next);
      expect(PA_LINES[`wing_${event}`] as readonly string[]).toContain(line);
      return;
    }
    throw new Error('no evented boss wing in 300 seeds');
  });
});
