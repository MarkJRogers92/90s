# DEAD MALL M4 Void the Warranty Design

## Goal and boundary

M4 proves deliberate, persistent-in-run fusion through one reusable **Emitter Mount** rule. A player can use the Remote-Control Car as independent automatic support or permanently combine it with either the Pump-Action Soaker or Party Popper Multipack, changing the primary weapon's firing origin and controls without losing compatible item behavior.

M4 is a separate deterministic launch mode alongside the preserved M1 **Start shift**, M2 **Interaction Lab**, and M3 **Shoplifting Loop** modes. It restores the intended 12-definition roster and uses curated clean and stolen inventories rather than repeating the M3 shopping loop. It does not connect M3 shopping to combat, generate a run, save to disk, add broader fusion families, introduce production art or audio, or begin M5.

## Player flow

The title screen adds a **Void the Warranty** action. It launches one fixed two-room proof containing the Bench Warrant service room and a combat test bay connected by one authored doorway.

The player selects one of three deterministic scenarios:

- **Clean Soaker:** clean Pump-Action Soaker and Remote-Control Car ingredients with Bubble-Bath Concentrate, Cracked Plasma Globe, VHS Rewinder, and Wide-Bore Nozzle already owned. Gel Pen Pack is available as a late clean pickup after fusion. Starting cash is $10 and the all-clean fusion fee is $4.
- **Stolen Popper:** stolen Party Popper Multipack and Remote-Control Car ingredients with VHS Rewinder and Wide-Bore Nozzle already owned. Gel Pen Pack is available as a late clean pickup after fusion. Starting cash is $10 and the fusion fee is the full $6 because at least one ingredient is stolen.
- **Unsupported Mop:** a clean Associate-Issue Mop and Remote-Control Car. Preview explains that Emitter Mount requires a supported projectile primary, and confirmation remains unavailable.

Scenario selection and restart create a completely fresh M4 state. The player walks to the Bench Warrant kiosk and presses E to open a preview. Preview pauses gameplay and displays the exact input instances, their provenance, the fee, resulting attack origin and controls, retained modifiers, removed independent-car behavior, irreversibility, and any incompatibility reason. Cancel closes the preview without changing state. Confirm revalidates and commits the transaction once.

The fixed doorway moves the player between the service room and test bay without creating a procedural graph. The carrier crosses or transfers coherently with the player and cannot remain active in the inactive room. Restart, scenario change, return to title, and scene shutdown remove all M4 input, DOM, carrier, preview, and simulation state.

## Architecture

The renderer-independent TypeScript simulation remains authoritative. Phaser owns input cadence, drawing, scene lifecycle, and pointer-to-world conversion; the DOM renders state and submits scenario, preview, confirm, cancel, and late-pickup commands.

M4 uses a wrapper rather than adding bench-specific fields to every combat run:

- `BenchRunState` owns the active room, curated inventory tree, cash, inventory revision, preview, transaction ledger, RC-car state, held interaction levels, recent feedback, and behavior trace.
- The wrapper contains the existing combat `RunState` used for player movement, enemies, projectiles, statuses, surfaces, effect ancestry, and terminal combat rules.
- `tickBenchRun` applies deterministic carrier and room-transition stages and delegates the ordinary combat stages through the existing simulation.
- A small generic extension lets a primary attack receive an explicit muzzle origin and deterministic projectile-pattern offsets. Ordinary M1-M3 attacks continue using the player position and a single zero-offset shot.

No central gameplay rule branches on `pump_soaker`, `party_popper`, or `rc_car`. Authored definitions declare payload and pattern capabilities, while the fusion resolver declares that the selected primary fires from its carrier.

## Twelve-item catalog without M1-M3 expansion

The immutable item catalog expands from eight to 12 definitions by adding:

- **Receipt Wallet:** cataloged retail passive with its lawful-purchase summary; its shopping behavior remains deferred because M3 intentionally shipped without it and M4 has no shopping transaction.
- **Reinforced Fanny Pack:** cataloged utility passive with its cash-pickup summary; its pickup behavior remains deferred because M4 has no cash drops.
- **Remote-Control Car:** support and Emitter Mount carrier definition.
- **Party Popper Multipack:** projectile primary definition with a three-pellet physical spread.

The catalog exports the original ordered eight-definition subset for M2 and M3. Interaction Lab controls and M3 wing validation continue using that subset, so adding M4 definitions cannot silently add cards, offers, or validation requirements to completed modes. The full 12-definition catalog is available to M4 and generic loadout compilation.

Catalog validation continues to reject duplicate definition IDs, unknown effect kinds, invalid stages, mismatched source IDs, unsupported references, and non-finite or out-of-range numeric values. Projectile-pattern validation additionally requires a non-empty frozen list of finite angular offsets and a bounded pellet count.

## Projectile payload and pattern generalization

Projectile payload data distinguishes `water` and `physical` payloads. Water payloads can apply Wet and can be converted by Bubble-Bath Concentrate. Physical payloads do not invent Wet and cannot undergo water-only conversion or conductivity without another supported Wet source.

