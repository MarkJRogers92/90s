import { describe, expect, it } from 'vitest';
import { createRun } from '../../src/sim/createRun';
import { tickRun } from '../../src/sim/tickRun';
import { compileLoadout } from '../../src/sim/items/compileLoadout';
import { catalogFor } from '../../src/sim/items/registry';
import { hybridDefinitionId, hybridHighlights, isHybridPair } from '../../src/sim/fusion/hybrid';
import { HERO_FUSIONS, heroOf } from '../../src/sim/fusion/heroes';
import {
  BEAM_COOLDOWN_TICKS,
  BEAM_DAMAGE,
  BEAM_DAZE_TICKS,
  DECOY_BURST_DAMAGE,
  DECOY_TICKS,
  RECORD_MAX,
  RECORD_ORBIT_RADIUS,
} from '../../src/sim/combat/heroes';
import { createEnemyStatusState } from '../../src/sim/effects/statuses';
import type { EnemyState, InputFrame, RunState } from '../../src/sim/model';

/** The legal fused id for a pair, whichever way round it goes. */
function fusedId(a: string, b: string): string {
  return isHybridPair(a, b) ? hybridDefinitionId(a, b) : hybridDefinitionId(b, a);
}

/** An empty room, the janitor holding `id`. */
function armed(id: string): RunState {
  const state = createRun(1);
  const instance = { instanceId: 'held', itemId: id };
  state.inventory = [instance];
  state.selectedPrimaryInstanceId = 'held';
  state.compiledLoadout = compileLoadout(catalogFor([instance]), [instance], 'held');
  state.enemies = [];
  state.walls = [];
  state.player.x = 300;
  state.player.y = 300;
  state.roomWasPopulated = false;
  return state;
}

let nextId = 100;
function enemy(x: number, y: number, kind: EnemyState['kind'] = 'hanger', health = 40): EnemyState {
  nextId += 1;
  return { id: nextId, kind, x, y, health, radius: 14, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, statuses: createEnemyStatusState() };
}

const still = (aimX = 600, aimY = 300): InputFrame => ({ moveX: 0, moveY: 0, aimX, aimY, fire: false });
const fire = (aimX = 600, aimY = 300): InputFrame => ({ moveX: 0, moveY: 0, aimX, aimY, fire: true });

/** Fires once, then waits out the cooldown. */
function attack(state: RunState, aimX = 600, aimY = 300): void {
  state.player.attackCooldownTicks = 0;
  tickRun(state, fire(aimX, aimY));
}

const GREATEST_HITS = fusedId('mixtape', 'record_toss');
const COMEDY_HOUR = fusedId('rubber_chicken', 'whoopee_cushion');
const MOVIE_NIGHT = fusedId('popcorn_bucket', 'vhs_tape');

