# DEAD MALL M3 Shoplifting Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, fixed two-store shoplifting loop with buying, theft escape, security suspicion and confiscation, provenance, Heat, and an intentional terminal summary while preserving M1 and M2.

**Architecture:** A separate renderer-independent `WingState` under `src/sim/shop` owns shopping, movement, economy, provenance, security, and terminal transitions. A dedicated Phaser `WingScene` reads that state and submits a renderer-neutral input frame; DOM and canvas views only present authoritative results. The existing combat `RunState`, M1 **Start shift**, and M2 **Interaction Lab** stay structurally independent.

**Tech Stack:** TypeScript 7.0.2, Phaser 4.2.1, Vite 8.3.0, Vitest 5.0.0, Playwright Test 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-13-dead-mall-m3-shoplifting-loop-design.md`

## Global Constraints

- Implement only M3's fixed 960-by-480 two-store shoplifting loop and terminal summary; do not begin M4.
- Reuse all eight M2 `ITEM_CATALOG` definitions exactly once as merchandise; offer prices live only on shop offers.
- Starting cash is `$30`; securing theft adds `15` Heat and confiscation adds `25` Heat; Heat is an integer clamped from `0` to `100` and never decays.
- Suspicion is clamped from `0` to `100`; visible gain is `0.5 * (1 + Heat / 100)` per tick and hidden drain is `0.75` per tick.
- Each authored sight zone has range `180`, full arc `70` degrees, sweep `55` degrees on either side of its inward centerline, and `180` ticks between sweep endpoints.
- Interaction distance is `42` world units; the player radius is `10` and movement speed is `210` world units per second.
- Shopping rules stay under `src/sim/shop`; Phaser and DOM code collect input and render state but never own economy, provenance, Heat, suspicion, visibility, or transitions.
- `WingState` remains separate from combat `RunState`; no multi-mode combat-state union.
- Resolve each tick in the spec's stable order, including securing a theft before sight/detection on the same tick and resolving no more than one contextual action.
- Each production behavior must follow red-green TDD: write the meaningful test, observe the expected failure, then implement minimally.
- Pause, blur, confiscation, restart, and scene shutdown clear held interaction state and discard accumulated time.
- Existing M1 **Start shift** and M2 **Interaction Lab** behavior and browser flows remain green.
- Runtime content remains local; no telemetry, accounts, backend, analytics, cloud service, or external runtime calls.
- No push, merge, publication, deployment, or release.

---

### Task 1: Immutable wing content, validation, authoritative state, and shopping commands

**Files:**
- Create: `src/sim/shop/types.ts`
- Create: `src/sim/shop/catalog.ts`
- Create: `src/sim/shop/validateWing.ts`
- Create: `src/sim/shop/createWingRun.ts`
- Create: `src/sim/shop/commands.ts`
- Create: `tests/unit/shop-catalog.test.ts`
- Create: `tests/unit/shop-commands.test.ts`

**Interfaces:**
- Consumes: `ITEM_CATALOG`, `ItemId`, `Rect`, and `Vec2` from existing M2 modules.
- Produces: `WingDefinition`, `StoreDefinition`, `ShopOfferDefinition`, `OwnedShopItem`, `CarriedTheft`, `WingSummary`, `WingState`, `WingCommandResult`, `M3_WING`, `validateWing()`, `createWingRun()`, `buyOffer()`, `beginTheft()`, `secureTheft()`, `confiscateTheft()`, and `leaveWing()`.
- `WingCommandResult` is `{ accepted: true; event: WingEvent } | { accepted: false; reason: string }`; rejected commands do not mutate cash, inventory, offers, Heat, suspicion, position, or status.
- Offer runtime status is one of `available | carried | consumed`; owned instances use IDs `wing-item-1`, `wing-item-2`, ... and store `itemDefinitionId`, `acquisitionKind`, `sourceStoreId`, `sourceOfferId`, and `acquisitionTick`.

- [ ] **Step 1: Write failing catalog-validation tests with hand-authored expectations.**

```ts
expect(M3_WING.startingCash).toBe(30);
expect(M3_WING.stores.flatMap((store) => store.offerIds)).toHaveLength(8);
expect(M3_WING.offers.map(({ itemDefinitionId, price }) => [itemDefinitionId, price])).toEqual([
  ['janitor_mop', 10], ['bubble_bath', 14], ['extension_cord', 12], ['gel_pens', 8],
  ['pump_soaker', 18], ['plasma_globe', 22], ['vhs_rewinder', 24], ['wide_nozzle', 16],
]);
expect(() => validateWing({ ...M3_WING, offers: [...M3_WING.offers, M3_WING.offers[0]!] }, ITEM_CATALOG)).toThrow(/homestyle-mop/);
expect(() => validateWing(wingWithUnknownItem('missing-item'), ITEM_CATALOG)).toThrow(/missing-item/);
expect(() => validateWing(wingWithSightZoneOutsideStore('homestyle'), ITEM_CATALOG)).toThrow(/homestyle/);
```

- [ ] **Step 2: Run `npx vitest run tests/unit/shop-catalog.test.ts` and confirm RED because `src/sim/shop` does not exist.**
- [ ] **Step 3: Implement plain immutable definitions and validation for duplicate wing/store/offer IDs, unknown item references, duplicate offered items, invalid finite positive prices, invalid bounds/walls/exit/reset geometry, sight-zone containment, usable store exits, and exactly the eight M2 items once each.**

```ts
export function validateWing(
  definition: WingDefinition,
  itemDefinitions: readonly ItemDefinition[],
): void;

