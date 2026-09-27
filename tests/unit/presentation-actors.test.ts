import { describe, expect, it } from 'vitest';
import {
  ACTOR_DIRECTION_ORDER,
  ActorPresentationMemory,
  actorFrameFor,
  actorPresentation,
  directionForVector,
  shouldRenderActorSprite,
} from '../../src/game/view/ActorSpriteView';
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
});

describe('snapshot-driven actor presentation', () => {
  it('derives motion, attack arc, hit flash, and Hanger phase cues from authoritative fields', () => {
    expect(actorVisualState({ moving: true, attackTicks: 3, invulnerableTicks: 1, phase: 'telegraph', isHanger: true, tick: 5 }))
      .toMatchObject({ walking: true, attackLean: 3, damageFlicker: true, mopArc: true, lunge: 3 });
  });
  it('projects movement, direct attack, damage flicker, Hanger lunge, and one-shot death', () => {
    const memory = new ActorPresentationMemory();
    const visible = new Set(['alex', 'hanger-1']);
    const walking = actorPresentation(memory, { id: 'alex', kind: 'alex', x: 0, y: 0, moveX: 1, moveY: 0, attackTicks: 0, damaged: false, phase: 'idle' }, 6, visible);
    expect(walking.walking).toBe(true);
    expect(walking.direction).toBe('east');
    const attack = actorPresentation(memory, { id: 'alex', kind: 'alex', x: 0, y: 0, moveX: 0, moveY: 0, attackTicks: 4, damaged: true, phase: 'idle' }, 7, visible);
    expect(attack.attackLean).toBeGreaterThan(0);
    expect(attack.damageFlicker).toBe(true);
    const hanger = actorPresentation(memory, { id: 'hanger-1', kind: 'hanger', x: 0, y: 0, moveX: 0, moveY: 0, attackTicks: 0, damaged: false, phase: 'telegraph' }, 8, visible);
    expect(hanger.bobY).not.toBe(0);
    expect(hanger.lunge).toBeGreaterThan(0);
    expect(memory.consumeDeaths(new Set())).toEqual(['alex', 'hanger-1']);
    expect(memory.consumeDeaths(new Set())).toEqual([]);
  });

  it('keeps vector fallbacks visible when the requested texture is unavailable', () => {
    expect(shouldRenderActorSprite('presentation:actor:alex-idle', new Set())).toBe(false);
    expect(shouldRenderActorSprite('presentation:actor:hanger-idle', new Set(['presentation:actor:hanger-idle']))).toBe(true);
  });
});
