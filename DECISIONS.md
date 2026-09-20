# Decisions

## 2026-09-13

- Use the empty MarkJRogers92/90s remote as the dedicated DEAD MALL repository, with local work on codex/m0-m1-combat-room.
- Build M0 and M1 only from the approved handoff.
- Use a renderer-independent TypeScript simulation with Phaser as a browser adapter.
- Pin Node-compatible exact versions: Phaser 4.2.1, Vite 8.3.0, TypeScript 7.0.2, Vitest 5.0.0, Playwright Test 1.63.0.
- Use original local vector/graybox rendering for the first room; final pixel art cannot block combat proof.
- Keep the debug snapshot opt-in for development/browser tests and absent from ordinary production runtime.
- The fresh clone and feature branch are sufficient isolation for an empty repository; no second linked worktree is needed.
- Local commits are authorized by the build handoff. Push, deployment, and publication are not authorized.
- Reuse one Phaser RunScene for restarts while replacing the authoritative RunState; a development-only generation counter proves ten restarts do not create extra canvases, HUDs, or loops.
- Keep the browser debug bridge read-only. The restart-proof fixture is selected by URL only when both Vite development mode and the explicit debug flag are active.
- Isolate M2 in linked worktree `.worktrees/m2-interaction-lab` on branch `codex/m2-interaction-lab`.
- Compile owned item instances into one immutable, stage-sorted loadout; central simulation code branches on effect kinds and capabilities, never item definition IDs.
- Cap effect ancestry at generation depth 4 and 64 child gameplay events per root action, with bounded visible diagnostics.
- Use Wet for 180 ticks and Sticky for 90 ticks at a 0.65 movement multiplier with a 0.5 floor.
- Limit conductive chains to one start per root and three additional already-Wet targets, ordered by distance then stable entity ID; Extension Cord changes range from 150 to 220 and upgrades rather than duplicates the reaction.
- Give eligible surviving projectiles one sampled-path return pass. Outbound expiry starts return before burst; destructive impact or return completion produces at most one terminal burst.
- Keep the Interaction Lab separate from Start shift, rebuild a fresh seeded run for every loadout change, and preserve one Phaser canvas and one HUD.
- M2 uses original local graybox/vector presentation. Production pixel art, audio, shops, theft, Heat, fusion, saves, and M3 content remain out of scope.
- Isolate M3 in linked worktree `.worktrees/m3-shoplifting-loop` on branch `codex/m3-shoplifting-loop`; keep shopping, economy, provenance, security, and transition rules renderer-independent under `src/sim/shop`.
- Isolate M4 in linked worktree `.worktrees/m4-void-the-warranty` on branch `codex/m4-void-the-warranty`; keep bench fusion rules, including the shared Emitter Mount rule, renderer-independent under `src/sim/bench` and `src/sim/fusion`.
- Keep the development-only `bench-doorway` fixture out of production; it temporarily teleports the player without the carrier and the authoritative leash correction closes the transient gap.
- Treat the first-tick projectile hold as intentional so a fresh projectile can be observed before movement; a doorway transition tick can consume held fire once in the destination while the scene immediately clears input and prevents multi-step leakage.
- Protect the M2/M3 catalog subset as the first eight definitions with exact-order regression coverage; browser origin proof uses a 48-unit deterministic allowance plus a closer-to-car-than-player assertion.
- Accept contributor Muse actual-diff review of `10765d10fb4703ae8fe7bae34da24b8f173dfffa..cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` read-only at `xhigh` with no Critical or Important findings as the M4 review gate.
- Correct the local Muse bridge to advertise and accept Muse reasoning levels through `xhigh` only, rejecting `max` with a clear contract error while leaving DeepSeek `max` support unchanged; the fix remains unstaged and uncommitted in the bridge repository and requires a fresh Work session to load the updated MCP schema.
- M4 uses original local graybox/vector presentation. Disk durability, production art, audio, M5 content, WebKit/Safari/Windows/device coverage, and physical-device performance remain out of scope.
- M4 may be committed and the branch may be pushed to `origin` for GitHub backup and continuation. Do not merge, publish, deploy, release, or begin M5.

## 2026-09-13 — M5 MVP run