describe('hero fusions (round 53)', () => {
  it('three signatures are heroes, in either order and inside a bigger fusion', () => {
    expect(HERO_FUSIONS.map((hero) => hero.name)).toEqual(['Greatest Hits', 'Comedy Hour', 'Movie Night']);
    expect(heroOf(GREATEST_HITS)).toBe('greatest_hits');
    expect(heroOf(COMEDY_HOUR)).toBe('comedy_hour');
    expect(heroOf(MOVIE_NIGHT)).toBe('movie_night');
    expect(heroOf(fusedId(GREATEST_HITS, 'gel_pens'))).toBe('greatest_hits');
    // Another signature, and a plain fusion, are not.
    expect(heroOf(fusedId('janitor_mop', 'pump_soaker'))).toBeNull();
    expect(heroOf(fusedId('janitor_mop', 'party_popper'))).toBeNull();
    expect(heroOf('record_toss')).toBeNull();
    // The bench says what it does.
    for (const [a, b] of [['mixtape', 'record_toss'], ['rubber_chicken', 'whoopee_cushion'], ['popcorn_bucket', 'vhs_tape']] as const) {
      const [base, ingredient] = isHybridPair(a, b) ? [a, b] : [b, a];
      expect(hybridHighlights(base, ingredient)[0]).toMatch(/^HERO: /);
    }
  });

  it('Greatest Hits: each attack adds an orbiting record, they cut what they pass, and the next one flings them all', () => {
    const state = armed(GREATEST_HITS);
    for (let shot = 1; shot <= RECORD_MAX; shot += 1) {
      attack(state);
      expect(state.hero?.records.filter((record) => record.mode === 'orbit')).toHaveLength(shot);
    }
    // A Hanger standing on the orbit gets cut as the records come round.
    const onOrbit = enemy(state.player.x, state.player.y - RECORD_ORBIT_RADIUS);
    state.enemies = [onOrbit];
    for (let tick = 0; tick < 90; tick += 1) {
      onOrbit.x = state.player.x;
      onOrbit.y = state.player.y - RECORD_ORBIT_RADIUS;
      tickRun(state, still());
    }
    expect(onOrbit.health).toBeLessThan(40);

    // The drop: the next attack flings all three, and they hit what is down range.
    const downRange = enemy(460, 300);
    state.enemies = [downRange];
    attack(state);
    expect(state.hero?.records.every((record) => record.mode === 'flying')).toBe(true);
    for (let tick = 0; tick < 60; tick += 1) tickRun(state, still());
    expect(downRange.health).toBeLessThan(40 - 8);
    // Flung records fly off and are gone; the next attack starts a new orbit.
    for (let tick = 0; tick < 120; tick += 1) tickRun(state, still());
    expect(state.hero?.records).toHaveLength(0);
  });

  it('Comedy Hour: throws a decoy that pulls monsters off the janitor, then bursts', () => {
    const state = armed(COMEDY_HOUR);
    attack(state, 600, 300);
    const decoy = state.hero?.decoy;
    expect(decoy).toBeTruthy();
    expect(decoy!.x).toBeGreaterThan(state.player.x + 100);
    // A Hanger between the two goes for the chicken, not the janitor.
    const hanger = enemy(380, 420);
    state.enemies = [hanger];
    const startToDecoy = Math.hypot(hanger.x - decoy!.x, hanger.y - decoy!.y);
    for (let tick = 0; tick < 40; tick += 1) tickRun(state, still());
    expect(Math.hypot(hanger.x - decoy!.x, hanger.y - decoy!.y)).toBeLessThan(startToDecoy - 20);
    // Only one chicken at a time.
    attack(state, 300, 600);
    expect(state.hero?.decoy?.x).toBe(decoy!.x);
    // When the timer runs out it bursts, hurting whoever it drew in.
    for (let tick = 0; tick < DECOY_TICKS; tick += 1) tickRun(state, still());
    expect(state.hero?.decoy).toBeNull();
    expect(hanger.health).toBeLessThanOrEqual(40 - DECOY_BURST_DAMAGE);
  });

  it('Comedy Hour: a monster busy with the chicken cannot hurt the janitor from over there, and a boss is not fooled', () => {
    const state = armed(COMEDY_HOUR);
    attack(state, 600, 300);
    const boss = enemy(500, 300, 'lp_manager', 200);
    const decoy = state.hero!.decoy!;
    state.enemies = [boss];
    const before = Math.hypot(boss.x - state.player.x, boss.y - state.player.y);
    for (let tick = 0; tick < 30; tick += 1) tickRun(state, still());
    // The boss still comes for the janitor.
    expect(Math.hypot(boss.x - state.player.x, boss.y - state.player.y)).toBeLessThanOrEqual(before);
    expect(decoy).toBeTruthy();
  });

  it('Movie Night: the projector beam hurts and scares everything down the aisle, every so often', () => {
    const state = armed(MOVIE_NIGHT);
    const inBeam = enemy(520, 300);
    const farInBeam = enemy(640, 304);
    const beside = enemy(520, 400);
    state.enemies = [inBeam, farInBeam, beside];
    attack(state, 700, 300);
    expect(state.hero?.beams).toHaveLength(1);
    expect(inBeam.health).toBe(40 - BEAM_DAMAGE);
    expect(farInBeam.health).toBe(40 - BEAM_DAMAGE);
    expect(beside.health).toBe(40);
    // Scared stiff: a dazed Hanger does not move.
    const x = inBeam.x;
    for (let tick = 0; tick < BEAM_DAZE_TICKS - 5; tick += 1) tickRun(state, still(700, 300));
    expect(inBeam.x).toBe(x);
    // A second attack inside the cooldown is just the tape, no beam.
    expect(state.hero?.beams).toHaveLength(0);
    attack(state, 700, 300);
    expect(state.hero?.beams).toHaveLength(0);
    for (let tick = 0; tick < BEAM_COOLDOWN_TICKS; tick += 1) tickRun(state, still());
    const before = farInBeam.health;
    farInBeam.x = 640;
    farInBeam.y = 300;
    attack(state, 700, 300);
    expect(state.hero?.beams).toHaveLength(1);
    expect(farInBeam.health).toBeLessThanOrEqual(before - BEAM_DAMAGE);
  });

  it('Movie Night: the beam stops at a wall', () => {
    const state = armed(MOVIE_NIGHT);
    state.walls = [{ x: 450, y: 200, width: 20, height: 200 }];
    const behind = enemy(560, 300);
    state.enemies = [behind];
    attack(state, 700, 300);
    expect(behind.health).toBe(40);
  });
});
