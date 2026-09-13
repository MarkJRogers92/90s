# DEAD MALL M4 Void the Warranty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate deterministic M4 mode that proves provenance-preserving Emitter Mount fusion, independent and fused RC-car behavior, and reusable Soaker/Party Popper projectile delivery while preserving M1-M3.

**Architecture:** A new renderer-independent `BenchRunState` wraps the existing combat `RunState` and owns fusion inventory, cash, room, transaction, preview, and carrier state. Pure fusion modules resolve and atomically commit Emitter Mount; the shared combat pipeline gains only generic projectile pattern and explicit-origin inputs. A dedicated Phaser scene and DOM HUD adapt the M4 state without owning gameplay rules.

**Tech Stack:** TypeScript 7.0.2, Phaser 4.2.1, Vite 8.3.0, Vitest 5.0.0, Playwright Test 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-13-dead-mall-m4-void-the-warranty-design.md`

## Global Constraints

- Work only in `/Users/markrogers/Documents/Github Code/90s/.worktrees/m4-void-the-warranty` on `codex/m4-void-the-warranty`.
- Follow `AGENTS.md`: renderer-independent gameplay belongs under `src/sim`; Phaser and the DOM collect input and present authoritative state.
- Preserve M1 Start shift, M2 Interaction Lab, and M3 Shoplifting Loop behavior and routes.
- Use red-green TDD for each production behavior; never weaken an existing assertion to accommodate M4.
- Catalog and runtime content remain local, immutable where authored, deterministic, and free of item-ID branches in central gameplay loops.
- No disk saves, procedural wing, M5 content, production art/audio, telemetry, backend, external runtime calls, push, merge, publish, deploy, or release.
- Contributor Muse tasks must explicitly set `model: "muse-spark-1.3-contributor"` and `project_policy: { contributor_opt_in: true }`; network remains disabled.
- The Codex parent inspects every actual diff and reruns each worker's claimed validation before accepting a checkpoint.
- Fusion inventory and transactions affect shared rules and provenance; require an independent actual-diff review before final acceptance.

---

## File and responsibility map

- `src/sim/items/types.ts`: generic projectile payload kind and deterministic angular pattern schema.
- `src/sim/items/catalog.ts`: full 12-definition catalog plus the preserved ordered M2/M3 subset.
- `src/sim/items/validateCatalog.ts`: validates payload kinds and bounded finite projectile patterns.
- `src/sim/items/compileLoadout.ts`: retains the current stage ordering while compiling physical and water projectile primaries.
- `src/sim/effects/playerProjectiles.ts`: builds frozen projectile behavior and spawns stable multi-projectile patterns from an explicit origin.
- `src/sim/effects/resolveAttack.ts`: accepts an optional generic projectile origin and creates one root action for a complete pattern.
- `src/sim/tickRun.ts`: forwards an optional attack context without acquiring M4-specific state.
- `src/sim/fusion/types.ts`: serializable leaves, composites, provenance, proposals, ledger, and command results.
- `src/sim/fusion/inventory.ts`: inventory-tree validation and deterministic loadout projection.
- `src/sim/fusion/emitterMount.ts`: one pure Emitter Mount compatibility and preview resolver.
- `src/sim/fusion/transaction.ts`: atomic, revision-checked, idempotent confirmation and cancel behavior.
- `src/sim/fusion/serialization.ts`: plain-data snapshot and validated reconstruction.
- `src/sim/bench/types.ts`: M4 room, carrier, input, held actions, and wrapper state.
- `src/sim/bench/scenarios.ts`: three immutable curated scenario definitions and fixed room content.
- `src/sim/bench/car.ts`: deterministic autonomous, emitter, leash, wall, bump, and recall rules.
- `src/sim/bench/createBenchRun.ts`: validates a scenario and creates a fresh M4 state.
- `src/sim/bench/commands.ts`: preview, confirm, cancel, late pickup, and fixed doorway commands.
- `src/sim/bench/tickBenchRun.ts`: stable M4 update order and delegation to the shared combat tick.
- `src/game/input/BenchInputAdapter.ts`: WASD, pointer, fire, E, R, Escape, and held-input cleanup.
- `src/game/view/BenchView.ts`: Phaser graphics for rooms, kiosk, doorway, car, leash cue, enemies, projectiles, and surfaces.
- `src/game/ui/BenchHud.ts`: accessible scenario, preview, confirmation, inventory, provenance, cash, and trace UI.
- `src/game/scenes/BenchScene.ts`: fixed-step M4 scene lifecycle and fresh restart/scenario changes.
- `src/main.ts`, `src/game/scenes/BootScene.ts`, `index.html`, `src/styles.css`: separate title route and M4 presentation shell.
- `src/debug/DebugBridge.ts`: read-only development snapshot support for the new mode only when explicitly enabled.

---

### Task 1: Expand the immutable roster while freezing M2/M3 at eight items

**Files:**
- Modify: `src/sim/items/types.ts`
- Modify: `src/sim/items/catalog.ts`
- Modify: `src/sim/items/validateCatalog.ts`
- Modify: `src/game/ui/InteractionLab.ts`
- Modify: `src/sim/shop/createWingRun.ts`
- Modify: `src/sim/shop/catalog.ts`
- Test: `tests/unit/items.test.ts`
- Test: `tests/unit/shop-catalog.test.ts`
- Test: `tests/browser/interaction-lab.spec.ts`

**Interfaces:**
- Consumes: existing `ItemDefinition`, `ProjectilePayloadEffect`, `ITEM_CATALOG`, `compileLoadout`, and M3 `validateWing` behavior.
- Produces: `ProjectilePayloadKind = 'water' | 'physical'`; `ItemCapability = 'emitter_carrier'`; `ProjectilePayloadEffect.payloadKind`; `ProjectilePayloadEffect.angularOffsetsRadians`; nullable `onHit`; `ItemDefinition.capabilities`; `M2_M3_ITEM_CATALOG`; a 12-entry `ITEM_CATALOG`.

- [ ] **Step 1: Write the failing catalog and isolation tests**

```ts
expect(ITEM_CATALOG.map((item) => item.id)).toEqual([
  'janitor_mop', 'pump_soaker', 'bubble_bath', 'plasma_globe',
  'vhs_rewinder', 'extension_cord', 'gel_pens', 'wide_nozzle',
  'receipt_wallet', 'fanny_pack', 'rc_car', 'party_popper',
]);
expect(M2_M3_ITEM_CATALOG).toHaveLength(8);
expect(M2_M3_ITEM_CATALOG.map((item) => item.id)).toEqual(
  ITEM_CATALOG.slice(0, 8).map((item) => item.id),
);
expect(() => validateWing(M3_WING, M2_M3_ITEM_CATALOG)).not.toThrow();
```

Add validator cases that reject an empty pattern, more than 16 offsets, non-finite offsets, a physical payload with a Wet `onHit`, invalid Wet duration, unknown item capabilities, and duplicate item capabilities. Add an Interaction Lab browser assertion that exactly eight item cards remain visible and no M4 IDs appear.

- [ ] **Step 2: Run the focused tests and observe the intended failures**

Run: `npx vitest run tests/unit/items.test.ts tests/unit/shop-catalog.test.ts`

Expected: FAIL because `M2_M3_ITEM_CATALOG`, payload kind, pattern fields, and the four M4 definitions do not exist.

- [ ] **Step 3: Add the generic payload schema and 12-definition catalog**

```ts
export type ProjectilePayloadKind = 'water' | 'physical';
export type ItemCapability = 'emitter_carrier';

