import { describe, expect, it } from 'vitest';
import {
  SWIFT_SPEED_MULTIPLIER,
  VOLATILE_BURST_RADIUS,
  VOLATILE_FUSE_TICKS,
  rollEliteTrait,
} from '../../src/sim/combat/eliteTraits';
import { PlaytestRecorder } from '../../src/game/playtest/recorder';
import { effectiveSpeedMultiplier } from '../../src/sim/effects/statuses';
import type { EnemyState } from '../../src/sim/model';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { buildRoomCombatState } from '../../src/sim/run/rooms';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpRunState } from '../../src/sim/run/types';

const idle = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** A run in a fight room with exactly the given enemies, the janitor at (x, y). */
function arena(enemies: Partial<EnemyState>[], at = { x: 480, y: 240 }): MvpRunState {
  const state = createMvpRun(7);
  state.room.combat.walls = [];
  state.room.combat.projectiles = [];
  state.room.combat.player.x = at.x;
  state.room.combat.player.y = at.y;
  state.room.combat.enemies = enemies.map((enemy, index) => ({
    id: 900 + index,
    kind: 'hanger',
    x: 0,
    y: 0,
    health: 8,
    radius: 14,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
    ...enemy,
  })) as EnemyState[];
  state.room.combat.roomWasPopulated = true;
  state.room.cleared = false;
  return state;
}

