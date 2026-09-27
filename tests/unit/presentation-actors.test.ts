import { describe, expect, it } from 'vitest';
import {
  ACTOR_DIRECTION_ORDER,
  ACTOR_DEATH_EFFECT_TICKS,
  MAX_ACTOR_DEATH_EFFECTS,
  ActorDeathEffectLifecycle,
  ActorMovementMemory,
  ActorPresentationMemory,
  actorFrameFor,
  actorPresentation,
  actorTextureKey,
  directionForVector,
  shouldRenderActorSprite,
} from '../../src/game/view/ActorSpriteView';
import { ACTOR_TEXTURE_KEYS } from '../../src/game/presentation/assets';
import { actorVisualState } from '../../src/game/view/visualState';

describe('actor direction and frame projection', () => {
  it('keeps the approved clockwise sprite direction order', () => {
    expect(ACTOR_DIRECTION_ORDER).toEqual([
      'south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast',
    ]);
  });

  it('maps cardinals and diagonal boundaries into the approved frame order', () => {
    expect(directionForVector(0, 1, 'north')).toBe('south');
    expect(directionForVector(-1, 1, 'north')).toBe('southwest');
    expect(directionForVector(-1, 0, 'north')).toBe('west');
    expect(directionForVector(-1, -1, 'south')).toBe('northwest');
    expect(directionForVector(0, -1, 'south')).toBe('north');
    expect(directionForVector(1, -1, 'south')).toBe('northeast');
    expect(directionForVector(1, 0, 'south')).toBe('east');
    expect(directionForVector(1, 1, 'north')).toBe('southeast');
  });

  it('keeps the previous facing when movement is zero', () => {
    expect(directionForVector(0, 0, 'northwest')).toBe('northwest');
  });

  it('uses idle frames by direction and six-frame walk cadence', () => {
    expect(actorFrameFor('idle', 'east', 999)).toEqual({ row: 0, column: 6 });
    expect(actorFrameFor('walk', 'southwest', 0)).toEqual({ row: 1, column: 0 });
    expect(actorFrameFor('walk', 'southwest', 5)).toEqual({ row: 1, column: 1 });
    expect(actorFrameFor('walk', 'southwest', 30)).toEqual({ row: 1, column: 0 });
  });

  it('selects the walk sheet only while Alex is moving', () => {
    expect(actorTextureKey('alex', false)).toBe(ACTOR_TEXTURE_KEYS.alexIdle);
    expect(actorTextureKey('alex', true)).toBe(ACTOR_TEXTURE_KEYS.alexWalk);
    expect(actorTextureKey('hanger', true)).toBe(ACTOR_TEXTURE_KEYS.hangerIdle);
  });
});

describe('snapshot-driven actor presentation', () => {
  it('derives motion, attack arc, hit flash, and Hanger phase cues from authoritative fields', () => {
    const visual = actorVisualState({ moving: true, attackTicks: 3, invulnerableTicks: 1, phase: 'telegraph', isHanger: true, tick: 5 });
    expect(visual).toMatchObject({ walking: true, attackLean: 3, damageFlicker: true, mopArc: true });
    expect(visual.lunge).toBeGreaterThan(0);
  });
  it('projects movement, direct attack, damage flicker, Hanger lunge, and one-shot death', () => {
    const memory = new ActorPresentationMemory();
    const walking = actorPresentation(memory, { id: 'alex', kind: 'alex', x: 0, y: 0, moveX: 1, moveY: 0, attackTicks: 0, damaged: false, phase: 'idle' }, 6);
    expect(walking.walking).toBe(true);
    expect(walking.direction).toBe('east');
    const attack = actorPresentation(memory, { id: 'alex', kind: 'alex', x: 0, y: 0, moveX: 0, moveY: 0, attackTicks: 4, damaged: true, phase: 'idle' }, 7);
    expect(attack.attackLean).toBeGreaterThan(0);
    expect(attack.damageFlicker).toBe(true);
    const hanger = actorPresentation(memory, { id: 'hanger-1', kind: 'hanger', x: 0, y: 0, moveX: 1, moveY: 0, attackTicks: 0, damaged: false, phase: 'pursue' }, 8);
    expect(hanger.bobY).not.toBe(0);
    expect(hanger.lunge).toBeGreaterThan(0);
  });

  it('animates a real pursuing Hanger from movement without inventing a telegraph phase', () => {
    expect(actorVisualState({ moving: true, attackTicks: 0, invulnerableTicks: 0, phase: 'pursue', isHanger: true, tick: 5 }).lunge)
      .toBeGreaterThan(0);
    expect(actorVisualState({ moving: false, attackTicks: 0, invulnerableTicks: 0, phase: 'pursue', isHanger: true, tick: 5 }).lunge)
      .toBe(0);
  });

  it('keeps vector fallbacks visible when the requested texture is unavailable', () => {
    expect(shouldRenderActorSprite('presentation:actor:alex-idle', new Set())).toBe(false);
    expect(shouldRenderActorSprite('presentation:actor:hanger-idle', new Set(['presentation:actor:hanger-idle']))).toBe(true);
  });
});