- Build M5 as one short seeded run that connects the proven systems instead of replacing them: M3 shopping, security, and provenance; M4 inventory and Emitter Mount; M2 loadout compilation; M1 combat, movement, statuses, and terminal rules.
- Isolate M5 in linked worktree `.worktrees/m5-mvp` on branch `codex/m5-mvp`, started from the M4 tip `ff2dcf5`.
- Fix the wing shape as a six-room chain — service corridor, storefront A, food court, storefront B, back hall, security office — with authored room and store templates and a bounded seeded selection; never free-form procedural geometry.
- Keep the service corridor a safe entry room with the Bench Warrant kiosk, and the security office the last room with a single boss; the run's generator and validator treat an authored enemy band of zero as a safe room that must carry no spawns.
- Lock both doorways of a room that authors enemy spawns until the room is cleared, and seal the security office permanently on entry.
- Own one provenance-bearing fusion inventory at the run level and rebuild room-local enemies, projectiles, and surfaces from the seed on every transition.
- Allow the boss's phase-3 Hanger summon once per boss encounter rather than once per save file, because the checkpoint deliberately stores run-level state only and never room-local entity state.
- Win the run when the Loss Prevention Manager dies, even if the Hangers it summoned are still alive.
- Grow the catalog to 24 definitions while keeping the frozen eight-definition M2/M3 subset and the twelve-definition M4 roster as explicit exports, and make `shop_discount` (Receipt Wallet) and `smuggle_pouch` (Fanny Pack) operational in M5 shops.
- Allow authored projectile geometry to subtract, so the compiled projectile hitbox has a positive floor (`MIN_PROJECTILE_RADIUS` in `src/sim/effects/playerProjectiles.ts`).
- Checkpoint only run-level state — seed, next room index, entry side, tick, cash, Heat, suspicion, player health, cleared rooms, inventory, offer status, and carried thefts — as versioned JSON, and rebuild the destination room deterministically on resume. Reject a checkpoint that lists the boss room as cleared or whose inventory cash disagrees with its run cash.
- Clear the checkpoint when the run is won and keep it when the player dies; a failed storage clear must not report success or leave Continue run enabled.
- Accept two independent cross-family read-only reviews at high reasoning as the M5 review gate: Muse reviewed the wing, run, economy, and checkpoint modules, and DeepSeek reviewed the boss and presentation. Every Critical and Important finding was repaired with a regression test in `c3a263b`.
- M5 uses original local graybox/vector presentation. Production art, audio, WebKit/Safari/Windows/device coverage, physical-device performance, and M6 content remain out of scope.
- Local commits are authorized for this build. Push, merge, publish, deploy, and release are not authorized. Do not begin M6 without a new user instruction.
- Environment notes recorded for the next session: run vitest serially (`--no-file-parallelism`) because parallel workers can time out on this filesystem, Chromium requires the approved escalation, and the Vite dev server can exceed Playwright's default 60-second `webServer` timeout.

## 2026-09-19

- Repair the M5 in-run Bench Warrant instead of removing the Remote-Control Car,
  because the M5 acceptance list already promised in-run fusion and browser
  acceptance item 4 and `R` recall, and because fusion is the verb DESIGN.md
  calls the game's core. Removing the car would have meant amending the M5 spec.
- Extract the carrier physics into `src/sim/carrier/car.ts` and make
  `src/sim/bench/car.ts` adapters over it, rather than writing a second copy for
  the run. `AGENTS.md` and the existing `src/sim/run/bench.ts` header both require
  one rule rather than two, and the extraction was verified by leaving M4's
  existing 431 tests green with `bench/car.ts`'s exported names and constant
  values unchanged.
- Derive the run's car from its inventory rather than storing it: an Emitter Mount
  composite means the car is fused and steers the shots, an owned
  `emitter_carrier` leaf means an independent companion, and neither means the
  run owns no car. This follows the existing rule that no central gameplay path
  branches on an item definition ID — presence branches on a capability and a
  recipe.
- Do not checkpoint the car. A checkpoint keeps storing run-level state only, so
  a restored shift re-derives whether it owns a car and in which mode from the
  checkpointed inventory, and re-parks it deterministically, exactly as the room
  and its enemies are rebuilt from the seed.
- Park the car with a fixed candidate-offset order (`findCarrierSpawn`) when it is
  first bought and after every doorway, taking the first spot that is inside the
  playfield and outside authored solid geometry, falling back to the owner's own
  position. The order is fixed so a replay stays reproducible.
- Open the Bench Warrant preview as a pausing run command and commit it against
  the proposal's own transaction ID and source revision, so a confirm after an
  intervening purchase or theft fails atomically with a reason instead of fusing
  against state the player never saw. `confirmRunFusionPreview` deliberately does
  not consult `blockedRunReason`, because an open preview pauses the run and
  confirming or cancelling are exactly the ways out of it.
- Advertise `R RECALL` in the HUD only while a fused car exists, and report a
  readable reason when recall is refused, so a key is never advertised while it
  would do nothing.
- Resolve the terminal summary's instance IDs to item names in the HUD, because
  the summary deliberately carries IDs and printing them raw showed players
  strings like `mvp-purchased-mall-mart-receipt_wallet`.
- Add a development-only `mvp-bench` fixture that stands the shift at the kiosk
  already owning the car and a projectile primary, so browser acceptance reaches
  the preview and the fused firing origin with real input instead of replaying a
  whole store purchase. Like every other fixture it is gated on Vite development
  mode plus `VITE_ENABLE_DEBUG_BRIDGE` and is absent from production output.
- Extend the development debug snapshot with the carrier, room-local projectiles,
  and whether a preview is open, so browser acceptance can prove the firing
  origin rather than only that a panel appeared.
- Draw every projectile by its owner and payload rather than one shared colour, so
  the boss's phase-2 volley can never be mistaken for the player's own fire, and
  draw Wet and Sticky markers from the `EnemyState.statuses` the central tick
  already maintains.
- Draw the boss's slam wind-up ring at `BOSS_SLAM_REACH` itself rather than a
  decorative radius, because a smaller ring tells players they are safe inside
  the real reach.
- Widen the development debug snapshot with enemy `phase`/`bossPhase` and
  projectile `faction`. The earlier snapshot omitted both, which silently made
  acceptance scripts unable to detect a telegraph or tell a volley from player
  fire; the gap is worth closing because it was indistinguishable from "nothing
  happened".
