// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CombatFeedback } from '../../src/game/view/CombatFeedback';
import { NEON_ASSETS } from '../../src/game/presentation/assets';
import { enemySpriteSheet, type ActorDirection } from '../../src/game/view/ActorSpriteView';
import { REST_POSE } from '../../src/game/view/combatBeats';
import { isBossKind } from '../../src/sim/combat/boss';
import type { EnemyState } from '../../src/sim/model';
import { enemyRenderer } from '../support/enemy-renderer';

vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1 }, TintModes: { FILL: 1, MULTIPLY: 0 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));

// Roadmap V1: every remaining enemy flinches in its own art and chips its own material.
const KINDS = ['walker', 'shopper', 'mascot', 'roofer', 'spitter', 'elf', 'spritzer', 'poodle', 'goon',
  'lp_manager', 'manager', 'owner', 'developer', 'santa', 'glamour_queen', 'whiskers', 'zamboni'] as const;
type Kind = typeof KINDS[number];
const prefix = (kind: Kind) => kind.replace('_', '-');
const pngSize = (file: string): [number, number] => { const png = readFileSync(`public/assets/neon/enemies/${file}`); return [png.readUInt32BE(16), png.readUInt32BE(20)]; };
const asset = (key: string) => NEON_ASSETS.filter((entry) => entry.key === key);

/** The walk-sheet scale and feet anchor, computed the way syncActorSprite does for a grown canvas. */
function expectedSpec(kind: Kind) {
  const [width, height] = pngSize(`${prefix(kind)}-hurt.png`);
  const frame = height / 8, idleFrame = pngSize(`${prefix(kind)}-idle.png`)[1];
  expect(width).toBe(frame * 4);
  return { textureKey: `neon:enemy:${prefix(kind)}-hurt`, frameWidth: frame, frameHeight: frame, scale: enemySpriteSheet(kind, false)!.displaySize / idleFrame, feetY: (frame - idleFrame) / 2 + idleFrame * 0.84 };
}

function setup(kind: Kind) {
  const renderer = enemyRenderer(), feedback = new CombatFeedback(renderer.scene);
  for (const file of [`${prefix(kind)}-hurt.png`, `${prefix(kind)}-impact.png`]) {
    const [width, height] = pngSize(file);
    renderer.sizes.set(`neon:enemy:${file.replace('.png', '')}`, { width, height });
  }
  const enemy = (health = 40): EnemyState => ({ id: 1, kind, x: 100, y: 200, health, radius: 14, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 } as EnemyState);
  const player = { x: 400, y: 200, health: 6, invulnerableTicks: 0 };
  const sync = (tick: number, enemies: EnemyState[], facing: ActorDirection = 'west') => feedback.sync('room', tick, enemies, player, false, [], () => facing);
  return { ...renderer, feedback, sync, enemy };
}

describe.each(KINDS)('%s native hurt reaction', (kind) => {
  it('registers a 4-frame × 8-facing hurt strip and a 6 × 48 px impact strip once each', () => {
    for (const file of [`${prefix(kind)}-hurt.png`, `${prefix(kind)}-impact.png`]) {
      const found = asset(`neon:enemy:${file.replace('.png', '')}`);
      expect(found).toHaveLength(1);
      expect(found[0]!.url).toBe(`/assets/neon/enemies/${file}`);
    }
    expect(pngSize(`${prefix(kind)}-impact.png`)).toEqual([288, 48]);
  });

  it('flinches through four frames at the walk scale and feet, holding the facing it was hit in', () => {
    const { feedback, sync, enemy } = setup(kind);
    const ticks = isBossKind(kind) ? [2, 2, 2, 1] : [3, 3, 4, 4];
    sync(0, [enemy()]); sync(1, [enemy(39)]);
    let age = 0;
    for (const [column, length] of ticks.entries()) {
      sync(1 + age, [enemy(39)], 'east');
      expect(feedback.hurtFor('enemy:1', 1 + age)).toMatchObject({ direction: 'west', frame: { row: 2, column }, spec: expectedSpec(kind) });
      age += length;
    }
    expect(feedback.hurtFor('enemy:1', 1 + age)).toBeNull();
  });

  it('chips its own material instead of blood, with no flash pose', () => {
    const { feedback, sync, images, enemy } = setup(kind);
    sync(0, [enemy()]); sync(1, [enemy(39)]);
    expect(images.some((image) => image.texture.key === `neon:enemy:${prefix(kind)}-impact`)).toBe(true);
    expect(images.filter((image) => image.texture.key.includes('decal:'))).toEqual([]);
    expect(feedback.poseFor('enemy:1', 1)).toEqual(REST_POSE);
  });

  it('falls back to the generic flash when its hurt art is missing', () => {
    const { feedback, sync, enemy, missing } = setup(kind);
    missing.add(`neon:enemy:${prefix(kind)}-hurt`);
    sync(0, [enemy()]); sync(1, [enemy(39)]);
    expect(feedback.hurtFor('enemy:1', 1)).toBeNull();
    expect(feedback.poseFor('enemy:1', 1).flash).toBe(true);
  });
});

describe('which flinches may interrupt an attack pose', () => {
  it('only the contact biters (Hanger, Mall Walker); every wind-up keeps priority', async () => {
    const { hurtOutranksAttack } = await import('../../src/game/view/EnemyReactionView');
    expect(hurtOutranksAttack('walker')).toBe(true);
    for (const kind of KINDS.filter((entry) => entry !== 'walker')) expect(hurtOutranksAttack(kind)).toBe(false);
  });
});
