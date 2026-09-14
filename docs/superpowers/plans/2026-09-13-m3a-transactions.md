# DEAD MALL M3A Transactions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this bounded first increment. Check off the evidence below; do not conflate it with the full M3 gate.

**Goal:** Provide deterministic buy/steal/leave economy and provenance transitions for the upcoming fixed-wing shop.

**Architecture:** Pure immutable transitions in `src/sim/shops/transactions.ts`. Stable authored offer IDs prevent double acquisition. Receipts preserve acquisition history without changing the existing item compiler or render loop.

**Tech Stack:** TypeScript, Node built-in contract tests, existing package scripts. No new dependency or runtime service.

**Spec:** `docs/milestones/M3_SHOPLIFTING_LOOP.md`

## Global constraints

- Keep the M1 and M2 runtime entry points unchanged in this increment.
- Cash and prices are nonnegative safe integer cents; Heat is integer 0–100.
- Use one-stock authored offers. No procedural generation, fusion, timers, or persistence in this module.
- Record limited/offline verification separately from the full pinned project gate.

## Task 1 — Define observable transaction behavior

Files: create `tests/contracts/shop-transactions.contract.cjs` and `src/sim/shops/transactions.ts`.

Interfaces:

```ts
createShopState(cashCents: number, offers: readonly ShopOffer[], securityHeat?: number): ShopState;
transactShop(state: ShopState, command: ShopCommand): ShopResult;
```

Commands are `{kind:'buy', offerId}`, `{kind:'steal', offerId}`, or `{kind:'leave'}`. State contains cash, Heat, frozen stock, and acquisition receipts. A result is either success with an optional acquisition receipt or rejection with the exact original state.

- [x] Write contract tests before behavior: purchase debit and provenance; exact funds; insufficient funds; theft and cap; leave; repeated commands; unknown/invalid commands; caller/state immutability; input validation; unique identities; deterministic replay.
- [x] Compile a no-behavior scaffold and run the purchase contract. Observe `false !== true`, not a missing-file/dependency error.
- [x] Implement minimal transitions and validation in the pure module.
- [x] Run all contract tests and a strict standalone TypeScript compile.

Example required assertion:

```js
const state = createShopState(2500, [{offerId:'display-a',storeId:'electronics',itemId:'extension-cord',instanceId:'shop:electronics:a',priceCents:1500,heatOnSteal:20}]);
const result = transactShop(state, {kind:'buy', offerId:'display-a'});
assert.equal(result.ok, true);
assert.equal(result.state.cashCents, 1000);
assert.equal(result.acquisition.method, 'purchased');
assert.equal(state.cashCents, 2500);
assert.equal(transactShop(result.state, {kind:'buy',offerId:'display-a'}).ok, false);
```

## Task 2 — Reproducible targeted gate and continuation evidence

Files: create `tools/test-m3-transactions.mjs`; add `test:m3` to `package.json`; update checkpoint docs.

- [x] Run the compiler with strict settings into a temporary CommonJS directory, run Node's contract tests against that emitted module, and clean the directory even on failure. Default to the repository's installed TypeScript; an explicit compiler path is allowed for recorded isolated checks only.
- [x] Record exact compiler/Node versions, contract count, failure-first evidence, and commands. A missing dependency must fail with a clear message, not trigger an automatic install.
- [x] Update STATUS and NEXT_SESSION to say M3A kernel only, not playable M3. Preserve historical M2 evidence.
- [ ] Commit on the continuation branch only, then fetch back the commit/tree and key files.

The remaining M3 integration and acceptance criteria are in the spec. This first increment deliberately does not change RunState, RunScene, EntityView, InteractionLab, or current combat behavior.
