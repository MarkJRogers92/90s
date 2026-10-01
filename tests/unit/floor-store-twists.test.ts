import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { activeStore, enterStore, roomStores } from '../../src/sim/run/storeInterior';
import { ALARM_TICKS_BY_FLOOR, alarmTicksFor } from '../../src/sim/run/heist';
import { OUTAGE_ALARM_BONUS, wingEventFor } from '../../src/sim/run/wingEvents';
import {
  COLD_SNAP_CYCLE_TICKS,
  COLD_SNAP_RADIUS,
  FROSTY_MACHINE,
  HOCK_PRICE,
  HOCK_TICKS,
  LIBRARY_ALARM_BONUS,
  LIGHTNING_ROD,
  MUSTARD_SPILLS,
  PAWN_COUNTER,
  ROD_DAMAGE,
  ROD_ZAP_TICKS,
  TWIST_HINTS,
  coldSnapPhase,
  glareBand,
} from '../../src/sim/run/storeTwists';
import { FLOOR_STORE_TEMPLATES } from '../../src/sim/wing/templates';
import type { FloorNumber } from '../../src/sim/wing/floorSpecs';
import type { EnemyState } from '../../src/sim/model';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
const tick = (state: MvpRunState, overrides: Partial<MvpInputFrame> = {}): void => tickMvpRun(state, { ...idle, ...overrides });

/** Standing inside `storeId` on `floor`, the room cleared. */
function inside(floor: FloorNumber, storeId: string): MvpRunState {
  for (let seed = 1; seed < 300; seed += 1) {
    const state = createMvpRun(seed, { floor });
    const room = state.wing.rooms.findIndex((candidate) => roomStores(candidate).some((store) => store.templateId === storeId));
    if (room < 0) continue;
    while (state.roomIndex < room) {
      state.room.combat.enemies = [];
      tick(state);
      const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
      state.room.combat.player.x = door.rect.x + door.rect.width / 2;
      state.room.combat.player.y = door.rect.y + door.rect.height / 2;
      if (!enterDoorway(state, 'east').accepted) throw new Error('could not walk east');
    }
    state.room.combat.enemies = [];
    const index = roomStores(state.wing.rooms[room]!).findIndex((store) => store.templateId === storeId);
    expect(enterStore(state, index).accepted).toBe(true);
    tick(state);
    state.room.combat.enemies = [];
    expect(activeStore(state)?.templateId).toBe(storeId);
    return state;
  }
  throw new Error(`no ${storeId} on floor ${floor}`);
}

const guard = (x: number, y: number, id = 900): EnemyState => ({ id, kind: 'shopper', x, y, health: 18, radius: 16, phase: 'recover', phaseTicks: 999, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 });

