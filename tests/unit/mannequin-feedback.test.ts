import { afterEach, describe, expect, it, vi } from 'vitest';
import { CombatFeedback } from '../../src/game/view/CombatFeedback';
import { ActorDeathEffectLifecycle, type ActorDirection } from '../../src/game/view/ActorSpriteView';
import { ENEMY_TEXTURE_KEYS } from '../../src/game/presentation/assets';
import { gameSettings, DEFAULT_SETTINGS } from '../../src/game/settings/settings';
import { hitStopFor, REST_POSE } from '../../src/game/view/combatBeats';
import type { EnemyState } from '../../src/sim/model';
import { enemyRenderer } from '../support/enemy-renderer';

vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1 }, TintModes: { FILL: 1, MULTIPLY: 0 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
const player = { x: 400, y: 200, health: 6, invulnerableTicks: 0 };
const enemy = (overrides: Partial<EnemyState> = {}): EnemyState => ({ id: 1, kind: 'mannequin', x: 100, y: 200, health: 8, radius: 14, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0, ...overrides } as EnemyState);
function setup() {
  const renderer = enemyRenderer(), feedback = new CombatFeedback(renderer.scene);
  const sync = (tick: number, enemies: EnemyState[], scope = 'room', paused = false, facing: ActorDirection = 'northwest') => feedback.sync(scope, tick, enemies, player, paused, [], () => facing);
  return { ...renderer, feedback, sync };
}
afterEach(() => gameSettings().update(DEFAULT_SETTINGS));

describe('mannequin material-specific combat feedback', () => {
  it('replaces white squash, stars, rings and blood with a material hit while preserving hit-stop and shake', () => {
    const { sync, feedback, images, marks, shakes } = setup();
    sync(0, [enemy()]); marks.length = 0;
    sync(1, [enemy({ health: 7 })]);
    expect(images.filter((image) => image.texture.key.includes('decal:'))).toEqual([]);
    expect(marks).not.toContain('strokeCircle');
    expect(feedback.poseFor('enemy:1', 1)).toEqual(REST_POSE);
    expect(feedback.takeHitStop()).toBe(hitStopFor([{ kind: 'hit', heavy: false }]));
    expect(shakes).toEqual([[70, .0035]]);
  });

  it('keeps the last rendered facing, seven death frames, feet anchor, original hold/fade and no white flash', () => {
    const { sync, feedback, images, marks, shakes } = setup();
    sync(0, [enemy()]); marks.length = 0; sync(1, []);
    const corpse = images.find((image) => image.texture.key === ENEMY_TEXTURE_KEYS.mannequinDeath)!;
    expect(corpse.crop).toEqual({ x: 0, y: 288, width: 96, height: 96 });
    expect(corpse.originX).toBe(48 / 672); expect(corpse.originY).toBe((288 + 80.64) / 768);
    expect(corpse.scaleX).toBe(.75); expect(corpse.tint).toBeNull();
    expect(images.filter((image) => image.texture.key.includes('decal:'))).toEqual([]);
    expect(marks).not.toContain('strokeEllipse');
    expect(feedback.takeHitStop()).toBe(hitStopFor([{ kind: 'kill', boss: false }]));
    expect(shakes).toEqual([[160, .008]]);
    sync(25, []); expect(corpse.crop.x).toBe(576);
    sync(74, []); expect(corpse.alpha).toBe(1);
    sync(87, []); expect(corpse.alpha).toBe(.5);
    sync(100, []); expect(corpse.destroyed).toBe(true);
  });

  it('leaves other enemy blood, impact rings, white pose and player-facing death untouched', () => {
    const { sync, feedback, images, marks } = setup();
    sync(0, [enemy({ kind: 'hanger' })]); sync(1, [enemy({ kind: 'hanger', health: 7 })]);
    expect(images.some((image) => image.texture.key.includes('decal:blood'))).toBe(true);
    expect(marks).toContain('strokeCircle'); expect(feedback.poseFor('enemy:1', 1).flash).toBe(true);
    sync(2, []);
    const corpse = images.find((image) => image.texture.key === ENEMY_TEXTURE_KEYS.hangerDeath)!;
    expect(corpse.crop.y).toBe(384); expect(corpse.tint).toBe(0xffffff);
  });

  it('suppresses the separate mannequin death-ring lifecycle without suppressing other enemies', () => {
    const lifecycle = new ActorDeathEffectLifecycle();
    lifecycle.sync('room', 0, [
      { id: 'enemy:1', kind: 'mannequin', x: 20, y: 20 },
      { id: 'enemy:2', kind: 'hanger', x: 40, y: 20 },
    ]);
    lifecycle.sync('room', 1, []);
    expect(lifecycle.snapshot().map((effect) => effect.id)).toEqual(['enemy:2']);
  });
});

describe('bounded native plastic chip strip', () => {
  const key = 'neon:enemy:mannequin-plastic-impact';
  it('plays six frames on a stable center at two ticks per frame, then disposes without replay', () => {
    const { sync, images } = setup();
    sync(0, [enemy()]); sync(1, [enemy({ health: 7 })]);
    const chip = images.find((image) => image.texture.key === key)!;
    expect(chip).toBeDefined();
    const start = { x: chip.x, y: chip.y };
    for (let age = 0; age < 12; age++) {
      sync(1 + age, [enemy({ health: 7 })]);
      expect(chip.crop).toEqual({ x: Math.floor(age / 2) * 48, y: 0, width: 48, height: 48 });
      expect({ x: chip.x, y: chip.y }).toEqual(start);
      expect(chip.originX).toBe((Math.floor(age / 2) * 48 + 24) / 288);
      expect(chip.originY).toBe(.5); expect(chip.tint).toBeNull();
    }
    sync(13, [enemy({ health: 7 })]); expect(chip.destroyed).toBe(true);
    sync(13, [enemy({ health: 7 })]); expect(images.filter((image) => image.texture.key === key)).toHaveLength(1);
  });
  it('caps simultaneous effects and clears every native strip on scope, rewind, reset and destroy', () => {
    const { sync, images, feedback } = setup();
    const enemies = Array.from({ length: 50 }, (_, i) => enemy({ id: i, health: 8 }));
    sync(10, enemies); sync(11, enemies.map((value) => ({ ...value, health: 7 })));
    const alive = () => images.filter((image) => image.texture.key === key && !image.destroyed);
    expect(alive().length).toBeGreaterThan(0); expect(alive().length).toBeLessThanOrEqual(24);
    sync(12, [enemy()], 'store'); expect(alive()).toEqual([]);
    sync(13, [enemy({ health: 7 })], 'store'); sync(0, [enemy()], 'store'); expect(alive()).toEqual([]);
    sync(1, [enemy({ health: 7 })], 'store'); feedback.resetRoom('store'); expect(alive()).toEqual([]);
    sync(2, [enemy()], 'store'); sync(3, [enemy({ health: 7 })], 'store'); feedback.destroy(); expect(alive()).toEqual([]);
  });
  it('uses bounded plastic fallback without blood or flash when native chips are missing', () => {
    const { sync, images, missing, marks, feedback } = setup();
    missing.add(key); sync(0, [enemy()]); sync(1, [enemy({ health: 7 })]);
    expect(images.some((image) => image.texture.key === key)).toBe(false);
    expect(images.some((image) => image.texture.key.includes('decal:'))).toBe(false);
    expect(marks).toContain('fillRect'); expect(marks).not.toContain('strokeCircle');
    expect(feedback.takeHitStop()).toBe(hitStopFor([{ kind: 'hit', heavy: false }]));
  });
  it('keeps native hurt, chip and corpse art visible under reduced flashes', () => {
    gameSettings().update({ flashes: 'reduced' });
    const { sync, feedback, images } = setup();
    sync(0, [enemy()]); sync(1, [enemy({ health: 7 })]);
    expect(feedback.poseFor('enemy:1', 1).flash).toBe(false);
    expect(feedback.hurtFor('enemy:1', 1)).not.toBeNull();
    sync(2, []);
    expect(images.filter((image) => image.texture.key === key || image.texture.key === ENEMY_TEXTURE_KEYS.mannequinDeath).every((image) => image.visible && image.tint === null)).toBe(true);
  });
});

describe('mannequin corpse and reaction edge cases', () => {
  it('keeps the actual last rendered facing when an attack replaced the hurt pose before death', () => {
    const { sync, images } = setup();
    sync(0, [enemy()]); sync(1, [enemy({ health: 7 })]);
    // The view rendered the attack facing east while the hurt clock was still active.
    sync(2, [], 'room', false, 'east');
    expect(images.find((image) => image.texture.key === ENEMY_TEXTURE_KEYS.mannequinDeath)!.crop.y).toBe(576);
  });
  it('never draws a partial death texture, but keeps material feedback and hit-stop available', () => {
    const { sync, sizes, images, feedback } = setup();
    sizes.set(ENEMY_TEXTURE_KEYS.mannequinDeath, { width: 96, height: 96 });
    sync(0, [enemy()]); sync(1, []);
    expect(images.some((image) => image.texture.key === ENEMY_TEXTURE_KEYS.mannequinDeath)).toBe(false);
    expect(feedback.takeHitStop()).toBe(hitStopFor([{ kind: 'kill', boss: false }]));
  });
  it('preserves the complete existing hold and fade for every body in a simultaneous crowd kill', () => {
    const { sync, images } = setup();
    sync(0, Array.from({ length: 40 }, (_, id) => enemy({ id })));
    sync(1, []);
    const corpses = images.filter((image) => image.texture.key === ENEMY_TEXTURE_KEYS.mannequinDeath && !image.destroyed);
    expect(corpses).toHaveLength(40);
    sync(74, []); expect(corpses.every((image) => !image.destroyed && image.alpha === 1)).toBe(true);
    sync(87, []); expect(corpses.every((image) => !image.destroyed && image.alpha === .5)).toBe(true);
    sync(100, []); expect(corpses.every((image) => image.destroyed)).toBe(true);
  });
});
