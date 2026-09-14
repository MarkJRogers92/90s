# DEAD MALL M5 MVP Run Plan

Milestone: one short seeded mall wing with stores, combat, a boss, a 24-item
roster, and a resumable checkpoint, built from the preserved M1-M4 systems.

Branch and worktree: `codex/m5-mvp` in
`/Users/markrogers/Documents/Github Code/90s/.worktrees/m5-mvp`, started from the
M4 tip `ff2dcf5`.

Ownership rule: only one writer may edit this worktree at a time. Read-only
review workers may run concurrently against the same commit.

Every task follows the same loop:

1. write a failing test and observe the intended failure;
2. implement the smallest change that passes it;
3. run the task's targeted tests plus `npm run typecheck`;
4. leave the worktree green, and only then move to the next task.

Tasks 1-6 are implementation. Task 7 is the milestone gate and documentation.

## Task 1 — Twenty-four item catalog and two new capabilities

Deliverable: `ITEM_CATALOG` grows from 12 to 24 immutable definitions, with the
frozen eight-definition and twelve-definition subsets preserved, and the two
capabilities that M5 shops consume.

Files:

- `src/sim/items/types.ts` — extend `ItemCapability` with `shop_discount` and
  `smuggle_pouch`.
- `src/sim/items/catalog.ts` — twelve new definitions reusing the seven
  existing effect kinds, plus the two new capabilities on the existing Receipt
  Wallet and Reinforced Fanny Pack definitions.
- `src/sim/items/validateCatalog.ts` — validate the new effect parameters and
  reject unknown capabilities.

Content to author, all using existing effect kinds:

1. Bottle Rocket Pack — physical two-prong projectile, damage 3, cooldown 36,
   speed 5.0, radius 3, lifetime 45.
2. Fire Extinguisher — water single projectile, damage 1, cooldown 30, speed
   2.6, radius 10, lifetime 70, Wet 240.
3. Paint Marker — physical single projectile, damage 2, cooldown 18, speed 6.0,
   radius 3, lifetime 40.
4. Foam Ball Blaster — physical three-prong projectile, damage 1, cooldown 20,
   speed 5.5, radius 3, lifetime 45, 14-degree spread.
5. Slushie Cup — water single projectile, damage 2, cooldown 26, speed 3.6,
   radius 5, lifetime 60, Wet 120.
6. Broken Broom Handle — direct primary, damage 5, cooldown 42, range 92,
   half-angle 30 degrees.
7. Box Cutter — direct primary, damage 3, cooldown 15, range 54, half-angle 25
   degrees.
8. Grease Gun — Sticky 150 ticks at 0.45 movement with a 0.4 floor.
9. Anti-Static Strap — conductive reaction with two chain starts per root, up to
   four additional targets, base range 110.
10. Car Battery — conductive range 300 with no weak discharge.
11. Needle Nozzle — projectile geometry, radius minus 1, speed multiplier 1.35.
12. Heavy-Duty Spring — projectile geometry, radius plus 3, speed multiplier
    0.75.

Also export `M4_ITEM_CATALOG` as the frozen first twelve definitions so M4 keeps
an explicit roster, and `M5_ITEM_CATALOG` (or the full `ITEM_CATALOG`) for the
run.

Tests (red first):

- `tests/unit/items.test.ts` — 24 definitions, unique IDs, stable order, the
  eight- and twelve-definition subsets unchanged, every new effect valid, and
  duplicate/unknown-kind/mismatched-source rejection.
- `tests/unit/shop-catalog.test.ts` — capability validation for the two new
  capabilities, including rejection of an unknown capability.

Acceptance: `npx vitest run tests/unit/items.test.ts tests/unit/shop-catalog.test.ts`
passes and `npm run typecheck` is clean.

## Task 2 — Seeded wing definition, templates, and generator

Deliverable: `src/sim/wing/**` generates a validated six-room wing from a seed.

Files:

- `src/sim/wing/types.ts` — authored room, storefront, offer, spawn-slot, and
  generated-wing types.
- `src/sim/wing/templates.ts` — authored room variants, store templates with six
  offers each, and spawn-slot bands.
- `src/sim/wing/rng.ts` — the seeded deterministic draw helper.
- `src/sim/wing/generateWing.ts` — `generateWing(seed)` in the documented draw
  order.
- `src/sim/wing/validateWingGraph.ts` — structural, geometric, and content
  validation.

Rules:

- fixed six-room chain: service corridor, storefront A, food court, storefront
  B, back hall, security office (boss last);
- two authored layout variants per combat room, seeded choice;
- two distinct store templates chosen from at least four authored templates,
  four of each template's six offers chosen in authored order;
- bounded seeded enemy composition from authored spawn slots;
- fixed player spawn, starting cash 30, and fixed boss room.

Tests (red first): `tests/unit/wing-generation.test.ts` covering seed
determinism, seed variation, draw-order stability, fixed room count and order,
offer prices inside authored bounds, catalogued offer definitions, spawn slots
inside geometry, reachable store exits, and rejection of a hand-corrupted wing.

Acceptance: `npx vitest run tests/unit/wing-generation.test.ts` passes and
`npm run typecheck` is clean.

## Task 3 — Run state, transitions, economy, and loadout

Deliverable: `src/sim/run/**` owns the run: room entry, transitions, shopping
against the run inventory, bench fusion reuse, loadout refresh, and terminal
summaries.

Files:

- `src/sim/run/types.ts` — `MvpRunState`, room state, run summary, commands, and
  results.
- `src/sim/run/createMvpRun.ts` — `createMvpRun(seed)` from a generated wing.
- `src/sim/run/transitions.ts` — doorway crossing, room entry, cleared-room
  gating, and boss-room sealing.
- `src/sim/run/economy.ts` — `shop_discount` and `smuggle_pouch` rules layered on
  the M3 purchase, theft, confiscation, and secure rules.
- `src/sim/run/loadout.ts` — inventory revision to compiled loadout refresh.
- `src/sim/run/tickMvpRun.ts` — deterministic stage order and combat delegation.
- `src/sim/run/summary.ts` — terminal run summary.

Rules:

- one fusion-style inventory of provenance-bearing leaves and composites;
- cash, Heat, suspicion, health, inventory, selected primary, and seed persist
  across rooms; room-local enemies, projectiles, and surfaces are rebuilt;
- combat rooms gate their exits until cleared; the boss room seals on entry;
- the bench reuse path compiles the same loadout the M4 resolver produces.

Tests (red first): `tests/integration/mvp-run.test.ts` and
`tests/unit/mvp-economy.test.ts` covering start state, deterministic room
rebuilding, transition preservation, cleared-room gating, purchase and theft
provenance, discount floor, two-item carry limit, Heat reduction, loadout
refresh on revision change, in-flight shot stability, and both terminal
outcomes.

Acceptance: the new tests pass, `npx vitest run tests/integration/run-lifecycle.test.ts`
still passes, and `npm run typecheck` is clean.

## Task 4 — Loss Prevention Manager boss

Deliverable: a new deterministic boss enemy kind with three phases.

Files:

- `src/sim/model.ts` — extend `EnemyKind` with `lp_manager` and add the optional
  boss phase fields without breaking existing fixtures.
- `src/sim/combat/boss.ts` — authored boss constants and phase behavior.
- `src/sim/combat/enemies.ts` — dispatch the new kind through the existing enemy
  stage.

Rules: health 60, radius 22, slow pursuit, telegraphed slam (reach 44, damage 2,
90-tick cooldown), a five-projectile volley every 150 ticks from 66% health, two
Hangers summoned once below 34%, slam cooldown 60 and volley cadence 120 in
phase 3, no movement through walls, and exact phase entry at the authored
thresholds.

