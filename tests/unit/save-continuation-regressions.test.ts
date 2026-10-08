import { expect, test } from 'vitest';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { ascend } from '../../src/sim/run/floors';
import { bossWingSeed } from '../../src/sim/wing/floorSpecs';
import { buyRunOffer, runOfferPrice } from '../../src/sim/run/economy';
import { serializeCheckpoint, parseCheckpoint } from '../../src/sim/run/checkpoint';
import { openRunWorkbench, pickWorkbenchItem, confirmRunFusionPreview } from '../../src/sim/run/bench';
import { sellWorkbenchItem, dropRunWeapon } from '../../src/sim/run/resale';
import { refreshRunLoadout } from '../../src/sim/run/loadout';
import { isValidFusionInventoryState } from '../../src/sim/fusion/inventory';
import { moveToRoom } from '../../src/sim/run/roomTransition';
import { LocalStorageCheckpointStore } from '../../src/game/persistence/LocalStorageCheckpointStore';
import type { MvpRunState } from '../../src/sim/run/types';

const saved = (state: any) => parseCheckpoint(JSON.parse(JSON.stringify(serializeCheckpoint(state))));
function checkpointRead(state: any) {
  const data = new Map<string, string>();
  const store = new LocalStorageCheckpointStore({
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
  expect(store.write(state).ok).toBe(true);
  return store.read();
}

test('keeps Continue valid after carrying a Floor 1 purchase up the stairs', () => {
  let setup: any;
  for (let seed = 1; seed <= 100 && !setup; seed++) {
    const first = createMvpRun(seed, { part: 1 });
    const second = createMvpRun(bossWingSeed(seed));
    const repeated = first.wing.rooms.flatMap((r: any) => r.offers)
      .find((o: any) => second.offerStatus[o.id] === 'available' && runOfferPrice(first, o) <= first.cash);
    if (repeated) setup = { seed, first, repeated };
  }
  expect(setup).toBeTruthy();
  const { seed, first, repeated } = setup;
  expect(buyRunOffer(first, repeated.id).accepted).toBe(true);
  expect(saved(first).ok).toBe(true);
  first.status = 'won'; // Represents completing the first wing's fights.
  const second = ascend(first);
  expect(second.wing.floor ?? 1).toBe(1);
  expect(second.wing.part).not.toBe(1);
  expect(second.offerStatus[repeated.id]).toBe('available');
  const result = checkpointRead(second);
  expect(result.ok).toBe(true);
});

function fused() {
  const state = createMvpRun(5);
  const kiosk = state.wing.rooms[0]!.benchKiosk!;
  Object.assign(state.room.combat.player, { x: kiosk.x, y: kiosk.y });
  const leaf = (id: string) => ({ kind: 'leaf', instanceId: 'probe-' + id,
    itemDefinitionId: id, acquisitionKind: 'found', sourceLocationId: state.room.roomId,
    sourceStockId: 'drop-' + id, acquisitionTick: state.tick });
  state.cash = 99;
  state.inventory = { ...state.inventory, cash: 99,
    inventory: [...state.inventory.inventory, leaf('pump_soaker'), leaf('plasma_globe')] } as any;
  refreshRunLoadout(state);
  expect(saved(state).ok).toBe(true);
  expect(openRunWorkbench(state).accepted).toBe(true);
  expect(pickWorkbenchItem(state, 'probe-pump_soaker').accepted).toBe(true);
  expect(pickWorkbenchItem(state, 'probe-plasma_globe').accepted).toBe(true);
  expect(confirmRunFusionPreview(state).accepted).toBe(true);
  expect(isValidFusionInventoryState(state.inventory)).toBe(true);
  expect(checkpointRead(state).ok).toBe(true);
  return state;
}

test('keeps Continue valid after selling a committed fusion', () => {
  const state = fused();
  const composite = state.inventory.inventory.find(n => n.kind === 'composite')!;
  expect(openRunWorkbench(state).accepted).toBe(true);
  expect(pickWorkbenchItem(state, composite.instanceId).accepted).toBe(true);
  expect(sellWorkbenchItem(state).accepted).toBe(true);
  expect(isValidFusionInventoryState(state.inventory)).toBe(true);
  state.workbench = null;
  moveToRoom(state, 1, 'west');
  const result = checkpointRead(state);
  expect(result.ok).toBe(true);
});

test('keeps Continue valid after leaving a dropped fusion behind', () => {
  const state = fused();
  const composite = state.inventory.inventory.find(n => n.kind === 'composite')!;
  state.inventory = { ...state.inventory, selectedPrimaryInstanceId: composite.instanceId };
  refreshRunLoadout(state);
  expect(dropRunWeapon(state).accepted).toBe(true);
  expect(state.room.tokens.some(t => t.node?.instanceId === composite.instanceId)).toBe(true);
  state.workbench = null;
  moveToRoom(state, 1, 'west');
  const result = checkpointRead(state);
  expect(result.ok).toBe(true);
});

test('selling a nested hybrid detaches every receipt in its subtree', () => {
  const state = fused();
  const inner = state.inventory.inventory.find((n: any) => n.kind === 'composite')!;
  state.inventory = { ...state.inventory,
    inventory: [...state.inventory.inventory,
      { kind: 'leaf', instanceId: 'probe-gel_pens', itemDefinitionId: 'gel_pens', acquisitionKind: 'found', sourceLocationId: state.room.roomId, sourceStockId: 'drop-gel', acquisitionTick: state.tick }],
    cash: 99 } as any;
  state.cash = 99;
  refreshRunLoadout(state);
  expect(openRunWorkbench(state).accepted).toBe(true);
  expect(pickWorkbenchItem(state, inner.instanceId).accepted).toBe(true);
  expect(pickWorkbenchItem(state, 'probe-gel_pens').accepted).toBe(true);
  expect(confirmRunFusionPreview(state).accepted).toBe(true);
  expect(state.inventory.committedTransactions.length).toBe(2);
  const nested = state.inventory.inventory.find((n: any) => n.kind === 'composite')!;
  expect(openRunWorkbench(state).accepted).toBe(true);
  expect(pickWorkbenchItem(state, nested.instanceId).accepted).toBe(true);
  expect(sellWorkbenchItem(state).accepted).toBe(true);
  expect(state.inventory.committedTransactions).toHaveLength(0);
  expect(isValidFusionInventoryState(state.inventory)).toBe(true);
  state.workbench = null;
  moveToRoom(state, 1, 'west');
  expect(checkpointRead(state).ok).toBe(true);
});

test('dropping an emitter mount detaches its receipt and pickup restores it', async () => {
  const { collectItemDrops } = await import('../../src/sim/run/drops');
  const state = createMvpRun(5);
  const kiosk = state.wing.rooms[0]!.benchKiosk!;
  Object.assign(state.room.combat.player, { x: kiosk.x, y: kiosk.y });
  const leaf = (id: string, item: string) => ({ kind: 'leaf', instanceId: 'probe-' + id,
    itemDefinitionId: item, acquisitionKind: 'found', sourceLocationId: state.room.roomId,
    sourceStockId: 'drop-' + id, acquisitionTick: state.tick });
  state.cash = 99;
  state.inventory = { ...state.inventory, cash: 99,
    inventory: [...state.inventory.inventory, leaf('soaker', 'pump_soaker'), leaf('car', 'rc_car')] } as any;
  refreshRunLoadout(state);
  expect(openRunWorkbench(state).accepted).toBe(true);
  expect(pickWorkbenchItem(state, 'probe-soaker').accepted).toBe(true);
  expect(pickWorkbenchItem(state, 'probe-car').accepted).toBe(true);
  expect(confirmRunFusionPreview(state).accepted).toBe(true);
  const mount = state.inventory.inventory.find((n: any) => n.kind === 'composite')!;
  if (mount.kind !== 'composite') throw new Error('Expected an emitter mount.');
  expect(mount.recipeId).toBe('emitter_mount');
  expect(state.inventory.committedTransactions.length).toBe(1);
  state.inventory = { ...state.inventory, selectedPrimaryInstanceId: mount.instanceId };
  refreshRunLoadout(state);
  expect(dropRunWeapon(state).accepted).toBe(true);
  const token = state.room.tokens.find((t: any) => t.node?.instanceId === mount.instanceId)!;
  expect(token.detachedTransactions?.length ?? 0).toBe(1);
  expect(state.inventory.committedTransactions).toHaveLength(0);
  expect(isValidFusionInventoryState(state.inventory)).toBe(true);
  Object.assign(state.room.combat.player, { x: token.x, y: token.y });
  state.room.tokens = state.room.tokens.map((t: any) => ({ ...t, awaitingStepOff: false }));
  collectItemDrops(state);
  expect(state.inventory.inventory.some((n: any) => n.instanceId === mount.instanceId)).toBe(true);
  expect(state.inventory.committedTransactions).toHaveLength(1);
  expect(isValidFusionInventoryState(state.inventory)).toBe(true);
  moveToRoom(state, 1, 'west');
  expect(checkpointRead(state).ok).toBe(true);
});

test('dropping a fusion, fusing again, then picking it up keeps every receipt', async () => {
  const { collectItemDrops } = await import('../../src/sim/run/drops');
  const state = fused();
  const first = state.inventory.inventory.find((n: any) => n.kind === 'composite')!;
  state.inventory = { ...state.inventory, selectedPrimaryInstanceId: first.instanceId };
  refreshRunLoadout(state);
  expect(dropRunWeapon(state).accepted).toBe(true);
  const token = state.room.tokens.find((t: any) => t.node?.instanceId === first.instanceId)!;
  expect(token.detachedTransactions?.length ?? 0).toBe(1);
  expect(isValidFusionInventoryState(state.inventory)).toBe(true);
  state.inventory = { ...state.inventory,
    inventory: [...state.inventory.inventory,
      { kind: 'leaf', instanceId: 'probe-bottle', itemDefinitionId: 'bottle_rocket_pack', acquisitionKind: 'found', sourceLocationId: state.room.roomId, sourceStockId: 'drop-bottle', acquisitionTick: state.tick },
      { kind: 'leaf', instanceId: 'probe-popper', itemDefinitionId: 'party_popper', acquisitionKind: 'found', sourceLocationId: state.room.roomId, sourceStockId: 'drop-popper', acquisitionTick: state.tick }],
    cash: 99 } as any;
  state.cash = 99;
  refreshRunLoadout(state);
  expect(openRunWorkbench(state).accepted).toBe(true);
  expect(pickWorkbenchItem(state, 'probe-bottle').accepted).toBe(true);
  expect(pickWorkbenchItem(state, 'probe-popper').accepted).toBe(true);
  expect(confirmRunFusionPreview(state).accepted).toBe(true);
  expect(state.inventory.committedTransactions.length).toBe(1);
  Object.assign(state.room.combat.player, { x: token.x, y: token.y });
  state.room.tokens = state.room.tokens.map((t: any) => ({ ...t, awaitingStepOff: false }));
  collectItemDrops(state);
  expect(state.inventory.inventory.some((n: any) => n.instanceId === first.instanceId)).toBe(true);
  expect(state.inventory.committedTransactions.length).toBe(2);
  expect(isValidFusionInventoryState(state.inventory)).toBe(true);
  moveToRoom(state, 1, 'west');
  expect(checkpointRead(state).ok).toBe(true);
});

test('re-buying a dropped fusion ingredient after the stairs reuses no dropped id', async () => {
  const { collectItemDrops } = await import('../../src/sim/run/drops');
  let setup: any;
  for (let seed = 1; seed <= 100 && !setup; seed++) {
    const first = createMvpRun(seed, { part: 1 });
    const second = createMvpRun(bossWingSeed(seed));
    const repeated = first.wing.rooms.flatMap((r: any) => r.offers)
      .find((o: any) => second.offerStatus[o.id] === 'available' && runOfferPrice(first, o) <= first.cash);
    if (repeated) setup = { seed, first, repeated };
  }
  expect(setup).toBeTruthy();
  const { first, repeated } = setup;
  first.cash = 500;
  first.inventory = { ...first.inventory, cash: 500 };
  expect(buyRunOffer(first, repeated.id).accepted).toBe(true);
  const kiosk = first.wing.rooms[0].benchKiosk!;
  Object.assign(first.room.combat.player, { x: kiosk.x, y: kiosk.y });
  first.inventory = { ...first.inventory,
    inventory: [...first.inventory.inventory,
      { kind: 'leaf', instanceId: 'probe-globe', itemDefinitionId: 'plasma_globe', acquisitionKind: 'found', sourceLocationId: first.room.roomId, sourceStockId: 'drop-globe', acquisitionTick: first.tick }],
    cash: 500 } as any;
  first.cash = 500;
  refreshRunLoadout(first);
  const boughtId = first.inventory.inventory.find((n: any) => n.kind === 'leaf' && n.sourceStockId === repeated.id)!.instanceId;
  expect(openRunWorkbench(first).accepted).toBe(true);
  expect(pickWorkbenchItem(first, boughtId).accepted).toBe(true);
  expect(pickWorkbenchItem(first, 'probe-globe').accepted).toBe(true);
  expect(confirmRunFusionPreview(first).accepted).toBe(true);
  first.status = 'won';
  const second = ascend(first);
  expect(second.offerStatus[repeated.id]).toBe('available');
  const carried = second.inventory.inventory.find((n: any) => n.kind === 'composite')!;
  second.cash = 500;
  second.inventory = { ...second.inventory, selectedPrimaryInstanceId: carried.instanceId, cash: 500 };
  refreshRunLoadout(second);
  expect(dropRunWeapon(second).accepted).toBe(true);
  const token = second.room.tokens.find((t: any) => t.node?.instanceId === carried.instanceId)!;
  expect(buyRunOffer(second, repeated.id).accepted).toBe(true);
  const rebought = second.inventory.inventory.find((n: any) => n.kind === 'leaf' && n.sourceStockId === repeated.id)!;
  expect(rebought.instanceId).not.toBe(boughtId);
  Object.assign(second.room.combat.player, { x: token.x, y: token.y });
  second.room.tokens = second.room.tokens.map((t: any) => ({ ...t, awaitingStepOff: false }));
  collectItemDrops(second);
  expect(isValidFusionInventoryState(second.inventory)).toBe(true);
  const ids: string[] = [];
  const walk = (n: any): void => { ids.push(n.instanceId); if (n.kind === 'composite') { walk(n.primary); walk(n.carrier); } };
  second.inventory.inventory.forEach(walk);
  expect(new Set(ids).size).toBe(ids.length);
  moveToRoom(second, 1, 'west');
  expect(checkpointRead(second).ok).toBe(true);
});

test('records the originating wing even when the next wing does not restock the item', () => {
  let setup: {
    first: MvpRunState;
    offer: MvpRunState['wing']['rooms'][number]['offers'][number];
  } | undefined;
  for (let seed = 1; seed <= 100 && !setup; seed++) {
    const first = createMvpRun(seed, { part: 1 });
    const next = createMvpRun(bossWingSeed(seed));
    const offer = first.wing.rooms.flatMap((room) => room.offers).find((candidate) =>
      next.offerStatus[candidate.id] === undefined && runOfferPrice(first, candidate) <= first.cash);
    if (offer) setup = { first, offer };
  }
  if (!setup) throw new Error('Expected an affordable item absent from the next wing.');
  const { first, offer } = setup;
  expect(buyRunOffer(first, offer.id).accepted).toBe(true);
  first.status = 'won';
  const next = ascend(first);
  const carried = next.inventory.inventory.find((node) =>
    node.kind === 'leaf' && node.itemDefinitionId === offer.itemDefinitionId);
  if (!carried || carried.kind !== 'leaf') throw new Error('Expected the carried purchase.');
  expect(carried.sourceStockId).toBe(`${first.seed}:${offer.id}`);
  expect(first.inventory.inventory.some((node) =>
    node.kind === 'leaf' && node.sourceStockId === offer.id)).toBe(true);
  next.status = 'won';
  const upstairs = ascend(next);
  expect(upstairs.inventory.inventory.find((node) => node.instanceId === carried.instanceId)).toEqual(carried);
  expect(checkpointRead(upstairs).ok).toBe(true);
});
