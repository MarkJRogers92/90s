# DEAD MALL M3 Shoplifting Loop Design

## Goal and boundary

M3 proves a fixed, deterministic mall-shopping loop in which the player walks through two stores, chooses whether to buy or steal merchandise, escapes live security pressure with stolen goods, and deliberately leaves the wing with a clear cash, inventory, provenance, and Security Heat summary.

The milestone reuses the eight M2 item definitions as merchandise. It adds no combat encounter, security combat, procedural wing generation, save system, fusion, new item behavior, audio, telemetry, backend, deployment, or production-art pass. M1 **Start shift** and M2 **Interaction Lab** remain available and behaviorally unchanged.

## Player flow

The start screen adds an explicit **Shoplifting Loop** action. It creates a fresh fixed 960-by-480 mini-wing containing two small stores and a mall exit. Each store contains four offers, so all eight M2 items are present exactly once. The player starts with $30: enough to buy only part of the catalog, making theft a meaningful alternative rather than a cosmetic choice. The player retains the M1 radius of 10 and movement speed of 210 world units per second.

The player moves with WASD. When within 42 world units of available merchandise, the game shows two contextual actions. Each action is edge-triggered once per key press:

- `[E] Buy $PRICE` purchases the item when the player has enough cash.
- `[F] Steal` removes the item from the shelf and makes it the player's temporarily carried stolen item.

Buying immediately deducts cash, removes the offer, and adds an item instance with `purchased` provenance. If cash is insufficient, the action changes no authoritative state and shows a concise reason.

Only one stolen item can be carried at a time. The player must physically cross that store's public exit boundary to secure it. A secured item enters inventory with `stolen` provenance, the shelf remains empty, and Security Heat increases. Until then, it is not owned inventory and remains vulnerable to confiscation.

The mall exit uses an intentional interaction rather than ending the run on accidental contact. Activating it ends the wing once and displays starting cash, remaining cash, purchased items, stolen items, and final Heat. Restart creates a fresh state with no carried item, suspicion, inventory, or stale input.

## Fixed wing and economy data

M3 uses immutable, validated content definitions rather than shop or item-name branches in the central update loop:

- A wing definition owns bounds, collision geometry, player spawn, mall exit, store definitions, and starting cash.
- Each store definition owns its bounds, entry/reset point, public exit boundary, security sight-zone definition, and four offer IDs.
- Each offer owns a stable offer ID, an M2 item-definition ID, position, and price.

Offer price belongs to the store offer, not to the reusable combat item definition. The authored offers are:

| Store | Item | Price |
|---|---|---:|
| Homestyle | Associate-Issue Mop | $10 |
| Homestyle | Bubble-Bath Concentrate | $14 |
| Homestyle | Extension Cord | $12 |
| Homestyle | Gel Pen Pack | $8 |
| Future Hobby | Pump-Action Soaker | $18 |
| Future Hobby | Cracked Plasma Globe | $22 |
| Future Hobby | VHS Rewinder | $24 |
| Future Hobby | Wide-Bore Nozzle | $16 |

With $30, the player can buy one premium item, combine a premium item with a cheap item, or buy as many as three inexpensive items, but cannot buy the full catalog.

Catalog validation rejects duplicate wing/store/offer IDs, unknown item-definition references, duplicate item offers, invalid prices or geometry, stores without a usable exit/reset point, sight zones outside their store, and a wing that does not offer all eight M2 items exactly once. Errors identify the offending content ID.

## Security pressure

Each store has one deterministic, visibly rendered security sight zone. The initial authored zones have range 180, a 70-degree full arc, sweep 55 degrees to either side of their inward-facing centerline, and take 180 ticks to travel from one sweep endpoint to the other. These values remain store data rather than central-rule constants. The simulation advances facing through a repeatable back-and-forth sweep; Phaser only renders the resulting cone.

Security only builds suspicion while the player is carrying an unsecured stolen item from that store and is both inside the sight cone and unobstructed by store walls. Suspicion drains while the player is out of sight. The HUD always shows the current suspicion meter while a theft is active and gives immediate `Seen`, `Hidden`, `Secured`, or `Confiscated` feedback.

Security Heat is an integer clamped from 0 to 100 and never decays during the run. Securing a theft adds 15 Heat. Being caught adds 25 Heat. Suspicion is clamped from 0 to 100; visibility adds `0.5 * (1 + Heat / 100)` suspicion per tick and being hidden removes 0.75 per tick. Current Heat therefore makes later attempts progressively harder without randomness or hidden outcomes. Heat cannot alter purchases already made or retroactively change secured inventory.

At full suspicion, the active item is confiscated, returned to its original offer, and removed from the player's carried state. Cash does not change. Heat increases, suspicion resets, held input is cleared, and the player is placed at that store's reset point. The run continues. This is the complete M3 catch consequence; no enemy, damage, chase, arrest, or run loss is introduced.

## Authoritative state and actions

Shopping rules live under `src/sim/shop` and do not expand the combat `RunState` into a multi-mode union. A separate `WingState` contains:

- seed, tick, pause, and `shopping | left` status;
- player position/facing and fixed collision geometry;
- starting and current cash;
- immutable store/offer definitions plus runtime offer availability;
- owned item instances and their provenance;
- at most one `CarriedTheft` with source store and offer IDs;
- Security Heat, current suspicion, and security sweep state;
- stable instance/event counters, recent feedback, and an ordered behavior trace;
- a one-time terminal summary.

Owned instances record a stable instance ID, item-definition ID, `purchased | stolen` acquisition kind, source store ID, source offer ID, and acquisition tick. Provenance is factual history, not an item power modifier in M3.

`createWingRun` validates and instantiates the authored wing. `tickWingRun` consumes a renderer-neutral input frame, advances movement and sight-zone state, resolves exactly one contextual action, updates suspicion and Heat, and evaluates the mall exit. Pure commands handle `buyOffer`, `beginTheft`, `secureTheft`, `confiscateTheft`, and `leaveWing`. They return explicit accepted/rejected results so the UI never infers whether a rule succeeded.

Stable update order is:

1. Reject harmful updates when paused or terminal.
2. Advance tick and clear one-frame feedback.
3. Update player facing and collision-constrained movement.
4. Advance deterministic security sweeps.
5. Resolve at most one nearby buy, steal, or mall-exit interaction using distance then stable offer ID.
6. Secure a carried theft if the player crossed its source-store exit.
7. Evaluate sight, line of sight, suspicion gain/drain, and confiscation.
8. Publish a concise recent change and trace entry.

Securing is resolved before detection on the same tick, so crossing the store boundary is a clear success rather than a frame-order coin flip. Mall exit interaction is rejected while an unsecured stolen item is being carried.

## Browser presentation

A dedicated Phaser scene and renderer adapt `WingState` without owning economy, provenance, Heat, sight, or transition rules. The fixed wing displays two recognizable storefronts, eight merchandise markers/cards, walls, store-exit thresholds, the mall exit, and readable security cones.

The M3 HUD shows cash, secured inventory count, Security Heat, the nearby offer and its price, valid interaction controls, carried-item state, and suspicion. Terminal presentation groups owned items by purchased and stolen provenance and offers **Restart loop** and **Return to title** actions.

Presentation remains authored graybox/vector work consistent with M1-M2. Sight cones, merchandise, prompts, and state changes must be readable at the supported desktop and 800-by-600 browser sizes. The production runtime makes no external requests.

## Error handling and invariants

- Cash, Heat, and suspicion are finite and clamped to their valid ranges.
- A store offer can be available, temporarily carried, or sold/secured, never more than one at once.
- Every owned instance refers to exactly one consumed offer and carries complete provenance.
- A rejected purchase or interaction is state-preserving except for visible feedback.
- Repeated input cannot buy, steal, secure, confiscate, or finish the same action twice.
- Pause and blur clear held interaction input and discard simulation backlog.
- Terminal state prevents further movement, economy, Heat, or inventory changes.
- Restart and scene shutdown remove all DOM, input, and simulation state without creating duplicate canvases or loops.

## Acceptance and testing

Tests follow red-green TDD and cover:

- wing/store/offer validation and all eight known item references;
- collision-constrained deterministic movement and stable nearby-offer selection;
- successful purchase, exact cash deduction, insufficient-cash rejection, and repeat-input idempotence;
- beginning theft, one-carried-item enforcement, successful boundary escape, and mall-exit rejection while carrying;
- deterministic sight-cone inclusion with wall occlusion, suspicion gain/drain, and Heat-based gain scaling;
- confiscation returning the correct offer, preserving cash, raising Heat, clearing input, and resetting position;
- purchased and stolen provenance records with stable IDs and acquisition metadata;
- Heat persistence across attempts, clamping, restart cleanup, and one-time terminal summary;
- same seed and input-by-tick producing identical final state and trace;
- every existing M1 and M2 unit, integration, and browser regression remaining green.

Browser tests use real keyboard input and visible UI to prove:

1. the Shoplifting Loop launches separately with one canvas, one HUD, two stores, eight offers, and no page errors;
2. a player can buy an item and see cash/provenance update;
3. a player can steal, hide from the sweeping sight zone, cross the store exit, and secure the item;
4. a player can be caught, see confiscation and increased Heat, and continue the run;
5. leaving the wing shows an accurate purchased/stolen/cash/Heat summary;
6. ten restarts retain one canvas, one HUD, one scene loop, and clean state;
7. M1 Start shift and M2 Interaction Lab remain operational.

The final gate is typecheck, complete unit/integration tests, targeted then full Chromium coverage, production build, production debug-fixture exclusion, and direct browser inspection at normal and 800-by-600 sizes. Human playtesting remains the acceptance gate for whether prices, sight timing, Heat escalation, and the buy-versus-steal decision feel fair and understandable.

## Explicitly deferred

M3 stops at the fixed mini-wing and terminal summary. It does not connect acquired items to a subsequent combat room, persist them between browser sessions, add random store inventories, introduce guard AI or combat, make provenance affect item power, implement the M4 fusion bench or Emitter Mount, add M5 seeded wings, or begin production presentation and content expansion.