export const M3_WING: WingDefinition = freezeDeep({
  id: 'orchard-gate-two-store-wing',
  width: 960,
  height: 480,
  startingCash: 30,
  playerSpawn: { x: 480, y: 390 },
  // Two authored stores open onto the lower public corridor; all remaining
  // bounds, walls, exits, cameras, and offers use literal validated data.
});
```

- [ ] **Step 4: Write failing command tests for purchase, insufficient cash, theft ownership, one-carried-item enforcement, escape, confiscation, provenance, Heat clamps, carried exit rejection, and one-time terminal summary.**

```ts
const bought = buyOffer(state, 'homestyle-mop');
expect(bought.accepted).toBe(true);
expect(state.cash).toBe(20);
expect(state.inventory[0]).toMatchObject({
  instanceId: 'wing-item-1', itemDefinitionId: 'janitor_mop', acquisitionKind: 'purchased',
  sourceStoreId: 'homestyle', sourceOfferId: 'homestyle-mop', acquisitionTick: 0,
});
expect(buyOffer(state, 'future-rewinder')).toEqual({ accepted: false, reason: 'Not enough cash.' });
expect(beginTheft(state, 'homestyle-gel-pens').accepted).toBe(true);
expect(beginTheft(state, 'future-soaker')).toEqual({ accepted: false, reason: 'Secure the carried item first.' });
expect(leaveWing(state)).toEqual({ accepted: false, reason: 'Secure the carried item before leaving.' });
```

- [ ] **Step 5: Run `npx vitest run tests/unit/shop-commands.test.ts` and confirm RED for missing command behavior.**
- [ ] **Step 6: Implement `createWingRun` and the five pure commands with explicit accepted/rejected results, stable IDs/events, ordered trace entries, factual provenance, finite/clamped numbers, offer conservation, and an immutable one-time summary grouped into purchased and stolen items.**
- [ ] **Step 7: Run both Task 1 test files plus `npm run typecheck`; all must pass.**
- [ ] **Step 8: Commit with `git commit -m "feat: add authoritative M3 shopping state"`.**

### Task 2: Deterministic movement, contextual actions, security sight, and wing tick

**Files:**
- Create: `src/sim/shop/security.ts`
- Create: `src/sim/shop/tickWingRun.ts`
- Create: `tests/unit/shop-security.test.ts`
- Create: `tests/integration/shop-loop.test.ts`
- Modify: `tests/helpers.ts`

**Interfaces:**
- Consumes: Task 1 commands/state, `moveCircle()`, `normalizedDirection()`, `hasLineOfSight()`, and `sweptCircleIntersectsRect()`.
- Produces: `WingInputFrame`, `tickWingRun()`, `clearWingHeldActions()`, `securityFacingAtTick()`, `isPointInSightCone()`, `canSecuritySeePlayer()`, `nearestAvailableOffer()`, and `crossedStoreExit()`.
- `WingInputFrame` is `{ moveX: number; moveY: number; interact: boolean; steal: boolean }`. `WingState.heldActions` stores the prior `interact` and `steal` levels so held keys cannot retrigger commands.

- [ ] **Step 1: Write failing deterministic security geometry tests.**

```ts
expect(securityFacingAtTick(zone, 0)).toBeCloseTo(zone.centerRadians - zone.sweepRadians);
expect(securityFacingAtTick(zone, 180)).toBeCloseTo(zone.centerRadians + zone.sweepRadians);
expect(securityFacingAtTick(zone, 360)).toBeCloseTo(zone.centerRadians - zone.sweepRadians);
expect(isPointInSightCone(zone.origin, Math.PI / 2, { x: zone.origin.x, y: zone.origin.y + 100 }, 180, 70)).toBe(true);
expect(canSecuritySeePlayer(state, store, wallOccludedPoint)).toBe(false);
```

- [ ] **Step 2: Run `npx vitest run tests/unit/shop-security.test.ts` and confirm RED because security geometry is absent.**
- [ ] **Step 3: Implement a triangular endpoint-inclusive sweep, cone inclusion, wall occlusion using existing collision geometry, and store-authored range/arc/sweep/timing with no Phaser imports.**
- [ ] **Step 4: Write failing integration tests for collision movement, distance-then-offer-ID selection, edge-triggered buy/steal/leave, boundary securing before detection, sight gain/hidden drain, Heat scaling, confiscation reset, terminal freeze, restart state, and deterministic replay.**

```ts
advanceWing(state, { moveX: 0, moveY: 0, interact: true, steal: false }, 2);
expect(state.inventory).toHaveLength(1); // the held key cannot buy twice
expect(nearestAvailableOffer(tiedState)?.id).toBe('a-offer');
expect(tickUntilConfiscated(hotState)).toBeLessThan(tickUntilConfiscated(coldState));
expect(replayWing(1997, inputs)).toEqual(replayWing(1997, inputs));
expect(JSON.stringify(terminalAfter20MoreTicks)).toBe(JSON.stringify(terminalAtExit));
```

- [ ] **Step 5: Run `npx vitest run tests/integration/shop-loop.test.ts` and confirm RED for missing authoritative tick behavior.**
- [ ] **Step 6: Implement the exact eight-stage tick order. Movement uses `210 / 60` units per tick and radius `10`; action candidates are within `42` units and sort by distance then stable offer ID. `interact` buys a nearby offer or deliberately leaves at the mall exit; `steal` begins a nearby theft.**
- [ ] **Step 7: Implement securing before detection; visible suspicion gain `0.5 * (1 + heat / 100)`, hidden drain `0.75`, confiscation at `100`, Heat changes `+15/+25`, position reset, held-action clearing, and `Seen | Hidden | Secured | Confiscated` feedback.**
- [ ] **Step 8: Run Task 2 tests, Task 1 tests, all existing unit/integration tests, and typecheck.**
- [ ] **Step 9: Commit with `git commit -m "feat: implement deterministic M3 shoplifting rules"`.**

### Task 3: Dedicated shoplifting scene, real input, renderer, HUD, and browser contract

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`
- Modify: `src/game/scenes/BootScene.ts`
- Modify: `src/debug/DebugBridge.ts`
- Modify: `src/styles.css`
- Create: `src/game/scenes/WingScene.ts`
- Create: `src/game/input/WingInputAdapter.ts`
- Create: `src/game/view/WingView.ts`
- Create: `src/game/ui/WingHud.ts`
- Create: `tests/browser/shoplifting-loop.spec.ts`

