/**
 * Audio cue derivation.
 *
 * The sound layer is presentation, so it is driven by a pure function over
 * authoritative state rather than by the Web Audio engine. That is what makes
 * it testable at all: these tests never create an AudioContext.
 */
import { describe, expect, it } from 'vitest';
import { createAudioSnapshot, deriveAudioCues } from '../../src/game/audio/cues';
import type { AudioCue } from '../../src/game/audio/cues';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import type { MvpRunState } from '../../src/sim/run/types';
import type { EnemyState, ProjectileState } from '../../src/sim/model';

function makeBoss(overrides: Partial<EnemyState> = {}): EnemyState {
  return {
    id: 99,
    kind: 'lp_manager',
    x: 400,
    y: 240,
    health: 60,
    radius: 22,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 1,
    telegraphAimY: 0,
    bossPhase: 1,
    bossSummoned: false,
    bossVolleyTelegraphTicks: 0,
    ...overrides,
  };
}

function makePlayerShot(): ProjectileState {
  return {
    id: 500,
    previousX: 100,
    previousY: 240,
    x: 104,
    y: 240,
    velocityX: 4,
    velocityY: 0,
    radius: 4,
    remainingTicks: 60,
    faction: 'player',
    damage: 3,
  };
}

function makeHanger(id: number, x: number, y: number, health = 8): EnemyState {
  return {
    id,
    kind: 'hanger',
    x,
    y,
    health,
    radius: 14,
    phase: 'pursue',
    phaseTicks: 0,
    cooldownTicks: 0,
    telegraphAimX: 0,
    telegraphAimY: 0,
  };
}

/** Snapshots a fresh run, applies a mutation, and reports the cues it produced. */
function cuesAfter(mutate: (state: MvpRunState) => void): AudioCue[] {
  const state = createMvpRun(9);
  const previous = createAudioSnapshot(state);
  mutate(state);
  return deriveAudioCues(previous, state);
}

/**
 * Snapshots an already-prepared state, applies a further mutation, and reports
 * the cues. Needed wherever the interesting change is a transition out of a
 * state the fresh run does not start in.
 */
function cuesBetween(
  state: MvpRunState,
  mutate: (state: MvpRunState) => void,
): AudioCue[] {
  const previous = createAudioSnapshot(state);
  mutate(state);
  return deriveAudioCues(previous, state);
}

