# Test evidence

## 2026-09-28 — round 20: the pink slip and the mall PA

- `pink-slip.test.ts` (4) and `pa-announcer.test.ts` (9) failed first on their
  missing modules; the end-card delay test failed first (`shiftCardDelayMs is
  not a function`). The PA start-grace test first passed falsely (an
  undefined constant made the tick NaN, which slipped past the cooldown); it
  was tightened to pin the grace below half the cooldown, failed, then passed.
- Real browser: a death on `?fixture=mvp-last-heart&seed=7` shows the slip
  (reason INSUBORDINATION TOWARD A DISPLAY — a mannequin), then the card at
  once (`audit/slip-*.png`); a theft on `?fixture=mvp-storefront&seed=0`
  after the 3 s grace plays the ticker (`audit/pa-2.png`). An earlier theft
  inside the grace stayed silent, as designed. No page errors.
- New browser test: death, pink slip, SHIFT OVER, R retries the same mall.
- `npx vitest run` — PASS: 66 files, 717 tests. `PW_PORT=4193 npx playwright
  test --workers=2` — PASS: 62/62 (3.0 min).

## 2026-09-28 — round 19: cinematic bookends

- Model tests: `dawn-ending.test.ts` (5) and `clock-in.test.ts` (5) failed first
  on their missing modules; the ending's hold-the-last-shot change failed
  first (`expected 1 to be +0`). `kill-cam.test.ts` (5) was written alongside
  its model and not observed red.
- Browser: new "beating the Mall Manager plays out to the CLOCKED OUT card,
  and a new shift starts from it" drives kill cam, dawn ending and card from
  a real killing blow. The escalator test now presses Enter only while still
  downstairs (the card opens after the kill cam). Two stability tests
  (Opening Concourse static scene; ten restart cycles) first failed because
  their baseline was taken during the cold open (one extra display object and
  keydown listener); they now wait for `cinematic: false`.
- Captures in `artifacts/neon-overhaul/audit/`: `kill-*.png`, `ending-*.png`,
  `clockin-*.png`; no page errors.
- `npx vitest run` — PASS: 63 files, 702 tests. `PW_PORT=4193 npx playwright
  test --workers=2` — PASS: 61/61 (3.0 min).

## 2026-09-28 — round 18: the escalator ride

- New `escalator-ride.test.ts` (6) failed first on the missing model: rider
  path end to end, never backwards, steps and shop rows moving, title timing,
  end fade and done, skip grace.
- New browser test "the escalator ride holds the run still until it ends or
  is skipped": a real boss kill, Enter at FLOOR CLEARED, the run is upstairs
  with its tick unchanged a second into the ride, then Space skips it and the
  tick advances. It can only pass if the run is frozen during the ride.
- Captures `artifacts/neon-overhaul/floor2/ride-{1,2,3}.png`; no page errors.
- `npx vitest run` — PASS: 60 files, 687 tests. `PW_PORT=4193 npx playwright
  test --workers=2` — PASS: 60/60 (2.6 min).

## 2026-09-28 — round 17: polish pass