**Interfaces:**
- Consumes: Task 2 `WingState`, `WingInputFrame`, `createWingRun()`, `tickWingRun()`, and `clearWingHeldActions()`.
- Produces: app mode `shop`, visible **Shoplifting Loop** launch action, `WingScene.KEY`, one M3 canvas renderer, an accessible M3 HUD, a read-only development snapshot, **Restart loop**, and **Return to title**.
- `WingInputAdapter.readFrame()` returns held WASD/E/F levels only; `WingScene` owns the fixed-step accumulator and passes frames to simulation. Pause and blur clear adapter keys and authoritative held-action state.

- [ ] **Step 1: Write the full failing browser contract before production UI behavior.**

```ts
await page.getByRole('button', { name: 'Shoplifting Loop', exact: true }).click();
await expect(page.locator('canvas')).toHaveCount(1);
await expect(page.getByTestId('wing-hud')).toContainText('$30');
await expect(page.getByTestId('wing-hud')).toContainText('HEAT 0');
await expect(page.getByText('Homestyle', { exact: true })).toBeVisible();
await expect(page.getByText('Future Hobby', { exact: true })).toBeVisible();
expect(await page.getByTestId('wing-offer').count()).toBe(8);
```

- [ ] **Step 2: Add failing real-keyboard flows for one purchase, one theft-and-escape, one confiscation-and-continue, an accurate exit summary, ten restarts, and 800-by-600 no-overflow/readability. Preserve explicit M1 and M2 launch smoke assertions.**
- [ ] **Step 3: Run `npx playwright test tests/browser/shoplifting-loop.spec.ts` and confirm RED because the Shoplifting Loop action and dedicated scene are absent.**
- [ ] **Step 4: Add the `shop` launch path. `BootScene` starts `WingScene` only for shop mode and otherwise preserves `RunScene`; return-to-title destroys the Phaser game, removes debug state, resets DOM visibility/data attributes, and re-enables all title actions.**
- [ ] **Step 5: Implement `WingInputAdapter` for WASD, E, F, Escape, and blur. It attaches and removes every listener, clears held keys on pause/blur/shutdown, and never mutates shopping rules.**
- [ ] **Step 6: Implement `WingScene` with the existing 60 Hz / five-step backlog cap, fresh restart generation, clean accumulator reset, terminal freeze, renderer synchronization, development-only read snapshot, and complete shutdown cleanup.**
- [ ] **Step 7: Render the two storefronts, walls, exit thresholds, eight available offers/cards, the mall exit, the player, and authoritative sweeping sight cones in `WingView`; no view method computes visibility, suspicion, Heat, price, ownership, or transitions.**
- [ ] **Step 8: Render cash, secured inventory count, Heat, nearest offer/price, contextual `[E] Buy` / `[F] Steal` / `[E] Leave` controls, carried item, suspicion, recent feedback, purchased/stolen terminal groups, restart, and return actions in `WingHud`.**
- [ ] **Step 9: Run the targeted M3 browser file, `npm run typecheck`, and the full unit/integration suite.**
- [ ] **Step 10: Commit with `git commit -m "feat: add playable M3 shoplifting loop"`.**