A compiled projectile pattern contains stable angular offsets relative to the pointer aim. The Soaker uses `[0]`. Party Popper uses three offsets spanning 16 degrees: `[-8 degrees, 0, +8 degrees]`. One accepted root action creates all pellets in stable offset order, and every pellet shares that root's ancestry and bounded effect ledger.

Party Popper starts with these authored M4 playtest values:

- 2 damage per pellet;
- 30-tick primary cooldown;
- speed 4.2 world units per tick;
- radius 4 world units;
- lifetime 55 ticks.

Gel Pen Pack, Wide-Bore Nozzle, and VHS Rewinder apply to both supported projectile primaries. Bubble-Bath Concentrate and Wet-driven conductive behavior remain water-only. The projectile specification is still frozen at spawn, so an in-flight shot does not mutate when inventory changes; the next accepted attack uses the newly compiled loadout.

Projectile spawning receives explicit origin coordinates. Its direction is calculated from that origin toward the pointer, its sampled path begins at that origin, and wall collision applies normally. An ordinary run supplies the player position. A fused M4 run supplies the car's actual authoritative position.

## Inventory and component tree

M4 inventory is plain serializable data. A leaf records:

- stable instance ID and item-definition ID;
- `purchased` or `stolen` acquisition kind;
- source location and source stock ID;
- acquisition tick.

An Emitter Mount composite records:

- its own stable instance ID;
- recipe ID `emitter_mount`;
- creation tick and transaction ID;
- the selected projectile-primary leaf and RC-car leaf as immutable components.

The components keep their original provenance. Fusion cannot turn stolen components clean. The consumed primary and car no longer exist as standalone inventory entries and cannot contribute behavior twice or be fused again. The integrated car cannot also spawn as the independent support companion.

A deterministic projection flattens behavior-bearing leaves for the existing loadout compiler. The primary component supplies the selected base attack and payload; all standalone compatible modifiers plus retained modifiers contribute normally. The integrated carrier controls firing origin but does not add a duplicate passive effect. Adding the late modifier increments the inventory revision and recompiles the next attack exactly as if the modifier had been acquired before fusion.

Serialization stores the component tree, stable IDs, definition IDs, provenance, cash, revision, selected composite, transaction ledger, and scenario—not closures or compiled functions. Reconstruction validates the plain data and rebuilds compiled behavior from the current immutable catalog. Equivalent serialized data produces equivalent state and attacks in a fresh fixture. Disk durability remains M5 work.

## Shared preview resolver and atomic transaction

One pure Emitter Mount resolver is used by preview rendering and confirmation. It accepts current inventory, selected primary instance, current cash, inventory revision, and service availability, then returns either a complete immutable proposal or a specific rejection.

The proposal contains:

- transaction ID and source inventory revision;
- exact primary and carrier instance IDs;
- component names and provenance;
- base fee, clean discount, and final fee;
- retained and inapplicable modifiers;
- resulting firing origin, pointer steering, R recall, and lost autonomous bump behavior;
- the proposed composite tree and selected-primary result;
- an irreversibility warning.

The base fee is $6. The fee is reduced by $2 only when both consumed ingredients are clean, for a final $4 charge. Any stolen ingredient produces the full $6 fee. There is no receipt-wallet discount, crafting currency, dismantle, resale, refund, or repeatable money loop in M4.

Confirmation re-runs the resolver against current state. It rejects a stale inventory revision, unavailable service, missing or already-consumed ingredient, unsupported primary, insufficient cash, repeated transaction ID, or invalid proposal without changing cash, inventory, selection, revision, ledger, carrier, or compiled behavior.

For a valid confirmation, the command builds and validates the complete next state first, then swaps inventory, cash, selected primary, revision, ledger, carrier mode, and compiled loadout as one logical commit. Held confirmation input is cleared. A rapid double confirmation can create only one composite and one fee deduction. Cancel only clears the preview.

## Remote-Control Car behavior

The car uses authored, deterministic M4 constants:

- radius 9 world units;
- speed 4 world units per tick;
- owner leash 180 world units;
- autonomous seek range 220 world units;
- bump damage 1;
- bump cooldown 45 ticks.

Before fusion, the independent car chooses the nearest living enemy inside seek range, breaking equal distances by stable entity ID. It moves collision-constrained toward that enemy, deals one bump when contact is eligible, starts its cooldown, and returns toward the owner when no target is eligible or the leash would be exceeded. Axis-separated collision and stable fallback steering let it slide around authored rectangular walls without teleporting.

After fusion, autonomous seeking and bump damage are disabled. The car moves toward the pointer while clamped to the 180-unit owner leash. R edge-triggers recall, temporarily overriding pointer steering until the car reaches within 24 units of the owner. Player movement remains ordinary WASD movement. The carrier is indestructible in M4.

At the fixed doorway, the active-room transition resolves before combat actions. The car transfers to the destination room at a validated entry anchor within leash range and keeps the correct independent or emitter mode. Projectiles, enemies, and hazards from the inactive room do not follow or update. This proves coherent transition behavior without introducing M5's procedural room graph.

