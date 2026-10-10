import { describe, expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Scene: class {}, Input: { Keyboard: { KeyCodes: {} } } } }));
import { InMemoryCheckpointStore } from '../../src/game/persistence/CheckpointStore';
import { LocalStorageCheckpointStore } from '../../src/game/persistence/LocalStorageCheckpointStore';
import { MvpRunScene } from '../../src/game/scenes/MvpRunScene';
import { SPITTER_PROJECTILE_SPEED_PER_TICK } from '../../src/sim/combat/enemies';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { NO_PERKS } from '../../src/sim/run/perks';
import { restoreMvpRun } from '../../src/sim/run/checkpoint';
import { enterDoorway, tickMvpRun } from '../../src/sim/run/tickMvpRun';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = {
  moveX: 0, moveY: 0, aimX: 900, aimY: 240,
  fire: false, interact: false, steal: false, recall: false,
};

/** One wounded Spitter and its previously fired shot, both in mop range. */
function lastKillAndIncomingShot(options: { noBreaks?: boolean; secondWind?: boolean } = {}): MvpRunState {
  const state = createMvpRun(8, {
    ...(options.noBreaks ? { rule: 'no_breaks' as const } : {}),
    perks: { ...NO_PERKS, secondWinds: options.secondWind ? 1 : 0 },
  });
  while (state.room.roomId !== 'food_court') {
    const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
    state.room.combat.player.x = door.rect.x + door.rect.width / 2;
    state.room.combat.player.y = door.rect.y + door.rect.height / 2;
    expect(enterDoorway(state, 'east').accepted).toBe(true);
  }

  const combat = state.room.combat;
  const player = combat.player;
  player.health = 1;
  player.invulnerableTicks = 0;
  combat.enemies = [{
    id: 900, kind: 'spitter', x: player.x + 50, y: player.y,
    health: 1, radius: 14, phase: 'recover', phaseTicks: 10,
    cooldownTicks: 0, telegraphAimX: -1, telegraphAimY: 0,
  }];
  const shotX = player.x + player.radius + 5 + 1;
  combat.projectiles = [{
    id: 901, faction: 'enemy', x: shotX, y: player.y,
    previousX: shotX, previousY: player.y,
    velocityX: -SPITTER_PROJECTILE_SPEED_PER_TICK, velocityY: 0,
    radius: 5, damage: 1, remainingTicks: 30,
  }];
  return state;
}

function swing(state: MvpRunState): void {
  const player = state.room.combat.player;
  tickMvpRun(state, { ...idle, fire: true, aimX: player.x + 100, aimY: player.y });
}

function sceneFor(state: MvpRunState) {
  const scene = new MvpRunScene();
  const store = new InMemoryCheckpointStore();
  Reflect.set(scene, 'run', state);
  Reflect.set(scene, 'store', store);
  const sync = () => Reflect.get(scene, 'syncCheckpoint').call(scene);
  return { scene, store, sync };
}

