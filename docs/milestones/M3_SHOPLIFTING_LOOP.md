# M3 — Shoplifting Loop

## Authorization and baseline

The user has explicitly asked to preserve the approved DEAD MALL art reference sheets on GitHub and move forward to the next milestone. The current repository roadmap identifies M3 as the Shoplifting Loop. This supersedes the earlier M2-only authorization for work on M3; it does not authorize deployment, a release, M4 fusion, or M5 expansion.

Base: `main`, matching the published M2 Interaction Lab continuation. Work on `codex/m3-shoplifting-art-reference`; preserve normal Start shift and Interaction Lab. The prior recorded gate is 123 tests and 12 Chromium browser checks, not a newly rerun result.

## M3 proof

A fixed small wing connects the existing combat loop to authored shop stock. Each offer exposes Buy, Steal, and Leave. Cash and per-instance acquisition provenance persist across room transitions. Theft raises visible Security Heat and produces a deterministic, clearly telegraphed security consequence. No procedural mall generation or fusion is needed for this proof.

## First increment: transaction kernel

Implement `src/sim/shops/transactions.ts` as a pure TypeScript state transition with no Phaser, DOM, network, clocks, randomness, or content-name behavior branches. Each authored offer is single-stock and has stable offer, store, item, and item-instance IDs, price in integer cents, and authored theft Heat. Successful acquisition consumes that offer exactly once and records a receipt. A purchase debits cash; theft preserves cash and increases bounded Heat; leaving changes neither stock nor economy. Rejected actions preserve the original state. Clone and freeze constructor inputs so caller mutations cannot alter future results.

The transaction receipt includes `instanceId` and `itemId`, matching the existing ItemInstance fields structurally. Integration must grant that exact instance once through the existing loadout compilation path; do not replace the M2 compiler. Acquisition receipts carry provenance independently of item behavior.

For this increment only, Heat is an integer from 0 to 100, capped at 100. This is a provisional implementation constant, not a claim that the user approved final balancing. Prices and theft Heat remain authored offer data, not item-name branches. No Heat decay or security-spawn rules are introduced by this first increment.

## Remaining M3 work

1. Connect the kernel to an optional M3 run mode and preserve inventory, cash, receipts, Heat, and consumed stock between fixed rooms. Block shopping while paused, dead, outside interaction range, or outside the active shop. Stage inventory validation and loadout compilation before committing an acquisition; no partial debit if compilation fails. Do not permit lab toggles to alter a normal M3 run.
2. Add a fixed mini-wing fixture with a combat room, an electronics shop, a connecting mall corridor, and an exit. Use already-defined compatible M2 items for first stock. Returning to a shop must not replenish an acquired offer. New runs must reset economy, stock, and receipts without duplicating the Janitor starter item.
3. Add a shop panel showing item identity, price, ownership/provenance, current cash, Heat consequence, and Buy/Steal/Leave controls. Use discrete interaction edges and simulation-side consumption guards, not pointer-repeat side effects. Show clear insufficient-cash and already-acquired feedback.
4. Add one deterministic, telegraphed security escalation response when an authored Heat threshold is crossed. Crossing triggers once; replayed commands or repeatedly reentering a room must not duplicate rewards or security spawns. Choose and record the encounter values at this next design checkpoint rather than inventing balancing in the transaction module.
5. Run the complete existing typecheck, Vitest, Chromium browser, and production build gate plus M3 browser journeys (buy, steal, leave, revisit, death/restart, pause, exit). Capture a genuine playable screenshot and recheck no external runtime calls. User playtesting remains separate from automated verification.

## Art integration constraints

The approved source boards establish direction, not validated runtime sprites. The art folder manifest distinguishes original Sheet 01 variants from earlier supporting crops and identifies any unavailable source. Do not use full boards as textures or call this batch the finished Visual Milestone. Keep the current Janitor gameplay identity; incidental generated protagonist names and inconsistent dimensions are not canonical decisions.

Follow the supplied source brief: 640 x 360 internal viewport; 3/4 top-down; four-direction bodies and eight-direction aimed arms/equipment; shared material ramps and bespoke store accents; 20–32 px world pickups with 64/96 px item portraits; larger character portraits. Clean and animate actual Aseprite assets before production integration. First environment priorities remain the modular mall, mall props, electronics store, arcade, readable pickups/enemies, corruption, combat effects, portraits, and lighting.

## Completion boundary

M3 is not complete when its transaction kernel passes isolated tests. The fixed wing, interactive UI, security consequence, regression gate, and hands-on feel check must be addressed explicitly. No deployment or main-branch gameplay replacement is part of this checkpoint.
