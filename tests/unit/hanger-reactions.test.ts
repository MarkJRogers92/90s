// @ts-expect-error Node is supplied by Vitest for fixture inspection.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { CombatFeedback } from '../../src/game/view/CombatFeedback';
import { ENEMY_TEXTURE_KEYS, NEON_ASSETS } from '../../src/game/presentation/assets';
import { HANGER_HURT_FRAME_TICKS } from '../../src/game/view/EnemyReactionView';
import { REST_POSE } from '../../src/game/view/combatBeats';
import type { ActorDirection } from '../../src/game/view/ActorSpriteView';
import type { EnemyState } from '../../src/sim/model';
import { enemyRenderer } from '../support/enemy-renderer';

vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1 }, TintModes: { FILL: 1, MULTIPLY: 0 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
const hanger = (health = 12, id = 1): EnemyState => ({ id, kind: 'hanger', x: 100, y: 200, health, radius: 12, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 } as EnemyState);
const player = { x: 400, y: 200, health: 6, invulnerableTicks: 0 };
function setup() {
  const renderer = enemyRenderer(), feedback = new CombatFeedback(renderer.scene);
  const sync = (tick: number, enemies: EnemyState[], facing: ActorDirection = 'west') => feedback.sync('room', tick, enemies, player, false, [], () => facing);
  return { ...renderer, feedback, sync };
}

describe('Hanger native reaction assets', () => {
  it.each([
    [ENEMY_TEXTURE_KEYS.hangerHurt, 'hanger-hurt.png', 368, 736],
    [ENEMY_TEXTURE_KEYS.hangerShellImpact, 'hanger-shell-impact.png', 288, 48],
  ])('registers %s once with its exact local dimensions', (key, file, width, height) => {
    const found = NEON_ASSETS.filter((asset) => asset.key === key);
    expect(found).toHaveLength(1);
    expect(found[0]!.url).toBe(`/assets/neon/enemies/${file}`);
    const png = readFileSync(`public${found[0]!.url}`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([width, height]);
  });
  it('plays four frames over 14 ticks, like the other material flinches', () => {
    expect(HANGER_HURT_FRAME_TICKS).toEqual([3, 3, 4, 4]);
  });
});

describe('Hanger hits use its chitin, not blood', () => {
  it('selects the hurt strip at the walk-sheet scale and feet anchor, holding the displayed facing', () => {
    const { feedback, sync } = setup();
    sync(0, [hanger()]); sync(1, [hanger(11)]);
    for (const [age, column] of [[0, 0], [3, 1], [6, 2], [10, 3]] as const) {
      sync(1 + age, [hanger(11)], 'east');
      expect(feedback.hurtFor('enemy:1', 1 + age)).toMatchObject({
        direction: 'west', frame: { row: 2, column },
        spec: { textureKey: ENEMY_TEXTURE_KEYS.hangerHurt, frameWidth: 92, frameHeight: 92, scale: 1, feetY: 67.76 },
      });
    }
    sync(15, [hanger(11)]); expect(feedback.hurtFor('enemy:1', 15)).toBeNull();
  });
  it('spawns a shell-chip impact and no blood decal, star or white flash pose', () => {
    const { feedback, sync, images, marks } = setup();
    sync(0, [hanger()]); marks.length = 0;
    sync(1, [hanger(11)]);
    expect(images.some((image) => image.texture.key === ENEMY_TEXTURE_KEYS.hangerShellImpact)).toBe(true);
    expect(images.filter((image) => image.texture.key.includes('decal:'))).toEqual([]);
    expect(feedback.poseFor('enemy:1', 1)).toEqual(REST_POSE);
  });
  it('yields to an attack pose, and falls back to the generic flash when the art is missing or the wrong size', () => {
    const { feedback, sync, missing, sizes } = setup();
    sync(0, [hanger()]); sync(1, [hanger(11)]);
    expect(feedback.hurtFor('enemy:1', 1, true)).toBeNull();
    missing.add(ENEMY_TEXTURE_KEYS.hangerHurt);
    expect(feedback.hurtFor('enemy:1', 1)).toBeNull();
    expect(feedback.poseFor('enemy:1', 1).flash).toBe(true);
    missing.clear(); sizes.set(ENEMY_TEXTURE_KEYS.hangerHurt, { width: 384, height: 768 });
    expect(feedback.hurtFor('enemy:1', 1)).toBeNull();
  });
});

describe('the Hanger flinch outranks its proximity-bite loop (it has no timed wind-up)', () => {
  it('lets only the Hanger interrupt its attack pose; telegraphed attackers keep priority', async () => {
    const { hurtOutranksAttack } = await import('../../src/game/view/EnemyReactionView');
    expect(hurtOutranksAttack('hanger')).toBe(true);
    expect(hurtOutranksAttack('mannequin')).toBe(false);
    expect(hurtOutranksAttack('static')).toBe(false);
    expect(hurtOutranksAttack('spitter')).toBe(false);
  });
  it('draws the Hanger hurt crop at the walk sheet feet point', async () => {
    const { MvpRunView } = await import('../../src/game/view/MvpRunView');
    const { ActorPresentationMemory, NEUTRAL_POSE } = await import('../../src/game/view/ActorSpriteView');
    const syncSprite = Reflect.get(MvpRunView.prototype, 'syncActorSprite') as (...args: unknown[]) => { textureKey: string; frame: { row: number; column: number } };
    const renderer = enemyRenderer();
    const context = { scene: renderer.scene, actorMemory: new ActorPresentationMemory(), actorSprites: new Map(), usedActorSpriteIds: new Set() };
    const actor = { id: 'enemy:1', kind: 'hanger', x: 120, y: 200, moveX: 1, moveY: 0, attackTicks: 0, damaged: false, phase: 'pursue' };
    const hurt = { direction: 'west', frame: { row: 2, column: 1 }, spec: { textureKey: ENEMY_TEXTURE_KEYS.hangerHurt, frameWidth: 92, frameHeight: 92, scale: 1, feetY: 67.76 } };
    const evidence = syncSprite.call(context, actor, 5, 200, NEUTRAL_POSE, null, null, hurt);
    expect(evidence.textureKey).toBe(ENEMY_TEXTURE_KEYS.hangerHurt);
    expect(renderer.images[0]).toMatchObject({ x: 120, y: 200, scaleX: 1, crop: { x: 92, y: 184, width: 92, height: 92 } });
    expect(renderer.images[0]!.originY).toBe((184 + 67.76) / 736);
  });
});

describe('a Hanger death matches its chitin', () => {
  it('stains the floor in shell-blue ichor, not red blood', () => {
    const { sync, images } = setup();
    sync(0, [hanger()]); sync(1, []);
    const decals = images.filter((image) => image.texture.key.includes('decal:'));
    expect(decals.length).toBeGreaterThan(0);
    for (const decal of decals) expect(decal.tint).toBe(0x7fb0d0);
  });
});