export type ProjectilePayloadEffect = EffectBase & {
  readonly kind: 'projectile_payload';
  readonly stage: 'projectile';
  readonly payloadKind: ProjectilePayloadKind;
  readonly angularOffsetsRadians: readonly number[];
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly lifetimeTicks: number;
  readonly onHit: WetStatusApplication | null;
};

export type ItemDefinition = {
  readonly id: ItemId;
  readonly name: string;
  readonly summary: string;
  readonly capabilities?: readonly ItemCapability[];
  readonly base?: ItemBaseAttack;
  readonly effects: readonly ItemEffectSpec[];
};
```

Give the Soaker `payloadKind: 'water'` and `[0]`. Add Receipt Wallet and Reinforced Fanny Pack with no combat effects. Add RC Car with `capabilities: ['emitter_carrier']` and no combat effect. Add Party Popper as a projectile primary with `payloadKind: 'physical'`, offsets `[-8, 0, 8]` converted to radians, damage 2, cooldown 30, speed 4.2, radius 4, lifetime 55, and `onHit: null`. Export a deeply frozen eight-item `M2_M3_ITEM_CATALOG` and pass it explicitly to M2 UI and M3 construction/validation.

- [ ] **Step 4: Validate the new schema without changing completed modes**

Run: `npx vitest run tests/unit/items.test.ts tests/unit/shop-catalog.test.ts`

Expected: PASS, including 12 full definitions, eight M2/M3 definitions, and the new invalid-pattern cases.

Run: `npx playwright test tests/browser/interaction-lab.spec.ts`

Expected: PASS with exactly the original eight lab cards.

- [ ] **Step 5: Commit the catalog checkpoint**

```bash
git add src/sim/items/types.ts src/sim/items/catalog.ts src/sim/items/validateCatalog.ts src/game/ui/InteractionLab.ts src/sim/shop/createWingRun.ts src/sim/shop/catalog.ts tests/unit/items.test.ts tests/unit/shop-catalog.test.ts tests/browser/interaction-lab.spec.ts
git commit -m "feat: add isolated M4 item roster"
```

---

### Task 2: Generalize projectile patterns and firing origin

**Files:**
- Modify: `src/sim/model.ts`
- Modify: `src/sim/effects/playerProjectiles.ts`
- Modify: `src/sim/effects/resolveAttack.ts`
- Modify: `src/sim/tickRun.ts`
- Modify: `tests/unit/projectile-effects.test.ts`
- Modify: `tests/integration/loadout-combat.test.ts`

**Interfaces:**
- Consumes: Task 1's `payloadKind`, `angularOffsetsRadians`, nullable `onHit`, Party Popper definition, and current effect ancestry limits.
- Produces: `PrimaryAttackContext`; `PlayerProjectileSpec.payloadKind`; `PlayerProjectileSpec.angularOffsetsRadians`; `spawnPlayerProjectiles(state, request): PlayerProjectileState[]`; optional `attackContext` on `resolvePrimaryAttack` and `tickRun`.

- [ ] **Step 1: Write failing tests for explicit origin and stable spread**

```ts
const run = createRun(1997, {
  itemIds: ['party_popper'],
  selectedItemId: 'party_popper',
});
const context = { projectileOrigin: { x: 420, y: 210 } };
tickRun(run, { moveX: 0, moveY: 0, aimX: 620, aimY: 210, fire: true }, context);
expect(run.projectiles).toHaveLength(3);
expect(run.projectiles.map(({ x, y }) => ({ x, y }))).toEqual([
  { x: 420, y: 210 }, { x: 420, y: 210 }, { x: 420, y: 210 },
]);
expect(run.counters.rootActions).toBe(1);
expect(run.projectiles.map((shot) => shot.ancestry?.rootActionId)).toEqual([1, 1, 1]);
```

Also assert that ordinary Soaker still creates one projectile at the player position, Party Popper pellets have stable `-8/0/+8` degree headings, physical pellets do not apply Wet, and Gel Pens/Wide-Bore/Rewinder still alter their eligible behavior.

- [ ] **Step 2: Run focused projectile tests and observe failure**

Run: `npx vitest run tests/unit/projectile-effects.test.ts tests/integration/loadout-combat.test.ts`

Expected: FAIL because the shared pipeline accepts neither an explicit origin nor a projectile pattern.

- [ ] **Step 3: Thread a generic attack context through the shared tick**

```ts
export type PrimaryAttackContext = {
  readonly projectileOrigin?: Vec2;
};
```

Change `tickRun` to the exact signature `tickRun(state: RunState, input: InputFrame, attackContext: PrimaryAttackContext = {}): void` and pass `attackContext` to `resolvePrimaryAttack` at the existing attack stage. Rename the one-shot spawner to `spawnPlayerProjectiles`. Build one frozen spec, rotate the origin-to-pointer unit vector by every stable offset, and append projectiles in authored offset order. All pellets share one root action but receive distinct entity IDs. Use zero Wet ticks for `onHit: null`; keep water-only conversion checks explicit by payload kind rather than definition ID.

The spawn request contains `origin: Vec2`, `aimX`, `aimY`, and the shared root event. `resolvePrimaryAttack` supplies `attackContext.projectileOrigin ?? state.player` only for projectile delivery; direct attacks continue using the player position and existing cone logic.

- [ ] **Step 4: Run projectile and existing combat tests**

Run: `npx vitest run tests/unit/projectile-effects.test.ts tests/integration/loadout-combat.test.ts tests/unit/combat.test.ts tests/integration/run-lifecycle.test.ts`

Expected: PASS with one ordinary Soaker projectile, three Party Popper pellets, one root per trigger, and unchanged M1 behavior.

- [ ] **Step 5: Commit the generic combat checkpoint**

```bash
git add src/sim/model.ts src/sim/effects/playerProjectiles.ts src/sim/effects/resolveAttack.ts src/sim/tickRun.ts tests/unit/projectile-effects.test.ts tests/integration/loadout-combat.test.ts
git commit -m "feat: support projectile origins and patterns"
```

---

### Task 3: Implement pure Emitter Mount preview, transaction, and reconstruction

**Files:**
- Create: `src/sim/fusion/types.ts`
- Create: `src/sim/fusion/inventory.ts`
- Create: `src/sim/fusion/emitterMount.ts`
- Create: `src/sim/fusion/transaction.ts`
- Create: `src/sim/fusion/serialization.ts`
- Create: `tests/unit/fusion-resolver.test.ts`
- Create: `tests/unit/fusion-transaction.test.ts`
- Create: `tests/unit/fusion-serialization.test.ts`

**Interfaces:**
- Consumes: full `ITEM_CATALOG`, existing `compileLoadout`, stable `ItemInstance` projection, and Task 1 projectile capabilities.
- Produces: `FusionInventoryState`; `InventoryLeaf`; `EmitterMountComposite`; `EmitterMountProposal`; `resolveEmitterMount`; `commitEmitterMount`; `cancelFusionPreview`; `projectFusionInventory`; `serializeFusionState`; `restoreFusionState`.

- [ ] **Step 1: Write resolver tests for one recipe and two supported primaries**

```ts
function leaf(
  instanceId: string,
  itemDefinitionId: string,
  acquisitionKind: 'purchased' | 'stolen',
): InventoryLeaf {
  return {
    kind: 'leaf', instanceId, itemDefinitionId, acquisitionKind,
    sourceLocationId: 'm4-fixture', sourceStockId: `${instanceId}-stock`, acquisitionTick: 0,
  };
}