describe('floor-exclusive store twists (round 55)', () => {
  it('every floor store announces a real twist', () => {
    for (const store of FLOOR_STORE_TEMPLATES) {
      expect(TWIST_HINTS[store.id], store.id).toBeTruthy();
      expect(TWIST_HINTS[store.id], store.id).not.toMatch(/no tricks|nothing in here|nothing odd|nothing else/i);
    }
  });

  it('Shade Station: the sweeping sun glare blinds guards, not the janitor in shades', () => {
    const state = inside(2, 'shade-station');
    const twist = state.room.twist!;
    const band = glareBand(twist);
    const y = 250;
    state.room.combat.enemies.push(guard(band.x + band.width / 2, y));
    const p = state.room.combat.player;
    p.x = band.x + band.width / 2;
    p.y = y + 60;
    tick(state);
    expect(state.room.combat.enemies.at(-1)!.stunnedTicks ?? 0).toBeGreaterThan(0);
    const x = p.x;
    tick(state, { moveX: 1 });
    expect(p.x).toBeGreaterThan(x);
  });

  it('Page Turner Books: the alarm is a polite chime, so it runs longer', () => {
    const state = inside(2, 'page-turner');
    const outage = wingEventFor(state.wing) === 'outage' ? OUTAGE_ALARM_BONUS : 0;
    expect(alarmTicksFor(state)).toBe(ALARM_TICKS_BY_FLOOR[2] + outage + LIBRARY_ALARM_BONUS);
  });

  it('Pretzel Pit: mustard slows the janitor and gums up guards', () => {
    const state = inside(3, 'pretzel-pit');
    const spill = MUSTARD_SPILLS[0]!;
    const p = state.room.combat.player;
    p.x = spill.x;
    p.y = spill.y;
    tick(state);
    const x = p.x;
    tick(state, { moveX: 1 });
    const slowed = p.x - x;
    const free = inside(3, 'pretzel-pit');
    free.room.combat.player.x = 480;
    free.room.combat.player.y = 120;
    tick(free);
    const fx = free.room.combat.player.x;
    tick(free, { moveX: 1 });
    expect(slowed).toBeGreaterThan(0);
    expect(slowed).toBeLessThan(free.room.combat.player.x - fx);
    state.room.combat.enemies.push(guard(spill.x, spill.y));
    tick(state);
    expect(state.room.combat.enemies.at(-1)!.statuses?.stickyTicks ?? 0).toBeGreaterThan(0);
  });

  it('Frosty Freeze: the cold snap freezes whoever is close to the machine, and warns first', () => {
    const state = inside(3, 'frosty-freeze');
    const p = state.room.combat.player;
    p.x = FROSTY_MACHINE.x - 40;
    p.y = FROSTY_MACHINE.y + 40;
    state.room.combat.enemies.push(guard(FROSTY_MACHINE.x - 60, FROSTY_MACHINE.y), guard(FROSTY_MACHINE.x - COLD_SNAP_RADIUS - 200, FROSTY_MACHINE.y + 150, 901));
    let warned = false;
    while (coldSnapPhase(state.room.twist!) !== 'snap') {
      if (coldSnapPhase(state.room.twist!) === 'warn') warned = true;
      tick(state);
      p.x = FROSTY_MACHINE.x - 40;
      p.y = FROSTY_MACHINE.y + 40;
      if (state.room.twist!.age > COLD_SNAP_CYCLE_TICKS * 2) throw new Error('no snap');
    }
    expect(warned).toBe(true);
    const near = state.room.combat.enemies.find((enemy) => enemy.id === 900)!;
    const far = state.room.combat.enemies.find((enemy) => enemy.id === 901)!;
    tick(state);
    expect(near.stunnedTicks ?? 0).toBeGreaterThan(0);
    expect(far.stunnedTicks ?? 0).toBe(0);
    const x = p.x;
    tick(state, { moveX: -1 });
    expect(p.x).toBe(x);
  });

  it('Antenna Annex: the lightning rod zaps the nearest guard, and anyone hugging it', () => {
    const state = inside(4, 'antenna-annex');
    const p = state.room.combat.player;
    const hp = p.health;
    state.room.combat.enemies.push(guard(LIGHTNING_ROD.x + 120, LIGHTNING_ROD.y), guard(LIGHTNING_ROD.x - 200, LIGHTNING_ROD.y, 901));
    for (let t = 0; t < ROD_ZAP_TICKS + 2; t += 1) {
      p.x = LIGHTNING_ROD.x;
      p.y = LIGHTNING_ROD.y + 20;
      tick(state);
    }
    expect(state.room.combat.enemies.find((enemy) => enemy.id === 900)!.health).toBe(18 - ROD_DAMAGE);
    expect(state.room.combat.enemies.find((enemy) => enemy.id === 901)!.health).toBe(18);
    expect(p.health).toBe(hp - 1);
  });

  it('Pawn Palace: wait at the counter to hock half a heart for cash, once a visit', () => {
    const state = inside(4, 'pawn-palace');
    const p = state.room.combat.player;
    const hp = p.health;
    const cash = state.cash;
    for (let t = 0; t < HOCK_TICKS * 3; t += 1) {
      p.x = PAWN_COUNTER.x;
      p.y = PAWN_COUNTER.y;
      tick(state);
    }
    expect(p.health).toBe(hp - 1);
    expect(state.cash).toBe(cash + HOCK_PRICE);
    expect(state.inventory.cash).toBe(state.cash);
  });

  it('Pawn Palace: the counter will not take your last heart', () => {
    const state = inside(4, 'pawn-palace');
    const p = state.room.combat.player;
    p.health = 2;
    for (let t = 0; t < HOCK_TICKS * 2; t += 1) {
      p.x = PAWN_COUNTER.x;
      p.y = PAWN_COUNTER.y;
      tick(state);
    }
    expect(p.health).toBe(2);
  });
});