describe('elite traits (round 57)', () => {
  it('rolls a trait from the seed: stable, and about half and half', () => {
    const traits = Array.from({ length: 400 }, (_, index) => rollEliteTrait(31, Math.floor(index / 8), index % 8));
    expect(traits).toEqual(Array.from({ length: 400 }, (_, index) => rollEliteTrait(31, Math.floor(index / 8), index % 8)));
    const swift = traits.filter((trait) => trait === 'swift').length;
    expect(swift).toBeGreaterThan(140);
    expect(swift).toBeLessThan(260);
    expect(traits.every((trait) => trait === 'swift' || trait === 'volatile')).toBe(true);
  });

  it('gives every Clearance elite a trait and nothing else one', () => {
    let elites = 0;
    let plain = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const wing = createMvpRun(seed).wing;
      for (let room = 0; room < wing.rooms.length; room += 1) {
        const combat = buildRoomCombatState(wing, room, 'west', createMvpRun(seed).inventory, seed, 0);
        for (const enemy of combat.enemies) {
          if (enemy.elite) {
            elites += 1;
            expect(enemy.trait === 'swift' || enemy.trait === 'volatile').toBe(true);
          } else {
            plain += 1;
            expect(enemy.trait).toBeUndefined();
          }
        }
      }
    }
    expect(elites).toBeGreaterThan(0);
    expect(plain).toBeGreaterThan(elites);
  });

  it('Swift moves a third faster than the same monster without it', () => {
    expect(SWIFT_SPEED_MULTIPLIER).toBeGreaterThan(1.2);
    const swift = arena([{ x: 800, y: 240, elite: true, trait: 'swift', health: 99 }]);
    const plain = arena([{ x: 800, y: 240, elite: true, health: 99 }]);
    for (let tick = 0; tick < 40; tick += 1) {
      tickMvpRun(swift, idle);
      tickMvpRun(plain, idle);
    }
    const travelled = (state: MvpRunState) => 800 - state.room.combat.enemies[0]!.x;
    expect(travelled(plain)).toBeGreaterThan(10);
    expect(travelled(swift) / travelled(plain)).toBeGreaterThan(1.25);
    expect(travelled(swift) / travelled(plain)).toBeLessThan(1.45);
  });

  it('keeps Sticky working on a Swift monster: slowed things stay slowed', () => {
    const swift: EnemyState = arena([{ trait: 'swift', elite: true }]).room.combat.enemies[0]!;
    expect(effectiveSpeedMultiplier(swift)).toBeCloseTo(SWIFT_SPEED_MULTIPLIER, 5);
    swift.statuses = { wetTicks: 0, stickyTicks: 30, stickyMultiplier: 0.5 };
    expect(effectiveSpeedMultiplier(swift)).toBeLessThan(SWIFT_SPEED_MULTIPLIER);
    expect(effectiveSpeedMultiplier(swift)).toBeCloseTo(0.5 * SWIFT_SPEED_MULTIPLIER, 1);
  });

  /** One tick of the janitor swinging the mop at enemy `index`, close enough to kill it (1 health). */
  function slay(state: MvpRunState, index: number): void {
    const target = state.room.combat.enemies[index]!;
    tickMvpRun(state, { ...idle, aimX: target.x, aimY: target.y, fire: true });
  }

  /** The elite (id 900) is gone from the room: the combat step removes the fallen. */
  const fallen = (state: MvpRunState): boolean => !state.room.combat.enemies.some((enemy) => enemy.id === 900);

  /** A janitor at (570, 240) with a 1-health elite of `trait` 30 px east, and a far-off bruiser to keep the room open. */
  function slayable(trait: 'swift' | 'volatile', health = 6): MvpRunState {
    const state = arena([{ x: 600, y: 240, elite: true, trait, health: 1 }, { x: 900, y: 440, health: 9999 }], { x: 570, y: 240 });
    state.room.combat.player.health = health;
    return state;
  }

  it('Volatile leaves a burst where it fell, with a fuse to run from', () => {
    const state = slayable('volatile');
    slay(state, 0);
    expect(fallen(state)).toBe(true);
    const bursts = state.room.combat.bursts ?? [];
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({ x: 600, y: 240 });
    expect(bursts[0]!.fuseTicks).toBeGreaterThan(0);
    expect(bursts[0]!.fuseTicks).toBeLessThanOrEqual(VOLATILE_FUSE_TICKS);
  });

  it('a janitor who stays in the burst is hurt when the fuse runs out; one who steps clear is not', () => {
    const stays = slayable('volatile');
    const leaves = slayable('volatile');
    slay(stays, 0);
    slay(leaves, 0);
    for (let tick = 0; tick < VOLATILE_FUSE_TICKS + 2; tick += 1) {
      tickMvpRun(stays, idle);
      // Walking west, away from the burst at x=600, until clear of its reach.
      tickMvpRun(leaves, { ...idle, moveX: -1 });
    }
    expect(stays.room.combat.player.health).toBe(5);
    expect(Math.abs(leaves.room.combat.player.x - 600)).toBeGreaterThan(VOLATILE_BURST_RADIUS);
    expect(leaves.room.combat.player.health).toBe(6);
    // Both bursts are spent.
    expect(stays.room.combat.bursts ?? []).toHaveLength(0);
    expect(leaves.room.combat.bursts ?? []).toHaveLength(0);
  });

  it('does not hurt a janitor in the burst who is in the usual grace period after a hit', () => {
    const state = slayable('volatile');
    slay(state, 0);
    for (let tick = 0; tick < VOLATILE_FUSE_TICKS + 2; tick += 1) {
      state.room.combat.player.invulnerableTicks = 200;
      tickMvpRun(state, idle);
    }
    expect(state.room.combat.player.health).toBe(6);
  });

  it('a burst can finish a janitor on one heart, and the shift ends', () => {
    const state = slayable('volatile', 1);
    slay(state, 0);
    for (let tick = 0; tick < VOLATILE_FUSE_TICKS + 4; tick += 1) tickMvpRun(state, idle);
    expect(state.status).toBe('dead');
  });

  it('a Swift elite dies like any other: no burst', () => {
    const state = slayable('swift');
    slay(state, 0);
    expect(fallen(state)).toBe(true);
    expect(state.room.combat.bursts ?? []).toHaveLength(0);
  });

  it('the playtest log names a burst as its own damage source, not "other"', () => {
    const recorder = new PlaytestRecorder();
    const state = slayable('volatile');
    recorder.observe(state);
    slay(state, 0);
    recorder.observe(state);
    for (let tick = 0; tick < VOLATILE_FUSE_TICKS + 2; tick += 1) {
      tickMvpRun(state, idle);
      recorder.observe(state);
    }
    const record = recorder.finish(state, 'quit')!;
    const damage = record.rooms.at(-1)!.damage;
    expect(damage.burst).toBe(1);
    expect(damage.other).toBe(0);
  });
});