const clean: FusionInventoryState = {
  inventory: [
    leaf('clean-soaker-primary', 'pump_soaker', 'purchased'),
    leaf('clean-soaker-car', 'rc_car', 'purchased'),
  ],
  cash: 10,
  revision: 0,
  selectedPrimaryInstanceId: 'clean-soaker-primary',
  serviceAvailable: true,
  nextCompositeId: 1,
  committedTransactions: [],
};
const soaker = resolveEmitterMount(clean, 'clean-soaker-primary', 'clean-soaker-car');
expect(soaker.accepted && soaker.proposal.recipeId).toBe('emitter_mount');
expect(soaker.accepted && soaker.proposal.fee).toBe(4);

const stolen: FusionInventoryState = {
  inventory: [
    leaf('stolen-popper-primary', 'party_popper', 'stolen'),
    leaf('stolen-popper-car', 'rc_car', 'stolen'),
  ],
  cash: 10,
  revision: 0,
  selectedPrimaryInstanceId: 'stolen-popper-primary',
  serviceAvailable: true,
  nextCompositeId: 1,
  committedTransactions: [],
};
const popper = resolveEmitterMount(stolen, 'stolen-popper-primary', 'stolen-popper-car');
expect(popper.accepted && popper.proposal.fee).toBe(6);
expect(popper.accepted && popper.proposal.operation.attackOrigin).toBe('carrier');
```

Assert that Mop, two primaries, two cars, a composite input, unavailable service, and insufficient cash return exact visible reasons without mutation.

- [ ] **Step 2: Write transaction and serialization failure tests**

Snapshot the entire state before cancel, stale revision, duplicate transaction ID, missing component, insufficient cash, and rapid repeated confirmation. Assert byte-equivalent serialized state after every rejection. Assert one valid confirmation deducts exactly one fee, consumes two leaves, creates one composite with both original provenance records, increments revision once, selects the composite, and records one ledger entry.

Serialize a confirmed state, restore it against `ITEM_CATALOG`, and assert equal component tree, provenance, cash, revision, ledger, selected primary, and compiled loadout.

- [ ] **Step 3: Run fusion tests and observe missing-module failures**

Run: `npx vitest run tests/unit/fusion-resolver.test.ts tests/unit/fusion-transaction.test.ts tests/unit/fusion-serialization.test.ts`

Expected: FAIL because the fusion domain does not exist.

- [ ] **Step 4: Implement the serializable domain and shared resolver**

```ts
export type InventoryLeaf = {
  readonly kind: 'leaf';
  readonly instanceId: string;
  readonly itemDefinitionId: string;
  readonly acquisitionKind: 'purchased' | 'stolen';
  readonly sourceLocationId: string;
  readonly sourceStockId: string;
  readonly acquisitionTick: number;
};

