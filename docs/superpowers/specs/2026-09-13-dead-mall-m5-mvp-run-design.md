# DEAD MALL M5 MVP Run Design

## Goal and boundary

M5 is the first milestone that plays like the actual game rather than a lab: one
short, seeded mall wing that chains shopping, movement, combat, the bench, and a
boss into a single run with a resumable checkpoint.

The run is a new deterministic launch mode alongside the preserved M1 **Start
shift**, M2 **Interaction Lab**, M3 **Shoplifting Loop**, and M4 **Void the
Warranty** modes. Every earlier mode keeps its existing state, rules, and tests.

M5 connects the already-proven systems instead of replacing them: M3 shopping
rules and security sweeps, M4 inventory provenance and Emitter Mount fusion, M2
loadout compilation and effect stages, and M1 combat, movement, statuses,
surfaces, and terminal handling. The wing generator, run state, boss, item
roster, and checkpoint layer are new; no earlier subsystem is rewritten.

M5 does not add production pixel art or audio, a second boss, meta-progression,
multi-slot saving, cloud storage, shops with stocking over time, or any
publication step.

## Player flow

The title screen adds a **Night Shift** action that starts the M5 MVP run, plus a
**Continue run** action that is only enabled when a valid local checkpoint
exists.

The run begins in the mall service corridor with $30, the Associate-Issue Mop,
and a Bench Warrant kiosk the player may return to at any time. Rooms are
connected in a chain and the player may walk back and forth between cleared
rooms. The chain is:

1. **Service corridor** — spawn, Bench Warrant kiosk, no enemies.
2. **Storefront A** — one seeded store with a security sweep.
3. **Food court** — combat room; both exits open when it is cleared.
4. **Storefront B** — a second, distinct seeded store with a security sweep.
5. **Back hall** — combat room with a heavier seeded composition.
6. **Security office** — the boss room; the entry door seals behind the player
   and the run ends when the boss or the player dies.

The run ends in exactly one of two terminal states. Winning publishes a run
summary and clears the checkpoint. Dying publishes the summary and keeps the
checkpoint so the player can retry from the last room boundary.

## Architecture

The renderer-independent TypeScript simulation stays authoritative, and Phaser
continues to own input cadence, drawing, scene lifecycle, and pointer-to-world
conversion. The DOM renders state and submits commands.

New simulation modules:

- `src/sim/wing/**` owns the seeded wing definition, authored room and store
  templates, the deterministic generator, and wing validation.
- `src/sim/run/**` owns `MvpRunState`, room entry and transition rules, the run
  inventory and economy, loadout refresh, run summaries, and checkpoint
  serialization.
- `src/sim/combat/boss.ts` owns the Loss Prevention Manager's deterministic
  phases and nothing else.

The run wraps rather than flattens the existing combat `RunState`, exactly as
M4's `BenchRunState` does. `MvpRunState` owns the current room, run-level
inventory, cash, Heat, suspicion, checkpoint status, boss state, and room-local
combat `RunState`. `tickMvpRun` applies deterministic room and checkout stages
and delegates ordinary combat stages through the existing simulation.

No central gameplay rule branches on an item definition ID. Authored
definitions declare payloads, patterns, and capabilities; the run and shop
layers branch on effect kinds and capabilities.

## Seeded wing generation

The wing is authored content plus a bounded, seeded selection, never free-form
procedural geometry:

- Room count, room order, room bounds, doorway positions, and room roles are
  fixed.
- Each role owns two authored layout variants; the seed chooses one per combat
  room and one store template per storefront.
- Store templates each declare six authored offers; the seed chooses four per
  run in authored order.
- Combat rooms declare authored spawn slots; the seed chooses a bounded subset
  and each slot's enemy kind from an authored band.
- Starting cash, player spawn, and the boss room composition are fixed.

Generation consumes seeded draws in one documented, stable order: room
variants, then storefront templates, then store offers, then combat spawns in
room order. The same seed therefore produces an identical wing, and the run
seed is displayed in the HUD and accepted from a URL parameter for playtests.

Generation is bounded and validated at construction: fixed room count, unique
room IDs, a connected chain, one boss room last, offers referencing catalogued
definitions, prices inside authored bounds, spawn slots inside their room and
outside solid geometry, and every store exit reachable from its room spawn.

