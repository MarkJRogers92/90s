import { describe, expect, it } from 'vitest';
import { bossConfigFor } from '../../src/sim/combat/boss';
import { MASCOT_CHARGE_TICKS } from '../../src/sim/combat/mascot';
import type { EnemyState, RunState } from '../../src/sim/model';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { spawnWaveMonster } from '../../src/sim/run/rooms';
import { VOLATILE_BURST_RADIUS, VOLATILE_FUSE_TICKS } from '../../src/sim/combat/eliteTraits';
import type { BotOptions } from '../balance/bot';
import { dangersOf, escapeFrom, pathCost, type Danger } from '../balance/danger';
import { crowdSweep, volatileDuel } from '../balance/duel';
import { bossFight } from '../balance/scenarios';
import { PERFUME_CLOUD_RADIUS, PERFUME_SLOW } from '../../src/sim/combat/perfume';
import { TAR_SLOW, TAR_SPLASH_RADIUS } from '../../src/sim/combat/roofer';

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

// Each case plays whole boss fights headlessly: ~3-8 s when the machine is busy, over the 5 s default.
describe('balance bot danger model (round 57 follow-up)', { timeout: 30_000 }, () => {
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
    const dangers: Danger[] = [{ key: 'test-b', damage: 2, kind: 'blast', x: 480, y: 240, reach: 80, at: 5 }];
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

  /** A lobber mid-throw: it has locked the spot (lobX, lobY) and the lob lands in `left` ticks. */
  function lobbing(combat: RunState, kind: 'roofer' | 'spritzer', lobX: number, lobY: number, left: number): EnemyState {
    const monster = spawnWaveMonster({ slotId: 'l', kind, x: 700, y: 100 }, 9, 1);
    Object.assign(monster, { phase: 'telegraph', phaseTicks: left, lobX, lobY });
    combat.enemies.push(monster);
    return monster;
  }

  it('reads a Roofer\'s locked landing spot as a blast that goes off when the bucket lands', () => {
    const combat = arena();
    lobbing(combat, 'roofer', 470, 250, 40);
    const dangers = dangersOf(combat);
    expect(dangers).toEqual([expect.objectContaining({ kind: 'blast', x: 470, y: 250, at: 40 })]);
    expect((dangers[0] as Extract<Danger, { kind: 'blast' }>).reach).toBeGreaterThan(TAR_SPLASH_RADIUS);
    expect(pathCost(combat, dangers, null).cost).toBeGreaterThan(0);
  });

  it('reads a Spritzer\'s spritz the same way, with the cloud\'s own reach', () => {
    const combat = arena();
    lobbing(combat, 'spritzer', 480, 240, 25);
    const dangers = dangersOf(combat);
    expect(dangers).toEqual([expect.objectContaining({ kind: 'blast', x: 480, y: 240, at: 25 })]);
    expect((dangers[0] as Extract<Danger, { kind: 'blast' }>).reach).toBeGreaterThan(PERFUME_CLOUD_RADIUS);
  });

  it('says nothing about a lobber that is not mid-throw', () => {
    const combat = arena();
    const resting = lobbing(combat, 'roofer', 470, 250, 40);
    resting.phase = 'recover';
    expect(dangersOf(combat)).toEqual([]);
  });

  it('reads the Developer\'s buckets in the air, each at its own spot and time, and his slam on the turns he does not throw tar', () => {
    const combat = arena();
    const developer = spawnWaveMonster({ slotId: 'd', kind: 'mascot', x: 480, y: 60 }, 7, 1);
    Object.assign(developer, { kind: 'developer', radius: 26, health: 340, phase: 'recover', tarStrikes: [{ x: 300, y: 200, ticks: 20 }, { x: 600, y: 300, ticks: 35 }] });
    combat.enemies.push(developer);
    expect(dangersOf(combat)).toEqual([
      expect.objectContaining({ kind: 'blast', x: 300, y: 200, at: 20 }),
      expect.objectContaining({ kind: 'blast', x: 600, y: 300, at: 35 }),
    ]);
    // Winding up on an even attack with tar to throw it is a slam (the odd one is the barrage).
    Object.assign(developer, { phase: 'telegraph', phaseTicks: 30, tarStrikes: [], bossPhase: 2, bossAttacks: 0 });
    expect(dangersOf(combat)).toEqual([expect.objectContaining({ kind: 'blast', x: 480, y: 60, at: 30 })]);
    developer.bossAttacks = 1;
    expect(dangersOf(combat)).toEqual([]);
  });

  it('slows a walk through tar or perfume, so a puddle can make an escape too slow (a dash is not slowed)', () => {
    const combat = arena();
    // A blast on the janitor in 25 ticks, 60 px wide: clear in 18 ticks on open floor, 33 in tar.
    const dangers: Danger[] = [{ key: 'test-a', damage: 2, kind: 'blast', x: 480, y: 240, reach: 60, at: 25 }];
    expect(pathCost(combat, dangers, { x: 1, y: 0 }).cost).toBe(0);
    combat.tar = [{ x: 480, y: 240, radius: 200, ticks: 300 }];
    expect(TAR_SLOW).toBeLessThan(0.6);
    expect(pathCost(combat, dangers, { x: 1, y: 0 }).cost).toBeGreaterThan(0);
    combat.tar = [];
    combat.perfume = [{ x: 480, y: 240, radius: 200, ticks: 200 }];
    expect(PERFUME_SLOW).toBeLessThan(0.7);
    expect(pathCost(combat, dangers, { x: 1, y: 0 }).cost).toBeGreaterThan(0);
    // A dash through it still clears.
    expect(pathCost(combat, dangers, { x: 1, y: 0 }, true).cost).toBe(0);
  });

  it('busy with bruisers, the pro bot is hit by almost every lob; the expert steps out of the ring while it fights on', () => {
    const pro: BotOptions = { skill: 'pro', shop: 'none' };
    const expert: BotOptions = { skill: 'expert', shop: 'none' };
    for (const kind of ['roofer', 'spritzer'] as const) {
      const before = crowdSweep(kind, pro);
      const after = crowdSweep(kind, expert);
      expect(before.throws, kind).toBeGreaterThan(40);
      expect(before.lobHits / before.throws, `pro vs ${kind}`).toBeGreaterThan(0.5);
      expect(after.lobHits / after.throws, `expert vs ${kind}`).toBeLessThanOrEqual(0.1);
    }
  });

  it('reads a boss\'s volley wind-up as a fan of trays that will leave him when it ends, so a point-blank volley is not a surprise', () => {
    const combat = arena();
    const owner = spawnWaveMonster({ slotId: 'o', kind: 'mascot', x: 480, y: 160 }, 5, 1);
    // Winding up a volley aimed straight down at the janitor, 30 ticks from firing.
    Object.assign(owner, { kind: 'owner', radius: 28, health: 210, phase: 'recover', bossVolleyTelegraphTicks: 30, telegraphAimX: 0, telegraphAimY: 1 });
    combat.enemies.push(owner);
    const dangers = dangersOf(combat);
    const trays = dangers.filter((danger) => danger.kind === 'shot');
    expect(trays).toHaveLength(bossConfigFor('owner').volleyAngles.length);
    for (const tray of trays) expect((tray as Extract<Danger, { kind: 'shot' }>).from).toBe(30);
    // Straight under the boss is in the fan's middle tray; a few steps to the side is not.
    expect(pathCost(combat, dangers, null).cost).toBeGreaterThan(0);
    const away = escapeFrom(combat, dangers, null);
    expect(away).not.toBeNull();
    expect(pathCost(combat, dangers, away!.heading, away!.dash).cost).toBe(0);
    // Nothing is in the air yet: before the wind-up there is nothing to read.
    owner.bossVolleyTelegraphTicks = 0;
    expect(dangersOf(combat).filter((danger) => danger.kind === 'shot')).toEqual([]);
  });

  it('survives the Owner when it notices his volley and charge inside 0.3 s and does not when it takes 0.5 s: the wind-ups were invisible to it before', () => {
    const fight = (seed: number, reaction: number) => bossFight(seed, { skill: 'expert', shop: 'none', reaction });
    for (const seed of [1, 2, 3]) {
      expect(fight(seed, 0).hpLost, `seed ${seed} at once`).toBeLessThanOrEqual(2);
      expect(fight(seed, 18).outcome, `seed ${seed} at 0.3 s`).toBe('won');
      expect(fight(seed, 30).outcome, `seed ${seed} at 0.5 s`).toBe('dead');
    }
  });

  it('prices a path in health, not in ticks: one charge costs two however long the janitor stays in it, and the grace after a hit covers what follows', () => {
    const combat = arena();
    winding(combat, 'mascot', 480, 60, 0, 1, 20);
    const dangers = dangersOf(combat);
    // Standing in the lane takes the charge once: 2 health, not a sum over every tick in contact.
    expect(pathCost(combat, dangers, null).cost).toBe(2);
    // Five trays through the same spot in the same moments: only the first lands inside the 60 ticks of grace.
    const trays: Danger[] = Array.from({ length: 5 }, (_, index) => ({ key: `tray-${index}`, kind: 'shot' as const, x: 480, y: 160, vx: 0, vy: 2.7, reach: 18, until: 200, damage: 1 }));
    expect(pathCost(combat, trays, null).cost).toBe(1);
    // Grace the janitor already has from a hit a moment ago covers a hit that lands inside it.
    combat.player.invulnerableTicks = 60;
    expect(pathCost(combat, trays, null).cost).toBe(0);
  });

  it('looks far enough ahead to see a point-blank volley land: a tray leaves after its wind-up and still has to fly', () => {
    const combat = arena();
    const owner = spawnWaveMonster({ slotId: 'o', kind: 'mascot', x: 480, y: 160 }, 5, 1);
    Object.assign(owner, { kind: 'owner', radius: 28, health: 210, phase: 'recover', bossVolleyTelegraphTicks: 45, telegraphAimX: 0, telegraphAimY: 1 });
    combat.enemies.push(owner);
    // 45 ticks of wind-up plus 30 of flight to the janitor 80 px below: 75 ticks.
    expect(pathCost(combat, dangersOf(combat), null).cost).toBeGreaterThan(0);
  });
});
