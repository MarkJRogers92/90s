import { describe, expect, it, vi } from 'vitest';
import { MvpRunView } from '../../src/game/view/MvpRunView';
import { ActorPresentationMemory, ActorMovementMemory, NEUTRAL_POSE, type ActorSnapshot, type ActorPose } from '../../src/game/view/ActorSpriteView';
import { ENEMY_TEXTURE_KEYS } from '../../src/game/presentation/assets';
import { enemyRenderer } from '../support/enemy-renderer';
import type { EnemyHurtFrame } from '../../src/game/view/EnemyReactionView';
vi.mock('phaser', () => ({ default: { Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
const syncSprite = Reflect.get(MvpRunView.prototype, 'syncActorSprite') as (actor: ActorSnapshot, tick: number, depth: number, pose: ActorPose, attackColumn: number | null, playerAction: null, hurt: EnemyHurtFrame | null) => { textureKey: string; direction: string; frame: { row: number; column: number } };
const actor: ActorSnapshot = { id: 'enemy:1', kind: 'mannequin', x: 120, y: 200, moveX: 1, moveY: 0, attackTicks: 0, damaged: false, phase: 'pursue' };
const hurt: EnemyHurtFrame = { direction: 'northwest', frame: { row: 3, column: 2 }, spec: { textureKey: 'neon:enemy:mannequin-hurt', frameWidth: 96, frameHeight: 96, scale: .75, feetY: 80.64 } };
function setup() {
  const renderer = enemyRenderer();
  const context = { scene: renderer.scene, actorMemory: new ActorPresentationMemory(), actorSprites: new Map(), usedActorSpriteIds: new Set() };
  return { ...renderer, context };
}
describe('MvpRunView mannequin native hurt composition', () => {
  it('draws the native hurt crop at the unchanged feet point and records the actual displayed facing', () => {
    const { context, images } = setup();
    const evidence = syncSprite.call(context, actor, 5, 200, NEUTRAL_POSE, null, null, hurt);
    expect(evidence.textureKey).toBe(ENEMY_TEXTURE_KEYS.mannequinHurt);
    expect(evidence.frame).toEqual({ row: 3, column: 2 }); expect(evidence.direction).toBe('northwest');
    expect(context.actorMemory.facingFor(actor.id)).toBe('northwest');
    expect(images[0]).toMatchObject({ x: 120, y: 200, scaleX: .75, scaleY: .75, rotation: 0, crop: { x: 192, y: 288, width: 96, height: 96 } });
    expect(images[0]!.originX).toBe(240 / 384); expect(images[0]!.originY).toBe((288 + 80.64) / 768);
    syncSprite.call(context, actor, 15, 200, NEUTRAL_POSE, null, null, null);
    expect(images).toHaveLength(1); expect(images[0]!.texture.key).toBe(ENEMY_TEXTURE_KEYS.mannequinWalk);
  });
  it('lets attack frames win over a supplied hurt and leaves other enemy selectors unchanged', () => {
    const { context, images } = setup();
    const attacking = syncSprite.call(context, actor, 5, 200, NEUTRAL_POSE, 1, null, hurt);
    expect(attacking.textureKey).toBe('neon:enemy:mannequin-attack'); expect(attacking.frame.column).toBe(1);
    const other = syncSprite.call(context, { ...actor, kind: 'hanger' }, 5, 200, NEUTRAL_POSE, null, null, hurt);
    expect(other.textureKey).not.toBe(ENEMY_TEXTURE_KEYS.mannequinHurt);
    expect(images[0]!.texture.key).not.toBe(ENEMY_TEXTURE_KEYS.mannequinHurt);
  });
  it('retains idle/walk fallback if the native texture disappears between selection and drawing', () => {
    const { context, missing, images } = setup(); missing.add(ENEMY_TEXTURE_KEYS.mannequinHurt);
    const result = syncSprite.call(context, actor, 5, 200, NEUTRAL_POSE, null, null, hurt);
    expect(result.textureKey).toBe(ENEMY_TEXTURE_KEYS.mannequinWalk); expect(images[0]!.visible).toBe(true);
  });
  it('can render the complete native hurt sheet even if the idle asset is missing', () => {
    const { context, missing, images } = setup(); missing.add(ENEMY_TEXTURE_KEYS.mannequinIdle);
    const result = syncSprite.call(context, actor, 5, 200, NEUTRAL_POSE, null, null, hurt);
    expect(result.textureKey).toBe(ENEMY_TEXTURE_KEYS.mannequinHurt); expect(images[0]!.visible).toBe(true);
  });
  it('clears movement and facing on backwards ticks within the same room', () => {
    const movement = new ActorMovementMemory();
    movement.beginScope('room', 100); movement.movementFor('enemy:1', 120, 200);
    movement.beginScope('room', 101); movement.movementFor('enemy:1', 125, 200);
    expect(movement.beginScope('room', 0)).toBe(true);
    expect(movement.movementFor('enemy:1', 300, 400)).toEqual({ x: 0, y: 0 });
  });
});

describe('mannequin fixed-eye overlays', () => {
  it('hides fixed eye pixels and light during authored hurt, retaining them for pursuit otherwise', () => {
    const drawEyes = Reflect.get(MvpRunView.prototype, 'drawMannequinEyes');
    expect(typeof drawEyes).toBe('function');
    const marks: string[] = [];
    const effects = { fillStyle: () => { marks.push('fill'); return effects; }, fillRect: () => { marks.push('eye'); return effects; } };
    const context = { openingConcourse: { addLight: () => marks.push('light') } };
    drawEyes.call(context, actor, effects, hurt); expect(marks).toEqual([]);
    drawEyes.call(context, actor, effects, null); expect(marks).toEqual(['light', 'fill', 'eye', 'eye']);
    marks.length = 0;
    drawEyes.call(context, { ...actor, phase: 'frozen' }, effects, null); expect(marks).toEqual([]);
    drawEyes.call(context, { ...actor, kind: 'hanger' }, effects, null); expect(marks).toEqual([]);
  });
});
