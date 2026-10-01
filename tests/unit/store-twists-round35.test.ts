import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { enterStore, roomStores } from '../../src/sim/run/storeInterior';
import { ALL_STORE_TEMPLATES } from '../../src/sim/wing/templates';
import {
  BALL_DAMAGE_ENEMY,
  GROOVE_TICKS,
  LISTENING_BOOTH,
  LISTEN_TICKS,
  OVEN_ZONE,
  PAINT_SPILLS,
  PITCHING_MACHINE,
  PITCH_INTERVAL_TICKS,
  REWIND_TILE,
  STATIC_ZONES,
  TWIST_HINTS,
  ovenPhase,
  pitchWindingUp,
  staticHides,
} from '../../src/sim/run/storeTwists';
import type { EnemyState } from '../../src/sim/model';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };
const tick = (state: MvpRunState, overrides: Partial<MvpInputFrame> = {}): void => tickMvpRun(state, { ...idle, ...overrides });
const ticks = (state: MvpRunState, count: number, overrides: Partial<MvpInputFrame> = {}): void => {
  for (let i = 0; i < count; i += 1) tick(state, overrides);
};

function walkEastTo(state: MvpRunState, target: number): void {
  while (state.roomIndex < target) {
    state.room.combat.enemies = [];
    tick(state);
    const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = door.rect.x + door.rect.width / 2;
    state.room.combat.player.y = door.rect.y + door.rect.height / 2;
    if (!enterDoorway(state, 'east').accepted) throw new Error('could not walk east');
  }
  state.room.combat.enemies = [];
}

function inside(storeId: string): MvpRunState {
  for (let seed = 1; seed < 300; seed += 1) {
    const state = createMvpRun(seed);
    for (let room = 0; room < state.wing.rooms.length; room += 1) {
      const index = roomStores(state.wing.rooms[room]!).findIndex((store) => store.templateId === storeId);
      if (index < 0) continue;
      walkEastTo(state, room);
      expect(enterStore(state, index).accepted).toBe(true);
      tick(state);
      state.room.combat.enemies = [];
      return state;
    }
  }
  throw new Error(`no ${storeId} found`);
}

function stand(state: MvpRunState, x: number, y: number): void {
  state.room.combat.player.x = x;
  state.room.combat.player.y = y;
}

function dummy(state: MvpRunState, x: number, y: number, health = 40): EnemyState {
  const enemy = { id: 900 + state.room.combat.enemies.length, kind: 'mannequin', x, y, health, radius: 14, phase: 'recover', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, dormant: true } as EnemyState;
  state.room.combat.enemies.push(enemy);
  return enemy;
}

