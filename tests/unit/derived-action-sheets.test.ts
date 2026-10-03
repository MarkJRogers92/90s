// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attackFrameFor, playerBodyAction, type Windup } from '../../src/game/view/combatBeats';
import { ACTION_FIGURE_SCALE, actionFigureScale } from '../../src/game/view/ActorSpriteView';
import { CHARACTER_ASSETS, ENEMY_TEXTURE_KEYS, NEON_ASSETS, PLAYER_TEXTURE_KEYS } from '../../src/game/presentation/assets';
import { DASH_TICKS } from '../../src/sim/combat/dash';
import type { EnemyState } from '../../src/sim/model';

const enemy = (kind: EnemyState['kind']): EnemyState => ({ id: 1, kind, x: 0, y: 0, health: 10, radius: 12, phase: 'telegraph', phaseTicks: 10, cooldownTicks: 0, telegraphAimX: 1, telegraphAimY: 0 } as EnemyState);
const windup = (kind: Windup['kind'], progress: number): Windup => ({ kind, progress, aimX: 1, aimY: 0, reach: 40 } as Windup);

describe('charge and lob wind-ups drive authored attack frames (roadmap V2)', () => {
  it('maps a charge or lob onto the four anticipation frames, then the release snap', () => {
    for (const kind of ['charge', 'lob'] as const) {
      expect(attackFrameFor(enemy('mascot'), [windup(kind, 0)], 6, 0)).toBe(0);
      expect(attackFrameFor(enemy('mascot'), [windup(kind, 0.5)], 6, 0)).toBe(2);
      expect(attackFrameFor(enemy('mascot'), [windup(kind, 0.84)], 6, 0)).toBe(3);
      expect(attackFrameFor(enemy('mascot'), [windup(kind, 0.86)], 6, 0)).toBe(4);
      expect(attackFrameFor(enemy('mascot'), [windup(kind, 1)], 6, 0)).toBe(5);
    }
  });
  it('leaves spit/slam timing and kinds without a sheet untouched', () => {
    expect(attackFrameFor(enemy('spitter'), [windup('spit', 0.5)], 6, 0)).toBe(2);
    expect(attackFrameFor(enemy('owner'), [windup('charge', 0.5)], 0, 0)).toBeNull();
  });
  it('a boss body ignores tar buckets already in the air (Developer, Santa barrages)', () => {
    const walking = { ...enemy('developer'), phase: 'pursue' } as EnemyState;
    expect(attackFrameFor(walking, [windup('lob', 0.2), windup('lob', 0.9)], 6, 0)).toBeNull();
    // Its own telegraph still winds the sheet up, and a boss charge still lunges.
    expect(attackFrameFor(enemy('developer'), [windup('slam', 0.5), windup('lob', 0.9)], 6, 0)).toBe(2);
    expect(attackFrameFor(enemy('owner'), [windup('charge', 0.9)], 6, 0)).toBe(4);
  });
  it('registers each PixelLab attack sheet (walk canvas grown evenly, feet re-registered)', () => {
    for (const [key, file, w, h] of [['neon:enemy:spritzer-attack', 'spritzer-attack.png', 624, 832], ['neon:enemy:mascot-attack', 'mascot-attack.png', 792, 1056], ['neon:enemy:roofer-attack', 'roofer-attack.png', 912, 1216], ['neon:enemy:owner-attack', 'owner-attack.png', 1032, 1376], ['neon:enemy:manager-attack', 'manager-attack.png', 768, 1024]] as const) {
      const found = NEON_ASSETS.filter((asset) => asset.key === key);
      expect(found, key).toHaveLength(1);
      expect(found[0]!.url).toBe(`/assets/neon/enemies/${file}`);
      const png = readFileSync(`public/assets/neon/enemies/${file}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([w, h]);
    }
    expect(ENEMY_TEXTURE_KEYS).toBeDefined();
  });
});

describe('Alex dashes with an authored body sheet (roadmap V4)', () => {
  const frames = { swing: 7, hurt: 6, death: 7, dash: 4 };
  const none = { swing: null, hurtAge: null, deadMs: null, dashAge: null };
  it('plays four frames across the dash', () => {
    expect(playerBodyAction({ ...none, dashAge: 0 }, frames)).toEqual({ sheet: 'dash', column: 0 });
    expect(playerBodyAction({ ...none, dashAge: DASH_TICKS / 2 }, frames)).toEqual({ sheet: 'dash', column: 2 });
    expect(playerBodyAction({ ...none, dashAge: DASH_TICKS - 1 }, frames)).toEqual({ sheet: 'dash', column: 3 });
    expect(playerBodyAction({ ...none, dashAge: DASH_TICKS }, frames)).toBeNull();
  });
  it('yields to death and hurt, and outranks a swing', () => {
    expect(playerBodyAction({ ...none, dashAge: 2, hurtAge: 1 }, frames)?.sheet).toBe('hurt');
    expect(playerBodyAction({ ...none, dashAge: 2, deadMs: 10 }, frames)?.sheet).toBe('death');
    expect(playerBodyAction({ ...none, dashAge: 2, swing: 0.5 }, frames)?.sheet).toBe('dash');
    expect(playerBodyAction({ ...none, dashAge: 2 }, { ...frames, dash: 0 })).toBeNull();
  });
  it('registers the PixelLab alex-dash at the 92 px action canvas', () => {
    expect(PLAYER_TEXTURE_KEYS.dash).toBe('neon:player:alex-dash');
    const found = CHARACTER_ASSETS.filter((asset) => asset.key === PLAYER_TEXTURE_KEYS.dash);
    expect(found).toHaveLength(1);
    const png = readFileSync(`public${found[0]!.url}`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([368, 736]);
  });
});

describe('the dash sheet follows the dash, not the aim', () => {
  it('draws the dash row for the dash direction while Alex aims elsewhere', async () => {
    const { vi } = await import('vitest');
    vi.doMock('phaser', () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
    const { MvpRunView } = await import('../../src/game/view/MvpRunView');
    const { ActorPresentationMemory } = await import('../../src/game/view/ActorSpriteView');
    const { enemyRenderer } = await import('../support/enemy-renderer');
    const renderer = enemyRenderer();
    renderer.sizes.set(PLAYER_TEXTURE_KEYS.dash, { width: 368, height: 736 });
    renderer.sizes.set(PLAYER_TEXTURE_KEYS.idle, { width: 512, height: 64 });
    renderer.sizes.set(PLAYER_TEXTURE_KEYS.walk, { width: 384, height: 512 });
    const context = Object.assign(Object.create(MvpRunView.prototype), { scene: renderer.scene, actorMemory: new ActorPresentationMemory(), actorSprites: new Map(), usedActorSpriteIds: new Set() });
    const syncSprite = Reflect.get(MvpRunView.prototype, 'syncActorSprite') as (...args: unknown[]) => { textureKey: string; direction: string; frame: { row: number; column: number } };
    // Facing (aim) north-west, dashing east.
    const alex = { id: 'player', kind: 'alex', x: 100, y: 200, moveX: 1, moveY: 0, faceX: -1, faceY: -1, attackTicks: 0, damaged: false, phase: 'idle' };
    const evidence = syncSprite.call(context, alex, 5, 200, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, flash: false, lean: 0 }, null, { sheet: 'dash', column: 1, direction: 'east' });
    expect(evidence.textureKey).toBe(PLAYER_TEXTURE_KEYS.dash);
    expect(evidence.direction).toBe('east');
    expect(evidence.frame).toEqual({ row: 6, column: 1 });
  });
});

describe('boss attack sheets drawn at their walk figure size (roadmap V2)', () => {
  it('shrinks only the sheets PixelLab re-rendered larger, around the feet', () => {
    expect(actionFigureScale('neon:enemy:owner-walk')).toBe(1);
    expect(actionFigureScale('neon:enemy:owner-attack')).toBe(1);
    for (const [key, factor] of Object.entries(ACTION_FIGURE_SCALE)) {
      expect(key).toMatch(/^neon:enemy:[a-z-]+-attack$/);
      expect(factor).toBeGreaterThan(0.75);
      expect(factor).toBeLessThan(1);
      expect(actionFigureScale(key)).toBe(factor);
    }
  });
});
