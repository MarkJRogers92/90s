import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: {
  BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2 }, TintModes: { MULTIPLY: 0, FILL: 1 },
  Math: { Vector2: class { constructor(public x: number, public y: number) {} } },
} }));
import { MvpRunView } from '../../src/game/view/MvpRunView';
import { DASH_HINT_LIMIT, shouldHintDash } from '../../src/game/view/playerCues';
import { NEON_ASSETS, PRESENTATION_ASSETS } from '../../src/game/presentation/assets';
import { dressingTextureFiles } from '../../src/game/presentation/rooms/roomDressing';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { moveToRoom } from '../../src/sim/run/roomTransition';
import { enterStore, leaveStore, roomStores } from '../../src/sim/run/storeInterior';
import { DASH_COOLDOWN_TICKS, DASH_TICKS } from '../../src/sim/combat/dash';
import type { MvpRunState } from '../../src/sim/run/types';
import { lightingRenderer } from '../support/lighting-renderer';

function setup() {
  const renderer = lightingRenderer([...NEON_ASSETS, ...PRESENTATION_ASSETS, ...dressingTextureFiles()]
    .map(asset => ({ key: asset.key, width: 96, height: 96, frames: {} })));
  const view = new MvpRunView(renderer.scene);
  const feedback = Reflect.get(view, 'feedback') as { puff(...args: number[]): void };
  const puff = vi.spyOn(feedback, 'puff');
  const state = createMvpRun(1);
  state.room.combat.walls = [];
  view.sync(state);
  const step = (run: MvpRunState, dash = false) => {
    const player = run.room.combat.player;
    tickMvpRun(run, { moveX: 0, moveY: 0, aimX: player.x + 100, aimY: player.y,
      fire: false, interact: false, steal: false, recall: false, dash });
    view.observeStep(run);
  };
  return { view, state, step, puff, count: () => Reflect.get(view, 'dashesThisRun') as number };
}

describe('dash feedback follows authoritative steps', () => {
  it('counts a real dash and emits its puff once, including repeated renders of that tick', () => {
    const { view, state, step, puff, count } = setup();
    step(state, true);
    expect(state.room.combat.player.dashTicks).toBe(DASH_TICKS - 1);
    view.sync(state);
    expect(count()).toBe(1);
    expect(puff).toHaveBeenCalledTimes(1);
    view.observeStep(state); // The same observed state is not a second dash.
    view.sync(state);
    state.paused = true;
    step(state, true);
    view.sync(state);
    expect(count()).toBe(1);
    expect(puff).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it.each([4, 8, DASH_TICKS])('keeps the start event when %i sim steps happen before rendering', steps => {
    const { view, state, step, puff, count } = setup();
    step(state, true);
    const atStart = { ...state.room.combat.player };
    for (let tick = 1; tick < steps; tick++) step(state);
    view.sync(state);
    expect(count()).toBe(1);
    expect(puff).toHaveBeenCalledTimes(1);
    expect(puff.mock.calls[0]!.slice(0, 2)).toEqual([atStart.x, atStart.y]);
    view.sync(state);
    expect(puff).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('retires the hint after three accepted dashes and ignores cooldown refusals', () => {
    const { view, state, step, puff, count } = setup();
    for (let dash = 0; dash < DASH_HINT_LIMIT; dash++) {
      step(state, true);
      view.sync(state);
      // Repeated dash requests while cooling down cannot count as learned dashes.
      for (let tick = 0; tick < DASH_TICKS + DASH_COOLDOWN_TICKS - 1; tick++) step(state, true);
      view.sync(state);
    }
    expect(count()).toBe(DASH_HINT_LIMIT);
    expect(puff).toHaveBeenCalledTimes(DASH_HINT_LIMIT);
    const player = state.room.combat.player;
    const threats = [{ enemy: { x: player.x - 100, y: player.y },
      windups: [{ kind: 'spit' as const, progress: .5, aimX: 1, aimY: 0 }] }];
    expect(shouldHintDash(threats, player, 1, 0)).toBe(true);
    expect(shouldHintDash(threats, player, 1, count())).toBe(false);
    view.destroy();
  });

  it('clears queued puffs and learned dashes when restarting the same seed', () => {
    const { view, state, step, puff, count } = setup();
    step(state, true); // Restart before the next render consumes this puff.
    view.resetForRun();
    const restarted = createMvpRun(1);
    restarted.room.combat.walls = [];
    view.sync(restarted);
    expect(count()).toBe(0);
    expect(puff).not.toHaveBeenCalled();
    step(restarted, true);
    view.sync(restarted);
    expect(count()).toBe(1);
    expect(puff).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it('keeps shop dust out of the concourse when the door is crossed before rendering', () => {
    const { view, state, step, puff, count } = setup();
    const shopRoom = state.wing.rooms.findIndex(room => roomStores(room).length > 0);
    expect(shopRoom).toBeGreaterThanOrEqual(0);
    moveToRoom(state, shopRoom, 'west');
    expect(enterStore(state).accepted).toBe(true);
    const combat = state.room.combat;
    step(state, true);
    leaveStore(state);
    expect(state.room.combat).toBe(combat); // This transition deliberately reuses combat.
    view.sync(state);
    expect(count()).toBe(1);
    expect(puff).not.toHaveBeenCalled();
    view.destroy();
  });
});
