# DEAD MALL M2 Interaction Lab Design

## Goal and boundary

M2 proves that the first eight gameplay items compose through reusable, deterministic behavior primitives. It extends the existing renderer-independent simulation and adds a clearly separate interaction-lab route where curated builds can be selected and exercised with real controls.

M2 includes the Associate-Issue Mop, Pump-Action Soaker, Bubble-Bath Concentrate, Cracked Plasma Globe, VHS Rewinder, Extension Cord, Gel Pen Pack, and Wide-Bore Nozzle. It does not add shops, theft, Heat, fusion, the RC car, procedural rooms, saves, unlocks, audio, or production art.

## Architecture

Immutable item definitions live in `src/sim/items/catalog.ts`. Runtime inventory uses item instances containing an instance ID and definition ID; only one owned primary is selected. A catalog validator rejects duplicate IDs, invalid finite values, unsupported effect kinds, and invalid references with the offending content ID in its error.

`compileLoadout` resolves definitions by ID, sorts effects by semantic stage, priority, and stable content ID, validates one selected owned primary, and returns an immutable attack specification plus human-readable compatibility notes and a behavior trace. Pickup order never affects the compiled result. The central tick consumes compiled capabilities and effect specifications; it never branches on an item name.

The behavior stages are:

1. Allocate root action and event identifiers.
2. Resolve primary and player origin.
3. Collect sorted compatible effects.
4. Build payload and conversions.
5. Apply trajectory and geometry modifiers.
6. Spawn or resolve the authoritative attack.
7. Apply direct damage, statuses, and reaction hooks in stable entity-ID order.
8. Drain a bounded child-event queue.
9. Append concise gameplay trace and cosmetic descriptions.

Mop remains a directional direct attack. Owning projectile modifiers never turns it into a projectile. Soaker creates a water projectile. Bubble Bath converts compatible water projectiles into penetrating drifting bubbles that record one hit per target per outbound/return pass. Ordinary Soaker projectiles are destroyed on their first entity or wall hit.

## Deterministic interaction rules

- Wet lasts 180 ticks and refreshes to the longer remaining duration.
- Sticky lasts 90 ticks. Gel Pens applies a 0.65 movement multiplier; the general slow floor is 0.5.
- Mop and Soaker apply Wet before reactions are checked.
- Plasma Globe starts one conductive chain from an eligible direct Wet-applying hit. A chain reaches at most three additional Wet targets, chooses eligible targets by distance then stable entity ID, visits each target once, and never invokes the primary-impact hook again.
- Extension Cord increases conductive range from 150 to 220 world units. Without Plasma Globe, it adds one weak direct discharge to the struck Wet target; with Globe it upgrades the single reaction rather than creating a duplicate chain.
- Wide Nozzle adds 4 world units to compatible projectile radius and multiplies speed by 0.8. It never changes the player hitbox.
- Bubble Bath changes Soaker speed to 2.5 world units per tick, radius to at least 10, and lifetime to 90 ticks. A terminal burst creates one radius-48 Wet patch lasting 180 ticks.
- VHS Rewinder lets an eligible surviving projectile retrace its sampled path once. An outward bubble that reaches normal expiry begins its return instead of bursting. It bursts on its first destructive impact or at return completion, never both. A wall-destroyed projectile does not resurrect.
- In-flight effects retain their spawn-time compiled attack specification.
- Surfaces and projectile/path history are removed by `clearTransientRoomState` and by run restart.

Every gameplay event carries `rootActionId`, `eventId`, `parentEventId`, `generationDepth`, `originKind`, `sourceItemIds`, `procCoefficient`, and a deterministic sequence number. Generation depth is capped at 4, each root can create no more than 64 child gameplay events, each replay effect activates once per root, and replay-origin events cannot create another replay.

## Simulation state and presentation

Enemy state gains deterministic Wet and Sticky durations. Player projectiles gain their compiled payload, trajectory phase, sampled path, per-pass target ledger, ancestry, and terminal-burst flag. Run state gains item instances, selected primary, surface patches, event counters/limits, recent change text, behavior trace, and visible limit diagnostics.

The Phaser layer only renders this state: water shots, bubbles, return direction, Wet/Sticky markers, conductive arcs/events, patches, and concise trace text. It does not decide damage, statuses, chaining, or replay behavior.

The start screen adds an explicit **Interaction Lab** action. The lab shows the eight item cards, selected primary, supported/limited applicability, curated build buttons, recent change text, and a readable trace such as `Soaker → bubbles → Wet → conductive chain → one return pass`. Selecting a preset or toggling an item creates a fresh deterministic lab run; normal **Start shift** remains the M1 encounter.

## Acceptance and testing

Tests follow red-green TDD and cover:

- catalog validation, instance ownership, one-primary selection, and unsupported-effect reasons;
- pickup-order invariance for compiled behavior and same-input simulation results;
- Wet refresh, Sticky strongest-slow/floor behavior, deterministic status expiry, and transient room cleanup;
- Mop + Globe, Soaker + Bath, Soaker + Globe + Cord, and Soaker + Bath + Rewinder;
- all six Soaker modifiers composing without replacement or runaway generation;
- Mop + Rewinder remaining direct and producing a limited-applicability explanation;
- one burst per bubble, one return pass, per-pass hit ledgers, visited-target chains, depth/event caps, and no reaction recursion;
- a new catalog entry using existing effects compiling without central-loop changes;
- real browser selection, visible trace/status feedback, rendered interaction effects, and responsive layout.

The final gate is typecheck, complete unit/integration tests, targeted Chromium browser coverage, production build, production debug-fixture exclusion, and direct browser inspection. M2 stops after the interaction lab; M3 remains unauthorized.
