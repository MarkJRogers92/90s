# DEAD MALL M0-M1 Design

## Goal

Build the first local vertical slice of DEAD MALL: a Janitor can enter one top-down mall room, move, aim, swing a directional mop, take readable damage from two enemy types, pause safely, clear or lose the encounter, and restart without leaked state.

This document distills the approved `DEAD_MALL_COMPLETE_HANDOFF.md`. It does not expand the authorized scope past M1.

## Product boundary

- Desktop browser first, running locally.
- Ordinary 1997 mall atmosphere: tired retail surfaces, readable combat, horror-comedy restraint.
- M0 and M1 only. Wet, item interactions, shopping, theft, Security Heat, fusion, procedural wings, saves, and content expansion remain later milestones.
- Original local graybox art is acceptable. Gameplay and readability take priority over a large asset catalog.
- No backend, accounts, analytics, telemetry, remote runtime assets, external gameplay calls, publishing, or deployment.

## Architecture

The renderer-independent TypeScript simulation is authoritative for position, collision, attacks, enemy phases, projectiles, damage, pause, and terminal states. Phaser owns the browser host, drawing, scene lifecycle, and input collection, but never duplicates gameplay decisions.

The browser advances the simulation at 60 Hz with an accumulator capped at five steps per rendered frame. Long stalls discard excess backlog. Blur pauses the run, clears held input, and requires an explicit resume.

The initial room is 960 by 480 simulation pixels. Movement uses circle-versus-bounds and circle-versus-axis-aligned-rectangle collision. Fast projectiles use swept collision. Identical state and input-by-tick produce repeatable headless outcomes.

## Gameplay contract

- Player: radius 10, speed 210 px/s, health 6.
- Mop: range 70 plus target radius, 80-degree full arc, damage 4, cooldown 27 ticks; walls block hits.
- Hanger: slower than the player, pursues, deals one contact damage, then player invulnerability lasts 60 ticks.
- Spitter: stationary 36-tick visible telegraph using a stored aim direction, then one slow projectile and bounded recovery/cooldown.
- Tick order: decrement eligible cooldowns; accept player attack; update enemy phases; move entities/projectiles; resolve collisions/damage stably; remove dead entities; evaluate death first and clear second.
- A populated room clears once when no enemies remain and the player is alive. Health at or below zero ends the run once. Terminal runs stop harmful updates.
- UI exposes health, controls, pause/resume, `Shift complete`, `Shift ended`, and `Restart shift`.

## Browser and diagnostics

The page begins with a `Start shift` button and creates the canvas only after activation. WASD moves, pointer position aims, primary pointer input attacks, and Escape pauses or resumes. Pointer coordinates are converted through the canvas transform.

Development and browser-test builds may expose a read-only `window.__DEAD_MALL_DEBUG__.snapshot()` behind `VITE_ENABLE_DEBUG_BRIDGE=true`. Ordinary production builds exclude the global bridge. Tests must use real keyboard and pointer events for interaction claims.

## Testing and evidence

Use Vitest for pure simulation and lifecycle tests and Playwright for startup, real input, pause/blur, restart, and canvas behavior. Follow red-green-refactor for new behavior. The M1 gate requires fresh typecheck, unit/integration tests, browser tests, production build, an inspected browser screenshot, a local run command, and honest notes about remaining feel/playtest uncertainty.

## Selected tooling

The installed runtime is Node 24.20.0 with npm 11.19.0. Registry verification on 2026-09-13 selected exact versions Phaser 4.2.1, Vite 8.3.0, TypeScript 7.0.2, Vitest 5.0.0, and Playwright Test 1.63.0. Their published Node requirements are compatible with Node 24.20.0.

## Acceptance gate

M1 is ready for user playtest only when diagonal speed matches cardinal speed, walls constrain movement, mop geometry/cooldown/line of sight are tested, damage cannot drain the full player in one overlap frame, Spitter telegraphs before firing, terminal states occur once, pause/blur discard backlog, ten restarts do not duplicate the run, and the real browser path has been exercised without page errors.
