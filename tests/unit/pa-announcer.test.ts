import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { enterDoorway } from '../../src/sim/run/tickMvpRun';
import { ascendToFloorTwo } from '../../src/sim/run/floors';
import { enterStore, roomStores } from '../../src/sim/run/storeInterior';
import { itemDefinitionName } from '../../src/sim/run/economy';
import { signatureFusions } from '../../src/sim/fusion/hybrid';
import type { EnemyState } from '../../src/sim/model';
import type { MvpRunState } from '../../src/sim/run/types';
import { PA_COOLDOWN_TICKS, PA_IDLE_TICKS, PA_LINES, PA_START_GRACE_TICKS, PaDirector, paTypingFrame, recipeLine } from '../../src/game/ui/paModel';

const hanger = (): EnemyState => ({ id: 70, kind: 'hanger', x: 600, y: 200, health: 12, radius: 14, phase: 'pursue', phaseTicks: 0, cooldownTicks: 0, telegraphAimX: 0, telegraphAimY: 0 } as EnemyState);

/** A director that has already seen the shift start. */
function watching(state: MvpRunState): PaDirector {
  const director = new PaDirector();
  expect(director.observe(state)).toBeNull();
  return director;
}

describe('the mall PA', () => {
  it('stays quiet as the shift starts (the clock-in has the floor)', () => {
    const director = new PaDirector();
    expect(director.observe(createMvpRun(7))).toBeNull();
  });

  it('greets the boss room with the boss line, whatever the cooldown', () => {
    const state = createMvpRun(7);
    const director = watching(state);
    while (state.wing.rooms[state.roomIndex]?.bossAnchor == null) {
      state.room.combat.enemies = [];
      state.tick += 1;
      enterDoorway(state, 'east');
      const line = director.observe(state);
      if (state.wing.rooms[state.roomIndex]?.bossAnchor != null) expect(line).toBe(PA_LINES.boss_floor_one[0]);
    }
  });

  it('welcomes the janitor to the upper level after the escalator', () => {
    const below = createMvpRun(7);
    const director = watching(below);
    below.status = 'won';
    const above = ascendToFloorTwo(below);
    expect(director.observe(above)).toBe(PA_LINES.upstairs[0]);
  });

  it('calls a cleanup on aisle four the first time the janitor drops to the last heart in a room', () => {
    const state = createMvpRun(7);
    const director = watching(state);
    state.tick += PA_COOLDOWN_TICKS;
    state.room.combat.enemies = [hanger()];
    state.room.combat.player.health = 2;
    expect(PA_LINES.low_health).toContain(director.observe(state));
    state.tick += PA_COOLDOWN_TICKS;
    state.room.combat.player.health = 1;
    expect(director.observe(state)).toBeNull();
  });

  it('pages loss prevention when heat goes up', () => {
    const state = createMvpRun(7);
    const director = watching(state);
    state.tick += PA_COOLDOWN_TICKS;
    state.heat += 20;
    expect(PA_LINES.theft).toContain(director.observe(state));
  });

  it('announces the store alarm by name, over the cooldown', () => {
    const state = createMvpRun(7);
    const director = watching(state);
    state.tick += 10;
    director.observe(state);
    const name = state.wing.rooms[state.roomIndex]?.store?.name ?? 'THE STORE';
    state.alarm = { storeId: 'x', roomIndex: state.roomIndex, ticksLeft: 300, shutter: 'open' };
    const line = director.observe(state);
    expect(PA_LINES.alarm.map((l) => l.replace('{STORE}', name.toUpperCase()))).toContain(line);
    expect(line).not.toContain('{STORE}');
  });

  it('locks the shutter with a security page', () => {
    const state = createMvpRun(7);
    state.alarm = { storeId: 'x', roomIndex: state.roomIndex, ticksLeft: 300, shutter: 'open' };
    const director = watching(state);
    state.tick += 10;
    state.alarm = { storeId: 'x', roomIndex: state.roomIndex, ticksLeft: 0, shutter: 'closed' };
    const line = director.observe(state);
    expect(line).toMatch(/^SECURITY TO .*\. NOBODY LEAVES\.$/);
  });

  it('asks for the merchandise back at three stars, and stays quiet below', () => {
    const state = createMvpRun(7);
    const director = watching(state);
    state.tick += PA_COOLDOWN_TICKS;
    state.heat = 60;
    expect(PA_LINES.wanted).toContain(director.observe(state));
    state.tick += PA_COOLDOWN_TICKS;
    state.heat = 70;
    expect(director.observe(state)).toBeNull();
  });

  it('reminds staff that all sales are final when a hot item is laundered', () => {
    const state = createMvpRun(7);
    state.inventory = { ...state.inventory, inventory: [{ kind: 'leaf', acquisitionKind: 'stolen' } as never] };
    const director = watching(state);
    state.tick += PA_COOLDOWN_TICKS;
    state.inventory = { ...state.inventory, inventory: [] };
    expect(PA_LINES.launder).toContain(director.observe(state));
  });

  it('never talks over itself: a second event inside the cooldown waits', () => {
    const state = createMvpRun(7);
    const director = watching(state);
    state.tick += PA_COOLDOWN_TICKS;
    state.heat += 20;
    expect(director.observe(state)).not.toBeNull();
    state.tick += 10;
    state.heat += 20;
    expect(director.observe(state)).toBeNull();
  });

  it('fills a long quiet stretch with an idle announcement', () => {
    const state = createMvpRun(7);
    const director = watching(state);
    state.room.combat.enemies = [];
    state.tick += PA_IDLE_TICKS;
    expect(PA_LINES.idle).toContain(director.observe(state));
  });

  it('keeps every line short enough for the ticker', () => {
    for (const lines of Object.values(PA_LINES)) for (const line of lines) expect(line.replace('{STORE}', 'DEPARTMENT OUTLET').length).toBeLessThanOrEqual(56);
  });

  it('chimes, types the line out, holds it, and fades', () => {
    const text = 'CLEANUP ON AISLE FOUR.';
    expect(paTypingFrame(0, text).chars).toBe(0);
    expect(paTypingFrame(700, text).chars).toBeGreaterThan(0);
    const typed = paTypingFrame(2000, text);
    expect(typed.chars).toBe(text.length);
    expect(typed.alpha).toBe(1);
    expect(paTypingFrame(20_000, text).done).toBe(true);
  });
});

