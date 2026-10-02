import { describe, expect, it } from 'vitest';
import { bossConfigFor } from '../../src/sim/combat/boss';
import { MASCOT_CHARGE_TICKS } from '../../src/sim/combat/mascot';
import type { EnemyState, RunState } from '../../src/sim/model';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { spawnWaveMonster } from '../../src/sim/run/rooms';
import { VOLATILE_BURST_RADIUS, VOLATILE_FUSE_TICKS } from '../../src/sim/combat/eliteTraits';
import type { BotOptions } from '../balance/bot';
import { dangersOf, escapeFrom, pathCost, type Danger } from '../balance/danger';
import { volatileDuel } from '../balance/duel';

/** An empty room with the janitor at (480, 240) and nothing else in it. */
function arena(): RunState {
  const combat = createMvpRun(7).room.combat;
  combat.walls = [];
  combat.projectiles = [];
  combat.enemies = [];
  combat.player.x = 480;
  combat.player.y = 240;
  return combat;
}

/** A monster of `kind` winding up at (x, y) with a lane locked along (dx, dy), `left` ticks from its charge. */
function winding(combat: RunState, kind: 'mascot' | 'shopper', x: number, y: number, dx: number, dy: number, left: number): EnemyState {
  const monster = spawnWaveMonster({ slotId: 'w', kind, x, y }, 1, 1);
  Object.assign(monster, { phase: 'telegraph', phaseTicks: left, telegraphAimX: dx, telegraphAimY: dy });
  combat.enemies.push(monster);
  return monster;
}

