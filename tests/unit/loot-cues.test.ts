import { describe, expect, it } from 'vitest';
import { lootPose, lootLabel, parseLootReceipt, LootReceiptCursor, nearbyLoot } from '../../src/game/view/lootCues';
import { createMvpRun } from '../../src/sim/run/createMvpRun';
import { recordBehaviorTrace } from '../../src/sim/effects/events';
import { collectTokens } from '../../src/sim/run/tokens';
import type { MallTokenPickup } from '../../src/sim/run/tokens';
const coin: MallTokenPickup = { id: 'coin', x: 100, y: 120, value: 4, droppedTick: 0 };
const item: MallTokenPickup = { ...coin, id: 'item', kind: 'item', itemDefinitionId: 'golden_mop', rare: true };

describe('floor loot cues use existing facts', () => {
  it('settles to a stable native-size silhouette without changing the pickup', () => {
    const before = JSON.stringify(coin);
    expect(lootPose(coin, 60, false)).toEqual(lootPose(coin, 91, false));
    expect(lootPose(coin, 60, false)).toMatchObject({ x: 100, y: 114, scale: 2, marker: 'cash' });
    expect(JSON.stringify(coin)).toBe(before);
  });
  it('uses a rare diamond independent of the gold cash colour', () => {
    expect(lootPose(item, 60, false)).toMatchObject({ marker: 'rare', scale: 1 });
    expect(lootPose({ ...item, rare: false }, 60, false).marker).toBe('item');
  });
  it('freezes spawn motion for quiet presentation', () => {
    expect(lootPose(item, 4, true)).toEqual(lootPose(item, 60, true));
    expect(lootPose(item, 4, false).y).toBeLessThan(lootPose(item, 60, false).y);
  });
  it('labels actual value and truthful automatic collection states', () => {
    expect(lootLabel(coin, true)).toBe('$4 - WALK OVER');
    expect(lootLabel({ ...coin, kind: 'snack' }, false)).toBe('PRETZEL - HEALTH FULL');
    expect(lootLabel({ ...coin, kind: 'snack' }, true)).toBe('PRETZEL - HALF A HEART');
    expect(lootLabel({ ...item, awaitingStepOff: true }, true)).toContain('STEP AWAY FIRST');
    expect(lootLabel(item, true)).toContain('RARE');
    expect(lootLabel(item, true)).not.toContain('[E]');
  });
  it('chooses one nearest item deterministically; hides behind real interactions or threats', () => {
    const other = { ...coin, id: 'a', x: 105 };
    expect(nearbyLoot([coin, other], { x: 100, y: 120 }, false)?.id).toBe('coin');
    expect(nearbyLoot([coin], { x: 100, y: 120 }, true)).toBeNull();
    expect(nearbyLoot([coin], { x: 400, y: 400 }, false)).toBeNull();
  });
});

describe('authoritative pickup success receipts', () => {
  it('recognizes actual token, snack, found, retained-node and boss feedback only', () => {
    expect(parseLootReceipt('[t4] +4 Mall Tokens ($4).')).toMatchObject({ kind: 'cash', cash: 4, text: '+$4' });
    expect(parseLootReceipt('[t4] Food court pretzel! +half a heart.')).toMatchObject({ kind: 'snack' });
    expect(parseLootReceipt('[t4] Found: Pump Soaker.')).toMatchObject({ kind: 'item', text: 'FOUND: PUMP SOAKER' });
    expect(parseLootReceipt('[t4] Picked up the Golden Mop.')).toMatchObject({ kind: 'item' });
    expect(parseLootReceipt('[t4] RARE FIND: the boss dropped the Golden Mop!')).toMatchObject({ kind: 'rare', text: 'RARE: GOLDEN MOP' });
    for (const text of ['Dropped the Golden Mop.', 'Bought Pump Soaker for $4.', 'Not enough cash.', '+4 cleanup combo!', 'Found: fake. trailing']) expect(parseLootReceipt('[t4] ' + text)).toBeNull();
  });
  it('does not replay old history or duplicate frames; retains same-tick successes', () => {
    const cursor = new LootReceiptCursor(); const trace = ['[t0] Found: Old Item.'];
    expect(cursor.read('room', 1, trace)).toEqual([]);
    trace.push('[t2] +1 Mall Token ($1).', '[t2] Found: Pump Soaker.', '[t2] Nothing nearby.');
    expect(cursor.read('room', 2, trace).map(r => r.kind)).toEqual(['cash', 'item']);
    expect(cursor.read('room', 2, trace)).toEqual([]);
  });
  it('coalesces cash and caps bursts without losing the rare priority', () => {
    const cursor = new LootReceiptCursor(); const trace: string[] = []; cursor.read('room', 0, trace);
    trace.push('[t1] +1 Mall Token ($1).', '[t1] +4 Mall Tokens ($4).');
    expect(cursor.read('room', 1, trace)).toEqual([{ kind: 'cash', cash: 5, text: '+$5' }]);
  });
  it('resets silently across transitions, rewind, replacement and explicit reset', () => {
    const cursor = new LootReceiptCursor(); let trace: string[] = []; cursor.read('one', 10, trace);
    trace.push('[t11] Found: Item.'); expect(cursor.read('two', 11, trace)).toEqual([]);
    trace.push('[t12] Found: Item.'); expect(cursor.read('two', 1, trace)).toEqual([]);
    trace = ['[t1] Found: Replaced.']; expect(cursor.read('two', 1, trace)).toEqual([]);
    cursor.reset(); trace.push('[t2] Found: Reset.'); expect(cursor.read('two', 2, trace)).toEqual([]);
  });
  it('reads new successes when the bounded combat log shifts without growing', () => {
    const cursor = new LootReceiptCursor(); const trace = Array.from({length:32},(_,i)=>`combat ${i}`);
    cursor.read('room', 10, trace);trace.shift();trace.push('[t11] +1 Mall Token ($1).');
    expect(cursor.read('room',11,trace)).toHaveLength(1);
    trace.shift();trace.push('[t12] +1 Mall Token ($1).');
    expect(cursor.read('room',12,trace)).toHaveLength(1);
    expect(cursor.read('room',12,trace)).toEqual([]);
    trace.shift();trace.push('[t12] Found: Golden Mop.');
    expect(cursor.read('room',12,trace)).toHaveLength(1);
  });

  it('follows the real combat-trim and collection sequence without missing cash', () => {
    const state = createMvpRun(3); const cursor = new LootReceiptCursor(); cursor.read('room',state.tick,state.behaviorTrace);
    for(let t=1;t<=4;t++){
      for(let n=0;n<40;n++) recordBehaviorTrace(state.room.combat,`combat ${t}-${n}`);
      state.tick=t;state.room.tokens=[{...coin,id:`cash-${t}`,x:state.room.combat.player.x,y:state.room.combat.player.y}];collectTokens(state);
      expect(cursor.read('room',state.tick,state.behaviorTrace)).toEqual([{kind:'cash',cash:4,text:'+$4'}]);
    }
  });
  it('distinguishes repeated identical strings in one tick and accepts more than 32 successes', () => {
    const cursor = new LootReceiptCursor();const trace:string[]=[];cursor.read('room',0,trace);
    for(let i=0;i<40;i++)trace.push('[t1] Found: Golden Mop.');
    expect(cursor.read('room',1,trace)).toHaveLength(40);
    expect(cursor.read('room',1,trace)).toEqual([]);
    trace.push('[t1] Found: Golden Mop.');expect(cursor.read('room',1,trace)).toHaveLength(1);
    trace.splice(0,32);expect(cursor.read('room',1,trace)).toEqual([]);
  });

});
