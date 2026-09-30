import { describe, expect, it } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { tickMvpRun } from '../../src/sim/run/tickMvpRun';
import { spawnSecurityGuard } from '../../src/sim/run/rooms';
import {
  BOSS_RARE_POOL,
  COMMON_DROP_POOL,
  ELITE_ITEM_DROP_CHANCE,
  ITEM_DROP_CHANCE,
  RARE_ITEM_IDS,
  dropItemsForDeaths,
  rollItemDrop,
} from '../../src/sim/run/drops';
import { markLivingEnemies } from '../../src/sim/run/tokens';
import { ITEM_CATALOG } from '../../src/sim/items/catalog';
import { STORE_TEMPLATES } from '../../src/sim/wing/templates';
import { isValidFusionInventoryState, isCleanPart } from '../../src/sim/fusion/inventory';
import { hotItemCount } from '../../src/sim/run/wanted';
import { parseCheckpoint, restoreMvpRun, serializeCheckpoint } from '../../src/sim/run/checkpoint';
import { buildBenchCardModel } from '../../src/game/ui/benchCardModel';
import { openRunWorkbench } from '../../src/sim/run/bench';
import type { InventoryLeaf } from '../../src/sim/fusion/types';
import type { MvpInputFrame, MvpRunState } from '../../src/sim/run/types';

const idle: MvpInputFrame = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, interact: false, steal: false, recall: false };

function killAt(state: MvpRunState, kind: 'hanger' | 'shopper' | 'lp_manager', x = 300, y = 240, elite = false) {
  const enemy = spawnSecurityGuard(kind === 'lp_manager' ? 'shopper' : kind as 'shopper', 900, x, y, 0);
  const marker = { ...enemy, kind, elite, health: 10 };
  // Nobody is left alive: the marker's enemy died this tick.
  state.room.combat.enemies = [];
  dropItemsForDeaths(state, [marker]);
}

describe('enemies and bosses drop items (round 32)', () => {
  it('rare items exist only as drops: no store sells them', () => {
    expect(RARE_ITEM_IDS.length).toBeGreaterThanOrEqual(8);
    const sold = new Set(STORE_TEMPLATES.flatMap((store) => store.offers.map((offer) => offer.itemDefinitionId)));
    for (const id of RARE_ITEM_IDS) {
      expect(ITEM_CATALOG.some((item) => item.id === id), id).toBe(true);
      expect(sold.has(id), id).toBe(false);
    }
    expect(COMMON_DROP_POOL.some((id) => RARE_ITEM_IDS.includes(id))).toBe(false);
    expect(BOSS_RARE_POOL.every((id) => RARE_ITEM_IDS.includes(id))).toBe(true);
  });

  it('a regular kill drops an item now and then, and an elite far more often', () => {
    let regular = 0;
    let elite = 0;
    const trials = 4000;
    for (let tick = 0; tick < trials; tick += 1) {
      if (rollItemDrop(99, tick, 7, false)) regular += 1;
      if (rollItemDrop(99, tick, 7, true)) elite += 1;
    }
    expect(regular / trials).toBeGreaterThan(ITEM_DROP_CHANCE * 0.6);
    expect(regular / trials).toBeLessThan(ITEM_DROP_CHANCE * 1.4);
    expect(elite / trials).toBeGreaterThan(ELITE_ITEM_DROP_CHANCE * 0.8);
  });

  it('a dropped item lies on the floor until the janitor walks over it, then is owned and clean', () => {
    const state = createMvpRun(3);
    let tick = 0;
    while (state.room.tokens.every((pickup) => pickup.kind !== 'item')) {
      state.tick = tick;
      killAt(state, 'shopper', 300, 240, true);
      tick += 1;
      if (tick > 500) throw new Error('no drop in 500 elite kills');
    }
    const drop = state.room.tokens.find((pickup) => pickup.kind === 'item')!;
    const before = state.inventory.inventory.length;
    state.room.combat.player.x = drop.x;
    state.room.combat.player.y = drop.y;
    tickMvpRun(state, idle);
    expect(state.inventory.inventory.length).toBe(before + 1);
    const found = state.inventory.inventory.at(-1) as InventoryLeaf;
    expect(found.itemDefinitionId).toBe(drop.itemDefinitionId);
    expect(found.acquisitionKind).toBe('found');
    expect(isCleanPart(found)).toBe(true);
    expect(hotItemCount(state)).toBe(0);
    expect(isValidFusionInventoryState(state.inventory)).toBe(true);
    // Found goods survive a checkpoint.
    const parsed = parseCheckpoint(serializeCheckpoint(state));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(restoreMvpRun(parsed.checkpoint).inventory.inventory.length).toBe(before + 1);
  });

  it('a boss always hands over a rare, straight into the inventory', () => {
    const state = createMvpRun(3);
    const before = state.inventory.inventory.length;
    killAt(state, 'lp_manager');
    expect(state.inventory.inventory.length).toBe(before + 1);
    const prize = state.inventory.inventory.at(-1) as InventoryLeaf;
    expect(RARE_ITEM_IDS).toContain(prize.itemDefinitionId);
    expect(prize.acquisitionKind).toBe('found');
    expect(state.recentChange).toMatch(/RARE/);
  });

  it('killing enemies in a real fight drops items through the tick', () => {
    const state = createMvpRun(11);
    let dropped = 0;
    for (let round = 0; round < 300 && dropped === 0; round += 1) {
      const guard = spawnSecurityGuard('shopper', 1000 + round, 400, 240, 0);
      state.room.combat.enemies = [{ ...guard, health: 0, elite: true }];
      const before = markLivingEnemies(state).map((marker) => ({ ...marker, health: 5 }));
      state.room.combat.enemies = [];
      state.tick = round;
      dropItemsForDeaths(state, before);
      dropped = state.room.tokens.filter((pickup) => pickup.kind === 'item').length;
    }
    expect(dropped).toBeGreaterThan(0);
  });

  it('the bench shows up to sixteen things, and a fused tile says how many items it holds', () => {
    const state = createMvpRun(5);
    const extra = ITEM_CATALOG.slice(30, 44).map((item): InventoryLeaf => ({ kind: 'leaf', instanceId: `x-${item.id}`, itemDefinitionId: item.id, acquisitionKind: 'purchased', sourceLocationId: 'test', sourceStockId: item.id, acquisitionTick: 0 }));
    state.inventory = { ...state.inventory, inventory: [...state.inventory.inventory, ...extra], revision: state.inventory.revision + 1 };
    const kiosk = state.wing.rooms[0]!.benchKiosk!;
    state.room.combat.player.x = kiosk.x;
    state.room.combat.player.y = kiosk.y;
    expect(openRunWorkbench(state).accepted).toBe(true);
    const card = buildBenchCardModel(state)!;
    expect(card.tiles.length).toBe(Math.min(16, state.inventory.inventory.length));
    expect(card.tiles.every((tile) => tile.parts >= 1)).toBe(true);
  });
});
