import { describe, expect, it } from 'vitest';
import {
  ELF_CROUCH_TICKS,
  ELF_HOP_RANGE,
  ELF_HOP_TICKS,
  GOON_WINDUP_TICKS,
  POODLE_CROUCH_TICKS,
  POODLE_DASH_TICKS,
  SPRITZ_WINDUP_TICKS,
} from '../../src/sim/combat/districtEnemies';
import { PERFUME_SLOW } from '../../src/sim/combat/perfume';
import { BOSS_CONFIGS } from '../../src/sim/combat/boss';
import { tickRun } from '../../src/sim/tickRun';
import type { EnemyState } from '../../src/sim/model';
import { advance, emptyFixture, frame } from '../helpers';

const monster = (kind: EnemyState['kind'], x: number, y: number, overrides: Partial<EnemyState> = {}): EnemyState => ({
  id: 80, kind, x, y, health: 20, radius: 13, phase: 'recover', phaseTicks: 1, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, ...overrides,
} as EnemyState);

describe('the district monsters (round 50)', () => {
  it('an Elf marks a landing ring within reach, leaps, and stomps a janitor who stays put', () => {
    const state = emptyFixture();
    const p = state.player;
    state.enemies = [monster('elf', p.x + 300, p.y)];
    tickRun(state, frame());
    const elf = state.enemies[0]!;
    expect(elf.phase).toBe('telegraph');
    // Too far to reach in one hop: it lands short, on the line to the janitor.
    expect(Math.hypot(elf.lobX! - (p.x + 300), elf.lobY! - p.y)).toBeCloseTo(ELF_HOP_RANGE, 0);
    advance(state, frame(), ELF_CROUCH_TICKS + ELF_HOP_TICKS + 2);
    expect(state.enemies[0]!.x).toBeCloseTo(elf.lobX!, 0);
    expect(state.player.health).toBe(6);
    // Close enough to land on: a stomp.
    const near = emptyFixture();
    near.enemies = [monster('elf', near.player.x + 90, near.player.y)];
    advance(near, frame(), 1 + ELF_CROUCH_TICKS + ELF_HOP_TICKS + 2);
    expect(near.player.health).toBe(5);
  });

  it('a Spritzer stings where she aims and leaves a cloud that slows walking', () => {
    const state = emptyFixture();
    const p = state.player;
    state.enemies = [monster('spritzer', p.x + 200, p.y)];
    advance(state, frame(), 2 + SPRITZ_WINDUP_TICKS + 1);
    expect(state.player.health).toBe(5);
    expect(state.perfume ?? []).toHaveLength(1);
    // Walking through it is slower than walking outside it.
    const x = state.player.x;
    tickRun(state, { ...frame(), moveX: -1 });
    const inCloud = x - state.player.x;
    const clean = emptyFixture();
    const cx = clean.player.x;
    tickRun(clean, { ...frame(), moveX: -1 });
    expect(inCloud).toBeCloseTo((cx - clean.player.x) * PERFUME_SLOW, 5);
  });

  it('a Poodle crouches, then dashes a short lane and bites only on the dash', () => {
    const state = emptyFixture();
    const p = state.player;
    state.enemies = [monster('poodle', p.x + 110, p.y, { radius: 12 })];
    tickRun(state, frame());
    expect(state.enemies[0]!.phase).toBe('telegraph');
    expect(state.player.health).toBe(6);
    advance(state, frame(), POODLE_CROUCH_TICKS + POODLE_DASH_TICKS);
    expect(state.player.health).toBe(5);
  });

  it('a Hockey Goon skates in with momentum and slaps a puck down a locked lane', () => {
    const state = emptyFixture();
    const p = state.player;
    state.enemies = [monster('goon', p.x + 260, p.y, { phase: 'pursue', cooldownTicks: 1 })];
    tickRun(state, frame());
    expect(state.enemies[0]!.phase).toBe('telegraph');
    advance(state, frame(), GOON_WINDUP_TICKS);
    expect(state.projectiles.filter((shot) => shot.faction === 'enemy')).toHaveLength(1);
    expect(state.projectiles[0]!.velocityX).toBeLessThan(0);
    // Left to skate, it builds speed toward the janitor.
    const skater = emptyFixture();
    skater.enemies = [monster('goon', skater.player.x + 300, skater.player.y, { phase: 'pursue', cooldownTicks: 999 })];
    advance(skater, frame(), 30);
    expect(Math.abs(skater.enemies[0]!.vx ?? 0)).toBeGreaterThan(1.5);
  });

  it('Mall Santa lobs coal only from his second phase', () => {
    expect(BOSS_CONFIGS.santa.tarBarrage!.counts[0]).toBe(0);
    expect(BOSS_CONFIGS.santa.tarBarrage!.counts[1]).toBeGreaterThan(0);
  });
});
