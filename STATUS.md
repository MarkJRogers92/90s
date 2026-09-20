# Status

**Current milestone:** M5 MVP run implemented, with in-run Bench Warrant fusion repaired and verified locally on 2026-09-19; ready for user playtest.

**2026-09-19 repair:** M5's acceptance list claimed in-run bench fusion and
`R` recall, but neither reached the player. `src/sim/run/bench.ts` was only
imported by a unit test, `MvpRunHud` had no bench panel, the kiosk's `E` only
printed a message, and `tickMvpRun` dropped the `recall` input, which left
`rc_car` a $20 item that did nothing. The car now exists as a real run entity
(shared carrier physics in `src/sim/carrier/car.ts`, driven by
`src/sim/run/carrier.ts`), the kiosk opens a real preview that pauses the shift
and commits atomically, and shots fire from the fused car. Coverage rose from
431 to 448 unit/integration tests and from 42 to 44 Chromium tests; the missing
browser acceptance item is now covered. See TEST_EVIDENCE.md for the full gate.

**Earlier verification (2026-09-13):** M5 MVP run implemented and reviewed
locally.

**Playable result:** The title screen now launches five modes. **Start shift** preserves the M1 combat room, **Interaction Lab** preserves the M2 item sandbox, **Shoplifting Loop** preserves the M3 deterministic two-store wing, **Void the Warranty** preserves the M4 bench-fusion mode, and **Night Shift** launches the M5 MVP run. **Continue run** is enabled only when a valid local checkpoint exists.

Night Shift is one short seeded mall wing: a safe service corridor with the Bench Warrant kiosk, two seeded storefronts drawn from four authored templates, two combat rooms whose doorways stay locked until they are cleared, and a sealed security office holding the Loss Prevention Manager boss. The run carries one provenance-bearing inventory, compiles its loadout from purchases, thefts, and fusion, tracks cash, Heat, and suspicion, and writes a versioned checkpoint at every room boundary. Winning clears the checkpoint; dying keeps it so the shift can be retried from the last boundary.

Buying the Remote-Control Car puts a real car in the run: it follows as an independent companion that seeks and bumps nearby enemies, and pressing E at the Bench Warrant kiosk opens a proposal that pauses the shift, states the fee, both ingredients and their provenance, the resulting attack origin, and what fusion costs the player. Confirming fuses the car into the firing origin, so the next attack leaves the car while WASD still moves the janitor and R steers it home. Cancelling changes nothing, and a proposal that went stale behind a purchase is refused rather than committed.

Wing generation, run state, economy, transitions, the car, the boss, and checkpoint validation remain renderer-independent under `src/sim/wing` and `src/sim/run`, with the carrier physics shared between the M4 bench and the M5 run in `src/sim/carrier`. Phaser collects input, advances the fixed-step loop, and presents authoritative state.

