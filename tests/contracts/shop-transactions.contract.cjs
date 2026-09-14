const test = require('node:test');
const assert = require('node:assert/strict');
const { createShopState, transactShop, SHOP_HEAT_CAP } = require(process.env.M3_SHOP_TRANSACTIONS_MODULE);

function offer(overrides = {}) {
  return { offerId: 'display-a', storeId: 'electronics', itemId: 'extension-cord',
    instanceId: 'shop:electronics:a', priceCents: 1500, heatOnSteal: 20, ...overrides };
}
const buy = { kind: 'buy', offerId: 'display-a' };
const steal = { kind: 'steal', offerId: 'display-a' };

test('purchase debits cash, preserves Heat, consumes stock, and records provenance', () => {
  const state = createShopState(2500, [offer()], 7);
  const result = transactShop(state, buy);
  assert.equal(result.ok, true);
  assert.equal(result.state.cashCents, 1000);
  assert.equal(result.state.securityHeat, 7);
  assert.equal(result.state.offers[0].status, 'purchased');
  assert.deepEqual(result.acquisition, { offerId:'display-a', storeId:'electronics',
    itemId:'extension-cord', instanceId:'shop:electronics:a', method:'purchased', pricePaidCents:1500, heatAdded:0 });
  assert.deepEqual(result.state.acquisitions, [result.acquisition]);
  assert.equal(state.cashCents, 2500);
  assert.equal(state.offers[0].status, 'available');
  assert.deepEqual(state.acquisitions, []);
});

test('purchase permits exact funds without a negative balance', () => {
  assert.equal(transactShop(createShopState(1500, [offer()]), buy).state.cashCents, 0);
});

test('insufficient cash rejects without any state or acquisition change', () => {
  const state = createShopState(1499, [offer()]);
  assert.deepEqual(transactShop(state, buy), { ok:false, state, reason:'insufficient-cash' });
  assert.equal(transactShop(state, buy).state, state);
});

test('a zero-price offer is a purchase, not stolen provenance', () => {
  const result = transactShop(createShopState(0, [offer({priceCents:0})]), buy);
  assert.equal(result.ok, true);
  assert.equal(result.state.cashCents, 0);
  assert.equal(result.acquisition.method, 'purchased');
});

test('theft costs no cash, adds authored Heat, and records stolen provenance', () => {
  const result = transactShop(createShopState(0, [offer()], 7), steal);
  assert.equal(result.ok, true);
  assert.equal(result.state.cashCents, 0);
  assert.equal(result.state.securityHeat, 27);
  assert.equal(result.state.offers[0].status, 'stolen');
  assert.equal(result.acquisition.method, 'stolen');
  assert.equal(result.acquisition.pricePaidCents, 0);
  assert.equal(result.acquisition.heatAdded, 20);
});

test('Heat is capped and receipt records the actual added Heat', () => {
  assert.equal(SHOP_HEAT_CAP, 100);
  const result = transactShop(createShopState(100, [offer()], 95), steal);
  assert.equal(result.state.securityHeat, 100);
  assert.equal(result.acquisition.heatAdded, 5);
});

test('theft at the cap still consumes the item exactly once', () => {
  const result = transactShop(createShopState(100, [offer()], 100), steal);
  assert.equal(result.ok, true);
  assert.equal(result.acquisition.heatAdded, 0);
  assert.equal(result.state.acquisitions.length, 1);
});

test('leave is a successful exact no-op and does not consume an offer', () => {
  const state = createShopState(4000, [offer()], 30);
  const result = transactShop(state, {kind:'leave'});
  assert.deepEqual(result, {ok:true, state, acquisition:null});
  assert.equal(result.state, state);
});

test('a purchased offer cannot be purchased or stolen again', () => {
  const state = transactShop(createShopState(5000, [offer()]), buy).state;
  for (const command of [buy, steal]) {
    assert.deepEqual(transactShop(state, command), {ok:false, state, reason:'offer-unavailable'});
    assert.equal(transactShop(state, command).state, state);
  }
});

test('a stolen offer cannot be stolen or purchased again', () => {
  const state = transactShop(createShopState(5000, [offer()]), steal).state;
  for (const command of [steal, buy]) {
    assert.deepEqual(transactShop(state, command), {ok:false, state, reason:'offer-unavailable'});
  }
});