describe('bounded actor death effects', () => {
  it('emits once when a previously visible enemy disappears and expires by authoritative tick', () => {
    const lifecycle = new ActorDeathEffectLifecycle();
    lifecycle.sync('food_court', 100, [{ id: 'enemy:1', x: 180, y: 240 }]);
    expect(lifecycle.snapshot()).toEqual([]);

    lifecycle.sync('food_court', 101, []);
    expect(lifecycle.snapshot()).toEqual([
      { id: 'enemy:1', x: 180, y: 240, startedTick: 101, remainingTicks: ACTOR_DEATH_EFFECT_TICKS },
    ]);

    lifecycle.sync('food_court', 101, []);
    expect(lifecycle.snapshot()).toHaveLength(1);
    lifecycle.sync('food_court', 101 + ACTOR_DEATH_EFFECT_TICKS, []);
    expect(lifecycle.snapshot()).toEqual([]);
  });

  it('clears without phantom deaths on room changes, restarts, and disposal', () => {
    const lifecycle = new ActorDeathEffectLifecycle();
    lifecycle.sync('food_court', 30, [{ id: 'enemy:1', x: 100, y: 100 }]);
    lifecycle.sync('back_hall', 31, [{ id: 'enemy:1', x: 200, y: 200 }]);
    expect(lifecycle.snapshot()).toEqual([]);

    lifecycle.sync('back_hall', 32, []);
    expect(lifecycle.snapshot()).toHaveLength(1);
    lifecycle.reset();
    expect(lifecycle.snapshot()).toEqual([]);

    lifecycle.sync('food_court', 0, [{ id: 'enemy:1', x: 300, y: 300 }]);
    expect(lifecycle.snapshot()).toEqual([]);
    lifecycle.destroy();
    expect(lifecycle.snapshot()).toEqual([]);
  });

  it('caps simultaneously active effects instead of accumulating without bound', () => {
    const lifecycle = new ActorDeathEffectLifecycle();
    const enemies = Array.from({ length: MAX_ACTOR_DEATH_EFFECTS + 5 }, (_, index) => ({
      id: `enemy:${index}`,
      x: index,
      y: index,
    }));
    lifecycle.sync('food_court', 1, enemies);
    lifecycle.sync('food_court', 2, []);
    expect(lifecycle.snapshot()).toHaveLength(MAX_ACTOR_DEATH_EFFECTS);
  });
});

describe('actor movement presentation memory', () => {
  it('does not turn a room transition or restart teleport into a walk frame', () => {
    const memory = new ActorMovementMemory();
    expect(memory.beginScope('room:0')).toBe(true);
    expect(memory.movementFor('player', 900, 240)).toEqual({ x: 0, y: 0 });
    expect(memory.movementFor('player', 905, 240)).toEqual({ x: 5, y: 0 });

    expect(memory.beginScope('room:1')).toBe(true);
    expect(memory.movementFor('player', 110, 240)).toEqual({ x: 0, y: 0 });
    expect(memory.beginScope('room:1')).toBe(false);

    memory.reset();
    expect(memory.beginScope('room:0')).toBe(true);
    expect(memory.movementFor('player', 110, 240)).toEqual({ x: 0, y: 0 });
  });
});