describe('audio cue derivation', () => {
  it('is silent when nothing changed', () => {
    expect(cuesAfter(() => undefined)).toEqual([]);
  });

  it('reports damage and recovery in the right direction', () => {
    expect(cuesAfter((state) => (state.room.combat.player.health -= 2))).toContain('hurt');
    expect(cuesAfter((state) => (state.room.combat.player.health -= 2))).not.toContain('heal');
    expect(cuesAfter((state) => (state.room.combat.player.health += 2))).toContain('heal');
  });

  it('reports a purchase when cash falls', () => {
    expect(cuesAfter((state) => (state.cash -= 6))).toContain('purchase');
  });

  it('distinguishes a theft from a confiscation', () => {
    const theft = {
      itemDefinitionId: 'gel_pens',
      sourceStoreId: 'mall_mart',
      sourceOfferId: 'offer-1',
      startedTick: 0,
    };
    expect(cuesAfter((state) => state.carried.push(theft))).toContain('theft');

    // Losing a carried item while Heat rises is a confiscation, not a theft.
    // This needs two steps: carrying and then losing in one tick nets to no
    // change at all, which is exactly what the first attempt at this test did.
    const carrying = createMvpRun(9);
    carrying.carried.push(theft);
    const confiscated = cuesBetween(carrying, (state) => {
      state.heat += 15;
      state.carried = [];
    });
    expect(confiscated).toContain('confiscation');
    expect(confiscated).not.toContain('theft');
  });

  it('reports an enemy going down', () => {
    // The service corridor authors no enemies, so one has to be present first.
    const state = createMvpRun(9);
    state.room.combat.enemies = [makeHanger(1, 200, 240)];
    expect(
      cuesBetween(state, (current) => {
        current.room.combat.enemies = [];
      }),
    ).toContain('enemy_down');
  });

  it('reports a cleared room and the checkpoint that follows it', () => {
    const cues = cuesAfter((state) => {
      state.clearedRooms.push(state.room.roomId);
      state.checkpoint = { roomIndex: 1, tick: 120 };
    });
    expect(cues).toContain('room_clear');
    expect(cues).toContain('checkpoint');
  });

  it('reports terminal outcomes', () => {
    expect(cuesAfter((state) => (state.status = 'won'))).toContain('won');
    const died = cuesAfter((state) => (state.status = 'dead'));
    expect(died).toContain('died');
    expect(died).not.toContain('won');
  });

  it('puts the terminal cue first so it wins the voice slot', () => {
    const cues = cuesAfter((state) => {
      state.room.combat.player.health -= 2;
      state.cash -= 6;
      state.status = 'dead';
    });
    expect(cues[0]).toBe('died');
  });

  it('reports boss escalation, telegraphs and volleys', () => {
    const escalate = cuesAfter((state) => {
      state.room.combat.enemies = [makeBoss()];
    });
    // The boss appearing is not itself an escalation to phase 2.
    expect(escalate).not.toContain('boss_phase');

    const state = createMvpRun(9);
    state.room.combat.enemies = [makeBoss()];
    const before = createAudioSnapshot(state);
    state.room.combat.enemies = [makeBoss({ bossPhase: 2 })];
    expect(deriveAudioCues(before, state)).toContain('boss_phase');

    const telegraph = createMvpRun(9);
    telegraph.room.combat.enemies = [makeBoss()];
    const beforeTelegraph = createAudioSnapshot(telegraph);
    telegraph.room.combat.enemies = [makeBoss({ phase: 'telegraph' })];
    expect(deriveAudioCues(beforeTelegraph, telegraph)).toContain('boss_telegraph');

    const volley = createMvpRun(9);
    volley.room.combat.enemies = [makeBoss({ bossPhase: 2 })];
    const beforeVolley = createAudioSnapshot(volley);
    volley.room.combat.enemies = [
      makeBoss({ bossPhase: 2, bossVolleyTelegraphTicks: 45 }),
    ];
    expect(deriveAudioCues(beforeVolley, volley)).toContain('boss_volley');
  });

  it('reports a swing on the attack window opening', () => {
    expect(cuesAfter((state) => (state.room.combat.player.attackActiveTicks = 6))).toContain(
      'swing',
    );
  });

  it('reports a shot and a splash', () => {
    expect(
      cuesAfter((state) => {
        state.room.combat.projectiles.push(makePlayerShot());
      }),
    ).toContain('shot');
  });

  it('announces a room change with the PA chime', () => {
    expect(cuesAfter((state) => (state.roomIndex += 1))).toContain('pa_chime');
  });

  it('does not fire the enemy projectile count as the player shooting', () => {
    const cues = cuesAfter((state) => {
      state.room.combat.projectiles.push({ ...makePlayerShot(), faction: 'enemy' });
    });
    expect(cues).not.toContain('shot');
  });
});

describe('combat beat cues', () => {
  function withEnemies(enemies: EnemyState[]): MvpRunState {
    const state = createMvpRun(9);
    state.room.combat.enemies = enemies;
    return state;
  }

  it('reports a hit when an enemy loses health, and a heavy hit for a big one', () => {
    const light = cuesBetween(withEnemies([makeHanger(1, 200, 240)]), (state) => {
      state.room.combat.enemies[0]!.health -= 1;
    });
    expect(light).toContain('hit');
    expect(light).not.toContain('hit_heavy');
    const heavy = cuesBetween(withEnemies([makeHanger(1, 200, 240)]), (state) => {
      state.room.combat.enemies[0]!.health -= 4;
    });
    expect(heavy).toContain('hit_heavy');
    expect(heavy).not.toContain('hit');
  });

  it('does not also report a hit for the blow that kills', () => {
    const cues = cuesBetween(withEnemies([makeHanger(1, 200, 240, 2)]), (state) => {
      state.room.combat.enemies = [];
    });
    expect(cues).toContain('enemy_down');
    expect(cues).not.toContain('hit');
  });

  it('gives the boss its own kill sting', () => {
    const cues = cuesBetween(withEnemies([makeBoss({ health: 1 })]), (state) => {
      state.room.combat.enemies = [];
    });
    expect(cues).toContain('boss_down');
    expect(cues).not.toContain('enemy_down');
  });

  it('reports a spitter charging and then spitting', () => {
    const spitter = { ...makeHanger(3, 300, 200), kind: 'spitter' as const, phase: 'recover' as const };
    const charging = cuesBetween(withEnemies([spitter]), (state) => {
      state.room.combat.enemies[0]!.phase = 'telegraph';
    });
    expect(charging).toContain('spit_charge');
    const state = withEnemies([{ ...spitter, phase: 'telegraph' }]);
    const fired = cuesBetween(state, (current) => {
      current.room.combat.enemies[0]!.phase = 'recover';
    });
    expect(fired).toContain('spit');
  });

  it('reports the slam landing when the boss leaves its telegraph', () => {
    const state = withEnemies([makeBoss({ phase: 'telegraph' })]);
    expect(cuesBetween(state, (current) => {
      current.room.combat.enemies[0]!.phase = 'recover';
    })).toContain('slam');
  });
});