## Run inventory and economy

The run owns one inventory: the existing fusion inventory of provenance-bearing
leaves and Emitter Mount composites. Shopping adds leaves; the bench fuses
them; the loadout compiler projects them. A single inventory means an item
never exists twice, and stolen provenance survives fusion exactly as it does in
M4.

Rules:

- Buying a store offer deducts the offer price, marks the offer consumed, and
  adds a `purchased` leaf with the store and offer as its source.
- Theft uses the M3 carry, sight, suspicion, confiscation, and secure-on-exit
  rules; securing a carried theft adds a `stolen` leaf and Heat.
- Cash, Heat, and suspicion persist across rooms and never reset on transition.
- Two authored capabilities become operational in M5: `shop_discount` (Receipt
  Wallet) reduces each lawful purchase by $2 with a $1 floor, and
  `smuggle_pouch` (Reinforced Fanny Pack) allows two concurrent unsecured
  thefts and reduces secured-theft Heat from 15 to 10.
- The loadout recompiles whenever the inventory revision changes, so the next
  attack after a purchase, theft, or fusion uses the newly owned behavior while
  shots already in flight keep their spawn-time specification.

Room transitions preserve player health, cash, Heat, suspicion, inventory,
selected primary, fusion ledger, and the run seed. Room-local enemies,
projectiles, surfaces, and event queues are rebuilt from the seed for the
destination room.

## Boss encounter

The Loss Prevention Manager is a new enemy kind with authored, deterministic
behavior and no randomness:

- health 60, radius 22, slow pursuit while not committed to an attack;
- phase 1 above 66% health: a telegraphed slam with a 44-unit reach, 2 damage,
  and a 90-tick cooldown;
- phase 2 from 66% to 34%: the slam plus a five-projectile tag volley every 150
  ticks with a 45-tick telegraph;
- phase 3 below 34%: entering the phase once summons two Hangers, shortens the
  slam cooldown to 60 ticks, and shortens the volley cadence to 120 ticks.

Phase entry happens exactly at the authored health thresholds, summons happen
at most once per run, and the boss cannot leave the room bounds or pass through
solid geometry. Killing the boss wins the run; the player dying loses it.
The boss room seals its entry door when the player enters and never reopens.

## Twenty-four item catalog

The catalog grows from 12 to 24 definitions. The twelve new definitions reuse
the seven existing effect kinds and add no new effect stage:

- five projectile primaries (Bottle Rocket Pack, Fire Extinguisher, Paint
  Marker, Foam Ball Blaster, Slushie Cup) spanning physical and water payloads,
  single and multi-prong patterns, and fast-light to slow-heavy shot profiles;
- two direct primaries (Broken Broom Handle, Box Cutter);
- one stronger Sticky modifier (Grease Gun);
- one heavier conductive reaction (Anti-Static Strap) and one longer conductive
  range (Car Battery);
- two projectile geometry modifiers (Needle Nozzle, Heavy-Duty Spring).

The frozen eight-definition M2/M3 subset and the twelve-definition M4 roster
remain exported unchanged, so completed modes cannot gain cards, offers, or
validation requirements. Catalog validation continues to reject duplicate IDs,
unknown effect kinds, invalid stages, mismatched source IDs, unsupported
references, and non-finite or out-of-range values, and extends to the two new
capabilities.

## Checkpoint and restart

A checkpoint is written at each room boundary: after the service corridor is
first entered, after a combat room is cleared, after leaving a storefront, and
on entering the boss room.

A checkpoint is plain versioned JSON holding the run seed, the next room index,
run tick, cash, Heat, suspicion, player health, the provenance-bearing
inventory tree with its revision and selected primary, and the committed
transaction ledger. It never holds closures, compiled functions, live
projectiles, or room-local entity state; the destination room is rebuilt
deterministically from the seed and the room index.

Loading validates the version, shape, ranges, catalogued definition IDs, and
inventory invariants. A missing, unreadable, wrongly versioned, or invalid
checkpoint is ignored with a concise player-visible reason; it never throws
into startup and never partially restores a run.