describe('balance bot danger model (round 57 follow-up)', () => {
  it('reads a Mascot Brute winding up as a charge that starts when the wind-up ends', () => {
    const combat = arena();
    winding(combat, 'mascot', 480, 80, 0, 1, 30);
    const dangers = dangersOf(combat);
    expect(dangers).toHaveLength(1);
    expect(dangers[0]).toMatchObject({ kind: 'charge', from: 30, ticks: MASCOT_CHARGE_TICKS, dx: 0, dy: 1 });
  });

  it('ignores a stunned or dormant charger, a player shot, and a monster it does not model', () => {
    const combat = arena();
    const stunned = winding(combat, 'mascot', 300, 80, 0, 1, 30);
    stunned.stunnedTicks = 40;
    const dormant = winding(combat, 'shopper', 600, 80, 0, 1, 30);
    dormant.dormant = true;
    combat.enemies.push(spawnWaveMonster({ slotId: 'h', kind: 'hanger', x: 500, y: 100 }, 3, 1));
    combat.projectiles.push({ id: 1, x: 100, y: 100, previousX: 100, previousY: 100, velocityX: 3, velocityY: 0, radius: 4, remainingTicks: 60, faction: 'player', damage: 1 });
    expect(dangersOf(combat)).toEqual([]);
  });

  it('reads an enemy shot, and the Owner as a blast on his slam turns and a charge on his charge turns', () => {
    const combat = arena();
    combat.projectiles.push({ id: 2, x: 100, y: 240, previousX: 100, previousY: 240, velocityX: 3, velocityY: 0, radius: 5, remainingTicks: 90, faction: 'enemy', damage: 1 });
    // The Owner, built from a monster: the model reads his kind, radius, phase and attack count.
    const owner = spawnWaveMonster({ slotId: 'o', kind: 'mascot', x: 480, y: 80 }, 5, 1);
    Object.assign(owner, { kind: 'owner', radius: 28, health: 210 });
    Object.assign(owner, { phase: 'telegraph', phaseTicks: 20, telegraphAimX: 0, telegraphAimY: 1, bossPhase: 2, bossAttacks: 0 });
    combat.enemies.push(owner);
    const slam = dangersOf(combat).filter((danger) => danger.kind !== 'shot');
    expect(slam).toEqual([expect.objectContaining({ kind: 'blast', at: 20 })]);
    expect((slam[0] as Extract<Danger, { kind: 'blast' }>).reach).toBeGreaterThan(bossConfigFor('owner').slamReach);
    owner.bossAttacks = 1;
    const charge = dangersOf(combat).filter((danger) => danger.kind === 'charge');
    expect(charge).toEqual([expect.objectContaining({ kind: 'charge', from: 20, ticks: bossConfigFor('owner').charge!.ticks })]);
    expect(dangersOf(combat).filter((danger) => danger.kind === 'shot')).toHaveLength(1);
    // Phase one has no charge turn: the odd attack is a slam as well.
    owner.bossPhase = 1;
    expect(dangersOf(combat).filter((danger) => danger.kind === 'blast')).toHaveLength(1);
  });

  it('prices a path by what it meets: standing in a lane is hit, walking out of it is not, walking along it is hit sooner', () => {
    const combat = arena();
    winding(combat, 'mascot', 480, 60, 0, 1, 20);
    const dangers = dangersOf(combat);
    const stand = pathCost(combat, dangers, null);
    const sideways = pathCost(combat, dangers, { x: 1, y: 0 });
    const toward = pathCost(combat, dangers, { x: 0, y: -1 });
    expect(stand.cost).toBeGreaterThan(0);
    expect(sideways.cost).toBe(0);
    expect(toward.cost).toBeGreaterThan(0);
    expect(toward.firstHit!).toBeLessThan(stand.firstHit!);
  });

  it('leaves a bot alone when its wanted heading is safe, and otherwise steps across the lane, not along it', () => {
    const combat = arena();
    winding(combat, 'mascot', 480, 60, 0, 1, 25);
    const dangers = dangersOf(combat);
    expect(escapeFrom(combat, dangers, { x: 1, y: 0 })).toBeNull();
    const escape = escapeFrom(combat, dangers, { x: 0, y: -1 })!;
    expect(escape).not.toBeNull();
    expect(pathCost(combat, dangers, escape.heading, escape.dash).cost).toBe(0);
    // Slips out of the lane (which runs along y) while still closing in: some sideways, not straight along it.
    expect(Math.abs(escape.heading!.x)).toBeGreaterThan(0.2);
  });

  it('keeps last tick\'s way out instead of trading it for an equal one every tick (the shuffle that stood a bot in a lane)', () => {
    const combat = arena();
    // Close enough that its 144 px charge reaches the janitor.
    winding(combat, 'shopper', 480, 130, 0, 1, 25);
    const dangers = dangersOf(combat);
    const first = escapeFrom(combat, dangers, { x: 0, y: -1 })!;
    expect(first.heading).not.toBeNull();
    // The same threat a step later, the bot's wish nudged the other way: an equal way out exists both sides.
    // (Wishes that would themselves be hit; a safe wish needs no escape at all.)
    const wishes = [{ x: 0.1, y: -1 }, { x: -0.1, y: -1 }, { x: 0, y: -1 }, null];
    for (const wish of wishes) {
      const again = escapeFrom(combat, dangers, wish, first)!;
      expect(again.heading).toEqual(first.heading);
    }
  });

  it('dashes only when walking cannot get clear in time, and a dash\'s own twelve ticks are safe', () => {
    const combat = arena();
    // A blast landing on the janitor in 5 ticks, with walls close on both sides: no walking out.
    combat.walls = [
      { x: 440, y: 0, width: 10, height: 480 },
      { x: 510, y: 0, width: 10, height: 480 },
    ];
    const dangers: Danger[] = [{ kind: 'blast', x: 480, y: 240, reach: 80, at: 5 }];
    expect(pathCost(combat, dangers, null).cost).toBeGreaterThan(0);
    expect(pathCost(combat, dangers, { x: 0, y: -1 }, true).cost).toBe(0);
    combat.player.dashCooldownTicks = 0;
    const escape = escapeFrom(combat, dangers, null)!;
    expect(escape.dash).toBe(true);
    combat.player.dashCooldownTicks = 30;
    expect(escapeFrom(combat, dangers, null)!.dash).toBe(false);
  });

  it('reads a Volatile elite\'s lit fuse as a blast that goes off when the fuse runs out', () => {
    const combat = arena();
    combat.bursts = [{ x: 500, y: 240, fuseTicks: VOLATILE_FUSE_TICKS }];
    const blast = dangersOf(combat);
    expect(blast).toEqual([expect.objectContaining({ kind: 'blast', x: 500, y: 240, at: VOLATILE_FUSE_TICKS })]);
    expect((blast[0] as Extract<Danger, { kind: 'blast' }>).reach).toBeGreaterThan(VOLATILE_BURST_RADIUS);
    // Standing in it is hit; stepping clear in time is not.
    expect(pathCost(combat, blast, null).cost).toBeGreaterThan(0);
    const escape = escapeFrom(combat, blast, null)!;
    expect(pathCost(combat, blast, escape.heading, escape.dash).cost).toBe(0);
  });

  it('the expert steps clear of a fallen Volatile elite\'s burst from every side; the pro bot, which cannot see it, is caught', () => {
    const pro: BotOptions = { skill: 'pro', shop: 'none' };
    const expert: BotOptions = { skill: 'expert', shop: 'none' };
    const bearings = Array.from({ length: 8 }, (_, index) => (index / 8) * Math.PI * 2 + 0.3);
    const lost = (options: BotOptions) => bearings.reduce((sum, bearing) => sum + volatileDuel(options, bearing, 120), 0);
    expect(lost(expert)).toBe(0);
    expect(lost(pro)).toBeGreaterThan(0);
  });
});