test('an unknown offer rejects without changing the original state', () => {
  const state = createShopState(5000, [offer()]);
  assert.deepEqual(transactShop(state, {kind:'buy',offerId:'missing'}), {ok:false,state,reason:'unknown-offer'});
});

test('invalid commands cannot accidentally acquire stock', () => {
  const state = createShopState(5000, [offer()]);
  for (const command of [null, {}, {kind:'sell'}, {kind:'buy'}, {kind:'steal',offerId:42}]) {
    assert.deepEqual(transactShop(state, command), {ok:false,state,reason:'invalid-command'});
  }
});

test('constructor clones authored offers and freezes nested state', () => {
  const authored = offer();
  const offers = [authored];
  const state = createShopState(5000, offers);
  authored.priceCents = 0;
  offers.length = 0;
  assert.equal(state.offers[0].priceCents, 1500);
  for (const value of [state, state.offers, state.offers[0], state.acquisitions]) assert.ok(Object.isFrozen(value));
});

test('successful results, receipts, and new stock are frozen', () => {
  const result = transactShop(createShopState(5000, [offer()]), buy);
  for (const value of [result, result.state, result.state.offers, result.state.offers[0],
    result.state.acquisitions, result.acquisition]) assert.ok(Object.isFrozen(value));
});

test('duplicate offer IDs are rejected at content construction', () => {
  assert.throws(() => createShopState(0, [offer(), offer({instanceId:'different'})]), /duplicate offer/i);
});

test('duplicate item-instance IDs are rejected even across stores', () => {
  assert.throws(() => createShopState(0, [offer(), offer({offerId:'display-b',storeId:'video'})]), /duplicate instance/i);
});

test('two distinct instances of the same item definition remain independently available', () => {
  const state = createShopState(5000, [offer(),offer({offerId:'display-b',instanceId:'shop:electronics:b'})]);
  const first = transactShop(state, buy).state;
  assert.equal(first.offers[1].status, 'available');
  const second = transactShop(first, {kind:'steal',offerId:'display-b'}).state;
  assert.equal(second.cashCents, 3500);
  assert.equal(second.securityHeat, 20);
  assert.deepEqual(second.acquisitions.map(r=>r.instanceId), ['shop:electronics:a','shop:electronics:b']);
});

test('cash requires a nonnegative safe integer', () => {
  for (const amount of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER+1])
    assert.throws(() => createShopState(amount, [offer()]), /cashCents/i);
});

test('price requires a nonnegative safe integer', () => {
  for (const amount of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER+1])
    assert.throws(() => createShopState(0, [offer({priceCents:amount})]), /priceCents/i);
});

test('initial Heat and authored theft Heat are bounded integers', () => {
  for (const amount of [-1, .5, NaN, Infinity, 101]) {
    assert.throws(() => createShopState(0, [offer()], amount), /securityHeat/i);
    assert.throws(() => createShopState(0, [offer({heatOnSteal:amount})]), /heatOnSteal/i);
  }
});

test('all authored identity fields must be nonblank strings', () => {
  for (const field of ['offerId','storeId','itemId','instanceId']) {
    for (const bad of ['', '  ', null, 5])
      assert.throws(() => createShopState(0, [offer({[field]:bad})]), new RegExp(field));
  }
});

test('an empty shop can be left and cannot conjure an item', () => {
  const state = createShopState(0, []);
  assert.equal(transactShop(state, {kind:'leave'}).state, state);
  assert.equal(transactShop(state, buy).reason, 'unknown-offer');
});

test('zero theft Heat is valid authored data', () => {
  const result = transactShop(createShopState(0,[offer({heatOnSteal:0})],30),steal);
  assert.equal(result.ok, true);
  assert.equal(result.state.securityHeat,30);
});

test('the same initial state and action sequence produce identical results', () => {
  function replay() {
    let state = createShopState(5000,[offer(),offer({offerId:'b',instanceId:'shop:b'})]);
    for (const command of [{kind:'leave'},buy,{kind:'steal',offerId:'b'},buy]) state=transactShop(state,command).state;
    return state;
  }
  assert.deepEqual(replay(),replay());
});
