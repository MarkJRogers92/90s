# DEAD MALL M2 Interaction Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable, deterministic eight-item interaction lab that proves Wet, Sticky, bubbles, conduction, geometry modification, and one-pass rewind compose without item-name branches in the central tick.

**Architecture:** Immutable catalog definitions compile into a stable attack specification consumed by renderer-independent simulation modules. Direct attacks, projectiles, statuses, surfaces, and bounded child events update authoritative `RunState`; Phaser renders them and an accessible lab panel selects curated loadouts.

**Tech Stack:** TypeScript 7.0.2, Phaser 4.2.1, Vite 8.3.0, Vitest 5.0.0, Playwright Test 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-13-dead-mall-m2-interaction-lab-design.md`

## Global Constraints

- Implement only M2's eight items: `janitor_mop`, `pump_soaker`, `bubble_bath`, `plasma_globe`, `vhs_rewinder`, `extension_cord`, `gel_pens`, and `wide_nozzle`.
- Do not add shops, theft, Heat, fusion, RC-car behavior, saves, procedural rooms, named-recipe unlocks, audio, or production art.
- `src/sim` remains authoritative; Phaser and DOM code render state and submit selections/input only.
- The central tick and attack resolver branch on discriminated effect kinds/capabilities, never item definition IDs.
- Effects sort by semantic stage, priority, and stable content ID; pickup order cannot affect the compiled result.
- Wet lasts 180 ticks; Sticky lasts 90 ticks; Sticky multiplier is 0.65 with a 0.5 general floor.
- Generation depth is at most 4; each root action creates at most 64 child gameplay events; replay activates once per root and cannot recursively replay.
- Existing M1 controls, pause behavior, terminal ordering, and normal **Start shift** encounter remain intact.
- Follow strict red-green TDD: each production behavior is preceded by a test that fails for the expected missing behavior.
- No push, merge, publication, or deployment.

---

### Task 1: Immutable catalog, instances, validation, and loadout compilation

**Files:**
- Create: `src/sim/items/types.ts`
- Create: `src/sim/items/catalog.ts`
- Create: `src/sim/items/validateCatalog.ts`
- Create: `src/sim/items/compileLoadout.ts`
- Create: `tests/unit/items.test.ts`

**Interfaces:**
- Produces: `ItemDefinition`, `ItemInstance`, `ItemEffectSpec`, `CompiledLoadout`, `ITEM_CATALOG`, `validateCatalog()`, and `compileLoadout()`.
- `compileLoadout(definitions, instances, selectedPrimaryInstanceId)` returns an immutable result containing `primary`, sorted `effects`, `sourceItemIds`, `compatibilityNotes`, and `trace`.

- [ ] **Step 1: Write failing catalog and compiler tests**

```ts
expect(() => validateCatalog([...ITEM_CATALOG, ITEM_CATALOG[0]!])).toThrow(/janitor_mop/);
expect(compileLoadout(ITEM_CATALOG, instancesA, 'soaker-a')).toEqual(
  compileLoadout(ITEM_CATALOG, instancesB, 'soaker-b'),
);
expect(mopWithRewinder.primary.delivery).toBe('direct');
expect(mopWithRewinder.compatibilityNotes.join(' ')).toMatch(/Rewinder.*projectile/i);
expect(allEight.effects.map((effect) => effect.sourceItemId)).toEqual([
  'pump_soaker', 'bubble_bath', 'gel_pens', 'plasma_globe', 'extension_cord',
  'vhs_rewinder', 'wide_nozzle',
]);
```

- [ ] **Step 2: Run `npx vitest run tests/unit/items.test.ts` and confirm RED because the item modules do not exist.**
- [ ] **Step 3: Implement the discriminated effect union, all eight definitions, strict validation, instance ownership, stable sorting, and immutable compiler output.**
- [ ] **Step 4: Run `npx vitest run tests/unit/items.test.ts` and `npm run typecheck`; both must pass.**
- [ ] **Step 5: Commit with `git commit -m "feat: add deterministic M2 loadout compiler"`.**

### Task 2: Statuses, attack descriptors, ancestry, and bounded event queue

**Files:**
- Modify: `src/sim/model.ts`
- Modify: `src/sim/createRun.ts`
- Modify: `src/sim/tickRun.ts`
- Modify: `src/sim/combat/attack.ts`
- Modify: `src/sim/combat/enemies.ts`
- Modify: `src/sim/combat/movement.ts`
- Create: `src/sim/effects/constants.ts`
- Create: `src/sim/effects/events.ts`
- Create: `src/sim/effects/statuses.ts`
- Create: `src/sim/effects/resolveAttack.ts`
- Create: `tests/unit/statuses.test.ts`
- Create: `tests/integration/loadout-combat.test.ts`

**Interfaces:**
- Produces: `GameplayEventMeta`, `AttackDescriptor`, `EnemyStatusState`, `SurfacePatchState`, `beginRootAction()`, `queueChildEvent()`, `applyWet()`, `applySticky()`, `tickStatuses()`, `clearTransientRoomState()`, and `resolvePrimaryAttack()`.
- `RunState` stores `inventory`, `selectedPrimaryInstanceId`, `compiledLoadout`, `surfaces`, counters, bounded diagnostics, `recentChange`, and `behaviorTrace`.

- [ ] **Step 1: Write failing tests for Wet refresh/expiry, Sticky strongest-slow/floor, room cleanup, ancestry fields, and 4-depth/64-child limits.**

```ts
applyWet(enemy, 120);
applyWet(enemy, 60);
expect(enemy.statuses.wetTicks).toBe(120);
applySticky(enemy, 90, 0.65);
applySticky(enemy, 45, 0.8);
expect(effectiveSpeedMultiplier(enemy)).toBe(0.65);
expect(() => queueChildEvent(state, { ...meta, generationDepth: 5 })).toThrow(/depth/i);
expect(state.limitDiagnostics.at(-1)).toMatch(/64 child events/i);
```

- [ ] **Step 2: Run the two focused files and confirm RED for missing state and resolver behavior.**
- [ ] **Step 3: Add the minimal authoritative state and modules, then route Mop through `resolvePrimaryAttack()` so its hit applies Wet before a reusable reaction stage. Preserve pre-movement attack acceptance and M1 lethal ordering.**
- [ ] **Step 4: Apply Sticky to Hanger movement through `effectiveSpeedMultiplier()` without changing Spitter telegraph timing.**
- [ ] **Step 5: Run focused tests, existing combat/movement/lifecycle tests, and typecheck.**
- [ ] **Step 6: Commit with `git commit -m "feat: add bounded M2 attack event pipeline"`.**

### Task 3: Soaker projectiles, bubbles, surfaces, conduction, and rewind

**Files:**
- Modify: `src/sim/model.ts`
- Modify: `src/sim/tickRun.ts`
- Modify: `src/sim/effects/constants.ts`
- Modify: `src/sim/effects/resolveAttack.ts`
- Create: `src/sim/effects/playerProjectiles.ts`
- Create: `src/sim/effects/conduction.ts`
- Create: `src/sim/effects/surfaces.ts`
- Create: `tests/unit/projectile-effects.test.ts`
- Create: `tests/integration/m2-interactions.test.ts`

**Interfaces:**
- Produces: `updatePlayerProjectiles()`, `resolveConductiveReaction()`, `updateSurfaces()`, and deterministic player projectile state containing spawn-time descriptor, outbound/return phase, sampled path, per-pass hit ledger, and `hasBurst`.
- Consumes only compiled effect kinds; no item IDs in `tickRun.ts`, `resolveAttack.ts`, or the projectile modules.

- [ ] **Step 1: Write failing authored fixture tests for the required combinations.**

```ts
expect(runMopGlobeFixture().chainedTargetDamage).toBeGreaterThan(0);
expect(runSoakerBathFixture().terminalPatchCount).toBe(1);
expect(runSoakerGlobeCordFixture().visitedIds).toEqual([10, 11, 12, 13]);
expect(runSoakerBathRewinderFixture()).toMatchObject({ returnPasses: 1, burstCount: 1 });
expect(runAllModifierFixture().limitDiagnostics).toEqual([]);
expect(runPickupPermutations()).toHaveLength(1);
```

- [ ] **Step 2: Confirm focused tests fail because player-projectile effects are absent.**
- [ ] **Step 3: Implement ordinary Soaker impact, Bubble conversion, one terminal patch, per-pass target ledgers, sampled-path rewind, wall/destructive-impact precedence, and surface Wet application.**
- [ ] **Step 4: Implement stable bounded conduction: direct damage → Wet/Sticky → one reaction; distance then ID ordering; three additional targets; Cord range 220 versus 150; Cord-alone discharge; no duplicate Globe/Cord chain.**
- [ ] **Step 5: Add an existing-primitive synthetic catalog definition in tests and prove it compiles/executes without central-loop edits.**
- [ ] **Step 6: Run the M2 focused suite, all unit/integration tests, and typecheck.**
- [ ] **Step 7: Commit with `git commit -m "feat: implement composable M2 projectile interactions"`.**

### Task 4: Playable interaction-lab UI and renderer

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `src/main.ts`
- Modify: `src/game/scenes/RunScene.ts`
- Modify: `src/game/view/EntityView.ts`
- Modify: `src/game/ui/Hud.ts`
- Modify: `src/debug/DebugBridge.ts`
- Create: `src/game/ui/InteractionLab.ts`
- Create: `tests/browser/interaction-lab.spec.ts`

**Interfaces:**
- Produces: explicit **Interaction Lab** launch action, eight accessible item cards, primary selection, curated presets, `onLoadoutChange(itemIds, selectedPrimaryId)`, recent-change text, and behavior trace.
- Debug snapshot remains read-only and exposes only authoritative lab state needed for browser assertions.

- [ ] **Step 1: Write failing Playwright tests that launch the lab through its visible button, select `Soaker + Bath + Rewinder`, fire via the real canvas, and observe one outbound/return/burst lifecycle plus visible trace text.**
- [ ] **Step 2: Add a failing responsive test at 800×600 and a real preset-switch test proving `Mop + Rewinder` displays limited applicability while keeping one canvas and one HUD.**
- [ ] **Step 3: Run `npx playwright test tests/browser/interaction-lab.spec.ts` and confirm RED because the lab action/panel is absent.**
- [ ] **Step 4: Implement the accessible lab panel and deterministic reset-on-selection flow. Keep normal Start shift unchanged.**
- [ ] **Step 5: Render player water shots, bubbles, return direction, patches, Wet/Sticky markers, and recent conductive events directly from state.**
- [ ] **Step 6: Run the targeted browser file, existing browser regression suite, typecheck, and production build.**
- [ ] **Step 7: Commit with `git commit -m "feat: add playable M2 interaction lab"`.**

### Task 5: Milestone evidence and handoff

**Files:**
- Modify: `DESIGN.md`
- Modify: `DECISIONS.md`
- Modify: `ROADMAP.md`
- Modify: `STATUS.md`
- Modify: `TEST_EVIDENCE.md`
- Modify: `NEXT_SESSION.md`
- Create: `artifacts/m2-interaction-lab.png`

**Interfaces:**
- Produces: exact run instructions, branch/checkpoint, test evidence, browser observation, uncertainty, M3 stop condition, and a real M2 screenshot.

- [ ] **Step 1: Run `npm run typecheck`, `npm test`, `npm run test:browser`, and `npm run build` once on the stable implementation; record exact counts and failures.**
- [ ] **Step 2: Scan production JavaScript for the debug global and development fixture names; expect no matches.**
- [ ] **Step 3: Inspect the production preview with Playwright, capture the interaction lab, and report canvas/HUD/panel counts plus page/console errors.**
- [ ] **Step 4: Update all six project documents with observed evidence only, and state that M3 remains unauthorized.**
- [ ] **Step 5: Commit with `git commit -m "docs: record M2 verification and continuation"`.**