**Latest verification (2026-09-19) from this working tree:**

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 25 files and 452 tests passed.
- `npx playwright test tests/browser/night-shift.spec.ts` — exit 0; 13 Chromium tests passed, including a test that presses E at the kiosk, reads the real proposal, confirms it, and proves from the shots' recorded origins that a real mouse-down fires from the car and not from the player.
- `npm run test:browser` — exit 0; 44 Chromium tests passed across all six modes.
- `npm run build` — exit 0; Vite production output created in `dist/` and verified regenerated.
- Production JavaScript scan — 0 hits for the debug bridge, the debug flag, and every fixture literal including the quoted `mvp-bench`; the only `mvp-bench` matches in `dist/` are the legitimate `#mvp-bench-confirm` and `#mvp-bench-cancel` markup IDs.
- Production preview smoke at 1440x900 — one canvas, one visible HUD, the bench panel present and hidden, `CAR: none owned`, no debug bridge, no horizontal overflow, zero page errors, zero console errors, and only local-origin requests. No 800x600 production screenshot was retaken after this change.
- Independent review round — Muse reviewed the simulation half and DeepSeek the presentation and test half, read-only and in parallel. Six confirmed defects were repaired with two of them proven red-before-green (the preview's pause guard and the confiscation re-park), one reported regression was refuted by diffing the pre-extraction file, and three checkpoint validation gaps were recorded as known issues rather than fixed. See TEST_EVIDENCE.md.

**Known issues carried forward (found by review, not yet fixed):** checkpoint validation accepts hand-edited saves whose inventory does not agree with its offer status, whose cleared-room list names rooms ahead of the current room, or whose `nextCompositeId` collides with an existing transaction. All require editing `localStorage` by hand.

**Also repaired on 2026-09-19 (presentation):** every projectile was drawn with one
shared colour, so the boss's five-shot volley was indistinguishable from the
player's own fire, and the slam wind-up ring was drawn 12 units smaller than the
slam's actual reach. Enemy shots are now magenta, water blue, physical bone, and
bursts a wide halo; Wet and Sticky now render on the enemies carrying them; and
the ring is exactly `BOSS_SLAM_REACH`. Verified by pixel measurement of a decoded
screenshot (`rgb(255, 93, 122)` where the shared orange used to be) plus captured
frames in `artifacts/`. This view code has no automated coverage, and the player
projectile branch is not exercised by any M5 fixture because the starting mop is
a melee arc.

**Earlier verification (2026-09-13) from implementation checkpoint `c3a263b`:**

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 24 files and 431 tests passed.
- `npx playwright test tests/browser/night-shift.spec.ts` — exit 0; 11 Chromium tests passed, including a real boss kill that publishes the terminal summary and clears the checkpoint.
- `npm run test:browser` — exit 0; 42 Chromium tests passed across all six modes.
- `npm run build` — exit 0; Vite production output created in `dist/`.
- Production JavaScript scan for the debug bridge, debug flag, and every M5 fixture name — no matches outside source maps.
- Direct production inspection at 1440x900 and 800x600 — one canvas, one run HUD, no horizontal overflow, no debug bridge, no page or console errors, and only local-origin requests. Screenshots: `artifacts/m5-mvp-run.png` and `artifacts/m5-mvp-run-800x600.png`.
- Independent cross-family review — Muse reviewed the wing, run, economy, and checkpoint modules read-only at high reasoning, and DeepSeek reviewed the boss and presentation read-only at high reasoning. Every Critical and Important finding was repaired with a regression test in `c3a263b`.

**Repository state:** Branch `codex/m5-mvp` in the local linked worktree `/Users/markrogers/Documents/Github Code/90s/.worktrees/m5-mvp`, started from the M4 tip `ff2dcf5`.

On 2026-09-19, at the user's explicit instruction, `main` was advanced to this
work by fast-forward and both `main` and `codex/m5-mvp` were pushed to `origin`.
Because `origin/main` was a direct ancestor of this tip, the advance introduced no
merge commit and resolved no conflicts. Nothing has been tagged, released,
deployed, or published as a package, and no branch has been deleted. This
supersedes the earlier statement that nothing from M5 had been pushed or merged.

**Known uncertainty:** The art is deliberate graybox/vector work and there is no sound. Balance is unplayed: wing pacing, store placement, boss difficulty, and checkpoint cadence all need the user's hands. The repaired car is unplayed too — its steering weight, the 180-unit leash, the recall trip, and whether the fusion fee reads as a real trade rather than a free upgrade all need hands on it. Phase-3 boss summons are allowed once per boss encounter rather than once per save slot, because checkpoints deliberately exclude room-local entity state. WebKit, Safari, Windows, device coverage, and physical-device performance were not run. No 800x600 production screenshot was retaken after the repair.

**Next:** Stop at M5. Run a hands-on Night Shift playtest, including buying the car and fusing it at the kiosk; do not begin M6 without new authorization.
