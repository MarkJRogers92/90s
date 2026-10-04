# Next session

## 2026-10-04 UTC — Bargain Hunter hurt strip drawn with GPT image (handoff)

Branch `claude/pixel-forge-image-generation-go3b0z`, committed locally, **not pushed** (AGENTS.md:
no push without the owner's say-so). Presentation only; no `src/sim` change.

**Done.** `public/assets/neon/enemies/shopper-hurt.png` is now a drawn strip, built from
`art/enemy-reactions/shopper-hurt/` (see its README). `tests/unit/shopper-hurt-art.test.ts` pins it
(new `tests/support/png.ts` decodes sprite pixels for tests).

**Still needs a person:**
- Look at every facing next to the walk sheet, in motion. Items are in the art README.
- **Seeing the flinch live was not achieved.** A mop hit lands during the hunter's own telegraph,
  charge or recover, and an attack pose outranks a flinch by design (`flinchOutranksAttack`), so
  the live capture showed `shopper-attack[...]` frames, not `shopper-hurt[...]`. The flinch only
  shows while it walks (`pursue`), which at mop range is a gap of a few ticks. A ranged weapon from
  a distance, or a fixture that holds the hunter in `pursue`, would show it. Kiting with the bot
  died before a swing landed. The unit tests cover the flinch path against the real PNG.

**Next:** the Spitter's and the bosses' derived hurt strips (`docs/PIXELLAB_HANDOFF.md` §2). To
generate with GPT again: `bash tools/pixel-forge/scripts/cloud-gpt-setup.sh setup`, then `login` (the
owner enters the code; the sign-in is not saved between sessions), then follow the field notes and quick
start in `tools/pixel-forge/docs/CODEX_NATIVE_BRIDGE.md`. A job allows 3 follow-ups. Keep
`auth.openai.com` and `chatgpt.com` in the cloud environment's allowed domains.

## 2026-10-04 UTC — Native hurt reactions for every enemy (roadmap V1 done)

Branch `feat/hurt-reactions`. Presentation only; no `src/sim` change, no balance change.

**What changed.** Every enemy kind now flinches in its own 4-frame hurt strip and chips its own
material instead of blood.
- **Hurt strips:**
  - PixelLab (8 facings): the Walker, Elf, Spritzer, Poodle, Goon, Mascot and Roofer. The
    Roofer was new this round and cost 16; 16 generations are left.
  - Derived from the walk art: the Bargain Hunter, the Spitter (from its idle) and all eight
    bosses. Bosses flinch over 2/2/2/1 ticks.
- **Impact strips:** each kind has a 6 × 48 px strip in its own material: sweat, coupons, foam,
  tar, goo, glitter, mist, fur, ice, paper, tinsel and so on.
- **Build:** `art/enemy-reactions/materials/build_material_reactions.py` builds all 34 PNGs. It
  erases the effects PixelLab painted in: the Walker's north-row burst (re-posed from frame 0),
  the Spritzer's sparks, swirl and falling bottles, and the Mascot's spark.
- **Code:**
  - `EnemyReactionView.ts` holds one `NATIVE` table. Scale and feet are computed the way
    `syncActorSprite` computes them.
  - `CombatFeedback` makes one impact view per material, on its first hit.
  - A flinch interrupts the attack pose only for the contact biters (Hanger, Walker), and for a
    boss in its follow-through. A boss's slam, volley and charge telegraphs, and every other
    wind-up, keep priority (`flinchOutranksAttack`, tested). Deaths are unchanged.
- **`scripts/live-capture.mjs --attack`** now records any enemy's frames, not only the Hanger's.
  An in-page sampler reports every hurt frame drawn (`hurtFramesSeen`), because a boss's 7-tick
  flinch is shorter than one polling round trip.

**Evidence:**
- `tests/unit/material-reactions.test.ts` covers 17 kinds × 4 checks against the real PNGs. It
  failed first (69 failures), then passed.
- Two older tests expected a Spitter hit to bleed. They now assert the V1 contract: no blood,
  and a flash when the art is missing.
- Unit 1,920 of 1,920; `tsc` passes.
- **Live** (`artifacts/live-qa/hurt/`, 0 console errors on every page):
  - **Hurt frames drawn after a real hit:** Mascot, Roofer, Elf, Poodle, Spitter, Spritzer and
    Zamboni (`zamboni-hurt[0]`, `[2]`).
  - **Wind-up kept priority:** the Manager's single hit landed during its wind-up.
  - **No hit landed:** the capture bot landed none on the Walker, Bargain Hunter or Goon. These
    kinds run the same code path, and the unit tests cover them against their real PNGs.

## 2026-10-04 UTC — District monster attack sheets + banked hurt strips (PixelLab)

Branch `feat/district-attacks`. Presentation only; no `src/sim` change, no balance change.

**Shipped.** `poodle-attack.png`, `elf-attack.png` and `goon-attack.png` (6 frames × 8 facings,
PixelLab v3 from the game's own characters) are registered as `neon:enemy:<kind>-attack`, so
the attack wind-ups (roadmap V2) are now complete for every enemy that has one.
- **Goon:** it fires from its telegraph straight back into `pursue` with the shot cadence
  reloaded, so `attackFrameFor` never reached its release frames. It now plays them for 14
  ticks after the puck leaves.

**Banked, not wired:** hurt strips (V1) for the Walker, Elf, Spritzer, Poodle, Goon and Mascot,
in `art/pixellab/*-hurt.png`.
- Some have effects painted into frames, which need erasing (listed in the handoff).
- Each still needs the V1 code.

**Handoff:** `docs/PIXELLAB_HANDOFF.md` lists what is left, the commands, the measured costs
and the gotchas. 32 PixelLab generations are left.

**Evidence:**
- The registration test failed first, then passed.
- The Goon release test (`combat-beats.test.ts`) failed first, then passed.
- Unit 1,850 of 1,850; `tsc` passes.
- Live (`artifacts/live-qa/district-attacks/`, 0 console errors in each):
  - Poodle: `poodle-attack[0..5]`, with release frames 4–5 during the dash.
  - Elf: `elf-attack[0..5]`, with frames 2–5 in the air.
  - Goon: wind-up 0–3, then follow-through 4–5.
- `scripts/live-capture-actions.mjs` now covers the elf (floor 1, `back_hall`), poodle and goon,
  and records frames after the telegraph.

## 2026-10-04 UTC — Bargain Hunter shoulder-charge sheet (review-candidate art; owner asked to merge)

Branch `feat/bargain-hunter-attack`. Presentation only; no `src/sim` change.

`public/assets/neon/enemies/shopper-attack.png` (768×1024: 8 facings × 6 frames at 128 px, the
96 px walk figure padded by 16) is registered as `neon:enemy:shopper-attack`. `enemySpriteSheet`
already named this key, so the Bargain Hunter now plays it: wind-up frames 0–3 over its 34-tick
warning, release frames 4–5 alternating every 4 ticks during the charge (PR #59).

**Art provenance** (full report: branch `pixel-forge-rig`, `bargain-hunter-finish/REVIEW.md`, which
rebuilds the sheet byte-identically): the GPT pilot rows with the wind-up shoes planted (frame 0
copied); WEST from Pixel Forge rig v3; NW and SE fixed so the bag stays in the anatomical-left
hand (the pilot switched hands mid-animation). Every frame sits on floor row 111; source palette
only; binary alpha.

**Still needs a person:** the S, SW, N, NE and E arms, torso and trouser shading are unchanged pilot
art and need a drawing pass. The SE far-arm depth and the NW near-arm reading are subtle.

**Also:**
- `art/pixellab/check_sheet.py`: the `--frames` value is no longer mistaken for a path.
- New dev fixture `mvp-floor-two-hunter`: one Bargain Hunter in the Cinema Lobby.
- `scripts/live-capture-actions.mjs` covers the Bargain Hunter.

**Evidence:**
- The registration test (`derived-action-sheets.test.ts`) failed first, then passed.
- Unit 1,849 of 1,849; `tsc` passes.
- `check_sheet.py` puts the feet height at 0 px from the walk sheet in every row.
- Live (`artifacts/live-qa/bargain-hunter/`): the telegraph plays `shopper-attack[0..5]` and the
  charge shows release frames (WEST row: `[2,0]`, `[2,3]`, `[2,5]`), with 0 console errors.

## 2026-10-04 UTC — Charging enemies keep their attack pose during the charge

Branch `fix/charge-attack-frames`. Presentation only; no `src/sim` change.

**Bug (found by the Pixel Forge handoff review):** after the warning, a charge runs as phase
`pursue` with `chargeTicks > 0`. `attackFrameFor` only handled the warning and recovery, so the
Bargain Hunter, Mascot, Poodle and the boss charges (Owner, Whiskers, Zamboni) were drawn with
their **walk** sheet mid-lunge.

**Fix:** while `chargeTicks > 0`, `attackFrameFor` steps between the release frames every
`CHARGE_STRIDE_TICKS` (4). The Elf's hop keeps its lob timing (its wind-up is checked first).
The debug snapshot now reports `chargeTicks` per enemy, and `scripts/live-capture-actions.mjs`
records the frames shown during the charge separately (`charge` in its report).

**Evidence:** tests in `derived-action-sheets.test.ts` failed first (`[null, null, null, null]`),
then pass. Unit 1,849 of 1,849; tsc and build pass; browser night-shift:355, 636, 753 and
break-room:84 pass 4/4. Live, Mascot charge frames: before the fix `mascot-walk[0,1,2,5]`, after
`mascot-attack[4]`, 0 errors (`artifacts/live-qa/charge/`). Boss charges start in phase 2, which
the capture does not reach; the unit test covers them.

## Animation work for an image-generation agent (start here)

`docs/ANIMATION_HANDOFF.md` has the full brief: what to draw (attack wind-ups for the
Bargain Hunter, Poodle, Elf and Goon; then hurt reactions), the exact sheet format,
shipped PixelLab examples, and the check-and-install steps
(`art/pixellab/check_sheet.py`).

## 2026-10-03 UTC — PixelLab boss attack wind-ups (V2 bosses) — DONE (HANDOFF)

Branch `feat/boss-attack-sheets` (PR #56 merged; this is the follow-up). Presentation only;
no `src/sim` change, so the balance bot cannot move. **All seven bosses are done.**

**Goal:** a 6-frame PixelLab attack sheet for each boss, played over its telegraph
(wind-up frames 0–3) and the slam/charge/barrage release (frames 4–5), exactly as the
LP Manager's sheet already does. `enemySpriteSheet` already names the keys
(`neon:enemy:<prefix>-attack`); each sheet only needs registering in `NEON_ASSETS`.

| Boss | PixelLab character | Sheet | State |
|---|---|---|---|
| Mall Owner (floor 3) | `ae2fc5eb` | `owner-attack.png` 1032×1376 (172 px) | **done, live-checked** (frames 0–3 in telegraph, 0 errors) |
| Manager (floor 2) | `1daf7771` (mall manager v2) | `manager-attack.png` 768×1024 (128 px) | **done, live-checked** (south row redone; frames 0–3, 0 errors) |
| Developer (floor 4) | `e3e0c843` | `developer-attack.png` 1488×1984 (248 px) | **done, live-checked** (frames 0–3, 0 errors). The PixelLab character itself is navy (the cream walk came from an older template), so every v3 animation is navy: `art/pixellab/recolor.py developer-attack` maps the suit onto the walk sheet's cream ramp. `ACTION_FIGURE_SCALE` 0.88 |
| Santa (holiday district) | `51e6a5de` | `santa-attack.png` 1296×1728 (216 px) | **done, live-checked** (frames 0–3, 0 errors). All 8 facings redone with the dark red sack pinned; the PixelLab character itself carries a flat black sack facing SW and E, so `recolor.py santa-attack` fills and shades that sack from the walk sheet's reds (boots and belt untouched). Scale 0.86 |
| Glamour Queen | `a1821931` | `glamour-queen-attack.png` 1296×1728 (216 px, size matches) | **done, live-checked** (frames 0–3, 0 errors) |
| Mr Whiskers | `aaf35aa7` (feral A, the shipped one) | `whiskers-attack.png` 960×1280 (160 px) | **done, live-checked** (frames 0–3, 0 errors); scale 0.95 |
| Zamboni Driver | `721b6f96` | `zamboni-attack.png` 1248×1664 (208 px, size matches) | **done, live-checked** (frames 0–3, 0 errors); S, NW, N, SE redone because the scraper changed shape (a barbell, a pick) — the action text now describes the pole |

**Code (done, tested):** `attackFrameFor` no longer reads a boss's airborne tar buckets
(Developer/Santa barrage `lob` wind-ups) as its own throw, which would have looped the
attack sheet while it walked (`derived-action-sheets.test.ts`, failed first).

**Also new (code, tested first):** `ACTION_FIGURE_SCALE` in `ActorSpriteView.ts` draws an
attack sheet smaller when PixelLab re-rendered the figure larger than its walk sheet
(160–180 px bosses come back ~1.1–1.2x); the sprite is anchored at the feet, so they stay
put. `collect` now warns about size or colour drift and prints the factor.
`art/pixellab/recolor.py` fixes colours the PixelLab *character itself* has wrong (a redo
cannot: v3 animation follows the character's rotations, not the action text).

**Evidence:** unit 1,846 of 1,846 (179 files); `tsc` and `npm run build` pass; browser
batch (night-shift:355, break-room:84, presentation-evidence) 6/6; the seven boss
browser tests (night-shift:636, 653, 726, 753, 768, 788, 803) 7/7. Live: every boss plays
`<prefix>-attack[0..3]` in its telegraph with 0 console errors
(`artifacts/live-qa/bosses/`). The seven sheets add 2.3 MB. PixelLab: 416 → 114
generations (redos included).

**To add or redo a boss** (all in `art/pixellab/animate_characters.py`):
1. `python3 art/pixellab/animate_characters.py topup <name>` until 8 directions are queued.
2. `python3 art/pixellab/animate_characters.py collect <name>` (waits out HTTP 423), then
   look at `art/pixellab/<name>.png`; `redo <name> <direction>` for any drifted row.
3. `python3 art/pixellab/animate_characters.py publish <name>` (lossless copy into `public/`).
4. Add `neon('neon:enemy:<prefix>-attack', 'enemies/<prefix>-attack.png')` under the
   Owner's line in `src/game/presentation/assets.ts`, and its size to the registration
   test in `tests/unit/derived-action-sheets.test.ts`.
5. Live: `CHROME=/opt/pw-browsers/chromium node scripts/live-capture-actions.mjs --only <kind> --out artifacts/live-qa/bosses`
   with the debug dev server on 4180; expect `<prefix>-attack[0..3]` and 0 errors.

**Cost:** 3 generations per direction at 128 px, about 4–5 at 160–180 px.
**Not done:** the LP Manager already had an attack sheet; the Spitter, Static, Bargain
Hunter, Elf, Poodle and Goon still use the procedural squash (V2 non-bosses).

## 2026-10-03 UTC — PixelLab animations: Alex aim + dash, Spritzer/Mascot/Roofer attacks (HANDOFF)

Branch `feat/attack-windups-alex-dash`, PR #56 (merged). Presentation only;
no `src/sim` change.

**Done.** These were made by animating the game's *original* PixelLab
characters through the PixelLab v2 API, so identity, palette and scale match
the existing sheets:

| Sheet | Character id | Frames |
|---|---|---|
| `alex-aim.png` | 943aa1b2 | 4 |
| `alex-dash.png` | 943aa1b2 | 4 |
| `mascot-attack.png` | 2370b80c | 6 |
| `spritzer-attack.png` | cd520aac | 6 |
| `roofer-attack.png` | d6eb1ca9 | 6 |

All are 8 facings.

- **Aim:** a new body sheet that plays while a ranged weapon fires. The held
  gun moves out to the outstretched hand (`AIM_POSE_REACH`). It yields to
  death, hurt and the dash.
- **Dash:** draws along the dash direction, not the aim.
- **Attacks:** the charge and lob wind-ups now drive attack frames
  (`attackFrameFor`, `WINDUP_RELEASE_AT`).
- **Redos:** three drifted directions were regenerated (Alex's aim NW, the
  Spritzer NE, the Roofer W).
- **Re-registration:** every sheet is re-registered so each facing's
  rest-frame feet and centre match its walk sheet (zero px error). Without
  it, the Roofer floated about 15 px up when attacking.
- **Derived pass removed:** `art/derived-poses` is gone, so nothing
  overwrites the PixelLab art.
- **Spend:** 68 of 500 subscription generations; 432 remain. The earlier
  Retro Diffusion trial was $0.18.

**How to redo or extend (needs `PIXELLAB_API_KEY`):**

    python3 art/pixellab/animate_characters.py submit [names]   # queue (waits out 429)
    python3 art/pixellab/animate_characters.py topup            # API drops directions past free job slots; queue the rest
    python3 art/pixellab/animate_characters.py redo <name> <direction> ...
    python3 art/pixellab/animate_characters.py collect [names]  # pack from the character ZIP export + re-register feet

Then copy `art/pixellab/<name>.png` into `public/assets/neon/...`.

Network notes:
- `backblaze.pixellab.ai` (the frame CDN) is blocked here, which is why
  frames come from `GET /v2/characters/{id}/zip` on `api.pixellab.ai`.
- `GET /v2/balance` shows the generation allowance.
- `GET /v2/characters` lists every character id. The Bargain Hunter, Poodle,
  Elf, Goon and the bosses are all there for the next wind-ups.

**Verified:**
- Unit: 1,844 of 1,844 across 179 files. TypeScript passes.
- Tests: `alex-aim.test.ts` and `derived-action-sheets.test.ts` (sheet
  sizes, priority, dash row).
- Feet registration was measured per facing.

**Mascot redo (done, commit d05d6f9):** all 8 directions regenerated with a deep
crouch then a full shoulder-first lunge (`ANIMATIONS` in `art/pixellab/animate_characters.py`).
Registration error 0 on every row; 792×1056 unchanged. Live in `mvp-floor-three-brute`:
the telegraph plays `mascot-attack[0]`…`[5]`, 0 console errors. Full unit suite 1,844 of 1,844 after the redo; build passes.
PixelLab balance afterwards: 416 of 2,000 generations.

**Verified live (scripts/live-capture-actions.mjs, `artifacts/live-qa/pixellab/`):**
Spritzer frames 0–5 and Roofer 0–4 during telegraphs, Mascot 0–5, Alex dash row 6 while
dashing east and aiming north-west, aim row 6 aiming east and row 2 aiming west. Build
passes; the browser batch (night-shift:355, break-room:84, presentation-evidence) passes 6/6.

**Remaining:** merge PR #56 when the owner says so.

## 2026-10-03 UTC — Enemy wind-up sheets (V2) and Alex's dash (V4)

Presentation only; no `src/sim` change, so the balance bot cannot move.

- **Wind-ups:** the Spritzer, Mascot Brute and Roofer have 6-frame attack
  sheets: four frames of anticipation (lean away, crouch) and two of release
  (lunge along the facing). They are derived from each walk sheet by
  `art/derived-poses/build_poses.py`.
- **`attackFrameFor` fix:** charge and lob wind-ups now drive attack frames.
  Before, only spit and slam did, so these kinds could never have used a
  sheet.
- **Dash:** Alex has a 4-frame, 8-facing dash (lean in, stretch plus smear,
  fade, recover) that replaces the procedural stretch. It draws along the
  dash direction, not the aim; live QA caught the first version leaning
  toward the mouse.
- **Debug bridge:** the renderer evidence now lists every enemy's displayed
  sheet and frame (`actorPresentation.enemies`).
- **Generation spend:** Retro Diffusion was tried once ($0.18, about $3.50
  left). The pose was good, but scale and palette drifted, so derived art
  was used.
- **Still open:** Alex's aim pose (needs new art), more wind-up kinds, and
  the bosses. The wind-up glow tint still dominates late in a telegraph;
  easing it is a design call.

Evidence:
- Unit: 1,840 of 1,840 across 178 files. TypeScript and build pass, and the
  240 replays match.
- Browser: the actor-presentation, Sneakers-dash and presentation-evidence
  specs pass (6/6).
- New `derived-action-sheets.test.ts` (7 tests) failed first. The dash-row
  test reproduced the live bug (`northwest`, not `east`) before its fix.
- Live:
  - all 6 frames of each attack sheet were displayed during real telegraphs;
  - dashes east, west and south drew rows 6, 2 and 0 while aiming top-left;
  - zero console errors.

  See `artifacts/live-qa/windups/`.

## 2026-10-03 UTC — Spray weapons (V3) and elite trait marks (V10)

Presentation only; no `src/sim` change. Built on main `235bca9`, which
includes #54's back-hall lighting.

- **Sprays:** hairspray, flea spray, ketchup and the whoopee cushion fire
  palette swaps of the extinguisher foam (lilac with gold, green, red with
  mustard, a sickly puff with pink). They are derived by
  `art/weapon-effects/derived/build_spray_variants.py`, sized to each
  weapon's own hitbox, with matching nozzle releases. Dev fixture
  `?fixture=mvp-spray`. The roster is down to 49 (31 melee, 18 projectile).
- **Elite marks:** each trait now has a glyph beside its tag and its own ring
  shape. Clearance is a price tag and a solid ring; Swift a `>>` chevron and
  a turning dashed ring (still under Flashes: Reduced); Volatile a lit fuse
  and a double ring. They are distinct in greyscale, which answers the
  round-57 question of whether you can tell Swift from Volatile at a glance.
  A pooled tag now also follows a trait change. Dev fixture
  `?fixture=mvp-elites`.

Evidence:
- Unit: 1,833 of 1,833 across 177 files.
- The 240 fixed-seed weapon replays match.
- TypeScript and build pass.
- New tests failed first, then passed: `spray-weapon-effects.test.ts` (5)
  and `elite-marks.test.ts` (4).
- Live, with zero console errors: all five sprays mid-shot
  (`artifacts/live-qa/spray/spray-in-flight.png`), and the three elites side
  by side in colour and greyscale (`artifacts/live-qa/elites/elite-marks.png`).

## 2026-10-03 UTC — Water weapons get their own water (roadmap V3)

Presentation only; no `src/sim` change.
- The Super Soaker 50 and CPS fire the authored soaker sheet.
- The garden hose, soda gun and watering can fire exact palette swaps of it:
  tap blue, cola brown with cream fizz, and a pale shower. The swaps are
  derived by `art/weapon-effects/derived/build_water_variants.py`, so there
  was no generation spend.
- Water balloons lob as their own wobbling icon, using the thrown-icon path.
- Muzzle releases use each weapon's own water.
- New dev fixture `?fixture=mvp-water`.
- The remaining-effect roster is down to 53 (31 melee, 22 projectile).

Six existing tests used the garden hose as their example of a weapon *without*
native art. They now use still-unsupported shooters (staple gun, gumball
launcher), keeping their intent, plus a positive check that a hose-rooted
fusion keeps the hose's water.

Evidence:
- Unit: 1,805 of 1,805 across 173 files.
- The 240 fixed-seed weapon replays match.
- TypeScript and build pass.
- New `water-weapon-effects.test.ts` (5 tests) failed first, then passed.
- Live: all six weapons were captured mid-shot with zero console errors
  (`artifacts/live-qa/water/water-in-flight.png`).

## 2026-10-03 UTC — Browser suite fixes, live QA sweep, thrown-weapon icons

Owner's ask: roadmap items B1/B2, V0 and V3 (thrown). Presentation and tests
only; no `src/sim` change.

**B1/B2, the two browser specs that also failed on main:**
- B1: the Bench Warrant car-shot spec read Party Popper shots after releasing
  the button, by which time the few-tick confetti had expired. It now reads
  them while the button is held, with the same origin assertion.
- B2: the prop-room walk takes about 2.7 minutes in overshoot-safe pulses, so
  its budget went from 90 s to 240 s.
- Both pass alone; before, both failed on `main`.

**V0, the live sweep.** `scripts/live-qa-sweep.mjs` captures in one run:
- the arsenal's 9 weapons mid-attack;
- the 10-weapon dense dock;
- the five-star wanted strip (reads whole);
- Static hits on Floor 2;
- the stage and menu at 390×844, 1920×1080 and 3440×1440.

It found no new defects, and every page logged zero console errors
(`artifacts/live-qa/sweep/`). A "headless Alex" in small crops turned out to
be the food-court spotlight; the renderer reports his full idle frame.
Portrait phones draw the stage at 0.4×, so landscape is the supported phone
orientation.

**V3 thrown:**
- Dodgeball, football, pog slammer, laserdisc, jawbreaker, squeaky toy,
  garden gnome and hockey puck now fly as their own inventory icon instead of
  a coloured blob. Spinners roll the way they travel; the football flies
  point-first with a wobble. Modified hitboxes grow the icon gently
  (0.75–1.5×), and fusions throw the shooter inside them. A missing icon
  falls back to the old procedural shot.
- New dev fixture `?fixture=mvp-thrown` (slots 2-9).
- `remaining-effect-roster.json` drops the eight (59 left), and a test keeps
  the roster honest.

Evidence:
- Unit: 1,800 of 1,800 across 172 files. TypeScript and build pass.
- The 240 fixed-seed weapon replays still match the baseline.
- New `thrown-weapon-effects.test.ts` (6 tests) failed first, then passed.
- Live, 7 of 8 thrown icons were captured mid-flight
  (`artifacts/live-qa/thrown/thrown-in-flight.png`). The pog spray had
  expired before capture, so it is covered by unit tests only.

## 2026-10-03 UTC — Hanger native reactions, live visual QA, visual roadmap

**First live browser QA in a cloud session.** The pre-installed Chromium works
when pointed at explicitly. `scripts/live-capture.mjs` launches Night Shift on
a fixture, screenshots it, walks to and hits enemies, and logs the renderer's
own texture/frame evidence per hit. `playwright.config.ts` honours
`PW_CHROMIUM_PATH`, so the existing browser suite runs here too.

**Found live and fixed (F1):** the Menu/Fullscreen toolbar was centred at the
top and covered the in-canvas PA ticker on most desktop windows. It now sits in
the free top-right corner, 28 px tall for mouse users. Touch and small screens
keep 44 px targets in their own rail.

**Found by the browser suite and fixed (F2):** the stage sat right of centre
on every window wider than 16:10 (32 px at 1280×720, 284 px on an ultrawide).
The base `place-items: center` re-centred the canvas on top of Phaser's own
margins. `viewport-layout.spec.ts` caught it; it had never been run before.

**Hanger native reactions (roadmap V1):**
- A 4-frame × 8-facing hurt strip and a 6-frame chitin-shell impact. Both are
  *derived* from the Hanger's own walk sheet by a committed script
  (`art/enemy-reactions/hanger/`): exact palette, no generation spend.
- Hits chip the shell instead of spraying blood, and its death splat is
  shell-blue ichor.
- Live capture showed the Hanger is almost always in its contact-bite loop
  when hit. It has no timed wind-up in the sim, so for the Hanger only a
  flinch outranks that pose (`hurtOutranksAttack`); its reach ring still draws.
  Mannequin and Static telegraphs keep priority.
- `MATERIAL_REACTIONS` in `EnemyReactionView.ts` is now one table, so the next
  enemy is a table row plus art. No `src/sim` change.

**Roadmap:** `docs/VISUAL_ROADMAP.md` lists 12 presentation items (V0–V11) with
status, files, contracts, tests and acceptance criteria, for any agent to
pick up. It is linked from AGENTS.md, ROADMAP.md and here.

Evidence:
- Full browser suite, run serially in this container for the first time:
  93 of 100 passed. Of the 7 failures:
  - two were load flakes that pass when re-run;
  - three were the F2 centring/fullscreen specs. They now pass (the whole
    viewport spec is 11/11). The fullscreen spec needed a 60 s budget for
    its two full cycles.
  - two fail identically on `main` (B1 Bench car shots, B2 prop-room walk)
    and are recorded in the roadmap.
- Unit: 1,793 of 1,794 passed across 171 files. The one failure was the
  documented `hybrid-fusion` 5 s timeout (5.25 s), which passes alone and
  now has a 20 s budget.
- New tests:
  - `hanger-reactions.test.ts` (9);
  - toolbar and centring guards in `viewport-layout.test.ts`;
  - three desktop toolbar browser cases.
- TypeScript and the production build pass (existing large-bundle warning).
Live: in four Hanger hits over two seeds the renderer reported `hanger-hurt`
frames, and every page logged zero console errors (`artifacts/live-qa/`).

## 2026-10-03 UTC — Review follow-up: wanted strip no longer truncates (branch `fix/wanted-strip-wrap-2026-10-03`)

Review of PRs #47–#49 found the HUD's wanted strip (round 57) mangled by the
mall-directory HUD: it wrapped with `wrapLogText`, which collapsed the
double-space clause separators and ended long lines in "...", so four/five-star
lines lost "NEXT * IN n" or "HOLD YOUR STARS". `wantedRows` now packs whole
clauses (joined by " / ", up to three rows of 32 characters) and `wantedPanel`
sizes the panel upward from its fixed baseline; the shop offer card follows
the panel's top edge. No simulation, art or gameplay change.

Evidence: new `tests/unit/wanted-line-layout.test.ts` failed first
(`wantedRows is not a function`), then passed. TypeScript passes. The adjacent
HUD/wanted set (6 files, 87 tests) passes. The full suite was last run before
this fix on main b4db9ba: 1,779 of 1,780 pass; the one failure was a 5 s
timeout in `balance-danger.test.ts` (7.7 s under load) that passes in
isolation with a 30 s timeout. The production build, browser suite and
`npm run balance` were not run (nothing balance-related changed). Live visual
QA of the strip at four/five stars is still outstanding.

Also in this change: `balance-danger.test.ts` now has a 30 s timeout (it
passes alone in ~13 s; it hit the 5 s default under load). Reviewed and left
alone on purpose: the run menu freezing end-card cinematics while open (they
are time-driven and resume on close, so it reads as a modal pause), and the
uncapped `ensurePixelLabel` cache (labels are a few KB each, and evicting one
a one-shot image still holds risks a blank sprite). NEXT_SESSION's "Start
here" section now names the real tip of `origin/main`.

## 2026-10-03 UTC — Mall-directory HUD (integration)

The approved in-canvas HUD now uses quiet directory panels, pale tabs and
receipt-style feedback. It shows all supported 2–6 heart capacities, keeps
numbered weapons separate from always-on passives, and labels FUSED/HOT
weapons. Fused weapons without authored blurbs show their actual component
names. Attack readiness is the player's shared timer; dash has its own
active/recovery state. Neither changes gameplay or invents per-slot timers.

The fixed dock handles nine weapons plus twelve passives without widening
into its neighbours. Larger weapon collections follow the selected weapon
in a nine-card window; excess passives use an honest count. The existing
selection controls, Tab disclosure, lower-player fading and overlay timing
remain. Shop cards avoid the wanted strip and dense dock. Corner chips leave
the PA lane clear, and reduced flashes suppress portrait hit-flashing.

Verification: 1,780 tests across 169 files, TypeScript and production build
pass. The 76 focused HUD checks include 720 complete run-state comparisons.
All 240 fixed-seed weapon replays match baseline. All 96 simulation files and
411 runtime assets are byte-identical to main d5e78984. Source review approved
both fixes found during review and the final clarity refinements.

Eight source-hash-verified, command-recorded offline previews cover ordinary,
crowded, fused, hot, shop, boss, reduced-flash/low-health and overflow states.
These are not live gameplay screenshots. Live browser compositing, native
interaction, animation and world-occlusion validation remain outstanding;
the previously recorded cloud-localhost restriction was not bypassed. This integration preserves all unrelated files from main d5e78984.
The earlier notes below describe their original review checkpoints.

## 2026-10-03 UTC — Combined enemy, loot and viewport integration

This change integrates the reviewed mannequin and Static/CRT reactions, loot
presentation, and viewport/fullscreen/menu polish described below. Editable
Aseprite and Forge sources are in art/enemy-reactions. Earlier unpublished
notes describe review checkpoints. Final verification: 1,722 tests in 166 files,
typecheck, build, and 240 unchanged gameplay traces. Live browser/fullscreen
visual QA remains outstanding; no simulation changes are included.

## 2026-10-03 UTC — Static/CRT native material reactions (cloud review, unpublished)

Static now uses an authored four-frame, eight-facing hurt strip (3/3/4/4 ticks),
a seven-frame, eight-facing death strip (4 ticks/frame), and a bounded six-frame
casing/glass impact (2 ticks/frame). The 96 px canvas still displays at 72 px;
the feet anchor is (48, 80.64). Hurt and death keep the last displayed facing.
Health/removal differences do not establish an incoming attack-source direction.

Localized CRT debris replaces Static blood, generic rings and full-body hit
flash while native hurt is available. The separate death ring is suppressed.
Blink/attack poses and exact teleport landing warnings keep priority. Reduced
flashes retain the material art; missing/malformed art falls back safely without
substituting an unrelated texture. Repeated hits restart the visual flinch;
room/restart/rewind/destroy and reused renderer slots clear stale material state.
All corpses retain the original 70-tick hold including the 24-tick fade.

Verification: 1,722 tests in 166 files pass serially, including 55 new Static
checks; the focused mannequin/Static set has 86 passes. TypeScript and the
production build pass. All 240 fixed-seed weapon gameplay traces match baseline.
All 96 simulation files, all five mannequin PNGs, and loot/UI implementation
are byte-identical to the recovered combined baseline. Existing npm proxy and
large-bundle warnings remain. Independent source review approved after the
reused-kind feedback/ring defects were fixed and retested. Final native art
hashes match the independently reviewed freeze. See diagnostics/static-reactions.

Live browser visual QA remains unverified under the already recorded cloud
localhost restriction. Art inspection and renderer unit checks do not replace
that gate. No Mac/OBS access, push, merge, publication or simulation edits were
performed. Integrate only the scoped manifest; never replace main wholesale.


## 2026-10-03 UTC — Viewport/menu polish (cloud review, unpublished)

Preserves the combined mannequin + loot baseline and the complete 960×600
Night Shift stage. Phaser now owns centering alone, with a dynamic-height
viewport shell, compact Menu/Fullscreen controls, and unboxed static margins.
Narrow/coarse screens and contextual store/bench controls reserve safe,
content-sized rails. The menu retains existing actions, pause ownership and
accessible focus; fullscreen targets the whole app so Settings stays included.
No world, camera/FOV, simulation, enemy, loot or artwork changes in this slice.

Verification: 1,667 tests in 161 files pass serially; 39 focused UI tests pass;
typecheck, production build and 240 unchanged weapon gameplay traces pass.
All 96 simulation files, art and public assets match the combined baseline.
Eight new browser cases discover successfully but have NOT been executed.
Independent source review approved after context-rail, modal and input fixes.

Live browser geometry, native fullscreen and touch QA remain outstanding.
Cloud localhost access is already blocked; a network-free synthetic-document
CLI render also could not launch Chromium (local socket operation denied).
No restriction bypass, Mac access, push, merge or deployment occurred.
The supplied before/after images are explicitly offline geometry schematics,
not gameplay screenshots. Use scoped patches, never replace a full checkout.

## 2026-10-03 UTC — Combined mannequin and loot review (cloud, unpublished)

The reviewed mannequin reaction/art pass and loot presentation pass are combined
in a separate scoped review copy against main 11b0c68c134615295b308563cda1f31a51b32b6a.
The only overlap reconciliation was preserving both MvpRunView import additions
and both sets of checkpoint notes. No new behavior was added during integration.
The individually delivered patches and preview packages remain unchanged.

Final combined verification: 1,628 tests in 158 files pass serially; TypeScript
and the production build pass; all 240 fixed-seed weapon gameplay traces match
the unchanged baseline. The suite includes the loot renderer's 720 full-state
comparisons. All 96 src/sim files remain byte-identical to the baseline. Runtime
asset differences are limited to the three intended mannequin reaction sheets.

Apply the cumulative scoped patch, not both individual patches on top of it.
Preserve all unrelated repository content: the portable baseline copy does not
contain every historical document/artifact and must never replace main wholesale.
Live browser visual QA remains outstanding under the previously recorded cloud
localhost navigation restriction. No Mac, tunnel, push, merge or deployment was
used for this combined verification. Existing npm proxy/bundle warnings remain.

## 2026-10-03 UTC — Loot interaction presentation (cloud review, unpublished)

Floor coins, pretzels and item icons now settle to stable native-friendly sizes.
A hollow diamond marks existing rare drops; one nearby name/value label explains
automatic pickup, full-health pretzels and a dropped weapon waiting for step-off.
Inspection yields to combat and existing contextual interactions. Missing item
art uses an unknown-item glyph rather than impersonating currency.

A bounded receipt queue acknowledges actual collection success messages, with
per-fixed-step observation of the existing rolling trace, duplicate protection,
room/restart/rewind cleanup, and presentation-time expiry on frozen victories.
No pickup eligibility, drops, prices, item values, inventory or prop rules changed.
All 503 simulation and runtime-asset files remain byte-identical to main 11b0c68.

Verification: 1,600 tests / 154 files pass serially; typecheck and build pass;
240 fixed-seed weapon traces match the baseline; 720 complete run-state
comparisons match with the loot renderer active. Twenty-five new tests cover
capped traces, rapid/same-tick pickups, boss and ordinary wins, pause, cleanup,
missing art, Shop-Vac depth, waiting snacks and reduced motion. Independent
review approved after its lifecycle findings were fixed and retested.

Offline command-recorded before/after visual proof is supplied separately.
Live cloud-browser verification is outstanding: localhost returned
ERR_BLOCKED_BY_CLIENT. No Mac access, runtime art generation, push, merge or
deployment occurred. This is a scoped patch against verified main 11b0c68;
the portable source snapshot must not replace unrelated repository artifacts.


## 2026-10-03 UTC — Mannequin reaction handoff

The isolated renderer slice is verified by 1,603 serial tests, TypeScript,
production build and 240 identical fixed-seed gameplay traces. Runtime uses
four hurt frames at 3/3/4/4 ticks, seven death frames at 4 ticks/frame with the
existing hold/fade, and six plastic-chip frames at 2 ticks/frame. Direction
comes from the last displayed enemy facing, not an inferred attacker.

Still required before claiming live visual approval: inspect the mannequin
in the actual Night Shift back hall at normal scale. Verify hurt/recovery,
repeated hits, death, pause, room transition, reduced flashes and chip scale
under the room lighting. The cloud browser's local Vite navigation was
blocked by ERR_BLOCKED_BY_CLIENT; no runtime visual pass is claimed.

The separate authored motion proof does not replace this live gate. No Mac
access, push, merge or deployment is authorized by this checkpoint. Preserve
all unrelated weapon, loot and simulation files when applying the scoped
patch to main 11b0c68c134615295b308563cda1f31a51b32b6a.

## 2026-10-03 UTC — Cumulative weapon presentation integration

This change integrates the two reviewed weapon-effect passes below: 13 native
animations / 60 frames, grip metadata for all 80 roots, and the focused cutter
size correction. Editable Aseprite and Forge sources are in art/weapon-effects.
The earlier unpublished notes describe the review checkpoints, not this PR.
Live gameplay visual QA remains outstanding. No simulation or inventory-icon
changes are included; 67 roots retain prior effect art.

## 2026-10-03 UTC — Five more native weapon effects (cloud review, unpublished)

Second pass adds broom bristles, box-cutter glints, paper confetti, a paper
bottle rocket with wooden guide stick/exhaust, and fine extinguisher foam.
The cumulative native set is 13 animations / 60 frames. The box cutter alone
now uses a believable 20px held-size override, including fused variants. All
other held sizes and the first eight native animations remain unchanged.

Final verification: 1,575 tests in 152 files pass serially; typecheck and
production build pass; 240 fixed-seed gameplay traces match the original
baseline. Native Forge/Aseprite roundtrips pass. Simulation and inventory
icons are unchanged. Missing-texture, fusion, muzzle reuse, swap, death and
room cleanup regressions are covered.

This cumulative source includes incremental and original-main patch options.
Offline exact-transform/light/dark previews are supplied; the live browser
gate remains outstanding because local-server navigation is blocked. No Mac
access, generation spending, push, merge or deployment occurred.

Still using prior effect art: 31 melee and 36 projectile weapons. See
diagnostics/weapon-visuals/remaining-effect-roster.json for exact IDs.


## 2026-10-03 UTC — Weapon visual first slice (cloud review, unpublished)

Authored grip/head/barrel metadata now covers all 80 primary weapons, including
root/nested fusion inheritance and upright gun orientation. Eight native Forge
animations (34 frames) cover mop/golden mop, pump soaker, foam ball, nail, VHS,
vinyl and CD. Other attacks retain existing vector fallback; this is not an
all 80-effect replacement. Weapon-swap/death lifecycle regressions are fixed.

Final verification: 1511 tests in 151 files pass with one worker, TypeScript and
production build pass, and240 fixed-seed traces (80 weapons × 3 seeds × 420 steps)
match the pre-change baseline exactly. Earlier parallel runs hit the existing
5-second hybrid-fusion/balance-danger timeouts; timeout settings are unchanged.
Simulation and inventory art are unchanged. Independent review is approved.

Art/source previews are offline exact-transform composites. Live browser
verification is outstanding: the cloud browser refused the local server with
ERR_BLOCKED_BY_CLIENT. No Mac access, push, merge or deployment occurred.
Baseline main: 8c30b488fa502df2021e34fc86fb912959ff6c68.


## Main contains the verified three-prop integration (2026-10-02)

The owner approved merge and push. Main now contains feature `3e2833a`
via merge `9a647f9`, with the test checkpoint corrections and fresh captures.
Merged-tree types, 1,329 tests and build pass; the identical feature tree
passed 11 browser checks including the clear monitor recapture.

Continue from main. The bounded rollout covers the six named food shops and
ground-floor Security Office only. The test fixture is still available:
`?fixture=mvp-prop-test&seed=1`, Night Shift, WASD, mouse/click, R.
The preserved isolated server is http://127.0.0.1:4194/; alternatively run
`node scripts/serve-prop-test.mjs` from a checkout without that port occupied.

No further implementation is queued by this task. Human feel and other
browsers/devices remain review items. The completion handoff records the
published remote SHA and CI status. Untracked 2026-10-02 art is preserved and
was excluded from the commits. No deployment was requested or performed.

## Local verification completed; sync test repairs back to cloud (2026-10-02)

The approved cloud integration is applied only in the isolated worktree on
`codex/three-prop-test-room`. Main is untouched. The review server remains on
port 4194, and a playable `?fixture=mvp-prop-test&seed=1` tab is open.

Sync `tests/browser/roomBoundaryCheckpoint.ts`,
`tests/unit/browser-room-boundary.test.ts`, the updated normal-room browser
spec and this verification evidence back to the cloud source. The new helper
builds valid Continue checkpoints by recording prior fights as cleared; it
does not modify live gameplay. The monitor screenshot is captured before pause.
The supplied local verification patch is against the delivered cloud ZIP.

Fresh results: 1,329 tests, types/build, 5/5 standard normal/fixture browser
checks, 5/5 adjacent hero/restart checks and the clear monitor recapture pass.
The earlier fixture navigation timeout has now passed twice locally under the
standard configuration. No game behavior repair, merge, push or deployment
was added locally. See TEST_EVIDENCE.md and the fresh screenshots.

## Verify normal-room three-prop rollout (2026-10-02)

Cloud continuation is prepared against the exact three-prop source snapshot,
not clean main. Read docs/neon-overhaul/three-prop-rollout/README.md and the new
TEST_EVIDENCE.md entry first. The portable patch is only for a matching source
snapshot; compare its changed-file before hashes and preserve newer work.
Nothing was applied to the original machine or published.

Unit/types/build checks pass; the remaining gate is real browser verification.
Run prop-test-room, normal-room-props, hero-props and restart specs with the
standard Playwright configuration, then the full browser suite. Confirm the
bakery at (280,335) clears the existing mustard, the slush at (680,335) leaves
the center aisle open, and the Security monitor at (550,60) is correctly
oriented even after a left-moving cart in the preceding room. Check intact and
damaged native registration, one-shot effects, south/north collision, exiting
and reentering shops, checkpoint recovery and non-food rooms. The supplied
normal-route tests use real input after an ordinary saved checkpoint.

No new screenshots exist yet. Images in artifacts/prop-test-room/ belong to
the earlier fixture and are not evidence of the normal-room rollout. The cloud
browser launch restrictions and exact rerun commands are in the rollout README.
Do not call the browser timeout fixed until a permitted browser run passes.

## Three-prop test room ready for owner review (2026-10-02)

The isolated worktree is
`/Users/markrogers/Documents/Codex/2026-10-02/task-3/dead-mall`, branch
`codex/three-prop-test-room`, based on `c9b84f6`. Start with
`node scripts/serve-prop-test.mjs`, then open
http://127.0.0.1:4194/?fixture=mvp-prop-test&seed=1 and choose **Night Shift**.
WASD moves, mouse aims, click swings the real mop, R or RESTART RUN resets.
The east door and return doorway provide a fresh reentry through the normal
transition code. Native sizes: bakery 64x48, monitors 56x56, slush 40x56;
all anchors are bottom-center, all three damaged states keep their solid base.

Review scale against the janitor, the shallow base collision, behind-prop
visibility, and glass/chip/soda impact readability. This is a visual destruction
probe: no enemy damage, loot or slush puddle behavior was added. The standard
Night Shift HUD is retained. Only the three approved test props are wired;
normal rooms and the original untracked 2026-10-02 art archive are untouched.
No push, merge or deployment was performed. See TEST_EVIDENCE.md for checks,
including the load-related timeout resolved by running the full unit suite
with four workers and using a file-watch-free browser QA session.

## Start here (updated 2026-10-03)

`origin/main` is at the mall-directory HUD merge (`b4db9ba`, PR #49), after
PRs #47 (weapon effects) and #48 (enemy reactions, loot, viewport) and the wanted-strip fix
that followed them; none of those touch `src/sim`. Round 57 (merge `4cf40da`) is the last
gameplay round: a bot playtester, the staff
passage, the coach, the daily rule, elite traits, the seed card and wanted
clarity, on top of round 56's floor-exclusive stores and leaner economy (rounds
54 and 55 are in it too). Round 57 was built as nine commits (a refactor, one
per feature, then docs) on `claude/balance-bot-and-routes`, merged with a merge
commit, and pushed. On the owner's Mac the repo is `~/code/90s`; make
sure the checkout is on `main` (or a branch off it) before playing, since an
old Codex branch shows the pre-neon game. Other sessions merge to `main` too
(a cloud session landed rounds 54-56 while this worktree still held round 54 as
uncommitted changes), so `git fetch` and compare before merging.

**The biggest open item is still a human playtest** (now rounds 50-57; the
questions below). Before you tune anything, run `npm run balance` (about two
minutes; see the playbook's Round 57) so a change can be judged against the
bot's baseline in [`docs/neon-overhaul/balance/`](docs/neon-overhaul/balance/round57-baseline.md).
Then switch on recording in the title screen's Playtest stats panel, play a
night or two, press Copy, and tune from the log, as round 45 did.

Read [`docs/neon-overhaul/README.md`](docs/neon-overhaul/README.md) first. It
is the playbook: architecture, art pipeline, and a section per round with its
tuning knobs.

    npm install
    VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort

Open http://127.0.0.1:4180 and choose **Night Shift** (or **Daily Shift**). If
port 5173 is taken by another worktree, run the browser gate with
`PW_PORT=4191 npx playwright test`.

Last gate (round 39, the Roof): see TEST_EVIDENCE.md round 39.

## Next up

Round 57's bot leads, after a better bot checked them twice (see the playbook's
"expert bot" and `docs/neon-overhaul/balance/round57-expert.md`): the Owner's
Suite, the "hard" Helipad, Glamour Row's perfume and the Roofers' tar all looked
like hot spots to the first bots and were each the bot failing to see something.
A bot that sees every hazard wins 95% of nights and loses under a heart in any
wing. So no wing needs tuning on the bot's say-so; what matters is how much time
each hazard gives a person, and a reaction-delay sweep now measures it
(`docs/neon-overhaul/balance/round57-reaction.md`, `npm run balance:reaction`): the
Perfume Spritzer's spritz and the Volatile fuse are the tightest (a player who
walks must react inside 0.2 s; with a dash, 0.4 s and 0.5 s), the Bargain Hunter is
0.4 s either way, and the Mascot Brute and the Roofer are comfortable (0.5-0.8 s).
The Owner is the one fight a pure reaction does not beat (the bot dies to him at
0.3-0.4 s; it never learns his rhythm, a player does). Candidate change, measured
but NOT made: lengthen the Spritzer's wind-up from 30 to 42 ticks and a walker's
allowance doubles to 0.4 s. A longer fuse is not worth it (48 ticks and a bot that
never reacts is never hit). For a human: does the Spritzer feel unfair, and does
the Owner feel like a push-over once you know his rhythm?
The Volatile burst (round 57) cost the bots 0.7-0.8 health a Floor 1 wing until
the expert learned to read the ring: a fair 0.6 s fuse for someone watching it,
a real tax for someone who is not. Playtest question: do you see it in time?

Round 56 halved the change monsters drop and put a $45 rare in every upstairs
floor store. Playtest: do you still buy upstairs? Are you short of a weapon on
Floor 1 now (the $30 float is unchanged)? Do you save for the rare?

Round 55 added floor-exclusive stores (floors 2-4) with Retro Diffusion shopfronts
and a twist each (see the playbook's Round 55). Playtest: do floors
2-4 now feel different to shop in? Is hocking half a heart for $6 ever worth it?
Is the cold snap fair, the rod's zap readable?

Round 39 (Floor 4, the Roof) is done; see STATUS.md and the playbook's
Round 39 section, which says how to add another floor.

Rounds 33-37 finished the owner's list (art pass, fusion spectacle, store
twists, sell and drop, reduced flashing). What is left:

1. ~~Icon redos~~ (done, round 38). Look at them in play at 1x; redo any that still
   do not read.
2. Playtest rounds 32-37 (questions below) and tune.
2b. ~~Browser gate flake~~ (fixed, round 41).

## Owner's queue (asked for next, 2026-10-01)

Round 48 did 1-3 below; round 49 grew the Break Room (item 4) to 11 perks,
10 locker weapons and a vending machine.

The queue as asked:

1. **First-wing back-wall signs.** First wings reuse the floor's signs
   (Floor 2's Lockdown still says MANAGEMENT). Give each `firstWingNames`
   room its own sign text.
2. **More signature pairs.** Pairs now land (3 signatures, every hint
   `tookBoth` in the 2026-10-01 night); widen the pool so each night has a
   new one to chase. See `src/sim/fusion/hybrid.ts` SIGNATURE_*.
3. **A new Floor 1-2 enemy: the Mall Walker.** Walks a fixed patrol loop and
   only fights when bumped or hit. Adds variety to the early floors, not
   difficulty. Needs PixelLab art (8-dir walk + death).
4. **Unlocks screen.** Spend pay stubs on a starting perk or loadout for the
   next night, so every night counts toward something.

## From the 2026-10-01 playtest (outside the Continue fix)

- Combat balance is unverified (tool-driven input was too slow to judge).
- Palms hiding the janitor and the `districts.test.ts` timeout: fixed in
  round 54.

## Round 57 playtest questions

- The staff passage (STAFF ONLY hatch on a safe concourse, about half of wings):
  did you find it, and did you take it? Did the star it costs (`SHORTCUT_HEAT`)
  feel fair? The bot says it is a wash; a human may use it better (skip a
  light fight at full health) or worse.
- The coach: did the tips come when they were useful, or get in the way? Is two
  shifts the right length (`COACH_SHIFTS`)? Settings has an off switch.
- The wanted strip above the portrait: does it tell you what the stars cost
  and when the next one comes? Is it too much text?
- Elite traits: can you tell Swift from Volatile at a glance? Is the Volatile
  fuse (0.6 s, 76 px) fair, and does it make you fight differently?
- The Daily Shift's rule: is one a day a good challenge? Which rule is the
  most fun, which the most annoying (Glass Janitor, No Breaks, Inflation,
  Short Fuse)?
- COPY CARD on the end card: would you paste it to someone?

## Round 54 playtest questions (props, the rack)

- Palms, pillars, the fountain: do they now fade enough to see the janitor,
  or too much? (`OCCLUSION_MIN_ALPHA` is 0.3.) Monsters behind a prop still
  hide; should a prop fade for them too?
- The fallen rack: does it read as a rack lying down, and does it block you
  where it looks like it does? Falls toward or away from the camera still use
  the old turned-over sprite and have not been looked at on screen.
- Arcade cabinets: decided 2026-10-02, the owner keeps the current glowing
  cabinets (`props/arcade-cabinet-anim.png`). The Forge candidates in
  `~/Desktop/art/finals/` are not used.

## Round 53 playtest questions (hero fusions, props)

- Did you build a hero on purpose? Which move felt best, which weakest?
- Comedy Hour: is the chicken's pull (260) and burst (8) worth the slot?
- Movie Night: is a beam every 1.5 s too often, too rare?
- Props: did you use them, or walk past? Is the soda puddle + shock combo
  findable? Does a fallen rack ever get in your own way?
- The back room: did you find the machine? Is 20 seconds of waves worth a
  rare item, or too risky with low health (there is no way out early)?

## Outside review backlog (GPT, 2026-10-01; proposals, not approved)

Round 52 fixed its three bugs. Its design ideas, in its order, and where they stand:
1. ~~An optional guided first shift~~ (round 57: the coach).
2. ~~Three to five signature fusions with their own mechanic~~ (round 53).
3. ~~One route choice per floor~~ (round 57: the staff passage; a risky way
   past one fight, about one a floor. A heavier version that replaces a room
   with a harder one for a better prize would need a new room role: dressing,
   HUD names and music are all keyed by role.)
4. Late-game tuning against strong builds (the bot can now play builds; wait
   for playtest logs before trusting it with the Owner and the Developer).
5. ~~Clearer wanted consequences~~ (round 57: the wanted strip).
6. Unlocks as play-style choices and optional challenges (round 57 started the
   second half with the Daily Shift's rule; a pick-your-own list of rules on
   any night, paying extra stubs, is not built).

## Round 50 playtest questions (the districts)

- Do the districts feel like new places, not reskins? Which is best/worst?
- Is half the nights the right rate for a district (`DISTRICT_CHANCE`)?
- Mini-bosses: fair? Too easy next to the elite wave they replace?
- Monsters: is the Elf's ring readable, the Spritzer's cloud annoying, the
  Poodle's dash fair, the Goon's slapshot dodgeable?
- Store twists: do you use the sample bowl, the buzzers, the punch card?
- Round 51 re-rolled the Queen's north walk, the Poodle's south run and a
  feral Mr. Whiskers. Does he read as a boss now?

## Round 49 playtest questions

- Which Break Room things do you buy first? Is Second Wind worth 60 stubs?
- Do the vending snacks change how you play the next night?
- Ideas not built yet: uniform colours (cosmetic), a "bring two locker
  weapons" upgrade, perks for floor events (e.g. a flashlight for outages).

## Round 48 playtest questions

- Mall Walkers: do you leave them be or pick the fight for the change?
  The log's `walker` damage says how often it goes wrong.
- Do recipe hints now show different pairs from night to night?

## Round 47 playtest questions

- Floor events: do the three feel different? Is 70% of wings too often?
  The log's records now carry `event`.
- Does the barrage now make you move (look for `barrage` damage > 0)?
- Heists: do you still steal, and do alarms now end in lockdowns sometimes?

## Round 46 playtest questions

- Mannequins now freeze for 1.5 s after a bite. Does Floor 1's back hall
  still eat 3-5 health? Is the freeze readable (it creaks when it wakes)?

## Round 45 answers (2026-10-01 log, a full night on seed 153774)

- Length: floors took 5.4 / 5.0 / 3.6 / 3.6 min, 17.6 min of play in all
  (was ~10). On target; leave it.
- Lockdowns cost 2-3 health except Floor 3's Walk-In Cooler (7: two Mascot
  charges and three globs).
- Pairs work: three signatures (Greatest Hits, Hydro Mop, Deep Dish), and
  every recipe hint followed that night had `tookBoth: true`.
- The Developer's tar barrage hit 0 times in 3 finales; Roofers once.

## Round 45 playtest questions

- Does a floor now feel ~1.5x longer, and is that the right length?
- Is the Lockdown a fair climax (5 elites, the janitor was hit within 1.5 s
  of entering in a capture)? Too much on the Roof, with x1.5 health?
- Follow-up: give first wings their own back-wall signs.

## Round 44 playtest questions

- Does the pink pair line and the 25% off get you to buy both halves?
- Do you save up for (or steal) the floor 3-4 rare? Is $45 right?
- Is a stub per $20 at clock-out a reason not to spend, or a nice bonus?

## Round 43 playtest questions

- Do you chase signature pairs now? The log's recipe hints show `tookBoth`
  and fusions show `signature`.
- Is a signature too strong next to the floor scaling (x1.5 damage plus a
  fifth part)?

## Round 42 playtest questions

- Is the Developer now the hardest fight of the night (target ~30 s, a few
  hits taken)? The log's `barrage` column shows whether his tar lands.
- Do floors 2-4 feel tougher without becoming a slog (x1.15 / x1.3 / x1.5)?
- What does the `roofer` column say about the HVAC Yard and Water Tower?

## Round 39 (the Roof) playtest questions

- Is the Roofer's 54-tick lob readable? Is 1 damage plus a slowing puddle
  too mean with brutes and Statics in the same room?
- Does tar pile up into a floor you can't cross? (Six puddles, 5 s each.)
- The Developer at 240 hp with barrages from phase 2: too long a finale
  after four floors? Does the night now run too long overall?
- Is FLOOR 3 CLEARED (12 stubs) the right pay, now that clocking out needs
  four floors?

## Round 35 playtest questions

- Store twists: which ones are fun and which are just in the way? The
  playtest log's store visits show time spent in each.
- Is the pitching machine's wind-up long enough to dodge? Is the oven worth
  luring guards into?
- Does the 1.4 s boss card still get skipped?
- Fusions and recipe hints are in the log now: are hints followed?

## Round 34 playtest questions

- Does the reveal feel good, or slow at the bench after the tenth fusion?
  (Repeats get the stamp but no banner.)
- Are recipe hints too common? Some small stores hold a whole pair by
  chance, so paired shelves turn up in most malls.
- Is the silhouette catalog a reason to replay?

## Round 32 playtest questions

- Is fusing three or four things worth the fee ($8 and $11)? Too strong?
- Drops: is 4% (30% for elites) the right rate? Do rares feel special?
- Is the getaway bonus enough to make stealing a real choice?
- Floor 1 at three enemies a fight, the five-prong Manager and the 210 hp
  Owner: better?
- Mall Mart as the general store: do people stop now?

## What the game has now

- **Four floors**, six rooms each, reached by the escalator (one table:
  `src/sim/wing/floorSpecs.ts`):
  - Floor 1 ends with the Loss Prevention Manager.
  - Floor 2 (Statics, Bargain Hunters) ends with the Mall Manager.
  - Floor 3, Food Court After Dark (Mascot Brute), ends with the Mall Owner.
  - Floor 4, the Roof (Roofers and their tar), ends with the Developer: the win.
  - Jump in with `?fixture=mvp-floor-two`, `mvp-floor-two-boss`,
    `mvp-floor-four-roofer`, `mvp-floor-four-boss` and the other fixtures
    listed in the playbook.
- **Grab and run** (round 25): press F on a shelf item to set off the alarm,
  then get out before the shutter drops. The loop adds Heat, wanted stars and
  hot goods, and fusing a hot item at the Bench Warrant launders it.
  - Code: sim in `src/sim/run/heist.ts` and `wanted.ts`, visuals in
    `src/game/view/alarmCues.ts`.
  - Try it with `?fixture=mvp-storefront`, then press F.
- **Store interiors** (round 27): the stores are inside now. On a storefront
  concourse, walk into the shop door in the back-wall art (or press E) to go
  in; each store fills the room in its own style, and its walls leave the
  EXIT door as the only way out. Walking out secures stolen goods.
  - Code: `src/sim/run/storeInterior.ts` (`generateRunWing` scales each
    store template up to a full room), dressing in `storeInterior()` in
    `roomDressing.ts`.
  - Try `?fixture=mvp-store-front` (the concourse) or `mvp-storefront`
    (inside, at the shelf nearest the door).
  - Each storefront has two shops (left and right), so a shift visits all
    four stores (round 27b).
  - The concourse has PixelLab furniture with collision (round 28):
    `CONCOURSE_FURNITURE` in `storeInterior.ts`.
- **Loss Prevention stalker** (round 26): at four stars an agent who can't
  be killed follows you room to room. A mop swing shoves him back, and
  dropping below four stars loses him.
  - Code: `src/sim/run/stalker.ts`, visuals in `src/game/view/stalkerCues.ts`.
  - Try it with `?fixture=mvp-wanted`.
- **Boss title cards** (round 26): entering a boss room holds the fight for
  a mall-directory card (`src/game/ui/BossIntro.ts`). Any fresh key skips.
  Try `?fixture=mvp-boss-door` and walk east.
- **Ambient props** (round 26): swaying palms, attract-mode arcades, the
  fountain's spray, dying neon tubes (`src/game/view/propAmbience.ts`).
- **Void the Warranty** (round 23c): any two items fuse at the Bench Warrant;
  since round 32 fused things fuse again, up to four items in one.
- **Eleven stores, 88 items** (round 32): `src/sim/items/storeRoster.ts`
  holds the new items and who stocks them; enemies drop items and every boss
  drops a rare (`src/sim/run/drops.ts`).
- **Daily Shift** (round 23a): today's seeded mall with standard-issue gear.
  Each day's record is saved in `dead-mall:daily:v1`.
- **Break Room** (rounds 22 and 24): Pay Stubs buy perks between shifts.
  - Perks: Seniority, Dental Plan, Coffee Break, New Sneakers, Shop-Vac
    Attachment. Locker weapons start in hand.
  - Code: `src/game/career/career.ts` and `src/sim/run/perks.ts`.
  - To test with money, set
    `localStorage['dead-mall:career:v1'] = '{"version":1,"stubs":200}'`.
- **Presentation**: clock-in cold open, kill cam, dawn ending, escalator ride,
  pink slip, mall PA ticker, room events (Blackout, Blue Light Special), and an
  adaptive synth soundtrack.

## Needs a human playtest

Switch on recording in the title screen's **Playtest stats** panel first, then
use **Copy** after a few shifts: since round 30 the log records alarm
outcomes (with seconds to spare), peak stars, Loss Prevention activity, store
visits and boss-card skips, which is what the questions below need.

- Grab and run:
  - Is the 4 s alarm the right length?
  - Are Hunters guarding the store door fair on Floor 1?
  - Does +60 score per star over-reward stealing?
  - Inside the full-room stores the door is farther from the back shelves:
    is 4 s still fair from there (the escape chevrons point the way)?
- Store twists (round 31): is the butter fun or just annoying? Do the
  Department Outlet displays make that store too dangerous to rob? Does the
  arcade cabinet feel like a gamble worth taking at $2?
- Loss Prevention stalker: is 150 px/s oppressive or ignorable, and is
  four stars the right threshold?
- Boss card: it now plays on the first entry per mall only. Is 2.6 s the
  right length for that one showing?
- Floor 3: Mascot Brute charge fairness and Mall Owner length (240 hp).
- Floor 2 difficulty since round 16. The playtest log separates upstairs
  rooms and attackers.
- Break Room economy: stub pay against perk prices over several shifts.

## Open follow-ups

- Fold the duplicate DOM status bar into an accessible off-canvas panel. The
  browser tests still read HP, cash, room and objective from it.
- A purpose-made Alex portrait.
- Safari/WebKit, Windows and physical-device performance are untested.

## Ideas backlog

Candidates, not commitments. Pick with the owner.

**Needs art and a decision first (asked for in round 57, not built)**
- A second playable employee. The janitor's in-world art (8-direction idle,
  walk and swing) is Alex only; `portraits/employee.png` and `teenager.png`
  exist as portraits. The kit should change a decision, not a number. Three
  candidates: a Stock Clerk (starts with the Box Cutter, two hearts, $1 off
  every shelf), a Teenager (a faster dash, one free alarm-less grab a night,
  one heart less), a Night Guard (four hearts, a slower dash, security guards
  fight on their side for the first star). Needs: a PixelLab character per
  employee, a title or Break Room picker, and the career to remember the pick.
- A secret floor (a Parking Garage or Basement Service Tunnels). A floor is a
  `floorSpecs.ts` entry plus whatever `tsc` lists, but `FloorNumber` is 1-4 and
  runs upward, so a basement below Floor 1 means renumbering or a flag; it also
  needs dressing, a music track and a way in (a hatch that opens after a won
  night? a key from the Owner?).

**Heist follow-ups**
- Blackouts silence the alarm (option E).

**Content**
- More levels per floor (the owner's plan): the floor table is ready for
  it. A Parking Garage or Basement Service Tunnels secret floor.
- A second playable employee with their own starting kit.
- More 90s items (Walkman, Tamagotchi, Super Soaker 50, Pogs, Game Boy).
- Elite variants of enemies.

**Meta**
- Seasonal wall resets for Employee of the Month.
- A daily leaderboard export (a shareable seed card).
- Unlockable mall layouts.

**Visuals**
- Convert the remaining vector rooms and earlier modes to the neon kit.
- Weather through the skylights.
- A CRT/VHS post-process toggle.

**Accessibility**
- Colourblind-safe telegraphs.
- Remappable keys.
- Reduced flashing, since alarms and blackouts flash.

## Baseline for comparison

`codex/presentation-3quarter` in `.worktrees/presentation-3quarter` is the
untouched Codex opening-slice baseline; see [`CLAUDE_HANDOFF.md`](CLAUDE_HANDOFF.md)
and the history of this file for its evidence notes. Earlier modes (Start
shift, Lab, Shoplifting Loop, Void the Warranty) keep their original
presentation. Night Shift is the game.

## 2026-09-30 — Additional prop candidates

The [asset handoff](docs/art/prop-packs/2026-09-30/HANDOFF.md) lists nine new prop candidates, both downloadable packs, and exact repository paths. Select sizes and check placement, render anchors and collision before integrating them through the existing asset pipeline.
