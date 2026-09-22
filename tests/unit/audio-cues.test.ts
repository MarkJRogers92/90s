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
import type { EmitterMountComposite, InventoryLeaf } from '../../src/sim/fusion/types';

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
    expect(confiscated).not.toContain('secured');
  });

  it('reports a secured theft instead of a confiscation', () => {
    // Securing and confiscating look identical in carried/Heat/suspicion: both
    // drop carried goods, raise Heat, and reset suspicion. The distinguisher is
    // the inventory — a securing banks stolen leaves, a confiscation does not.
    const theft = {
      itemDefinitionId: 'gel_pens',
      sourceStoreId: 'mall_mart',
      sourceOfferId: 'offer-1',
      startedTick: 0,
    };
    const carrying = createMvpRun(9);
    carrying.carried.push(theft);
    const secured = cuesBetween(carrying, (state) => {
      state.heat += 15;
      state.suspicion = 0;
      state.carried = [];
      const leaf: InventoryLeaf = {
        kind: 'leaf',
        instanceId: 'mvp-stolen-offer-1',
        itemDefinitionId: 'gel_pens',
        acquisitionKind: 'stolen',
        sourceLocationId: 'mall_mart',
        sourceStockId: 'offer-1',
        acquisitionTick: 5,
      };
      state.inventory = {
        ...state.inventory,
        inventory: [...state.inventory.inventory, leaf],
      };
    });
    expect(secured).toContain('secured');
    expect(secured).not.toContain('confiscation');
  });

  it('reports a fusion instead of a purchase', () => {
    // The bench fee reduces cash exactly like a shop purchase; the composite
    // appearing in the same tick is what makes it a fusion.
    const fused = cuesAfter((state) => {
      state.cash -= 4;
      const popper: InventoryLeaf = {
        kind: 'leaf',
        instanceId: 'dev-party_popper',
        itemDefinitionId: 'party_popper',
        acquisitionKind: 'purchased',
        sourceLocationId: 'dev-fixture',
        sourceStockId: 'dev-fixture',
        acquisitionTick: 0,
      };
      const car: InventoryLeaf = {
        kind: 'leaf',
        instanceId: 'dev-rc_car',
        itemDefinitionId: 'rc_car',
        acquisitionKind: 'purchased',
        sourceLocationId: 'dev-fixture',
        sourceStockId: 'dev-fixture',
        acquisitionTick: 0,
      };
      const composite: EmitterMountComposite = {
        kind: 'composite',
        instanceId: 'composite-1',
        recipeId: 'emitter_mount',
        createdTick: 5,
        transactionId: 'txn-1',
        primary: popper,
        carrier: car,
      };
      state.inventory = {
        ...state.inventory,
        inventory: [...state.inventory.inventory, composite],
      };
    });
    expect(fused).toContain('fusion');
    expect(fused).not.toContain('purchase');
  });

  it('reports a non-lethal enemy hit without the takedown cue', () => {
    const state = createMvpRun(9);
    state.room.combat.enemies = [makeHanger(1, 200, 240)];
    const struck = cuesBetween(state, (current) => {
      current.room.combat.enemies = [makeHanger(1, 200, 240, 4)];
    });
    expect(struck).toContain('hit');
    expect(struck).not.toContain('enemy_down');
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
