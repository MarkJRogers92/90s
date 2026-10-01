import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway, nearestMvpInteraction, tickMvpRun, tryInteract } from '../../src/sim/run/tickMvpRun';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { INTERIOR_EXIT, activeStore } from '../../src/sim/run/storeInterior';
import { circleIntersectsRect } from '../../src/sim/core/geometry';
import {
  SECRET_CASH,
  SECRET_CHANCE,
  SECRET_MACHINE,
  SECRET_STORE_INDEX,
  SECRET_TICKS,
  SECRET_WAVE_TICKS,
  secretFor,
} from '../../src/sim/run/secretRoom';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

/** A night whose wing has a secret, the janitor standing at the machine. */
function atTheMachine(): MvpRunState {
  for (let seed = 1; seed < 200; seed += 1) {
    const state = createMvpRun(seed);
    const secret = secretFor(state.wing);
    if (!secret) continue;
    while (state.roomIndex !== secret.roomIndex) {
      state.room.combat.enemies = [];
      tickMvpRun(state, idle);
      const door = state.wing.rooms[state.roomIndex]!.doorways.find((entry) => entry.side === 'east')!;
      state.room.combat.player.x = door.rect.x + door.rect.width / 2;
      state.room.combat.player.y = door.rect.y + door.rect.height / 2;
      expect(enterDoorway(state, 'east').accepted).toBe(true);
    }
    state.room.combat.player.x = SECRET_MACHINE.x;
    state.room.combat.player.y = SECRET_MACHINE.y + 30;
    return state;
  }
  throw new Error('no secret in 200 nights');
}

/** Ticks with the janitor kept standing, so a fight can be outlasted. */
function outlast(state: MvpRunState, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    state.room.combat.player.health = 6;
    state.room.combat.player.invulnerableTicks = 10;
    tickMvpRun(state, idle);
  }
}