describe('checkpoint after a simultaneous last kill and fatal hit', () => {
  it('keeps the previous valid Continue save when No Breaks leaves the player dead', () => {
    const state = lastKillAndIncomingShot({ noBreaks: true });
    const store = new InMemoryCheckpointStore();
    expect(store.write(state)).toEqual({ ok: true });
    const previousSave = store.read();
    expect(previousSave.ok).toBe(true);
    const previousMarker = state.checkpoint;

    swing(state);

    // Both outcomes were produced by real combat in one tick, not by setting
    // zero health or declaring the room clear in the fixture.
    expect(state.room.combat.enemies).toHaveLength(0);
    expect(state.room.combat.player.health).toBe(0);
    expect(state.room.cleared).toBe(true);
    expect(state.status).toBe('dead');
    expect.soft(state.checkpoint).toEqual(previousMarker);

    // The scene writes when the checkpoint marker changes. A fatal clear
    // must leave the stored, resumable boundary in place.
    if (JSON.stringify(state.checkpoint) !== JSON.stringify(previousMarker)) {
      expect(store.write(state)).toEqual({ ok: true });
    }
    const continued = store.read();
    expect(continued).toEqual(previousSave);
    if (!continued.ok) throw new Error(continued.reason);
    const restored = restoreMvpRun(continued.checkpoint);
    expect(restored.status).toBe('playing');
    expect(restored.room.combat.player.health).toBe(1);
    expect(restored.room.cleared).toBe(false);
    expect(restored.room.combat.enemies.length).toBeGreaterThan(0);
  });

  it('preserves the saved bytes and observed key when a later batched tick kills the player', () => {
    const state = lastKillAndIncomingShot({ noBreaks: true });
    // One step farther out: the shot misses on the clear tick, then kills on
    // the second tick before the rendered frame gets to syncCheckpoint.
    state.room.combat.projectiles[0]!.x += SPITTER_PROJECTILE_SPEED_PER_TICK;
    const { scene, store, sync } = sceneFor(state);
    const write = vi.spyOn(store, 'write');
    sync();
    const previousSave = store.read();
    const previousKey = Reflect.get(scene, 'lastCheckpointKey');
    const previousStatus = Reflect.get(scene, 'checkpointStatus');

    swing(state);
    expect(state.status).toBe('playing');
    expect(state.room.combat.player.health).toBe(1);
    expect(JSON.stringify(state.checkpoint)).not.toBe(previousKey);
    tickMvpRun(state, idle);
    expect(state.status).toBe('dead');
    expect(state.room.combat.player.health).toBe(0);
    sync();

    expect.soft(write).toHaveBeenCalledTimes(1);
    expect.soft(Reflect.get(scene, 'lastCheckpointKey')).toBe(previousKey);
    expect.soft(Reflect.get(scene, 'checkpointStatus')).toBe(previousStatus);
    expect(store.read()).toEqual(previousSave);
  });

  it('still clears the stored checkpoint on a won run', () => {
    const state = createMvpRun(8);
    const { scene, store, sync } = sceneFor(state);
    sync();
    expect(store.read().ok).toBe(true);
    state.status = 'won';
    state.checkpoint = null;

    sync();

    expect(store.read().ok).toBe(false);
    expect(Reflect.get(scene, 'lastCheckpointKey')).toBe('null');
    expect(Reflect.get(scene, 'checkpointStatus')).toBe('cleared — night shift survived');
  });

  it.each([
    { name: 'Second Wind', noBreaks: true, secondWind: true },
    { name: 'ordinary room-clear recovery', noBreaks: false, secondWind: false },
  ])('still saves a valid cleared room after $name revives the player', ({ noBreaks, secondWind }) => {
    const state = lastKillAndIncomingShot({ noBreaks, secondWind });
    const previousMarker = state.checkpoint;

    swing(state);

    expect(state.room.combat.enemies).toHaveLength(0);
    expect(state.room.combat.player.health).toBe(2);
    expect(state.status).toBe('playing');
    expect(state.room.cleared).toBe(true);
    expect(state.checkpoint).not.toEqual(previousMarker);
    expect(state.checkpoint).toEqual({ roomIndex: state.roomIndex, tick: state.tick });
    if (secondWind) expect(state.perks.secondWinds).toBe(0);
    const store = new InMemoryCheckpointStore();
    expect(store.write(state)).toEqual({ ok: true });
    const continued = store.read();
    if (!continued.ok) throw new Error(continued.reason);
    const restored = restoreMvpRun(continued.checkpoint);
    expect(restored.room.cleared).toBe(true);
    expect(restored.room.combat.enemies).toHaveLength(0);
    expect(restored.room.combat.player.health).toBe(2);

    const beforeX = state.room.combat.player.x;
    tickMvpRun(state, { ...idle, moveX: 1 });
    expect(state.room.combat.player.x).toBeGreaterThan(beforeX);
  });
});

describe('checkpoint stores preserve a valid save on an invalid health write', () => {
  const stores = [
    { name: 'memory', create: () => new InMemoryCheckpointStore() },
    { name: 'localStorage', create: () => {
      const entries = new Map<string, string>();
      return new LocalStorageCheckpointStore({
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => { entries.set(key, value); },
        removeItem: (key) => { entries.delete(key); },
      });
    } },
  ];

  it.each(stores)('$name refuses dead and noninteger health without overwriting Continue', ({ create }) => {
    const state = createMvpRun(8);
    const store = create();
    expect(store.write(state)).toEqual({ ok: true });
    const previousSave = store.read();
    for (const health of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5]) {
      state.room.combat.player.health = health;
      expect.soft(store.write(state).ok, `health ${health}`).toBe(false);
      expect.soft(store.read(), `health ${health}`).toEqual(previousSave);
    }
  });
});