- Audit captures of every screen (`artifacts/neon-overhaul/audit/`) found: the
  MANNEQUINS toast drawn over the Food Court title card (the hint was decided
  before the new room's card existed), a store name collision ("BROOM
  HANDLEBOX CUTTER"), Floor 1 names on the Floor 2 map, a log line cut
  mid-word ("THE ESCALATOR L."), and the dash hint stacked on damage text.
  Each was re-captured after the fix (`fc-seq.png`, `fixes.png`,
  `dash-crop.png`).
- New tests failed first: Floor 2 map names, log wrapping (2), Static and
  Bargain Hunter audio cues (2). `npx vitest run` — PASS: 59 files, 681 tests.
- `npx tsc --noEmit` and `npx vite build` — PASS.
- `PW_PORT=4193 npx playwright test --workers=2` — PASS: 59/59 (2.4 min),
  including the title-screen launch paths after the button regrouping.

## 2026-09-28 — round 16: a new mall every shift, sharper upstairs

- New `shift-seed.test.ts` (3) failed first (missing module); the Floor 2
  tuning tests failed first (`expected 42 to be 34`, `expected 40 to be 24`);
  the end card's MALL row test failed first. `npx vitest run` — PASS: 59
  files, 676 tests.
- Browser suite with random seeds for seedless launches: 58/59 — "real
  keyboard theft secures at the store exit" relied on mall 0's storefront
  layout (walks straight down to the exit). Pinned both storefront tests to
  `seed=0`; new "each shift clocks into its own mall" test added.
  `PW_PORT=4193 npx playwright test --workers=2` — PASS: 59/59 (2.4 min).
- Real browser: a real boss kill on `?fixture=mvp-boss-win&seed=4242` shows
  the end card with `MALL #4242`, rows and buttons clear; no page errors
  (`artifacts/neon-overhaul/floor2/endcard-mall.png`).

## 2026-09-28 — round 15: Floor 2, the Upper Level

- `npx vitest run` — PASS: 58 files, 666 tests. New `manager-boss.test.ts`,
  `floor-two-enemies.test.ts` and `floor-two.test.ts` failed first. The
  Bargain Hunter spawn-grace test failed first (`expected 'pursue' to be
  'recover'`), then passed with a 50-tick spawn recover.
- `npx tsc --noEmit` and `npx vite build` — PASS.
- `PW_PORT=4193 npx playwright test --workers=2` — PASS: 57/57 (2.7 min), then
  the new "Management Suite spawns the Mall Manager" test — PASS (4.7 s).
- Real-browser captures (`artifacts/neon-overhaul/floor2/`, fixtures
  `mvp-floor-two`, `mvp-floor-two-lobby`, `mvp-floor-two-boss`): no page or
  console errors. Findings acted on: Bargain Hunters by the west door charged
  within ~0.6 s of entry (fixed, above); the Cinema Lobby's red mid-floor neon
  strip read as a hazard (now gold). A suspected slow-movement bug on the
  landing was the locker-aisles wall at x=180 (the player stopped at 170 =
  wall minus radius), not a sim fault.
- Floor 2 music: new `music.test.ts` cases (upstairs track, Manager theme by
  phase, 16-bar arrangements) failed first. Offline renders in Chromium
  (`node scripts/render-music.mjs <url> <dir> upstairs manager`), RMS / peak:
  upstairs low 0.108/0.662, upstairs full 0.119/0.667, manager low
  0.117/0.654, manager phase 3 0.125/0.686; no page errors, no clipping.
- Playtest log: the upstairs-attackers/floor test failed first (`expected
  undefined to be 2`), and the room-keying summary test failed first
  (`{ food_court: 2 }`). `npx vitest run` — PASS: 58 files, 670 tests.
- `PW_PORT=4193 npx playwright test --workers=2` — PASS: 58/58 (2.6 min).

## 2026-09-28 — round 14: the soundtrack, rebuilt

- `npx vitest run` — PASS: 55 files, 648 tests (new reactive-music tests: combat
  intensity, Lights Out in blackouts, mannequin tension, boss phase intensity,
  sixteen-bar arrangements; they failed first on the old cue and 4-bar tracks).
- Offline renders in Chromium (`scripts/render-music.mjs`), RMS / peak: muzak
  0.113/0.48, combat low 0.090/0.64, combat full 0.097/0.65, boss 0.121/0.66,
  boss phase 3 0.123/0.68, blackout 0.062/0.62; no page errors, no clipping.
- `PW_PORT=4193 npx playwright test --workers=2` — PASS: 57/57 (2.4 min).

## 2026-09-28 — round 13: the Mannequin

- `npx vitest run` — PASS: 55 files, 643 tests. New `mannequin.test.ts` (5) and
  `mannequin-spawns.test.ts` (3) failed first (missing module / no spawns). The
  mannequin creak cue test was added after its implementation (not red first).
- Updated contracts: `tests/integration/mvp-run.test.ts` now asserts authored
  enemies first and in order, then only display mannequins, unique ids and
  `nextEntityId`; the difficulty test counts only regular non-elite enemies.
- Real browser (`?fixture=mvp-back-hall`): 2 mannequins; aiming at them kept
  both frozen (`phase: recover`), aiming away sent both ~100 px toward the
  janitor in 0.45 s (`pursue`); no errors. Captures
  `artifacts/neon-overhaul/mannequin-{watched,moving}.png`.
- Browser suite under host load (three ffmpeg jobs, load average 17 -> 143):
  53/57, then the four failures rerun alone: 3 pass, the ten-restart-cycles
  test failed in its real-time movement helper (`moveUntil`) at load ~143.
- Rerun with two workers once the host eased: `PW_PORT=4193 npx playwright test
  --workers=2` — PASS: 57/57 (3.5 min).

## 2026-09-28 — round 12: controller support

- `npx vitest run` — PASS: 53 files, 634 tests (new `gamepad.test.ts`, 6 tests:
  deadzone, d-pad, aim memory, trigger and full-stick fire, press edges,
  missing pad; failed first on the missing module).
- Real-browser check with a stubbed `navigator.getGamepads`: left stick moved
  the janitor 105 px, A dashed exactly 126 px, Start paused, B resumed, no errors.
  (No physical controller was available to test.)
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (2.8 min).

## 2026-09-28 — round 11: playtest tuning, readability, combo, elites, events, score

- `npx vitest run` — PASS: 52 files, 628 tests. New: `difficulty-tuning` (4),
  `combo` (4), `elites-snacks` (5), `room-events` (3), `score` (5), shift-card
  score (1), combo and boss-intro cues (2). Each failed first on its missing
  module or constant, except `score.test.ts`, which was written together with
  its module (not observed red first).
- Boss tests re-pinned to the same 66%/34% phase thresholds of the new 90 max;
  the DOM boss chip's hardcoded `/60` fixed and its test updated to `60/90`.
- Bot comparison after tuning (sim-level, 150 seeds, no dashing): won 29 -> 4,
  HP lost per run 5.70 -> 7.27. The bot was already losing ~6 HP per run where
  the human lost 0-2, so this is a relative signal only.
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (3.1 min).
- Captures: `shop-readable.png`, `event-blackout.png`, `event-bluelight.png`,
  `boss-intro.png` in `artifacts/neon-overhaul/`.

## 2026-09-27 — round 10: settings

- `npx vitest run` — PASS: 47 files, 604 tests (new `settings.test.ts`, 5 tests;
  failed first on the missing module).
- Real-browser flow: change settings on the title (saved JSON checked), start a
  shift, O opens the dialog and pauses, shows the saved values; Esc closes it
  and stays paused; Esc again resumes. No page or console errors.
- Browser suite NOT cleanly re-verified this round: the host was saturated by
  unrelated processes (three ffmpeg jobs, fileproviderd, iCloud bird; load
  average 59-94). At that load a single headless page ran 16 fps / 17 sim
  ticks per second, and the known timing-based cases failed (53-56/57),
  including with music scheduling disabled as an experiment (reverted).
- Follow-up on `2004976` once the host calmed (load ~9): `PW_PORT=4193 npx
  playwright test` — PASS: 57/57 (2.9 min). The earlier failures were host load.

## 2026-09-27 — round 9: playtest log

- `npx vitest run` — PASS: 46 files, 599 tests (new `playtest-recorder.test.ts`,
  5 tests: damage by source and final blow, kills and quit, opt-in storage with
  the 50-run cap, broken/garbage storage, summary). Failed first on the missing
  module.
- Real-browser check: switch on from the title, play, Return to title, reopen:
  1 run logged as a quit with its room time and dash count; no page errors.
- `PW_PORT=4193 npx playwright test` under a machine load average of ~47 (another
  process): 56/57, then 53/57 on rerun. The four failures are the known
  load-sensitive timing/movement cases (pause tick budget, civilian
  evacuation, opening exit, integer-scale capture); all four PASS run alone
  (4/4, one worker). No change in this round touches those paths.

## 2026-09-27 — round 8: soundtrack, store card, Bench Warrant card

- `npx vitest run` — PASS: 45 files, 594 tests. New: `music.test.ts` (5),
  `bench-card-model.test.ts` (4), store offer prompt (2). Each failed first.
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (2.6 min).
- Music rendered offline per track in Chromium (RMS / peak): muzak
  0.014/0.18 (then given a higher bus gain), combat 0.040/0.39, boss
  0.056/0.43, boss phase 3 0.060/0.42; no page errors.
- Real-input check of the Bench Warrant card: Esc closes the preview and
  resumes; Enter commits the Emitter Mount (composite in inventory, cash
  $30 -> $26). Captures `artifacts/neon-overhaul/{shop,bench}-after.png`.
- Found and fixed: the new pause card was drawing under the fusion preview
  (the preview holds the sim clock too).

## 2026-09-27 — round 7: dash readiness/hint, last heart, arrivals, pause card

- `npx vitest run` — PASS: 43 files, 583 tests (new `player-cues.test.ts`, 7
  tests; failed first on the missing module).
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (2.6 min) with the room
  fade-in and pause card on.
- Captures `artifacts/neon-overhaul/cues/` (spawn-in, dash recharge, dash hint,
  pause). The first pass showed the hint clipped at the left wall and still
  visible under the pause card; both fixed.

## 2026-09-27 — round 6: end card, fairness, dash, performance

- `npx vitest run` — PASS: 42 files, 576 tests. New: `shift-card-model` (5),
  `melee-knockback` (4), `dash` (6), dash cue (1); heavy-hit cue updated. Each
  new block failed first (missing module / wrong behaviour).
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (2.3 min) after moving the
  DOM status bar and summary off-screen.
- Fairness harness (sim-level scripted brawler, 150 seeds, not committed):
  original rules won 39 / died 80 / stalled 31, Hanger contact damage 375;
  Hanger knockback won 29 / died 93 / stalled 28, Hanger damage 214; all-enemy
  knockback raised glob damage 503 -> 728 and was narrowed to Hangers; a
  Spitter opener stagger raised room-entry 2+-damage rooms 12% -> 20% and was
  reverted. The bot's outcome swings with its own logic, so difficulty is
  left to a human playtest.
- `node scripts/perf-fight.mjs` — GPU (Apple M2, ANGLE Metal) 60 median / 60
  p10 fps in a Food Court fight; SwiftShader 30 / 29 fps (storefront).

## 2026-09-27 — round 5: Alex swing, flinch, death

- `npx vitest run` — PASS: 39 files, 560 tests (new `player body action` block,
  4 tests, failed first on the missing function).
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (2.4 min).
- Captures `artifacts/neon-overhaul/beats/*-swing.png`, `*-dead.png`. The first
  death capture showed the killing blow's star and a Spitter wind-up frozen on
  top of the body (the sim clock stops at game over); fixed by the real-time
  effects clock and verified in the recapture.

## 2026-09-27 — round 4b: combat sound

- `npx vitest run` — PASS: 39 files, 556 tests. New `combat beat cues` block in
  `tests/unit/audio-cues.test.ts` (hit vs heavy hit, no hit on the killing blow,
  boss kill sting, spitter charge then spit, slam on leaving telegraph); four
  failed first for the missing cues.
- Real fight with autoplay allowed: the engine scheduled 29 voices across the
  Food Court fight with no page or audio errors (only headless GL perf notes).
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (2.2 min).

## 2026-09-27 — round 4: combat readability (wind-ups, exaggerated hits, hit stop)

- `npx vitest run` — PASS: 39 files, 551 tests (new `tests/unit/combat-beats.test.ts`,
  12 tests: wind-ups from authoritative telegraph fields, landed-attack diffing,
  hit-stop ordering and non-stacking, hit-reaction spring, wind-up poses,
  attack-sheet frame scrubbing). Observed failing first (module missing, then
  `windupPose is not a function`) before implementation.
- `PW_PORT=4193 npx playwright test` — PASS: 57/57 (2.2 min) with hit stop on and
  all six new attack/death sheets loaded. `npm run build` PASS.
- Simulation change is export-only: `SPITTER_TELEGRAPH_TICKS`,
  `SPITTER_RECOVER_TICKS`, `VOLLEY_ANGLE_OFFSETS_DEGREES`.
- Captures: `node scripts/capture-beats.mjs` → `artifacts/neon-overhaul/beats/`
  (spitter/boss wind-up, hit, kill, corpse, hurt).
- Fixed during the round: a full-screen red hurt flash held by hit stop hid the
  field (now an edge vignette); the room title covered the first wind-up (it
  now dims while any enemy charges); a PixelLab-baked impact star in the
  Hanger's south strike frame (replaced with the previous pose).

## 2026-09-27 — round 2: UI, weapon switching, swing, 64px characters

- `npx tsc --noEmit` — exit 0. `npx vitest run` — 38 files, **539 passed**
  (new `run-weapons.test.ts`, 6, written first and observed failing).
- `PW_PORT=4193 npx playwright test` — **57/57 passed**. Player texture
  assertions now name the 64px `neon:player:alex-*` sheets.
- `npm run build` — exit 0.
- Fixed during the round: a CSS margin collapse that pushed the status row
  down over the canvas once the marquee was hidden; the room name clipping at
  800x600 (status row now a flex column sized to its text).

## 2026-09-27 — Claude neon overhaul (`claude/neon-overhaul`)

Environment: macOS (Apple M2), Node 24, Playwright 1.63 Chromium.

- `npx tsc --noEmit` — exit 0.
- `npx vitest run` — 37 files, **533 tests passed** (was 513). New:
  `room-dressing.test.ts` (11: every room dressed, facades in bounds and
  non-overlapping, every interior collision rect covered, no decor in door
  lanes, registered textures only, mood darkens through the shift, shoppers
  only in the opening, signs name the rolled store, fountain collision valid
  and clear of the door lane), `game-hud-model.test.ts` (4), and
  `mall-tokens.test.ts` (5: empty on entry, drop on death by kind, collect
  into cash with inventory cash in step, left behind on room change,
  deterministic). The token tests were written first and observed failing.
- `PW_PORT=4193 npx playwright test` — **57/57 Chromium tests passed** on a
  clean run (2.4 min). Two earlier full runs lost 1–3 tests to movement
  overshoot while GPU capture scripts shared the machine; the evidence route
  and two night-shift routes now use the existing bounded-tap `nudgePlayerY`
  before the east door, and the clean run passed.
- `npm run build` — exit 0; the built JavaScript contains no debug bridge or
  fixture names (grep of `dist/assets/*.js`).
- Frame rate, headless SwiftShader: ~17 fps with bloom, ~50 fps without;
  bloom is therefore skipped on software renderers and dropped at runtime
  below 45 fps. Captures use Chromium on Metal (ANGLE, Apple M2) with bloom.
- Scripted Food Court fight (`scripts/playtest-fight.mjs`): cleared the room
  at 5/6 HP with cash $30 → $36 from Mall Tokens in one run; the bot is crude
  and also lost a run, which is not a balance signal.

Tests changed on purpose (the old assertions described the replaced camera
and view, not gameplay): the scroll test now asserts the fixed-stage contract
(camera holds still while the janitor moves; aim stays correct after resize);
"presentation is null outside the opening" now asserts the opening view was
replaced; evidence captures pin the new 960x600 stage; the civilian-lane unit
test uses whole-room bounds; the wing-validation fixture point moved off the
new fountain collision.

Captures: `artifacts/neon-overhaul/` (1440x900 and 800x600 after-shots,
`before/` = the baseline's own evidence, `comparison.png` side by side).

## 2026-09-27 — production presentation vertical slice proof

Environment: macOS, Node 24.20.0, Playwright 1.63 Chromium desktop profile.
Port 5173 was already owned by another worktree, so initial browser verification
used `127.0.0.1:4176` and the correction pass used an isolated temporary
Playwright/Vite config on `127.0.0.1:4187`; the temporary config was removed
afterward. Screenshot tests use an author-level `!important` rule so Phaser's
delayed resize cannot replace the requested integer canvas size: 1280x720 (2x)
inside a 1440x900 viewport and 640x360 (1x) inside the 800x600 viewport.

### Automated results

- `python3 docs/art/tools/validate_runtime_tree.py public/assets/presentation --palette docs/art/palettes/deadmall-global.json` — PASS: 27 PNGs, binary alpha, all pixels within the 105-swatch shared palette.
- `npm run typecheck` — PASS after the correction pass. The original evidence harness had first exposed an optional CDP `objectId`; its explicit runtime guard remains in place.
- `npx vitest run tests/unit/projection.test.ts tests/unit/presentation-assets.test.ts tests/unit/presentation-depth.test.ts tests/unit/presentation-occlusion.test.ts tests/unit/presentation-actors.test.ts tests/unit/concourse-ambience.test.ts tests/unit/mvp-run-hud.test.ts` — PASS: 7 files, 43 tests. New coverage fixes the approved neon palette, cropped-frame foot origin, and all six potential civilian lanes inside the initial camera-safe region.
- `npx vitest run tests/unit/combat.test.ts tests/unit/movement.test.ts tests/unit/checkpoint.test.ts tests/unit/checkpoint-store.test.ts tests/unit/wing-generation.test.ts tests/unit/mvp-economy.test.ts tests/unit/boss.test.ts tests/integration/mvp-run.test.ts tests/integration/run-lifecycle.test.ts tests/integration/loadout-combat.test.ts` — PASS: 10 files, 151 tests. Seeded generation, stable `service_corridor` identity/order, checkpoint behavior, collision/movement, combat/boss rules, lifecycle, and loadout integration stayed green; only the already-approved room display name differs.
- `npm test` — PASS: 34 files, 513 tests.
- `npx playwright test --config=playwright.task8.config.ts tests/browser/presentation-evidence.spec.ts --workers=1` — PASS: 4/4. The busy capture proves exactly four unique rendered civilian IDs whose actual 32x48 cropped-frame bounds are fully contained in the current camera; it does not rely on total ambience count. The compact capture proves the HUD bottom is at or above the canvas top and the full room identity is unclipped.
- Ten restart/lifecycle cycles — PASS: one canvas, one HUD, one busy ambience group with 4 visible and 4 in-frame civilian sprites (`north-window`, `directory`, `fountain-west`, `fountain-east`), and exact repeated presentation counts: 31 static display objects, 13 static textures, 3 dynamic display objects, 16 scene display-list objects, 4 occluders, 0 fallbacks. Window, document, and canvas listener signatures were captured through Chromium CDP and remained byte-for-byte equal after leaving the concourse, returning through the supported restart flow, and completing ten restarts. The run is forward-only, so restart is the supported return to the opening flow.
- External-request assertion — PASS in all four evidence browser cases: every HTTP(S) request remained on `127.0.0.1`; zero external URLs were observed.
- `npx playwright test --config=playwright.task8.config.ts` — PASS: 57/57 with 4 workers in 1.9 minutes after focused correction. The former seed failure was a DOM-observation error: `.allInnerTexts()` returned four empty strings because the authored offers sit inside a collapsed `<details>`, while direct inspection proved the seed-specific text content differed. The test now reads trimmed `.allTextContents()`. The former resized-aim failure was one-frame projection skew: immediately after resize the canvas box had changed while `worldToCanvas` still reported `(622.5, 75)`, then stabilized at `(871.5, 105)`. The test waits for two consecutive stable projection/canvas samples and retains the strict normalized direction-cosine assertion `> 0.85`.
- Parallel stabilization also exposed `void-the-warranty.spec.ts › fused car is the sampled projectile origin`: the old test compared a shot's immutable origin with a later carrier position after the carrier continued steering during the projectile poll, so the `originToCarrier <= 48` check could fail under load even though the origin was correct. The correction moves the real pointer back to the carrier to stop that steering, samples carrier and player immediately before `mouse.down`, compares the shot to that pre-fire sample, tightens the allowance from 48 to 12 units, and retains `originToCarrier < originToPlayer`. The focused M4 spec and the final 57-case parallel suite pass; no fixture shortcut or simulation change was made.
- Round-2 first-combat diagnosis — the prior screenshot harness accepted either a Hanger `lungeCueVisible` or a renderer telegraph. Hangers deliberately have no authored telegraph phase, so the always-available pursuit streak won the poll before a Spitter reached its 36-tick windup. The old image therefore proved motion, not readable warning. The corrected test requires `kind === 'spitter'`, authoritative `phase === 'telegraph'`, a visible renderer telegraph with the same `enemy:<id>`, and a projected enemy center at least 48 CSS pixels inside every canvas edge before capture. The existing effect-band renderer then produced two large bright-yellow rings with long aim lines; no effect shape, AI, timing, radius, damage, collision, or simulation code changed.
- Round-2 verification — `npm run typecheck` PASS; focused `presentation-actors` plus `presentation-depth` PASS (2 files / 17 tests); the complete evidence harness PASS (4/4). The first four-worker full rerun passed 56/57 because `Opening Concourse civilians evacuate monotonically from real input and restart fresh` timed out on its east-door route under load; that unchanged case immediately passed in isolation. One idle-machine final rerun then passed 57/57 in 1.9 minutes. Both results are recorded because the transient full-run failure was real but unrelated to this screenshot-only correction.
- `npm run build` — PASS: 86 modules transformed; `dist/index.html` 13.71 kB (2.97 kB gzip), CSS 14.47 kB (3.36 kB gzip), JavaScript 1,604.47 kB (421.15 kB gzip), source map 11,792.28 kB. Vite retains the known warning that the JavaScript chunk exceeds 1,500 kB.

Production executable scan covered `dist/index.html`, `dist/assets/*.js`, and
`dist/assets/*.css`:

- `/Users/markrogers` — 0 hits.
- `__DEAD_MALL_DEBUG__` and `VITE_ENABLE_DEBUG_BRIDGE` — 0 hits.
- Exact quoted fixture literals `mvp-storefront`, `mvp-bench`,
  `mvp-boss-entry`, `mvp-boss-win`, `restart-proof`, and `death-proof` — 0 hits.
- `.aseprite`, `deadmall-art`, `docs/art`, and `artifacts/provenance` — 0 hits.
- Unexpected `.aseprite`, `.psd`, `.kra`, contact-sheet, or provenance files in
  `dist/` — 0 files.
- `http://` / `https://` — 4 strings, inspected as Phaser's attribution/default
  metadata and W3 SVG/XHTML namespace literals. They are not application request
  targets; the live request assertion above observed zero external requests.

### Screenshot evidence and native-scale visual review

- `artifacts/presentation-vertical-slice/opening-busy.png` — actual 1440x900 browser, canvas 1280x720 (2x), SHA-256 `83f0d1d88d96981b691fbfe0872d87fc4040e5bab8da096fdc682beac4227bba`. Native inspection shows the Janitor plus four distinct civilians (blue shopper, magenta clerk, security employee, orange shopper). The HUD is entirely above the canvas with the full room title. Cyan Video World signage, magenta Music Mart treatment, and paired cyan/magenta inlay borders are materially stronger; beige terrazzo is still the largest field, so the overall room is not uniformly neon-heavy.
- `artifacts/presentation-vertical-slice/opening-evacuation.png` — actual 1440x900 browser, canvas 1280x720 (2x), SHA-256 `7375e76208c4f53e9853d7526864797f7660454da12d1bcedcca5908614f26f8`, captured while authoritative presentation phase was `evacuating` and at least one unique cropped sprite remained fully in frame. The shifted camera shows civilians moving out through the authored scene. Warning/flicker treatment remains subtle in a still and does not by itself strongly communicate panic.
- `artifacts/presentation-vertical-slice/first-combat.png` — actual 1440x900 browser, canvas 1280x720 (2x), SHA-256 `b9896e450bd8a821e999b0b2b9ca81fa847dbc1f0684a90077d82ee3dc606160`. The harness captured only after finding an authoritative Spitter windup whose matching renderer cue projected with a 48-pixel in-canvas margin. Native inspection shows two large bright-yellow rings and long aim lines around the visible purple Spitters, clearly distinct from red projectile/damage squares and short Hanger movement streaks. The existing gray/olive Food Court background remains a vector graybox outside this opening-only art scope.
- `artifacts/presentation-vertical-slice/compact-800x600.png` — actual 800x600 browser, canvas 640x360 (1x), SHA-256 `52f812208fab618dc75caf8810ae3db4b625af6a12e83dc566287444623e9f22`. The HUD is entirely above the canvas, preserves the complete Opening Concourse identity, critical values, objective/context, actions and controls, and has no horizontal overflow. Native inspection shows the same four civilians plus the Janitor. The remaining black margin follows the requested native 1x canvas and beige terrazzo remains dominant.

### Acceptance status

This packet proves the local asset gate, M5 simulation preservation, disposable
opening presentation lifecycle, integer scaling, local-only requests, a clean
57-case Chromium gate, and a reproducible set of native-scale review images. It
does not constitute visual approval. Beige dominance, subtle evacuation warning
in a still, and the out-of-scope Food Court graybox remain visible.
WebKit, Safari, Windows, physical devices, physical-device performance, and
human feel remain untested. Broader room rollout is still closed.

## 2026-09-13 — M0 foundation

Environment: macOS, Node 24.20.0, npm 11.19.0, Playwright Chromium desktop profile.

Red proof:

- npm run test:browser -- tests/browser/startup.spec.ts — exit 1 as expected; the Start shift action existed but canvas was not found.
- After initial implementation, the same test failed because Phaser created the canvas while its parent was hidden. The shell now reveals the parent before constructing Phaser.

Green proof:

- npm run typecheck — exit 0.
- npm run build — exit 0; Vite 8.3.0 produced dist/.
- npm run test:browser -- tests/browser/startup.spec.ts — 1 passed in Chromium.

Not yet run: unit/integration tests (M1 simulation does not exist yet), WebKit, Safari/device coverage, full M1 browser scenarios, restart loop, or human feel playtest.

## 2026-09-13 — M1 combat room

Red proof:

- npm test -- tests/unit/movement.test.ts — exit 1 with normalized direction and fixed movement behavior absent.
- npm test -- tests/unit/combat.test.ts — exit 1 with eight expected behavior failures covering cone geometry, wall blocking, cooldown, contact damage, Spitter timing, projectile cleanup, and lethal ordering.
- npm run test:browser -- tests/browser/combat.spec.ts — exit 1 before the run HUD, real input adapter, and debug snapshot existed.
- npm run test:browser -- tests/browser/restart.spec.ts — exit 1 before terminal UI and restart wiring existed.

Final automated gate:

- npm run typecheck — exit 0.
- npm test — exit 0; 3 files and 19 tests passed.
- npm run test:browser — exit 0; 6 Chromium tests passed with 3 workers.
- npm run build — exit 0; Vite 8.3.0 created production output in dist/.
- rg -n "__DEAD_MALL_DEBUG__" dist -g "*.js" — no match; the development global is absent from production JavaScript.

Browser scenarios exercised the real Start shift button, canvas visibility, WASD movement, pointer-held mop input, Escape pause/resume, blur pause, input/backlog clearing, responsive canvas bounds, and ten UI-driven restarts with one canvas and one HUD.

Visual inspection:

- artifacts/m0-title.png — actual local title screen.
- artifacts/m1-combat-room.png — actual local combat room while the mop sweep is active.
- Direct Playwright observation at 1440 by 900 reported one canvas, one HUD, tick 25, an active mop cooldown/sweep, two live enemy types, no Vite overlay, no page/console errors, and no external requests.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or user feel/playtest. The graybox/vector art is not the production pixel-art pass.

## 2026-09-13 — M1 final review closure

Red proof:

- npm test -- --run tests/unit/combat.test.ts — the new simultaneous move/fire boundary test failed because movement incorrectly extended mop reach before attack acceptance.
- npx playwright test tests/browser/combat.spec.ts tests/browser/restart.spec.ts — three expected failures showed that scaled pointer targeting, a live restart encounter, and the loss/restart branch were not yet exercised.

Final automated gate after the fixes:

- npm run typecheck — exit 0.
- npm test — exit 0; 3 files and 20 tests passed.
- npm run test:browser — exit 0; 7 Chromium tests passed.
- npm run build — exit 0; Vite 8.3.0 created production output in dist/.
- rg scan of production JavaScript for the debug global and all three test-fixture names — no matches.

The browser suite now proves scaled canvas-to-world pointer mapping and directional damage, ten generations of defeating and restoring a live two-enemy encounter through real input, and the Shift ended/full-health restart branch. A scoped independent re-review found all five review findings addressed and no new breakage. A production preview smoke reported one canvas, one HUD, no debug bridge, no error overlay, and no page or console errors.

## 2026-09-13 — M2 interaction lab

Red proof was captured for the loadout compiler, status/event pipeline, projectile interactions, Wet-only conduction, direct Sticky ordering, transient projectile cleanup, and the two final visual-state regressions. The first Task 4 Playwright RED could not run inside the nested DeepSeek sandbox because localhost binding was blocked; the parent environment later ran the authored browser suite successfully.

Final automated gate from the milestone worktree at `848bd693876c23ecf5f10a320140d2b9c68be75c`:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 9 files and 123 tests passed.
- `npm run test:browser` — exit 0; 12 Chromium tests passed with 4 workers.
- `npm run build` — exit 0; 32 modules transformed and production output created in `dist/`.
- Production scan for `__DEAD_MALL_DEBUG__`, `VITE_ENABLE_DEBUG_BRIDGE`, `installDebugBridge`, and development fixture names outside source maps — no matches.

The browser suite proves the visible Interaction Lab launch, one canvas and one HUD, Soaker + Bath + Rewinder outbound/return/one-burst lifecycle through real pointer input, Mop + Rewinder limited applicability, real ownership/primary resets, generation changes, 800 by 600 usability, no horizontal overflow, and all seven M1 startup/combat/restart regressions.

Production preview inspection at 1440 by 1000 reported one canvas, one HUD, one Interaction Lab region, eight item cards, no framework error overlay, no page or console errors, and requests only to `http://127.0.0.1:4173`. The captured artifact is `artifacts/m2-interaction-lab.png`.

DeepSeek Flash performed the substantial M2 implementation through eight bridge calls including the initial read-only probe. One final visual-repair call returned a malformed completion envelope, but its exact three-file patch was inspected, all gates passed, and the parent recorded commit `848bd69`. The bridge's Sol-backed parent coordinated and reviewed those calls; it was not the implementation worker.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or human feel/playtest. The graybox/vector art is not the production pixel-art pass.

## 2026-09-13 — M3 shoplifting loop

Baseline:

- `npm test` before M3 — 9 files and 123 tests passed.
- Explicit 90-second read-only startup probes reached the exact clean M3 worktree through contributor Muse and DeepSeek with `network_access:false`; neither changed a file. An unqualified Muse probe remained on the standard model, confirming fail-closed contributor consent.

Red proof:

- Task 1 catalog and command tests failed because `src/sim/shop` did not exist; the completed foundation passed 60 focused tests and raised the full suite to 183 tests.
- Task 2 security/tick tests failed before deterministic sight and wing updates existed; the completed rule lane passed 9 focused loop tests and raised the full suite to 195 tests.
- The first host M3 browser run passed 7/11 and failed four real flows: single E purchase, single F theft, retained confiscation feedback, and single E mall exit. Queueing discrete E/F presses until the fixed tick consumes them and retaining authoritative trace feedback made all 11 pass.
- Final review's ordinal-ID test failed as expected: `nearestAvailableOffer()` returned `a_thing` instead of ordinal-first `a-thing` under `localeCompare()`. The implementation now uses explicit ordinal comparison.
- Final review's terminal browser test failed as expected because Escape changed a completed wing from `paused:false` to `paused:true`. `WingScene` now ignores pause/blur mutations outside `shopping` state.
- The authoritative confiscation wording test failed against the old presentation-dependent sentence. The command now publishes `Confiscated ...`, and the HUD renders the event verbatim.

Final automated gate from reviewed implementation checkpoint `32873ec58355f8e4ad512d29a7dfcdef098980f3`:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 13 files and 196 tests passed.
- `npx playwright test tests/browser/shoplifting-loop.spec.ts` — exit 0; 11 targeted Chromium tests passed.
- `npm run test:browser` — exit 0; 23 Chromium tests passed with 4 workers.
- `npm run build` — exit 0; Vite transformed 43 modules and created production output in `dist/`.
- `if rg -n '__DEAD_MALL_DEBUG__|VITE_ENABLE_DEBUG_BRIDGE|m3-buy-proof|m3-steal-proof|m3-caught-proof|m3-exit-proof' dist/assets --glob '*.js'; then exit 1; fi` — exit 0 with no matches.

The targeted browser suite proves launch, one canvas/HUD, two stores/eight offers, a real purchase, theft/Hidden/escape, confiscation and continuation, terminal summary and freeze, ten clean restarts, 800×600 reachability, pause/blur cleanup, return to title, and preserved M1/M2 launches. The full browser suite keeps every prior M1/M2 browser regression green.

Direct production inspection:

- 1440×900: real keyboard movement reached Extension Cord; E changed cash from `$30` to `$18`, changed inventory to `PURCHASED 1 · STOLEN 0`, and displayed the purchase event. One canvas, one HUD, eight offers, no horizontal overflow, no debug bridge, no page/console errors, and only `http://127.0.0.1:4173` requests.
- 800×600: document width stayed 800/800 with one canvas and eight offers. The HUD measured 486px client height and 796px scroll height; scrolling from 0 to 310 brought Restart and Return to title into the viewport. No page/console errors and only local-origin requests.
- Visual artifacts: `artifacts/m3-shoplifting-loop.png`, `artifacts/m3-shoplifting-loop-800x600.png`, and `artifacts/m3-shoplifting-loop-800x600-scrolled.png`.

Independent GPT review found two Important issues (terminal pause mutation and locale-sensitive tie-breaking); both were fixed with red-green proof. Its post-fix re-review found no Critical or Important issue. Minor remaining uncertainty is limited to the immutable-input expectation for custom injected item catalogs; production uses a deep-frozen catalog.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or human feel/playtest. Prices, sight timing, Heat escalation, and the buy-versus-steal choice still require hands-on evaluation. The graybox/vector art is not the production-art pass.

## 2026-09-13 — M4 void the warranty

Final automated gate from implementation checkpoint `cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` on branch `codex/m4-void-the-warranty` (branch start `10765d10fb4703ae8fe7bae34da24b8f173dfffa`):

- `npm run typecheck` — passed.
- `npm test` — passed; 18 files and 289 tests.
- `npx playwright test tests/browser/void-the-warranty.spec.ts` — passed; 7/7 Chromium tests.
- `npm run test:browser` — passed; 31/31 Chromium tests.
- `npm run build` — passed; Vite transformed 55 modules and emitted `dist/index.html` 9.81 kB (2.34 kB gzip), CSS 8.29 kB (2.27 kB gzip), and JavaScript 1,495.73 kB (390.82 kB gzip).
- `rg -n --glob '*.js' --glob '!*.map' "__DEAD_MALL_DEBUG__|VITE_ENABLE_DEBUG_BRIDGE|bench-doorway" dist` — no matches.
- `git diff --check` — passed.

Direct production inspection of the current `dist/`, served locally at `http://127.0.0.1:4174` because port 4173 was already occupied by an older unrelated preview and was left untouched (server stopped afterward):

- 1440x900: one canvas and one visible Bench HUD; body width 1440, scroll width 1440, so no horizontal overflow; production debug bridge absent; clean preview visible; HUD client height 786 and scroll height 1074; Clean soaker, Stolen popper, Unsupported mop, Confirm fusion, Cancel fusion, Acquire late pickup, Restart bench, and Return to title were all reachable; zero page errors, zero console errors, zero external-origin requests, and three local requests.
- 800x600: one canvas and one visible Bench HUD; body width 800, scroll width 800, so no horizontal overflow; production debug bridge absent; clean preview visible; HUD client height 486 and scroll height 1074; all scenario and transaction controls above remained reachable by scrolling; zero page errors, zero console errors, zero external-origin requests, and three local requests.
- Screenshots: `artifacts/m4-void-the-warranty.png` (1440x900, SHA-256 `9c615882c80f82b07f8872632758c05ec9a268d548a95e36e7f25e1ab815bd4a`) and `artifacts/m4-void-the-warranty-800x600.png` (800x600, SHA-256 `7f10a5f9efdf45252e6e6f08839da5ac160ba97318158ab889eedb7b8939ecbf`).

Independent review: contributor Muse reviewed the actual range `10765d10fb4703ae8fe7bae34da24b8f173dfffa..cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` read-only at `xhigh`. It reported no Critical or Important findings and approved Task 6 documentation. Non-blocking observations preserved: the first-tick projectile hold is intentional so a fresh projectile can be observed before movement; a doorway transition tick can consume held fire once in the destination, but the scene immediately clears input and prevents multi-step leakage; the development-only `bench-doorway` fixture temporarily teleports the player without the carrier, and the authoritative leash correction closes the transient gap; the protected M2/M3 catalog subset uses the first eight definitions with exact-order regression coverage; browser origin proof uses a 48-unit deterministic allowance plus a closer-to-car-than-player assertion.

Muse bridge health: the bridge originally accepted `reasoning_level: max` for contributor Muse even though that provider invocation exits before a turn begins. Minimal probes reproduced the zero-turn failure at `max` and succeeded at `xhigh`. A local bridge correction now advertises and accepts Muse levels through `xhigh` only, rejects `max` with a clear contract error, and leaves DeepSeek's `max` support unchanged. Host checks passed: 26/26 focused bridge tests, 191/191 full bridge tests, and `git diff --check`. The bridge repository was intentionally dirty before this work, so these changes remain unstaged and uncommitted. A fresh Work session is required to load the updated MCP schema.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or human feel/playtest. Fusion balance and bench feel still require hands-on evaluation. The graybox/vector art is not the production-art pass. Disk durability, production art, audio, and M5 behavior are not claimed.

## 2026-09-13 — M5 MVP run

Final automated gate from implementation checkpoint `c3a263b` on branch
`codex/m5-mvp` (branch start `ff2dcf5`, the M4 tip):

- `npm run typecheck` — passed.
- `npm test` — passed; 24 files and 431 tests.
- `npx playwright test tests/browser/night-shift.spec.ts` — passed; 11/11 Chromium tests.
- `npm run test:browser` — passed; 42/42 Chromium tests across all six modes. An earlier full run reported three load-related failures in the preserved M1/M3 specs while the machine was busy; those three specs passed 17/17 in isolation and the full suite then passed 42/42 on an idle machine, and the repair commit changed no M1-M4 simulation file.
- `npm run build` — passed; Vite emitted `dist/index.html` 12.48 kB (2.71 kB gzip), CSS 10.35 kB (2.49 kB gzip), and JavaScript 1,561.24 kB (408.46 kB gzip).
- `rg -n --glob '*.js' --glob '*.html' --glob '!*.map' "__DEAD_MALL_DEBUG__|VITE_ENABLE_DEBUG_BRIDGE|mvp-storefront|mvp-boss-entry|mvp-boss-win" dist` — no matches.

Direct production inspection of the current `dist/`, served locally at
`http://127.0.0.1:4176` after the repair round (server stopped afterward):

- 1440x900: one canvas and one visible run HUD, no other mode HUD visible, body width 1440 and scroll width 1440 so no horizontal overflow, production debug bridge absent, HUD client height 476 with no scroll needed, Restart run and Return to title reachable, zero page errors, zero console errors, zero external-origin requests.
- 800x600: one canvas and one visible run HUD, no other mode HUD visible, body width 800 and scroll width 800 so no horizontal overflow, production debug bridge absent, Restart run and Return to title reachable, zero page errors, zero console errors, zero external-origin requests.
- Screenshots: `artifacts/m5-mvp-run.png` (1440x900, SHA-256 `db21057a20c8c80896c2f93ebb5aedb810daabcb25873397cc46d46186e8e5d1`) and `artifacts/m5-mvp-run-800x600.png` (800x600, SHA-256 `a21ecae07a6130086477ff67122eb2ec52bfea77b68e7770f88eccefd83cc2b7`).

Browser acceptance exercised real keyboard and pointer input for: launching
Night Shift with one canvas and one HUD; identical offers for a repeated seed
and different offers across seeds; a real purchase spending cash and recording
purchased provenance; a real theft secured at the store exit raising Heat by 15;
Continue run resuming the saved seed and boundary; an invalid checkpoint
disabling Continue run without breaking startup; ten restarts keeping one canvas
and one HUD; the security office spawning the Loss Prevention Manager; a real
boss kill publishing the terminal summary and clearing the checkpoint, after
which Continue run is disabled; the sealed boss-room doorway reported to the
player; and the run HUD fitting 800x600 without horizontal overflow.

Independent cross-family review (both read-only, high reasoning) before the
repair round:

- Muse reviewed the wing, run, economy, and checkpoint modules and reported three
  Critical findings (theft banked without crossing the store exit, checkpoint
  cash divergence that refunded the fusion fee, and a crafted checkpoint that
  listed the boss room as cleared) and several Important findings (suspicion
  frozen for a theft carried out of its source store, a combat room's west
  doorway opening while enemies lived, a boss-room door opening for an unknown
  item id, checkpoint restore always entering from the west, and three
  under-asserted tests).
- DeepSeek reviewed the boss and presentation and reported one Critical finding
  (killing the boss did not win while its phase-3 Hangers lived) and Important
  findings (two phase-3 Hangers able to share one position, summon-once state
  lost across checkpoint retries, a failed checkpoint clear leaving Continue run
  enabled, missing browser acceptance coverage, and stale milestone docs) plus
  minor HUD and view inconsistencies.

All Critical and Important findings were repaired in `c3a263b` with a regression
test each, and the parent verified every fix marker, the full unit/integration
suite, the full Chromium suite, the production scan, and the production
inspection afterward. The once-per-encounter boss summon is recorded as an
explicit decision rather than a defect, because checkpoints deliberately exclude
room-local entity state.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device
performance, audio, and human feel/playtest. Wing pacing, store placement, boss
difficulty, and checkpoint cadence still require hands-on evaluation. The
graybox/vector art is not the production-art pass. Push, merge, publish, deploy,
and release are not claimed.

## 2026-09-19 — M5 in-run Bench Warrant fusion repair

Defect repaired. The M5 acceptance list claimed browser item 4, "the bench still
fuses in-run and the next attack uses the fused behavior". `src/sim/run/bench.ts`
did implement `previewRunEmitterMount` and `commitRunEmitterMount`, but its only
importer was `tests/unit/mvp-economy.test.ts`. No production file called it,
`src/game/ui/MvpRunHud.ts` had no bench panel, and
`tests/browser/night-shift.spec.ts` had no bench or fusion coverage. The player
path was `tickMvpRun.ts`'s `case 'bench'`, which only published the string "The
Bench Warrant kiosk is ready for Emitter Mount fusion." The same gap made
`rc_car` a $20 item with `effects: []` whose only use was unreachable, and made
`R RECALL` advertised by the HUD while `tickMvpRun` forwarded only
`{moveX, moveY, aimX, aimY, fire}` to `tickRun`, so recall was collected and
dropped.

Red proof:

- The pre-existing assertion `tests/integration/mvp-run.test.ts:418`
  (`expect(tryInteract(corridor).accepted).toBe(true)` at the kiosk) failed with
  `expected false to be true` once the kiosk stopped reporting success without a
  carrier. That failure is the observed red for the interaction contract change;
  the assertion was updated to require a readable refusal plus no opened preview,
  and a positive path is covered in `tests/unit/run-carrier.test.ts`.
- Every new behavior is new surface: the preview panel, the `carrier` and
  `preview` run fields, and the car itself did not exist, so
  `tests/unit/run-carrier.test.ts` and the two new browser tests could not have
  passed against the previous revision.

Not red-green: for the new `src/sim/carrier/car.ts` module the extraction was
written first and then verified behavior-preserving, rather than test-first. The
three bench adapters were checked against the unchanged 431-test baseline before
any new test was added, which is what establishes the extraction did not change
M4 behavior.

Green proof, from this working tree:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 25 files and 448 tests passed (431 before this change).
- `npx playwright test tests/browser/night-shift.spec.ts` — exit 0; 13 tests
  passed, including the two new ones.
- `npm run test:browser` — exit 0; 44 Chromium tests passed (42 before).
- `npm run build` — exit 0; Vite produced `dist/`.
- Production scan: `__DEAD_MALL_DEBUG__` 0 hits, `VITE_ENABLE_DEBUG_BRIDGE` 0
  hits, and 0 hits for every fixture literal including the new `mvp-bench`. The
  only `mvp-bench` matches in `dist/` are the legitimate `#mvp-bench-confirm` and
  `#mvp-bench-cancel` UI element IDs, which are production markup.
- Production preview smoke at 1440x900 on `localhost:4199`: one canvas, one
  visible HUD, the bench panel present and hidden, `CAR: none owned`, no debug
  bridge, body width 1440 equal to scroll width 1440, zero page errors, zero
  console errors, and only local-origin requests.

What the new coverage proves:

- Buying the car brings an independent companion into the run; it parks beside
  the player inside the leash and seeks and bumps a nearby enemy.
- Pressing E at the kiosk opens a real proposal that pauses the shift; cancel
  changes nothing and confirm charges the fee once, consumes both ingredients,
  and promotes the car to the firing origin.
- A commit against an inventory that changed after the preview is refused
  atomically, leaving cash and inventory untouched.
- After fusion a real browser mouse-down spawns shots closer to the car than to
  the player, and before fusion the same input spawns them at the player.
- Recall is refused with a readable reason before fusion and advertised by the
  HUD only after it, instead of being an advertised no-op.

Not run: WebKit, Safari, Windows browser/device, physical-device performance,
audio, and human feel/playtest. The car's steering and leash feel, the fusion
fee, and the preview's readability in motion still require hands-on evaluation.
Push, merge, publish, deploy, and release are not claimed.

## 2026-09-19 — M5 combat readability and slam telegraph repair

Two verified presentation defects repaired in `src/game/view/MvpRunView.ts`.

Defect 4 (projectile identity): `drawProjectile` painted every projectile with
the single hardcoded colour `0xff8d64`, so the player's water, the player's
physical shots, burst bubbles, and the Loss Prevention Manager's five-shot
phase-2 fan were visually identical. In a fan, a hit the player could not have
avoided looked exactly like their own fire. Enemy shots are now magenta squares,
water reads blue, physical reads bone, and a burst draws a wide translucent halo.
Wet and Sticky markers now render on enemies and the boss from the
`EnemyState.statuses` the central tick already maintains, so applied state is
visible on the target it was applied to.

Defect 5 (telegraph reach): the slam wind-up ring was drawn at
`enemy.radius + 10` (32 units for a radius-22 boss) while `BOSS_SLAM_REACH` is 44,
so the ring told players they were safe 12 units inside the actual hit. The ring
and its fill now use `BOSS_SLAM_REACH` itself.

Evidence:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 25 files and 448 tests passed, unchanged, as expected for
  a view-only change that adds no simulation behaviour.
- `npm run test:browser` — exit 0; 44 Chromium tests passed.
- `npm run build` — exit 0; production scan re-run with every pattern checked
  individually: `__DEAD_MALL_DEBUG__` 0, `VITE_ENABLE_DEBUG_BRIDGE` 0, and 0 for
  each fixture literal. The only `mvp-bench` matches in `dist/` are the
  production `#mvp-bench-confirm` and `#mvp-bench-cancel` element IDs.
- Deterministic pixel proof for defect 4: with the boss in phase 3 and a real
  five-shot volley in flight, a screenshot clipped around an enemy projectile was
  decoded from PNG and its pixels sampled. The fill sampled `rgb(255, 93, 122)`,
  exactly the new `0xff5d7a` enemy magenta, and the outline sampled
  `rgb(74, 18, 32)`, exactly the new `0x4a1220`. The old shared `0xff8d64` orange
  did not appear. This is a colour measurement, not an eyeball judgement.
- Visual inspection frames kept for a human: `artifacts/m5-readability-slam-
  telegraph.png` (captured during a real phase-1 telegraph at boss health 60) and
  `artifacts/m5-readability-enemy-volley.png` (captured with five real enemy
  projectiles in flight at boss health 16, phase 3). The parent could not view
  these images in its own session; they are recorded for the user's eyes.

Honest limits of this evidence:

- The view has no automated coverage in this repository. These fixes are proven by
  typecheck, an unchanged green suite, the pixel measurement above, and the two
  captured frames — not by an assertion that would fail if the colours were
  reverted. Adding pixel assertions would be the way to make this durable.
- The M5 run equips the Associate-Issue Mop, which is a melee arc and produces no
  player projectiles, so no M5 fixture pairs player fire with enemies. The player
  branch of `drawProjectile` is therefore verified by code inspection and by the
  M2/M4 modes that do fire projectiles, not by an M5 pixel sample.

Not run: WebKit, Safari, Windows browser/device, physical-device performance,
audio, and human feel/playtest.

## 2026-09-19 — independent review round on the repair commits

Two independent read-only reviewers were run in parallel over the change set:
Muse reviewed the simulation half and DeepSeek reviewed the presentation and test
half. Both returned findings; every one below was re-verified here by reading the
code or by running it, and the refuted ones are recorded as refuted.

Confirmed and repaired:

- **A refusal the sim never halts.** `tickMvpRun`'s opening guard was
  `if (state.paused)` only. `openRunFusionPreview` sets `paused = true`, but the
  scene's Escape handler toggles `paused` with no knowledge of previews, so
  Escape behind an open preview resumed live combat while the HUD still rendered
  `FUSION PREVIEW OPEN`. The guard is now `state.paused || state.preview !== null`.
  Red proof: the new test in `tests/unit/run-carrier.test.ts` ("halts the shift
  even when the pause is cleared from outside the sim") fails against the old
  guard and passes against the new one.
- **A teleport that left the car behind.** `confiscateRunThefts` moves the player
  to the store entrance without re-parking the car, unlike `enterDoorway`. The
  next tick's leash correction then covered the whole deficit in one `moveCircle`
  call, which only endpoint-checks and so can cross a wall rather than slide along
  it. `updateRunSuspicion` now reports whether this tick confiscated, and
  `tickMvpRun` re-parks on that signal. Red proof: with the `parkRunCarrier` call
  disabled, the new test fails with the car 146 units from where it belongs
  (`expected 356.7 to be close to 503`); with it enabled the test passes.
- **Advertised controls the sim would refuse.** The HUD printed
  `E PREVIEW FUSION` at the kiosk unconditionally, even with no carrier owned or
  with the melee mop selected, and the refusal was never published, so the RECENT
  line kept showing an unrelated older event. A new `canOpenRunFusionPreview`
  gates the prompt, and edge-triggered interaction refusals (buy, steal, kiosk,
  recall) now publish their reason instead of failing silently.
- **A refused Confirm that did nothing visible.** A stale proposal was rejected
  without any feedback while the panel sat there with an enabled button.
  `confirmRunFusionPreview` now publishes the refusal, and the Confirm button is
  disabled whenever the run is not playing.
- **The HUD swallowed pointer input.** `.mvp-run-hud` had no `pointer-events`
  rule, so it defaulted to `auto` and consumed aim and fire across its footprint —
  which covers the janitor's spawn area. It now follows the existing `.run-hud`
  pattern: `pointer-events: none` on the panel, `auto` on its action rows. Trade
  accepted: wheel-scrolling the panel is no longer possible; it is documented in
  DECISIONS.md.
- **A projection that proved less than it claimed.** The firing-origin browser
  assertion compared each shot's *current* position, which a fast shot travelling
  away from its true origin can satisfy, and it did not filter to player shots.
  The run debug snapshot now exposes `originX`/`originY` from the shot's recorded
  path — the same field the M4 bench snapshot already exposes — and the test
  asserts against the origin and additionally that the origin is more than 50
  units from the player.
- Three one-line hardenings: `commitRunEmitterMount` now promotes the car like the
  preview path does; `parkRunCarrier` resets `bumpCooldownTicks` so a room-local
  cooldown does not follow the car into a rebuilt room; and `carrierModeForInventory`
  branches on `recipeId === 'emitter_mount'` rather than merely on node kind.

Refuted:

- **"The `selectCarTarget` tie-break changed and may flip an M4 golden test."**
  Refuted by diffing the pre-extraction file: `git show 348cfeb:src/sim/bench/car.ts`
  contains the identical `(distance === bestDistance && enemy.id < best.id)` clause.
  The extraction did not change target selection. The reviewer correctly said it
  could not check this without a shell.

Deferred, and recorded rather than fixed:

- Checkpoint validation accepts hand-crafted saves that live play cannot produce:
  inventory leaves are not cross-checked against `offerStatus`, `clearedRoomIds`
  may name rooms ahead of `roomIndex`, and `nextCompositeId` may collide with a
  composite and transaction already present (which would brick future fusion on
  that restored run). These require editing `localStorage` by hand; they are real
  defects worth fixing and are left as known issues rather than silently ignored.

Gate after the review repairs: `npm run typecheck` exit 0; `npm test` exit 0 with
25 files and 452 tests passed (448 before this round); `npm run test:browser` exit
0 with 44 Chromium tests passed; `npm run build` exit 0 and `dist/` regenerated;
production scan 0 hits for the debug bridge, the debug flag, and every fixture
literal including the quoted `mvp-bench`.

Not run: WebKit, Safari, Windows browser/device, physical-device performance,
audio, and human feel/playtest.

## 2026-09-19 — room-clear recovery

Balance change chosen by the user. Six health across two combat rooms and a
sixty-health Loss Prevention Manager made a chipped shift arithmetically
unwinnable, and a run chipped down at a checkpoint retried from behind. Clearing
a room that authored enemy spawns now restores 2 health, capped at 6
(`ROOM_CLEAR_HEAL` in `src/sim/run/rooms.ts`).

Evidence:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 26 files and 456 tests passed (452 before).
- New `tests/unit/run-health.test.ts` covers four directions: a cleared fight
  heals 2, healing never exceeds the authored maximum, a cleared room heals
  exactly once, and the enemy-free safe rooms (the service corridor and the first
  storefront) heal nothing.
- `npm run test:browser` — exit 0; 44 Chromium tests passed, unchanged.

The gate this change needed: `evaluateRoomClear` runs for any room with no living
enemies, and the safe rooms are enemy-free the moment they are entered, so an
ungated heal would have been a free +2 per doorway rather than per fight. The
heal is therefore gated on `currentRoom(state).enemySpawns.length > 0`, and the
safe-room test is written specifically to catch that mistake.

Honest note on method: the negative direction was reasoned rather than observed.
Attempting to run the suite against a deliberately weakened gate was refused by
the tooling's own classifier as a test-removal pattern, which is a reasonable
guardrail, and it was not worked around. The gate was reverted immediately and
the suite re-run green. Both directions are pinned by assertions, but only the
positive direction was watched turning from red to green.

## 2026-09-19 — synthesized sound layer

Night Shift now has sound. There are no audio assets: every cue is a short
oscillator envelope in `src/game/audio/engine.ts`, with one generated noise
buffer for the noisy cues. The white noise uses a small deterministic LCG rather
than `Math.random`, so the module has no unseeded randomness anywhere.

What decides the sounds is a pure function, `deriveAudioCues` in
`src/game/audio/cues.ts`, which reads the fields the simulation already
maintains — health, the attack window, the enemy roster, boss phase and volley
telegraph, the event counters, cash, carried thefts, Heat, cleared rooms, and the
checkpoint — and reports the cues one tick produced, loudest first. Audio stays
out of `src/sim`, and the cue decision is never made by matching rendered text.

Cues: swing, shot, splash, hit, hurt, heal, purchase, theft, confiscation,
conduction, enemy_down, boss_telegraph, boss_volley, boss_phase, checkpoint,
room_clear, pa_chime, won, died.

Evidence:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 27 files and 469 tests passed (456 before), including 13
  new cases in `tests/unit/audio-cues.test.ts` that exercise the cue table with no
  AudioContext at all.
- `npx playwright test tests/browser/night-shift.spec.ts` — exit 0; 14 tests
  passed, including a new one that clicks the canvas, proves the engine's context
  was actually created, toggles mute by button and by the M key, and fires in
  combat with sound live.
- `npm run test:browser` — exit 0; 45 Chromium tests passed (44 before).
- `npm run build` — exit 0; `dist/` regenerated and inspected. Production scan: 0
  hits for the debug bridge, the debug flag, and fixture literals. `AudioContext`
  appears in the bundle because it is production code. No new external URL was
  introduced: the only absolute URLs in the bundle are Phaser's XML namespace
  strings and its own attribution link, both pre-existing and neither a request.
- Web Audio only starts from a genuine user gesture. The test had to click the
  canvas *after* launch, because the unlock listener is attached when the scene is
  created, which happens in response to the very click that starts the run.

A bug this test found: the keyboard shortcut was wired to the wrong callback, so
pressing M resumed the audio context instead of toggling mute. The test asserted
the button label rather than only the engine state, which is what caught it, and
both entry points now route through one method.

Scope, stated plainly: only the M5 Night Shift run has sound. **Start shift** (M1),
**Interaction Lab** (M2), **Shoplifting Loop** (M3), and **Void the Warranty**
(M4) are still silent. `deriveAudioCues` reads run state and is mode-agnostic, so
those are wiring work rather than new design. The PA announcement is a two-tone
chime, not speech; spoken lines would need assets or SpeechSynthesis.

Not run: WebKit, Safari, Windows browser/device, physical-device performance, and
human feel/playtest. Actual audio quality has never been heard by a human — the
tests prove the cue table, the mute path, and that nothing throws, not that the
sounds are any good.

The sound test asserts more than "audio did not crash": the engine exposes a
count of cues actually scheduled as voices, and the test swings for real and
requires that count to rise. A created AudioContext only proves the layer exists;
the counter proves the engine acted on a cue.

Observed intermittent failure, recorded rather than hidden: one full
`npm run test:browser` run failed
`void-the-warranty.spec.ts:139 › fused car is the sampled projectile origin`,
which is an M4 test unrelated to this change. It passes 7/7 when that spec is run
alone and the full suite passed 45/45 on the next run. Nothing in the sound layer
runs in the M4 bench scene, and the M4 debug bridge was not modified, so it was
correctly recorded rather than attributed to sound. Task 8 later diagnosed the
test defect: it compared an immutable projectile origin with a carrier position
sampled after the carrier had kept moving. The current proof samples immediately
before firing, tightens the allowance from 48 to 12 units, and passes in the
57-case parallel gate; see the 2026-09-27 section above.