describe('store twists for the seven themed stores (round 35)', () => {
  it('every store announces a twist on the way in', () => {
    for (const store of ALL_STORE_TEMPLATES) expect(TWIST_HINTS[store.id], store.id).toBeTruthy();
  });

  it('Sports Locker: the pitching machine winds up, then fires a ball down the aisle', () => {
    const state = inside('sports-locker');
    stand(state, 480, 340);
    let wound = false;
    for (let i = 0; i < PITCH_INTERVAL_TICKS && !(state.room.twist?.balls.length); i += 1) {
      tick(state);
      if (pitchWindingUp(state.room.twist!)) wound = true;
    }
    expect(wound).toBe(true);
    const ball = state.room.twist!.balls[0]!;
    expect(ball.x).toBeLessThan(PITCHING_MACHINE.x + 40);
    const startX = ball.x;
    ticks(state, 10);
    expect(state.room.twist!.balls[0]!.x).toBeGreaterThan(startX);
  });

  it('Sports Locker: a ball hurts the janitor in its lane once, and bowls over a guard', () => {
    const state = inside('sports-locker');
    stand(state, 480, PITCHING_MACHINE.y);
    const before = state.room.combat.player.health;
    ticks(state, PITCH_INTERVAL_TICKS + 120);
    expect(state.room.combat.player.health).toBe(before - 1);

    const guarded = inside('sports-locker');
    stand(guarded, 480, 340);
    const guard = dummy(guarded, 400, PITCHING_MACHINE.y);
    ticks(guarded, PITCH_INTERVAL_TICKS + 120);
    expect(guard.health).toBe(40 - BALL_DAMAGE_ENEMY);
  });

  it('Hardware Hut: paint makes the janitor slide on after letting go; dry floor does not', () => {
    const state = inside('hardware-hut');
    const spill = PAINT_SPILLS[0]!;
    stand(state, spill.x - spill.rx + 6, spill.y);
    ticks(state, 20, { moveX: 1 });
    const letGo = state.room.combat.player.x;
    ticks(state, 30);
    expect(state.room.combat.player.x - letGo).toBeGreaterThan(15);

    const dry = inside('hardware-hut');
    stand(dry, 480, 345);
    ticks(dry, 20, { moveX: 1 });
    const stopAt = dry.room.combat.player.x;
    ticks(dry, 30);
    expect(Math.abs(dry.room.combat.player.x - stopAt)).toBeLessThan(2);
  });

  it('Toy Box: wind-up toys waddle the aisle, and bumping one shoves the janitor without hurting', () => {
    const state = inside('toy-box');
    stand(state, 480, 345);
    const toys = state.room.twist!.toys;
    expect(toys.length).toBeGreaterThanOrEqual(3);
    const start = toys.map((toy) => toy.x);
    ticks(state, 60);
    expect(toys.some((toy, index) => toy.x !== start[index])).toBe(true);
    ticks(state, 1200);
    for (const toy of toys) {
      expect(toy.x).toBeGreaterThan(40);
      expect(toy.x).toBeLessThan(920);
    }
    const toy = toys[0]!;
    stand(state, toy.x + 4, toy.y);
    const health = state.room.combat.player.health;
    const before = { x: state.room.combat.player.x, y: state.room.combat.player.y };
    tick(state);
    const moved = Math.hypot(state.room.combat.player.x - before.x, state.room.combat.player.y - before.y);
    expect(moved).toBeGreaterThan(8);
    expect(state.room.combat.player.health).toBe(health);
  });

  it('Radio Shed: TV static comes and goes, hiding whoever stands in it', () => {
    const state = inside('radio-shed');
    stand(state, 480, 345);
    const zone = STATIC_ZONES[0]!;
    const middle = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
    const outside = { x: zone.x - 30, y: middle.y };
    const seen: boolean[] = [];
    for (let i = 0; i < 400; i += 1) {
      tick(state);
      seen.push(staticHides(state, middle));
      expect(staticHides(state, outside)).toBe(false);
    }
    expect(seen.includes(true)).toBe(true);
    expect(seen.includes(false)).toBe(true);
  });

  it('Spiral Records: a spell in the listening booth puts the janitor in the groove, once a visit', () => {
    const state = inside('spiral-records');
    stand(state, LISTENING_BOOTH.x, LISTENING_BOOTH.y);
    ticks(state, LISTEN_TICKS + 2);
    const twist = state.room.twist!;
    expect(twist.grooveTicks).toBeGreaterThan(GROOVE_TICKS - 10);
    // Attacks recharge twice as fast in the groove.
    state.room.combat.player.attackCooldownTicks = 20;
    tick(state);
    expect(state.room.combat.player.attackCooldownTicks).toBe(18);
    // Once a visit: the groove runs out and the booth will not start another.
    stand(state, 480, 345);
    ticks(state, GROOVE_TICKS);
    stand(state, LISTENING_BOOTH.x, LISTENING_BOOTH.y);
    ticks(state, LISTEN_TICKS + 2);
    expect(twist.grooveTicks).toBe(0);
  });

  it('Slice Station: the oven warns, then blasts heat that burns the janitor once and cooks guards', () => {
    const state = inside('slice-station');
    const inZone = { x: OVEN_ZONE.x + OVEN_ZONE.width / 2, y: OVEN_ZONE.y + OVEN_ZONE.height / 2 };
    stand(state, inZone.x, inZone.y);
    const guard = dummy(state, inZone.x, inZone.y + 20);
    const health = state.room.combat.player.health;
    const phases = new Set<string>();
    let warnedBeforeBlast = false;
    for (let i = 0; i < 300; i += 1) {
      const before = ovenPhase(state.room.twist!);
      tick(state);
      const after = ovenPhase(state.room.twist!);
      phases.add(after);
      if (before === 'warn' && after === 'blast') warnedBeforeBlast = true;
      if (after !== 'blast') expect(state.room.combat.player.health === health || state.room.combat.player.health === health - 1).toBe(true);
    }
    expect(warnedBeforeBlast).toBe(true);
    expect(state.room.combat.player.health).toBe(health - 1);
    expect(guard.health).toBeLessThan(40);

    const safe = inside('slice-station');
    stand(safe, 120, 345);
    const safeHealth = safe.room.combat.player.health;
    ticks(safe, 300);
    expect(safe.room.combat.player.health).toBe(safeHealth);
  });

  it('Video World: the rewind tile undoes the last hit taken in the store, once a visit', () => {
    const state = inside('video-world');
    stand(state, 480, 345);
    // Stepping on it unhurt does nothing and does not use it up.
    stand(state, REWIND_TILE.x, REWIND_TILE.y);
    ticks(state, 5);
    expect(state.room.twist!.rewindUsed).toBe(false);
    stand(state, 480, 345);
    const full = state.room.combat.player.health;
    state.room.combat.player.health -= 2;
    ticks(state, 2);
    stand(state, REWIND_TILE.x, REWIND_TILE.y);
    ticks(state, 2);
    expect(state.room.combat.player.health).toBe(full);
    expect(state.room.twist!.rewindUsed).toBe(true);
    stand(state, 480, 345);
    state.room.combat.player.health -= 1;
    ticks(state, 2);
    stand(state, REWIND_TILE.x, REWIND_TILE.y);
    ticks(state, 2);
    expect(state.room.combat.player.health).toBe(full - 1);
  });
});