Tests (red first): `tests/unit/boss.test.ts` covering phase thresholds,
summon-once behavior, telegraph windows, volley geometry and cadence, cooldown
changes, wall collision, and phase-1 inactivity of the volley.

Acceptance: `npx vitest run tests/unit/boss.test.ts tests/unit/combat.test.ts`
passes and `npm run typecheck` is clean.

## Task 5 — Checkpoint serialization and local storage

Deliverable: a versioned, validated checkpoint that the run writes at room
boundaries and restores deterministically.

Files:

- `src/sim/run/checkpoint.ts` — `serializeCheckpoint`, `parseCheckpoint`, and
  `restoreMvpRun` with strict validation.
- `src/game/persistence/CheckpointStore.ts` — the `CheckpointStore` interface and
  an in-memory implementation for tests.
- `src/game/persistence/LocalStorageCheckpointStore.ts` — the browser store under
  a versioned key, tolerating absent, unreadable, or invalid data.

Rules: checkpoint at each room boundary; version-tagged JSON only; no closures,
compiled behavior, projectiles, or room-local entities; invalid or
version-mismatched data is ignored with a reason and never throws into startup;
winning clears the checkpoint and dying keeps it.

Tests (red first): `tests/unit/checkpoint.test.ts` covering round-trip
equivalence with a run played to the same boundary, rejection of unknown
versions, missing fields, out-of-range values, unknown item IDs, duplicate
instances, tampered inventories, storage failure tolerance, and clear-on-win.

Acceptance: the new tests pass and `npm run typecheck` is clean.

## Task 6 — M5 presentation: Night Shift mode

Deliverable: the run is playable from the title screen with its own HUD, view,
debug fixtures, and checkpoint controls.

Files:

- `index.html` — Night Shift and Continue run actions, the M5 HUD panel, and
  checkpoint messaging.
- `src/main.ts` — mode wiring, checkpoint store creation, continue/restart
  handling, and teardown.
- `src/game/scenes/MvpRunScene.ts` — input, fixed-step ticking, room rendering,
  and scene lifecycle.
- `src/game/ui/MvpRunHud.ts` — run, store, inventory, boss, and checkpoint
  presentation.
- `src/game/view/MvpRunView.ts` — graybox room, store, boss, and projectile
  rendering.
- `src/debug/DebugBridge.ts` — development-only M5 fixtures.
- `src/styles.css` — layout for the new panel at 1440x900 and 800x600.

Rules: one canvas, one HUD, one scene loop; the seed is readable and settable in
development; fixtures stay out of production builds; Escape, blur, transitions,
restart, and shutdown clear held input.

Tests (red first): `tests/browser/night-shift.spec.ts` covering launch, seeded
offers, a purchase, a theft with Heat, cleared-room gating, the boss terminal
summary, Continue run after reload, invalid-checkpoint fallback, and ten
restarts.

Acceptance: `npx playwright test tests/browser/night-shift.spec.ts` passes, the
M1-M4 browser specs still pass, and `npm run build` succeeds.

## Task 7 — Milestone gate and documentation

Deliverable: the full acceptance gate, production inspection, and updated
project documentation.

Steps:

1. `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`.
2. Production scan: no debug bridge, debug flag, or M5 fixture names outside
   source maps.
3. Serve `dist/` and inspect 1440x900 and 800x600 with real input, checking one
   canvas, one HUD, no horizontal overflow, no page or console errors, and
   local-origin requests only.
4. Capture `artifacts/m5-mvp-run.png` and the 800x600 screenshot.
5. Update `STATUS.md`, `TEST_EVIDENCE.md`, `NEXT_SESSION.md`, `DECISIONS.md`,
   `ROADMAP.md`, `DESIGN.md`, and `README.md` with real evidence.
6. Independent actual-diff review of the milestone range by a non-implementing
   provider, read-only, before the checkpoint commit.

Acceptance: every gate passes, the review reports no unresolved Critical or
Important finding, and the milestone is committed locally on `codex/m5-mvp`.
Merge, push, publish, deploy, and release remain separate gates.