export type EmitterMountComposite = {
  readonly kind: 'composite';
  readonly instanceId: string;
  readonly recipeId: 'emitter_mount';
  readonly createdTick: number;
  readonly transactionId: string;
  readonly primary: InventoryLeaf;
  readonly carrier: InventoryLeaf;
};

export type FusionInventoryNode = InventoryLeaf | EmitterMountComposite;

export type FusionTransactionRecord = {
  readonly transactionId: string;
  readonly recipeId: 'emitter_mount';
  readonly primaryInstanceId: string;
  readonly carrierInstanceId: string;
  readonly compositeInstanceId: string;
  readonly fee: number;
  readonly committedRevision: number;
};

export type FusionInventoryState = {
  inventory: FusionInventoryNode[];
  cash: number;
  revision: number;
  selectedPrimaryInstanceId: string;
  serviceAvailable: boolean;
  nextCompositeId: number;
  committedTransactions: FusionTransactionRecord[];
};
```

`resolveEmitterMount` must derive compatibility from definition capabilities, not item-name conditionals: one owned leaf with projectile delivery plus one owned carrier-capability leaf. The proposal carries exact input IDs, source revision, fee components, retained IDs, excluded independent-car behavior, operation text, composite preview, selected result, and irreversibility text.

`commitEmitterMount` must recompute the proposal from current state, build and validate a complete next value, then assign the next inventory/cash/revision/ledger/selection together. `projectFusionInventory` represents a composite primary as `{ instanceId: composite.instanceId, itemId: composite.primary.itemDefinitionId }`, includes standalone modifiers, returns the composite ID as the selected runtime primary, and excludes the integrated carrier as an independent effect.

- [ ] **Step 5: Run fusion tests and the catalog compiler tests**

Run: `npx vitest run tests/unit/fusion-resolver.test.ts tests/unit/fusion-transaction.test.ts tests/unit/fusion-serialization.test.ts tests/unit/items.test.ts`

Expected: PASS with exact preview/commit parity, atomic rejection, preserved stolen flags, and equivalent reconstructed compilation.

- [ ] **Step 6: Commit the fusion-domain checkpoint**

```bash
git add src/sim/fusion tests/unit/fusion-resolver.test.ts tests/unit/fusion-transaction.test.ts tests/unit/fusion-serialization.test.ts
git commit -m "feat: add atomic emitter mount fusion"
```

---

### Task 4: Add deterministic BenchRunState, RC car, and fixed room transfer

**Files:**
- Create: `src/sim/bench/types.ts`
- Create: `src/sim/bench/scenarios.ts`
- Create: `src/sim/bench/car.ts`
- Create: `src/sim/bench/createBenchRun.ts`
- Create: `src/sim/bench/commands.ts`
- Create: `src/sim/bench/tickBenchRun.ts`
- Create: `tests/unit/bench-car.test.ts`
- Create: `tests/integration/bench-loop.test.ts`
- Modify: `tests/helpers.ts`

**Interfaces:**
- Consumes: Task 2 `tickRun(state, input, attackContext)`; Task 3 fusion commands and projection; current collision, enemy, and run creation helpers.
- Produces: `BenchScenarioId`; `BenchRoomId`; `BenchInputFrame`; `CarrierState`; `BenchRunState`; `createBenchRun`; `tickBenchRun`; `openFusionPreview`; `confirmFusion`; `cancelFusion`; `acquireLateModifier`; `transferBenchRoom`.

- [ ] **Step 1: Write failing deterministic car tests**

```ts
const state = createBenchRun('clean-soaker');
const first = structuredClone(state);
const second = structuredClone(state);
const scriptedBenchInputs: BenchInputFrame[] = Array.from({ length: 60 }, () => ({
  moveX: 0,
  moveY: 0,
  aimX: 760,
  aimY: 240,
  fire: false,
  interact: false,
  recall: false,
}));
for (const input of scriptedBenchInputs) {
  tickBenchRun(first, input);
  tickBenchRun(second, input);
}
expect(second).toEqual(first);
```

Add focused assertions for nearest-enemy distance/ID ordering, radius 9, speed 4, seek range 220, leash 180, one bump damage, 45-tick cooldown, idle return, rectangular-wall collision, emitter pointer steering, R edge recall until 24 units, and mutually exclusive independent/emitter behavior.

- [ ] **Step 2: Write failing full-loop integration tests**

Cover all three scenarios, E-range preview, exact clean/stolen fees, cancel, confirm, late Gel Pen acquisition, inventory revision, compile refresh, fixed doorway transfer, inactive-room freeze, restart cleanup, and firing from the car position after fusion while WASD still moves only the player.

- [ ] **Step 3: Run the bench tests and observe missing-module failures**

Run: `npx vitest run tests/unit/bench-car.test.ts tests/integration/bench-loop.test.ts`

Expected: FAIL because the M4 wrapper, scenarios, commands, and car simulation do not exist.

- [ ] **Step 4: Implement immutable scenarios and fresh state creation**

```ts
export type BenchScenarioId = 'clean-soaker' | 'stolen-popper' | 'unsupported-mop';
export type BenchRoomId = 'service' | 'test_bay';