Keeping the car independent provides automatic positioning and small cooldown-limited damage. Fusion removes that convenience and requires the player to steer the firing origin, manage the leash, and account for wall-blocked shots. It is an operational trade rather than a free damage upgrade.

## Presentation and controls

The M4 scene renders the Bench Warrant kiosk, room doorway, player, enemies, walls, RC car, leash boundary or tether cue, projectiles, surfaces, and readable attack origin. Presentation remains original graybox/vector work consistent with M1-M3.

Controls are:

- WASD: move the player;
- pointer: aim and, after fusion, steer the emitter target;
- primary pointer button: fire;
- R: recall the car;
- E near Bench Warrant: open preview;
- Escape: close the preview when it is open; otherwise toggle pause.

The M4 HUD shows scenario, room, cash, inventory revision, selected primary, carrier mode, ingredient provenance, nearby interaction, retained modifiers, late-pickup availability, recent feedback, and bounded behavior trace. Preview and confirmation are accessible DOM controls with explicit disabled reasons. The mode supports normal desktop and 800-by-600 layouts without horizontal overflow; vertical scrolling is acceptable for the information panel.

## Error handling and invariants

- M1, M2, and M3 routes continue using their existing state and behavior.
- A leaf instance exists exactly once in the component forest.
- A composite contains exactly one supported projectile primary and one RC car.
- The selected primary refers to one owned leaf or the primary component of one owned composite.
- Cash and revisions are finite non-negative integers.
- Preview and commit use the same resolver and produce the same price, provenance, retained effects, and operational change.
- Rejected and cancelled commands are state-preserving except for concise visible feedback.
- A transaction ID and component instance can be committed at most once.
- Independent and fused carrier modes are mutually exclusive.
- The car and player remain outside solid geometry and inside the current room's valid bounds.
- A projectile spawns at the authoritative requested origin and moves once per tick.
- Pause, preview, blur, transition, restart, and shutdown clear held fire, recall, and interaction input.
- Production runtime performs no external requests and contains no development fixtures or debug bridge unless explicitly enabled in Vite development mode.

## Acceptance and testing

Tests follow red-green TDD and cover:

- all 12 immutable definitions and the unchanged ordered M2/M3 subset;
- physical and water payload validation, deterministic pattern compilation, and pickup-order invariance;
- Soaker plus car and Party Popper plus car resolving through the same Emitter Mount rule;
- unsupported Mop compatibility messaging;
- exact clean and stolen fees, preview/commit parity, insufficient cash, stale revisions, missing ingredients, repeated confirmation, cancel, and rapid input;
- atomic component consumption, selected-primary replacement, retained provenance, no duplicate independent carrier, and no refusion;
- serialization and reconstruction of leaves, composite tree, ledger, selection, revision, and equivalent compiled behavior;
- autonomous seek ordering, bump cooldown, idle return, wall collision, leash enforcement, pointer steering, R recall, and doorway transfer;
- projectile origin at the car's actual position, pointer-relative Party Popper spread, wall-blocked shots, and unchanged player movement;
- Bubble Bath, Plasma Globe, Wide-Bore Nozzle, VHS Rewinder, and Gel Pen Pack behavior after supported fusion;
- acquiring Gel Pen Pack after fusion changing subsequent attacks without mutating shots already in flight;
- every existing M1-M3 unit, integration, and browser regression remaining green.

Browser acceptance uses real keyboard and pointer input to prove:

1. Void the Warranty launches separately with one canvas, one M4 HUD, Bench Warrant, and no page errors;
2. clean and stolen scenarios display and charge the exact previewed fees;
3. cancel and unsupported preview leave inventory and cash unchanged;
4. confirm consumes both components once and creates one provenance-preserving composite;
5. the independent car seeks and bumps, while the fused car instead steers, recalls, and fires from its visible position;
6. Soaker and Party Popper use the same recipe path and display retained modifier behavior;
7. a late modifier changes the next attack;
8. the fixed doorway transfers carrier state without stale-room activity;
9. ten restarts retain one canvas, one HUD, one scene loop, and clean state;
10. M1 Start shift, M2 Interaction Lab, and M3 Shoplifting Loop remain operational.

The final gate is typecheck, complete unit/integration tests, targeted M4 Chromium coverage, full Chromium coverage, production build, production debug-fixture exclusion, and direct production inspection at 1440 by 900 and 800 by 600. Human playtesting remains the acceptance gate for car control, leash, spread, preview readability, fusion value, and whether independent versus fused car behavior feels like a real choice.

## Explicitly deferred

M4 does not connect M3 acquisitions to combat, add random inventory, build a procedural wing, implement a save slot or disk checkpoint, add dismantling or refunds, support a second carrier or second-stage fusion, make Receipt Wallet or Fanny Pack operational, add Leaf Blower, add security combat, expand the enemy roster, introduce production pixel art or audio, publish, deploy, or begin M5.