describe('the secret back room (round 53)', () => {
  it('about three nights in five hide a machine on a storefront concourse, the same every time', () => {
    let found = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const wing = createMvpRun(seed).wing;
      const secret = secretFor(wing);
      expect(secretFor(createMvpRun(seed).wing)).toEqual(secret);
      if (!secret) continue;
      found += 1;
      const room = wing.rooms[secret.roomIndex]!;
      expect(room.store).not.toBeNull();
      expect(room.enemySpawns).toHaveLength(0);
      expect(room.walls.some((wall) => circleIntersectsRect(SECRET_MACHINE.x, SECRET_MACHINE.y + 30, 14, wall))).toBe(false);
      expect(secret.prize.length).toBeGreaterThan(0);
    }
    expect(found / 200).toBeGreaterThan(SECRET_CHANCE - 0.15);
    expect(found / 200).toBeLessThan(SECRET_CHANCE + 0.15);
  });

  it('jiggling the machine opens a sealed back room with a prize on offer', () => {
    const state = atTheMachine();
    expect(nearestMvpInteraction(state).kind).toBe('secret');
    expect(tryInteract(state).accepted).toBe(true);
    expect(state.room.interior).toBe(true);
    expect(state.room.storeIndex).toBe(SECRET_STORE_INDEX);
    expect(activeStore(state)).toBeNull();
    expect(state.room.secret?.phase).toBe('fight');
    expect(state.room.combat.walls).toContainEqual(INTERIOR_EXIT);
    expect(state.recentChange).toMatch(/20 seconds/i);
    // Monsters come in waves, never on top of the janitor.
    outlast(state, 1);
    const player = state.room.combat.player;
    const first = state.room.combat.enemies.length;
    expect(first).toBeGreaterThan(0);
    for (const enemy of state.room.combat.enemies) expect(Math.hypot(enemy.x - player.x, enemy.y - player.y)).toBeGreaterThan(120);
    outlast(state, SECRET_WAVE_TICKS);
    expect(state.room.combat.enemies.length).toBeGreaterThan(first);
  });

  it('outlast it: the lights come on, the prize drops, the door opens, and the machine is spent', () => {
    const state = atTheMachine();
    const secret = secretFor(state.wing)!;
    tryInteract(state);
    const cash = state.cash;
    outlast(state, SECRET_TICKS + 2);
    expect(state.room.secret?.phase).toBe('won');
    expect(state.room.combat.enemies.filter((enemy) => enemy.health > 0)).toHaveLength(0);
    expect(state.room.combat.walls).not.toContainEqual(INTERIOR_EXIT);
    expect(state.cash).toBe(cash + SECRET_CASH);
    const prize = state.room.tokens.find((token) => token.kind === 'item');
    expect(prize?.itemDefinitionId).toBe(secret.prize);
    // Pick it up.
    state.room.combat.player.x = prize!.x;
    state.room.combat.player.y = prize!.y;
    tickMvpRun(state, idle);
    expect(state.inventory.inventory.some((node) => node.kind === 'leaf' && node.itemDefinitionId === secret.prize)).toBe(true);
    // And out the door, back by the machine, which does nothing now.
    state.room.combat.player.x = INTERIOR_EXIT.x + INTERIOR_EXIT.width / 2;
    state.room.combat.player.y = INTERIOR_EXIT.y - 4;
    for (let tick = 0; tick < 30 && state.room.interior; tick += 1) tickMvpRun(state, { ...idle, moveY: 1 });
    expect(state.room.interior).toBe(false);
    expect(state.room.secret ?? null).toBeNull();
    state.room.combat.player.x = SECRET_MACHINE.x;
    state.room.combat.player.y = SECRET_MACHINE.y + 30;
    expect(nearestMvpInteraction(state).kind).not.toBe('secret');
  });

  it('a save after the back room keeps it spent; an older save loads with it still there', () => {
    const state = atTheMachine();
    tryInteract(state);
    const parsed = parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const resumed = restoreMvpRun(parsed.checkpoint);
    expect(resumed.room.interior).toBe(false);
    resumed.room.combat.player.x = SECRET_MACHINE.x;
    resumed.room.combat.player.y = SECRET_MACHINE.y + 30;
    expect(nearestMvpInteraction(resumed).kind).not.toBe('secret');

    const { secretsDone: _dropped, ...older } = JSON.parse(JSON.stringify(serializeCheckpoint(state))) as Record<string, unknown>;
    const old = parseCheckpoint(older);
    expect(old.ok).toBe(true);
    if (!old.ok) return;
    const oldRun = restoreMvpRun(old.checkpoint);
    oldRun.room.combat.player.x = SECRET_MACHINE.x;
    oldRun.room.combat.player.y = SECRET_MACHINE.y + 30;
    expect(nearestMvpInteraction(oldRun).kind).toBe('secret');
  });
});

describe('the back room sounds', () => {
  it('a creak when the passage opens, a fanfare when it is won', async () => {
    const { createAudioSnapshot, deriveAudioCues } = await import('../../src/game/audio/cues');
    const state = atTheMachine();
    const before = createAudioSnapshot(state);
    tryInteract(state);
    expect(deriveAudioCues(before, state)).toContain('secret_open');
    outlast(state, SECRET_TICKS - 1);
    const almost = createAudioSnapshot(state);
    outlast(state, 2);
    expect(deriveAudioCues(almost, state)).toContain('secret_won');
  });
});

describe('the back room on the HUD', () => {
  it('the objective is the clock, then the prize', async () => {
    const { buildGameHudModel, roomTitleSubtitle } = await import('../../src/game/ui/gameHudModel');
    const state = atTheMachine();
    tryInteract(state);
    expect(roomTitleSubtitle(state).text).toMatch(/20 SECONDS/);
    expect(buildGameHudModel(state).objectives[1]!.text).toMatch(/^SURVIVE THE BACK ROOM {2}20S$/);
    outlast(state, SECRET_TICKS + 1);
    expect(buildGameHudModel(state).objectives[1]!.text).toBe('GRAB THE PRIZE AND GET OUT');
  });
});