describe('the mall PA after a quiet start', () => {
  it('can speak a few seconds into a shift, not only after a full cooldown', () => {
    expect(PA_START_GRACE_TICKS).toBeLessThan(PA_COOLDOWN_TICKS / 2);
    const state = createMvpRun(7);
    const director = new PaDirector();
    director.observe(state);
    state.tick += PA_START_GRACE_TICKS;
    state.heat += 20;
    expect(PA_LINES.theft).toContain(director.observe(state));
  });
});

describe('the PA drops recipe hints (round 34)', () => {
  /** A fresh run standing on the concourse of a storefront whose shop shelves a signature pair. */
  function atPairedShop(): { state: MvpRunState; index: number; names: [string, string] } {
    for (let seed = 1; seed < 400; seed += 1) {
      const state = createMvpRun(seed);
      for (let guard = 0; guard < 6; guard += 1) {
        const room = state.wing.rooms[state.roomIndex]!;
        const index = roomStores(room).findIndex((shop) => room.offers.some((offer) => offer.storeId === shop.templateId && offer.pairedWith));
        if (index >= 0) {
          const offer = room.offers.find((candidate) => candidate.storeId === roomStores(room)[index]!.templateId && candidate.pairedWith)!;
          return { state, index, names: [itemDefinitionName(offer.itemDefinitionId).toUpperCase(), itemDefinitionName(offer.pairedWith!).toUpperCase()] };
        }
        state.room.combat.enemies = [];
        state.tick += 1;
        if (!enterDoorway(state, 'east').accepted) break;
      }
    }
    throw new Error('no paired shop in 400 malls');
  }

  it('walking into a store with a named pair on the shelf gets a hint naming both', () => {
    const { state, index, names } = atPairedShop();
    const director = watching(state);
    state.tick += PA_COOLDOWN_TICKS;
    expect(enterStore(state, index).accepted).toBe(true);
    state.tick += 1;
    const line = director.observe(state)!;
    expect(line).toContain(names[0]);
    expect(line).toContain(names[1]);
  });

  it('keeps every hint short enough for the ticker, for every named pair', () => {
    for (const { itemIds: [a, b] } of signatureFusions()) {
      for (const line of PA_LINES.recipe) {
        const said = recipeLine(line, a, b);
        expect(said.length, said).toBeLessThanOrEqual(56);
      }
    }
  });
});