export type BenchInputFrame = InputFrame & {
  readonly interact: boolean;
  readonly recall: boolean;
};

export type BenchRunState = {
  readonly seed: number;
  tick: number;
  paused: boolean;
  activeRoom: BenchRoomId;
  scenarioId: BenchScenarioId;
  fusion: FusionInventoryState;
  combat: RunState;
  carrier: CarrierState;
  preview: EmitterMountProposal | null;
  heldActions: { interact: boolean; recall: boolean };
  recentChange: string;
  behaviorTrace: string[];
};
```

Create the exact approved inventories, $10 cash, Bench Warrant interaction bounds, service/test-bay walls, doorway bounds, destination anchors, and deterministic enemy fixtures. Place every scenario's initial player spawn inside Bench Warrant interaction range so the first edge-triggered E press can open preview. Validate scenario IDs, ingredient IDs, geometry, and spawn positions before returning state.

- [ ] **Step 5: Implement the stable M4 tick and car rules**

Use this order: reject paused/preview-open updates; tick wrapper counters/cooldowns; resolve doorway transfer; update independent or emitter carrier from current player and pointer positions; resolve one edge-triggered E/R action; call shared `tickRun` with car origin only for a confirmed emitter; synchronize terminal/recent trace state; save held levels. Player facing remains owned by `tickRun` and is not updated twice.

Use stable distance then enemy ID targeting. Clamp proposed carrier movement to room bounds and leash, apply axis-separated wall collision, and use deterministic axis fallback when a direct step is blocked. At doorway transfer, clear projectiles and hazards, rebuild the destination encounter state, and place the carrier at its validated destination anchor in its current mode.

- [ ] **Step 6: Run bench and adjacent shared-engine tests**

Run: `npx vitest run tests/unit/bench-car.test.ts tests/integration/bench-loop.test.ts tests/unit/combat.test.ts tests/unit/projectile-effects.test.ts tests/integration/loadout-combat.test.ts`

Expected: PASS with deterministic car behavior, exact transaction integration, coherent doorway transfer, and unchanged shared combat behavior.

- [ ] **Step 7: Commit the M4 simulation checkpoint**

```bash
git add src/sim/bench tests/helpers.ts tests/unit/bench-car.test.ts tests/integration/bench-loop.test.ts
git commit -m "feat: add deterministic M4 bench runtime"
```

---

### Task 5: Build the separate M4 scene, HUD, controls, and browser proof

**Files:**
- Create: `src/game/input/BenchInputAdapter.ts`
- Create: `src/game/view/BenchView.ts`
- Create: `src/game/ui/BenchHud.ts`
- Create: `src/game/scenes/BenchScene.ts`
- Modify: `src/main.ts`
- Modify: `src/game/scenes/BootScene.ts`
- Modify: `src/debug/DebugBridge.ts`
- Modify: `index.html`
- Modify: `src/styles.css`
- Create: `tests/browser/void-the-warranty.spec.ts`
- Modify: `tests/browser/startup.spec.ts`
- Modify: `tests/browser/combat.spec.ts`
- Modify: `tests/browser/interaction-lab.spec.ts`
- Modify: `tests/browser/shoplifting-loop.spec.ts`

**Interfaces:**
- Consumes: Task 4 `BenchRunState`, commands, `tickBenchRun`, and existing fixed-step/scene cleanup patterns.
- Produces: title action `#void-warranty-launch`; DOM shell `#bench-hud`; `BenchScene.KEY`; one read-only M4 debug snapshot under the existing development-only bridge contract.