Restart is explicit: **Restart run** clears the checkpoint and starts a fresh
run, while **Continue run** resumes from the last boundary. Winning clears the
checkpoint; dying keeps it.

## Presentation and controls

The M5 scene renders the current room's walls, doorways, store fixtures, offer
labels, security sweeps, player, enemies, boss telegraphs, projectiles,
surfaces, and the Bench Warrant kiosk using the existing graybox/vector
presentation.

Controls are unchanged from the earlier modes: WASD moves, the pointer aims,
the primary pointer button attacks, E interacts (buy, open the bench preview,
or enter the next room), F steals, R recalls a fused carrier, and Escape pauses
or closes a preview.

The M5 HUD shows the run seed, current room name and index, room objective,
player health, cash, Heat, suspicion, carried thefts, secured inventory with
provenance, the compiled primary and its behavior trace, the bench interaction
prompt, checkpoint status, terminal summary, and the run controls. The mode
supports 1440x900 and 800x600 without horizontal overflow; vertical scrolling
of the information panel is acceptable.

## Error handling and invariants

- M1, M2, M3, and M4 routes keep their existing state and behavior.
- The wing is fully determined by the seed; the same seed and decisions produce
  the same rooms, offers, spawns, and boss behavior.
- Every owned item instance exists exactly once in the inventory tree.
- Cash, Heat, and suspicion stay finite non-negative integers inside their
  authored ranges.
- A store offer is available, carried, or consumed, never both.
- A rejected shopping or bench command leaves state unchanged except for
  concise visible feedback.
- A combat room's exits are closed until it is cleared, and the boss room seals
  on entry.
- Room transitions never carry projectiles, enemies, or surfaces between rooms.
- Pause, preview, blur, room transition, restart, and shutdown clear held
  input.
- A checkpoint never restores partially, and an invalid checkpoint never
  crashes startup.
- Production runtime performs no external requests and contains no development
  fixtures or debug bridge unless explicitly enabled in Vite development mode.

## Acceptance and testing

Tests follow red-green TDD and cover:

- identical seeds producing identical wings, different seeds producing
  different wings, and generated geometry, offers, and spawns passing
  validation;
- the unchanged eight-item and twelve-item catalog subsets, the 24-definition
  catalog, the new payloads and patterns, and both new capabilities;
- purchases, thefts, confiscation, secured thefts, cash and Heat persistence,
  discount and carry-limit behavior, and rejection paths;
- room transition rules, cleared-room gating, boss-room sealing, and per-room
  state rebuilding;
- boss phase thresholds, summon-once behavior, telegraph windows, volley
  geometry, cooldowns, movement bounds, and both terminal outcomes;
- checkpoint round-tripping, resume equivalence against a run played to the
  same boundary, invalid and version-mismatched checkpoint handling, and
  restart semantics;
- every existing M1-M4 unit, integration, and browser regression remaining
  green.

Browser acceptance uses real keyboard and pointer input to prove:

1. Night Shift launches with one canvas, one M5 HUD, the service corridor, and
   no page errors;
2. the seeded wing matches the displayed seed and store offers can be bought and
   stolen with correct cash, Heat, and provenance;
3. a combat room must be cleared before its exits open;
4. the bench still fuses in-run and the next attack uses the fused behavior;
5. the boss phases, telegraphs, and terminal summary appear, and winning clears
   the checkpoint;
6. Continue run resumes the same seed and boundary after a reload, and an
   invalid checkpoint falls back safely;
7. ten restarts retain one canvas, one HUD, and clean state;
8. M1 Start shift, M2 Interaction Lab, M3 Shoplifting Loop, and M4 Void the
   Warranty stay operational.

The final gate is typecheck, complete unit/integration tests, targeted M5
Chromium coverage, full Chromium coverage, production build, production
debug-fixture exclusion, and direct production inspection at 1440x900 and
800x600. Human playtesting remains the acceptance gate for wing pacing, store
placement, boss difficulty, and whether the checkpoint cadence feels right.

## Explicitly deferred

M5 does not add production pixel art or audio, a second boss or additional
enemy kinds, item durability or dismantling, shops that restock over time,
multi-slot or cloud saves, meta-progression between runs, WebKit/Safari/
Windows/device coverage, or any merge, publish, deployment, or release step.