### Task 4: Cross-mode acceptance hardening and independent actual-diff review

**Files:**
- Modify only files already introduced or changed by Tasks 1-3 when a failing acceptance check proves a defect.
- Test: `tests/browser/shoplifting-loop.spec.ts`
- Test: existing files under `tests/browser/`

**Interfaces:**
- Consumes: the complete Tasks 1-3 implementation and the approved M3 spec.
- Produces: a reviewed M3 branch with all seven required browser flows, preserved M1/M2 behavior, and no unresolved Critical or Important finding.

- [ ] **Step 1: Review the actual branch diff from `de920bc365306dc287c5481194264168dab866fc` for renderer-independent rules, offer conservation, input idempotence, update ordering, provenance, terminal freeze, cleanup, and M1/M2 regression risk.**
- [ ] **Step 2: Run `npx playwright test tests/browser/shoplifting-loop.spec.ts`; if any contract fails, preserve that meaningful failure as the red test and make only the smallest production fix needed for green.**
- [ ] **Step 3: Run `npm run test:browser`; repair only confirmed M3 or regression defects, always keeping the failing test before the production fix.**
- [ ] **Step 4: Run `npm run typecheck` and `npm test` after browser stabilization.**
- [ ] **Step 5: Commit any proven fixes with `git commit -m "fix: stabilize M3 shopping acceptance"`; create no empty commit if no fix was needed.**

### Task 5: Final verification evidence, direct inspection, and local M3 handoff

**Files:**
- Modify: `STATUS.md`
- Modify: `TEST_EVIDENCE.md`
- Modify: `NEXT_SESSION.md`
- Create: `artifacts/m3-shoplifting-loop.png`
- Create: `artifacts/m3-shoplifting-loop-800x600.png`

**Interfaces:**
- Consumes: the reviewed stable M3 implementation.
- Produces: exact branch/checkpoint, command evidence, browser observations at normal and 800-by-600 sizes, production debug exclusion, remaining uncertainty, M4 stop condition, and two direct-inspection screenshots.

- [ ] **Step 1: Run the final gate once on the stable tree: `npm run typecheck`, `npm test`, targeted `npx playwright test tests/browser/shoplifting-loop.spec.ts`, full `npm run test:browser`, and `npm run build`; record exact counts, failures, and exit codes.**
- [ ] **Step 2: Scan built production JavaScript for `__DEAD_MALL_DEBUG__`, `VITE_ENABLE_DEBUG_BRIDGE`, and every M3 development fixture name; expect no matches outside source maps, and record the exact command.**
- [ ] **Step 3: Start the production preview, inspect the real Shoplifting Loop at a normal desktop viewport and at 800-by-600, verify one canvas/HUD/scene loop, readable offers/prompts/cones/state changes, no horizontal overflow, no page/console errors, and only local-origin requests.**
- [ ] **Step 4: Save the two screenshots, then update `STATUS.md`, `TEST_EVIDENCE.md`, and `NEXT_SESSION.md` with observed evidence only, the exact local branch/checkpoint, uncertainties, and an explicit stop before M4.**
- [ ] **Step 5: Re-run `git status --short`, review the complete changed-file list, and commit the evidence with `git commit -m "docs: record M3 verification and continuation"`.**