- [ ] **Step 1: Write the failing launch and clean-preview browser tests**

```ts
await page.getByRole('button', { name: 'Void the Warranty' }).click();
await expect(page.locator('canvas')).toHaveCount(1);
await expect(page.locator('#bench-hud')).toBeVisible();
await expect(page.getByText('BENCH WARRANT')).toBeVisible();
await page.keyboard.press('e');
await expect(page.getByText('Emitter Mount preview')).toBeVisible();
await expect(page.getByText('$4')).toBeVisible();
```

Use real key presses and pointer coordinates. Assert no page errors, one canvas/HUD, $4 clean preview, $6 stolen preview, unsupported Mop reason, cancel state preservation, one confirmation charge, late modifier display, R recall, visible projectile origin at the car, doorway transfer, ten restart cleanup, and return to title.

- [ ] **Step 2: Run the targeted browser test and observe launch failure**

Run: `npx playwright test tests/browser/void-the-warranty.spec.ts`

Expected: FAIL because the title action and M4 scene do not exist.

- [ ] **Step 3: Add the M4 HTML shell and route**

```ts
type RunMode = 'shift' | 'lab' | 'shop' | 'bench';

if (document.body.dataset.mode === 'bench') {
  this.scene.start(BenchScene.KEY);
  return;
}
```

