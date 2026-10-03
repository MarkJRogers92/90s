import { describe, expect, it, vi } from 'vitest';
import { CombatFeedback } from '../../src/game/view/CombatFeedback';
import { ActorPresentationMemory, type ActorDirection } from '../../src/game/view/ActorSpriteView';
import { REST_POSE } from '../../src/game/view/combatBeats';
import { enemyRenderer } from '../support/enemy-renderer';
import type { EnemyState } from '../../src/sim/model';
vi.mock('phaser', () => ({ default: { BlendModes: { ADD: 1 }, TintModes: { FILL: 1, MULTIPLY: 0 }, Math: { Vector2: class { constructor(public x: number, public y: number) {} } } } }));
const mannequin = (health = 8): EnemyState => ({ id: 1, kind: 'mannequin', x: 100, y: 200, health, radius: 14, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 } as EnemyState);
const player = { x: 400, y: 200, health: 6, invulnerableTicks: 0 };
function setup() {
  const renderer = enemyRenderer(), feedback = new CombatFeedback(renderer.scene);
  const sync = (tick: number, health: number | null = 8, facing: ActorDirection = 'northwest', paused = false, scope = 'room') => feedback.sync(scope, tick, health === null ? [] : [mannequin(health)], player, paused, [], () => facing);
  return { ...renderer, feedback, sync };
}

describe('renderer-owned mannequin hurt strip', () => {
  it('exposes the native hurt selection without adding a simulation state', () => {
    const { feedback } = setup();
    expect(typeof feedback.hurtFor).toBe('function');
  });
  it('scrubs 3/3/4/4 ticks across four frames and holds the rendered facing through movement changes', () => {
    const { feedback, sync } = setup();
    sync(0); sync(1, 7);
    for (const [age, column] of [[0, 0], [2, 0], [3, 1], [5, 1], [6, 2], [9, 2], [10, 3], [13, 3]]) {
      sync(1 + age!, 7, 'east');
      expect(feedback.hurtFor('enemy:1', 1 + age!)).toMatchObject({ direction: 'northwest', frame: { row: 3, column }, spec: { textureKey: 'neon:enemy:mannequin-hurt', frameWidth: 96, frameHeight: 96, scale: .75, feetY: 80.64 } });
    }
    sync(15, 7); expect(feedback.hurtFor('enemy:1', 15)).toBeNull();
  });
  it('restarts on repeated hits but not on repeated snapshots; a fatal removal cancels hurt', () => {
    const { feedback, sync, images } = setup();
    sync(0); sync(1, 7); sync(5, 7);
    expect(feedback.hurtFor('enemy:1', 5)?.frame.column).toBe(1);
    const count = images.length;
    sync(5, 7); expect(images).toHaveLength(count);
    sync(6, 6, 'northwest'); expect(feedback.hurtFor('enemy:1', 6)?.frame.column).toBe(0);
    // A second impact during the same flinch preserves the displayed flinch facing.
    expect(feedback.hurtFor('enemy:1', 6)?.direction).toBe('northwest');
    sync(7, null, 'east'); expect(feedback.hurtFor('enemy:1', 7)).toBeNull();
  });
  it('does not replace an attack or windup, and safely retains generic hit feedback for missing or malformed hurt art', () => {
    const { feedback, sync, missing, aliases, sizes } = setup();
    sync(0); sync(1, 7);
    expect(feedback.hurtFor('enemy:1', 1, true)).toBeNull();
    expect(feedback.poseFor('enemy:1', 1)).toEqual(REST_POSE);
    for (const mode of ['missing', 'alias', 'size']) {
      missing.clear(); aliases.clear();
      if (mode === 'missing') missing.add('neon:enemy:mannequin-hurt');
      if (mode === 'alias') aliases.add('neon:enemy:mannequin-hurt');
      if (mode === 'size') sizes.set('neon:enemy:mannequin-hurt', { width: 96, height: 96 });
      expect(feedback.hurtFor('enemy:1', 1)).toBeNull();
      expect(feedback.poseFor('enemy:1', 1).flash).toBe(true);
    }
  });
  it('captures the newly rendered facing when a repeat hit follows an intervening attack pose', () => {
    const { feedback, sync } = setup();
    sync(0); sync(1, 7, 'northwest');
    // A higher-priority attack was displayed facing east before the next hit.
    sync(2, 6, 'east');
    expect(feedback.hurtFor('enemy:1', 2)?.direction).toBe('east');
  });
  it('never replays across pause, scope, rewind, reset or destruction', () => {
    const { feedback, sync } = setup();
    sync(10); sync(11, 7); sync(11, 7, 'east', true);
    expect(feedback.hurtFor('enemy:1', 11)?.frame.column).toBe(0);
    sync(12, 7, 'east', false, 'store'); expect(feedback.hurtFor('enemy:1', 12)).toBeNull();
    sync(13, 6, 'east', false, 'store'); sync(0, 8, 'east', false, 'store'); expect(feedback.hurtFor('enemy:1', 0)).toBeNull();
    sync(1, 7, 'east', false, 'store'); feedback.resetRoom('store'); expect(feedback.hurtFor('enemy:1', 1)).toBeNull();
    sync(2, 8, 'east', false, 'store'); sync(3, 7, 'east', false, 'store'); feedback.destroy(); expect(feedback.hurtFor('enemy:1', 3)).toBeNull();
  });
  it('reads the previous displayed facing without inventing an incoming attack direction', () => {
    const memory = new ActorPresentationMemory();
    expect(typeof memory.facingFor).toBe('function');
    memory.directionFor({ id: 'enemy:1', kind: 'mannequin', x: 10, y: 20, moveX: -1, moveY: 0, attackTicks: 0, damaged: false, phase: 'pursue' });
    expect(memory.facingFor('enemy:1')).toBe('west');
    memory.reset(); expect(memory.facingFor('enemy:1')).toBe('south');
  });
});
