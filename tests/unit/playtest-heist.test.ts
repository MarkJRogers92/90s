import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { INTERIOR_EXIT, activeStore, enterStore } from '../../src/sim/run/storeInterior';
import { STALKER_ARRIVAL_TICKS } from '../../src/sim/run/stalker';
import { HEAT_PER_STAR } from '../../src/sim/run/wanted';
import { alarmTicksFor } from '../../src/sim/run/heist';
import { PlaytestRecorder } from '../../src/game/playtest/recorder';
import { summarizeRuns } from '../../src/game/playtest/log';
import { pinkSlipReason } from '../../src/game/ui/pinkSlipModel';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** One tick of the sim, seen by the recorder like a rendered frame. */
function step(state: MvpRunState, recorder: PlaytestRecorder, overrides: Partial<MvpInputFrame> = {}): void {
  tickMvpRun(state, { ...idle, ...overrides });
  recorder.observe(state);
}

/** Into the first storefront's first shop, beside a shelf, with the recorder watching. */
function inStore(): { state: MvpRunState; recorder: PlaytestRecorder } {
  const state = createMvpRun(9);
  const recorder = new PlaytestRecorder();
  recorder.observe(state);
  state.room.combat.enemies = [];
  step(state, recorder);
  const door = state.wing.rooms[0]!.doorways.find((entry) => entry.side === 'east')!;
  state.room.combat.player.x = door.rect.x + door.rect.width / 2;
  state.room.combat.player.y = door.rect.y + door.rect.height / 2;
  enterDoorway(state, 'east');
  step(state, recorder);
  enterStore(state, 0);
  step(state, recorder);
  const here = activeStore(state)!.templateId;
  const offer = state.wing.rooms[state.roomIndex]!.offers.find((candidate) => candidate.storeId === here)!;
  state.room.combat.player.x = offer.position.x;
  state.room.combat.player.y = offer.position.y + 20;
  return { state, recorder };
}

function walkOut(state: MvpRunState, recorder: PlaytestRecorder): void {
  state.room.combat.player.x = INTERIOR_EXIT.x + INTERIOR_EXIT.width / 2;
  state.room.combat.player.y = INTERIOR_EXIT.y - 2;
  step(state, recorder, { moveY: 1 });
}

describe('playtest log: the heist, Loss Prevention, stores and boss cards', () => {
  it('logs a clean getaway with the seconds to spare, the store visit, and the peak stars', () => {
    const { state, recorder } = inStore();
    step(state, recorder, { steal: true });
    for (let index = 0; index < 60; index += 1) step(state, recorder);
    const left = state.alarm!.ticksLeft;
    walkOut(state, recorder);
    const record = recorder.finish(state, 'quit')!;
    expect(record.alarms).toHaveLength(1);
    expect(record.alarms![0]).toMatchObject({ outcome: 'escaped', stars: 0 });
    expect(record.alarms![0]!.secondsLeft).toBeCloseTo(left / 60, 0);
    expect(record.alarms![0]!.secondsLeft!).toBeLessThan(alarmTicksFor(state) / 60);
    expect(record.peakStars).toBe(1);
    expect(record.storeVisits).toHaveLength(1);
    expect(record.storeVisits![0]).toMatchObject({ bought: 0, stolen: 1 });
    expect(record.storeVisits![0]!.seconds).toBeGreaterThanOrEqual(1);
  });

  it('logs a janitor locked in behind the shutter who then fights out', () => {
    const { state, recorder } = inStore();
    step(state, recorder, { steal: true });
    for (let index = 0; index < alarmTicksFor(state) + 5 && state.alarm?.shutter !== 'closed'; index += 1) step(state, recorder);
    expect(state.alarm?.shutter).toBe('closed');
    // Security goes down; the shutter lifts; out the door.
    for (const enemy of state.room.combat.enemies) enemy.health = 0;
    step(state, recorder);
    walkOut(state, recorder);
    const record = recorder.finish(state, 'quit')!;
    expect(record.alarms![0]).toMatchObject({ outcome: 'lockedEscaped', secondsLeft: null });
  });

  it('closes an alarm still ringing behind the shutter when the shift ends', () => {
    const { state, recorder } = inStore();
    step(state, recorder, { steal: true });
    for (let index = 0; index < alarmTicksFor(state) + 5 && state.alarm?.shutter !== 'closed'; index += 1) step(state, recorder);
    const record = recorder.finish(state, 'quit')!;
    expect(record.alarms![0]!.outcome).toBe('locked');
  });

  it('blames Loss Prevention for his write-ups, counts his arrivals and shoves, and fires the janitor for it', () => {
    const state = createMvpRun(9);
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    state.room.combat.enemies = [];
    state.heat = 5 * HEAT_PER_STAR;
    for (let index = 0; index <= STALKER_ARRIVAL_TICKS + 1; index += 1) step(state, recorder);
    expect(state.stalker?.phase).toBe('hunting');
    // Shoved with the mop.
    const player = state.room.combat.player;
    player.x = state.stalker!.x + 40;
    player.y = state.stalker!.y;
    player.attackActiveTicks = 6;
    step(state, recorder, { aimX: state.stalker!.x, aimY: state.stalker!.y });
    for (let index = 0; index < 60; index += 1) step(state, recorder);
    // Caught.
    player.x = state.stalker!.x + 4;
    player.y = state.stalker!.y;
    player.invulnerableTicks = 0;
    step(state, recorder);
    const record = recorder.finish(state, 'quit')!;
    expect(record.stalker).toEqual({ arrivals: 1, writeUps: 1, shoves: 1 });
    expect(record.rooms[0]!.damage.stalker).toBe(1);
    expect(recorder.lastDamageSource).toBe('stalker');
    expect(pinkSlipReason('stalker', 1)).toBe('WRITTEN UP ONE TIME TOO MANY');
  });

  it('records how long each boss card was watched and whether it was skipped', () => {
    const state = createMvpRun(9);
    const recorder = new PlaytestRecorder();
    recorder.observe(state);
    recorder.noteBossCard('lp_manager', 2600, false);
    recorder.noteBossCard('manager', 840, true);
    const record = recorder.finish(state, 'quit')!;
    expect(record.bossCards).toEqual([
      { boss: 'lp_manager', seconds: 2.6, skipped: false },
      { boss: 'manager', seconds: 0.8, skipped: true },
    ]);
  });

  it('summarizes the new fields across runs, and older runs without them still count', () => {
    const { state, recorder } = inStore();
    step(state, recorder, { steal: true });
    walkOut(state, recorder);
    recorder.noteBossCard('lp_manager', 1000, true);
    const fresh = recorder.finish(state, 'quit')!;
    const { peakStars: _p, alarms: _a, stalker: _s, storeVisits: _v, bossCards: _b, ...old } = fresh;
    const summary = summarizeRuns([fresh, old]);
    expect(summary.runs).toBe(2);
    expect(summary.heist.alarms.escaped).toBe(1);
    expect(summary.heist.avgSecondsLeft).not.toBeNull();
    expect(summary.heist.peakStars).toBe(1);
    expect(summary.stores[0]).toMatchObject({ visits: 1, stolen: 1 });
    expect(summary.bossCards).toEqual({ shown: 1, skipped: 1, avgSeconds: 1 });
  });
});