Add a separate title button and hidden `#bench-hud` section. `main.ts` must disable all four launch buttons during a run and restore them on return to title or startup failure. Existing M1-M3 HUD visibility remains mode-specific.

- [ ] **Step 4: Implement scene, input, view, and accessible HUD adapters**

Mirror the existing fixed 60 Hz accumulator and five-step cap. `BenchInputAdapter` edge-tracks E and R, clears held fire/interaction/recall on pause, preview, blur, transition, restart, and destroy, and never writes gameplay state directly. `BenchHud` renders state and invokes supplied command callbacks; disabled confirmation includes the authoritative rejection reason. `BenchView` draws only the current room's state and gives the carrier, tether/leash, kiosk, doorway, projectile origin, walls, and interaction range distinct readable shapes.

- [ ] **Step 5: Add responsive styling and development-only inspection**

At 1440 by 900, keep canvas and M4 information visible together without horizontal overflow. At 800 by 600, preserve exact viewport width and allow the information panel to scroll vertically to every scenario and transaction control. Extend the debug mode union and snapshot serializer without exposing mutation methods; production behavior remains gated by both Vite development mode and `VITE_ENABLE_DEBUG_BRIDGE=true`.

- [ ] **Step 6: Run targeted and prior-mode browser coverage**

Run: `npx playwright test tests/browser/void-the-warranty.spec.ts`

Expected: PASS for the complete M4 browser flow.

Run: `npx playwright test tests/browser/startup.spec.ts tests/browser/combat.spec.ts tests/browser/interaction-lab.spec.ts tests/browser/shoplifting-loop.spec.ts`

Expected: PASS with unchanged M1-M3 launch, controls, restart, and state assertions.

- [ ] **Step 7: Commit the playable M4 checkpoint**

```bash
git add src/game/input/BenchInputAdapter.ts src/game/view/BenchView.ts src/game/ui/BenchHud.ts src/game/scenes/BenchScene.ts src/main.ts src/game/scenes/BootScene.ts src/debug/DebugBridge.ts index.html src/styles.css tests/browser/void-the-warranty.spec.ts tests/browser/startup.spec.ts tests/browser/combat.spec.ts tests/browser/interaction-lab.spec.ts tests/browser/shoplifting-loop.spec.ts
git commit -m "feat: add playable void the warranty mode"
```

---

### Task 6: Final regression, production inspection, and M4 handoff

**Files:**
- Modify: `ROADMAP.md`
- Modify: `DESIGN.md`
- Modify: `DECISIONS.md`
- Modify: `README.md`
- Modify: `STATUS.md`
- Modify: `TEST_EVIDENCE.md`
- Modify: `NEXT_SESSION.md`
- Create: `artifacts/m4-void-the-warranty.png`
- Create: `artifacts/m4-void-the-warranty-800x600.png`

**Interfaces:**
- Consumes: completed Tasks 1-5 and their actual validation evidence.
- Produces: a clean local M4 checkpoint, reproducible evidence, screenshots, known uncertainty, and an explicit stop before M5.

- [ ] **Step 1: Run static and complete simulation validation**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm test`

Expected: all unit/integration test files pass with zero failures; record the exact file and test counts in `TEST_EVIDENCE.md`.

- [ ] **Step 2: Run targeted then full browser validation**

Run: `npx playwright test tests/browser/void-the-warranty.spec.ts`

Expected: all targeted M4 Chromium tests pass.

Run: `npm run test:browser`

Expected: all M1-M4 Chromium tests pass with zero page errors.

- [ ] **Step 3: Build and inspect the production artifact**

Run: `npm run build`

Expected: exit 0 and a production `dist/` generated from the M4 source.

Scan non-source-map production JavaScript for `__DEAD_MALL_DEBUG__`, `VITE_ENABLE_DEBUG_BRIDGE`, and every M4 fixture name. Expected: no matches. Start `npm run preview -- --host 127.0.0.1`, inspect the real production build at 1440 by 900 and 800 by 600, and record canvas/HUD counts, viewport overflow, preview controls, local-only requests, page errors, console errors, and screenshots.

- [ ] **Step 4: Perform independent actual-diff review**

Give a read-only reviewer the exact range `10765d10fb4703ae8fe7bae34da24b8f173dfffa..HEAD`, the approved M4 spec, and the shared-rule/provenance risk areas. Require Critical/Important findings with file and line evidence. Fix confirmed findings with focused regression tests, rerun their targeted checks, and request one post-fix review of the resulting actual diff.

- [ ] **Step 5: Update authoritative handoff documents with real evidence**

Record the exact branch, HEAD, commands, counts, production inspection, screenshots, known balance/browser/device limitations, contributor work, review result, and the M5 authorization boundary. Update obsolete roadmap/readme statements that still say M3 or earlier is the current limit. Do not claim disk durability, production art, audio, or M5 behavior.

- [ ] **Step 6: Run the final documentation and cleanliness check**

Run: `git diff --check`

Expected: exit 0.

Run: `git status --short`

Expected: only the intended documentation and screenshot paths for this checkpoint before staging.

- [ ] **Step 7: Commit the verified M4 handoff**

```bash
git add ROADMAP.md DESIGN.md DECISIONS.md README.md STATUS.md TEST_EVIDENCE.md NEXT_SESSION.md artifacts/m4-void-the-warranty.png artifacts/m4-void-the-warranty-800x600.png
git commit -m "docs: record M4 verification and continuation"
```

Run: `git status --short`

Expected: no output. Stop before M5. Do not push, merge, publish, deploy, or release.
