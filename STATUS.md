# Status

## 2026-10-05 — Round 58: a visual review of every floor (branch `claude/floor-visual-review`)

Built on `origin/main` (`90204ab`), merged as PR #73 (`7fceed6`). The owner's review: lines across the top of
each room, rings round the fountain, assets that did not fit, and floors that
all looked alike. Every room on every floor (boss and first wings, districts,
shop interiors) was captured before and after with the new
`scripts/floor-sweep.mjs`.

- The floor neon strips and fountain rings are gone; sign reflections only on
  polished floors.
- No sprite is stretched to fit collision any more; bars that run away from the
  camera are fitted 3/4 blocks (planter beds, curbs, ducts, atrium wells,
  counters, shelving) with sprites stood on them.
- Floors 2-4 have their own layouts (18 new) and storefront furniture; floor 1
  is unchanged. Shop interiors are fitted out in six styles. Floors 2-4 are
  lit brighter. Nine new PixelLab props.
- Balance: floor 1 identical; over 160 nights the shopping pro bot 61% -> 57%,
  expert 94% -> 89%. The owner asked for harder, so it stays.

See the playbook's Round 58 section and TEST_EVIDENCE.md.

## 2026-10-04 UTC — Bargain Hunter hurt strip drawn with GPT image (roadmap V1, first derived strip upgraded)

Branch `claude/pixel-forge-image-generation-go3b0z`. Presentation only; no `src/sim` change, no
balance change (so `npm run balance` was not run).

**What changed.** The Bargain Hunter's flinch is now a drawn 4-frame × 8-facing strip instead of the
walk frame squashed and stretched. The peak recoil snaps the head back and flings an arm out; the
feet stay planted.
- **Art:** `art/enemy-reactions/shopper-hurt/` holds the raw GPT sheet, the Pixel Forge job spec,
  `convert_gpt_hurt.py` and the converted `shopper-hurt.png`. Its README has the provenance and the
  open review items.
- **Install:** `build_material_reactions.py` now copies that sheet (new `DRAWN` table) instead of
  deriving the strip. Of the 34 strips it rewrites, only this one changed. The shipped file is
  `public/assets/neon/enemies/shopper-hurt.png`, same 384 × 768 format, so no game code changed.
- **How it was generated:** Pixel Forge's Codex bridge, signed in with the owner's ChatGPT plan from
  this cloud container, orchestrator `gpt-6.1-sol`. See the field notes in
  `tools/pixel-forge/docs/CODEX_NATIVE_BRIDGE.md` (network hosts, the interrupt trap, the follow-up
  cap, why the prompt must spell out the character).
- **`scripts/live-capture.mjs --attack`** now aims along the line to the target, 120 units out. It
  used to point at the target's own position, which for an enemy standing on Alex is a few pixels
  from him and swings at the wrong angle (the sim's cone is measured from the player). That
  explains why it never landed a hit on the Bargain Hunter (confirmed), and probably the Walker and
  Goon, which stand close to Alex too (not retested).

**State of the art: review-only.** `check_sheet.py` and the tests cover format and registration, not
drawing quality. Known items: the figures are a little stockier and more shaded than the walk
figure; the east row's bag side is unchecked; the chest mark is a brown stain, not the walk art's
checkered patch. The Spitter and the eight bosses still use derived strips.

**Evidence:** `TEST_EVIDENCE.md`, same date. Live, the new sheet loads and the hunter can be hit with
0 console errors, but no flinch frame was seen on screen (below).

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


## 2026-10-03 UTC — Mannequin native reactions (isolated cloud review, unpublished)

The mannequin now has a four-frame, eight-facing hurt strip (3/3/4/4 ticks),
a seven-frame, eight-facing death strip (4 ticks/frame), and a six-frame
plastic-chip impact (2 ticks/frame). Hurt and death retain the last rendered
facing; health differences do not identify an incoming attack source. The
96 px actor canvas still displays at 72 px with feet at (48, 80.64).

Native hurt suppresses the mannequin's generic white squash, walk jitter and
fixed eye overlays while active; attack/wind-up cues take priority. Small
bounded plastic impacts replace mannequin stars, rings and blood decals, and
the separate generic death ring is suppressed. Missing/malformed hurt art
retains the existing hit pose; missing chip art uses matte pixel flecks.
Every corpse retains the existing full hold/fade, including crowd kills.
Other enemy feedback, hit-stop beats and shake values are preserved.

Final verification: 1,603 tests in 156 files pass serially; typecheck and
production build pass; 240 fixed-seed gameplay traces match baseline. All 96
simulation files are byte-identical to main 11b0c68c134615295b308563cda1f31a51b32b6a.
Live runtime visual QA remains unverified: the dedicated cloud browser
refused the isolated local Vite URL with ERR_BLOCKED_BY_CLIENT. No Mac
access, push, merge, deployment, or simulation changes occurred.

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


## 2026-10-02 — Three-prop integration merged into main

The owner approved merge and push. Feature commit `3e2833a15c389b3bc0bae5d981a53451d30a6bfa`
was merged without conflicts as `9a647f975de3cdc68c5e95e31687baa74f14acbd`.
The merge tree is byte-identical to the verified feature tree.

Normal Night Shift now has bakery cases in Slice Station, Pretzel Pit and
Cocoa Hut, slush machines in Cinema Snacks, Candy Cauldron and Frosty Freeze,
and one monitor bank in the ground-floor boss Security Office. Native intact/
damaged sprites, retained solid bases and matching one-shot effects use the
existing simulation and renderer. The three-prop dev fixture remains available.

Fresh checks on the actual merged main tree: types pass, 1,329 tests pass,
and the production build passes with the existing large-bundle warning.
The identical feature tree passed the standard normal/fixture browser gate
5/5, adjacent hero/restart checks 5/5 and the live monitor recapture 1/1.
Only verified task files were committed. All 3,894 untracked art archive files
retain their original names, sizes and timestamps.

Publication is authorized to the existing `origin/main`; the completion
handoff records the remote commit verification and CI status. No deployment
is part of this change. The isolated review server remains on port 4194.

## 2026-10-02 — Normal-room props verified locally in the isolated worktree

Applied the approved cloud patch only to `codex/three-prop-test-room`, after
matching all 785 baseline snapshot files. The applied tree matched all 794
cloud source files byte-for-byte. Main remains at `c9b84f6` with only its
existing untracked art archive. No merge, push or deployment was performed.

Fresh local checks: typecheck/build pass, 1,329 unit/integration tests pass,
the standard-config normal-room plus fixture browser gate passes 5/5, and
the five adjacent hero/restart browser checks pass. Native sprites and
unchanged anchors, collision, single-break effects, repeat hits, occlusion,
cleanup, shop entry/exit/reentry, fixture reentry and reset were verified.
Fresh screenshots are in `artifacts/normal-props/` and `artifacts/prop-test-room/`.

The browser run found invalid bakery/Security test checkpoints that skipped
uncleared fights. A test-only room-boundary helper now includes the required
prior cleared-room history; three regression cases pass against the real save
validator. The monitor capture now happens before the pause overlay covers it.
No production code was changed locally beyond the approved cloud patch.
The previous fixture timeout is resolved by a real standard-config browser pass.

The review server is running on http://127.0.0.1:4194/ with the integrated code.
For the three-prop probe use `?fixture=mvp-prop-test&seed=1`, choose Night Shift,
then WASD, click and R. The normal route contains the approved sparse rollout.

## 2026-10-02 — Three approved props in normal rooms (cloud continuation)

The bounded rollout now places one bakery case in Slice Station, Pretzel Pit
and Cocoa Hut, one slush machine in Cinema Snacks, Candy Cauldron and Frosty
Freeze, and one monitor bank in the actual Floor 1 Security Office. Other
stores, concourses, upper-floor office-role rooms and the seeded cart/soda/rack
layouts are unchanged. The original dev-only three-prop fixture is preserved.
All nine native PNGs remain byte-identical, and damage retains scale 1 and the
same bottom-center anchor. Props rebuild intact on room/store reentry.

Final unit gate: **143 files / 1,326 tests pass**. Typecheck and production build
pass, with the existing large-bundle warning. Independent focused review passed
91 tests and found no overlap with existing static dressing across 1,524 prop
instances. Before/after bot results and the complete evidence are below in
TEST_EVIDENCE.md and artifacts/normal-props/.

**Not visually verified yet:** this cloud executor could not launch a permitted
browser. No fresh gameplay screenshots were produced. The keyboard navigation
helper's split-input overshoot is fixed under four offline latency regressions,
but its original browser timeout still needs a real-browser rerun. Normal-route
Continue/store-door browser specs are supplied and discover successfully.
The code has not been applied to the original worktree, pushed, merged or deployed.
See docs/neon-overhaul/three-prop-rollout/README.md for placement and patch steps.

## 2026-10-02 — Three-prop playable art test (isolated branch)

Built on `c9b84f6` in `codex/three-prop-test-room`, without changing the normal
room layouts. The dev-only `?fixture=mvp-prop-test&seed=1` Night Shift route
contains the bakery case, security monitor bank and twin-bowl slush machine.
The regular simulation handles movement, mop attacks and solid footprints;
one hit swaps the exact native intact/damaged PNG at the same bottom-center
anchor. Glass break, machine chips and soda rupture play once at 50 ms/frame
using the approved untrimmed strips. Damaged props remain solid. R resets;
the east door leads to an empty return room, and reentry rebuilds intact props.

Run `node scripts/serve-prop-test.mjs`, open
http://127.0.0.1:4194/?fixture=mvp-prop-test&seed=1 and choose Night Shift.
This launcher disables file watching so review sessions stay open while files
are inspected. Checkpoints stay in memory and the fixture consumes no career
snacks/perks. The three-prop pack loads only for this dev fixture.

Evidence: 1,292 unit/integration tests pass, types/build pass, the full fixture
browser flow and normal-route exclusion pass, and five adjacent hero/restart
browser specs pass. See TEST_EVIDENCE.md and artifacts/prop-test-room/.
Only these three props are integrated; broader prop rollout awaits the owner's
judgment of native scale, footprint and destruction feel.

## 2026-10-01 — Round 57: a bot playtester, a route choice, a coach, a daily rule

Built on `origin/main` (`2b6250d`, round 56) as nine commits (a refactor, then
one per feature, then docs) on `claude/balance-bot-and-routes`, merged to `main`
(`4cf40da`) and pushed on the owner's say-so. A headless bot now plays Night Shift through the real input (`npm run balance`,
`tests/balance/`), so balance can be measured instead of guessed; its first
100-night baseline is in `docs/neon-overhaul/balance/`. On top of it:

- **Wanted clarity.** A strip above the portrait says what the stars cost
  (shelf surcharge, extra guards, Loss Prevention from four stars) and when the
  next star comes, or that hot goods are holding yours.
- **The staff passage** (the route choice). About half of wings have a STAFF
  ONLY hatch on a safe concourse: crawl through to skip the next fight for a
  star of Heat. The bot says it is balanced (60% against 59% won).
- **The coach.** Optional how-to tips for a new janitor's first two shifts,
  with a Settings switch.
- **The Daily Shift's rule.** One of Glass Janitor, No Breaks, Inflation or
  Short Fuse a day, shown on the title and the clock-in card.
- **Elite traits.** Clearance elites are now Swift (faster) or Volatile (a
  short fuse, then a burst where they fell), with their own colours and tags.
- **The seed card.** COPY CARD on the end card puts a plain-text summary on the
  clipboard.

Gameplay otherwise unchanged. Not done, because they need art and a decision:
a second playable employee and a secret floor (briefs in NEXT_SESSION.md). See
the playbook's Round 57 section and TEST_EVIDENCE.md.

Follow-up the same day: the Volatile burst now has a browser spec and a
screenshot, and a smarter `expert` bot (`tests/balance/danger.ts`) checked the
first bot's leads and refuted them, twice. The Mall Owner's Suite, the Helipad,
Glamour Row's perfume and the Roofers' tar all looked like hot spots and were
each the bot failing to see something: a bot that scores every hazard at once
(charge lanes, slams, shots, burst fuses, lobs, tar) wins 95% of nights and
loses under a heart in any wing. The open question was human, not mechanical:
how much time each hazard gives. A reaction-delay sweep (`npm run
balance:reaction`) measured it: the Perfume Spritzer's spritz and the Volatile
fuse are tightest (a walker must react inside 0.2 s; with a dash 0.4 and 0.5), the
Mascot Brute and Roofer are comfortable, and the Owner is the one fight a pure
reaction does not beat. A longer Spritzer wind-up (30 to 42 ticks) would double the
allowance; it is measured, not changed. See
`docs/neon-overhaul/balance/round57-reaction.md` and `round57-expert.md`.

## 2026-10-01 — Round 54: palms, the toppled rack, a flaky test (branch `claude/polish-palms-rack-tests`)

Three small fixes on top of `origin/main` (`4d9f981`). Tall props now fade to
30% (from 50%) as soon as the janitor's body, not just the foot point, is
behind them, so a palm no longer nets over the janitor. The approved toppled
clothes rack is wired in for east and west falls (the old turned-over sprite
stays for falls toward and away from the camera). `districts.test.ts` runs in
0.6 s instead of 2.3 s, clear of the 5 s timeout. Gameplay and the sim are
unchanged. See the playbook's Round 54 section and TEST_EVIDENCE.md.

## 2026-10-01 — Continue no longer flashes the ended run's HUD

A playtest read Continue as reopening a dead (0 HP) run. It does not: the
checkpoint parser already rejects 0 HP, and death keeps the last living
room-boundary checkpoint, so Continue resumed Kiosk Alley at 6/6 HP and $30.
The defect was the DOM HUD: `launchRun` un-hid `#mvp-run-hud` before the new
scene existed, so the previous run's 0/6 HP and "Shift ended" stayed on screen
while assets loaded. `launchRun` now keeps it hidden; `MvpRunHud.sync`
reveals it on the new scene's first authoritative frame. Checkpoint recovery
and storage rules are unchanged. See TEST_EVIDENCE.md.

## 2026-09-27 — Claude neon overhaul (branch `claude/neon-overhaul`)

Night Shift now renders every room as a lit, dressed 90s mall instead of the
opening-only slice plus gray vector rooms. Baseline for comparison:
`codex/presentation-3quarter` (unchanged). Full write-up and the extension
playbook: [`docs/neon-overhaul/README.md`](docs/neon-overhaul/README.md).

Round 53b (2026-10-01): the secret back room. About three nights in five,
a suspicious vending machine stands on the first storefront concourse. E
opens a service passage into a sealed back room: last 20 seconds of the
wing's own monsters in waves and a rare item and $15 drop. One try a wing.

Round 53 (2026-10-01): hero fusions and mall props (from the outside
review's ideas). Three signatures have a move of their own: Greatest Hits
(records orbit you; the 4th attack flings them), Comedy Hour (a decoy
chicken pulls monsters off you, then bursts) and Movie Night (a projector
beam that hurts and scares the aisle stiff). Most regular fights have two or
three props: carts roll, soda machines burst into a soaking puddle, clothing
racks topple into a low wall. See the playbook's Round 53 section.

Round 52 (2026-10-01): three bugs from an outside (GPT) review. A mop hit
could knock a guard through a closed shutter and soft-lock the lockdown
(`moveCircle` now moves in 4 px steps); the Bench Warrant hid every item past
the 16th (it now pages, nine a page, Q/E or the arrows); and the Candy
Cauldron's sample came back every visit (now once per store per wing, kept in
the checkpoint as `samplesTaken`). See TEST_EVIDENCE.md round 52.

Round 50 (2026-10-01): the mall districts, an expansion. About half the
nights, each floor's first wing is its district instead: Holiday Village
(Floor 1), Glamour Row (2), Pet Paradise (3) or the Skate Arena (4), each
with its own rooms and art, two new stores with a twist each, 37 new items
(29 more signature pairs), a new monster, a mini-boss in place of the
Lockdown wave, and its own music track. See the playbook's Round 50 section
and TEST_EVIDENCE.md round 50.

Round 49 (2026-10-01): a much bigger Break Room. Six new perks (Lookout,
Deep Pockets, Employee Discount, Bench Technician, Lucky Penny, Second
Wind), six more locker weapons (10), and a vending machine of one-night
snacks (Energy Drink, Lunch Money, Fusion Coupon, Fake Mustache) eaten on
the next shift. 1115 unit tests; browser 75/76 with 1 load timeout that
passes serially; see TEST_EVIDENCE.md round 49.

Round 48 (2026-10-01): the owner's queue. First wings hang their own
back-wall signs; 17 more signature pairs give every store three or more, so
recipe hints change night to night; and the Mall Walker (new PixelLab
sprites) power-walks laps through Floor 1-2 fights, harmless until bumped
or hit, carrying the most change of any regular. The queue's "unlocks
screen" already exists as the Break Room. 1103 unit tests; browser 75/76
with 1 load timeout that passes serially; see TEST_EVIDENCE.md round 48.

Round 47 (2026-10-01): floor events. Most wings after the first roll a power
outage (dark, alarms a second slower), sprinklers (every enemy Wet, so
anything that conducts chains) or a clearance sale (30% off, an extra
Bargain Hunter per fight); the PA and title cards announce them. The
Developer's barrage leads a moving janitor, alarms shrink floor by floor
(3.5 s to 2.5 s) with the door Hunters quicker upstairs, and a bug is fixed:
re-buying an item on a later floor no longer blocks every fusion. 1093 unit
tests; browser 73/76 with 3 load timeouts that pass serially; see
TEST_EVIDENCE.md round 47.

Round 46 (2026-10-01): a Mannequin that bites the janitor freezes for 1.5 s,
so one bump is one hit. Mannequins were Floor 1's top source of damage in
every log (3-5 health in the back hall, one death). 1081 unit tests; see
TEST_EVIDENCE.md round 46.

Round 45 (2026-10-01): every floor is two wings. The first is the lighter
half under its own names and ends in the Lockdown, a sealed room of five
elites; clearing it opens the stairs to the floor's boss wing. The night
still opens in the Opening Concourse. 1080 unit tests; the browser suite
passed with load-related timeouts that pass serially (load average 20-32);
see TEST_EVIDENCE.md round 45.

Round 44 (2026-10-01): shelf deals and late-game money. A recipe-hint item's
store card now says what the pair makes (pink), and the second half is 25%
off once you hold the first. Floors 3 and 4 each shelve one rare for $45
(buy it or steal it), and clocking out pays a stub for every $20 left. 1071
unit and 76 browser tests pass; see TEST_EVIDENCE.md round 44.

Round 43 (2026-10-01): signature fusions are the best fusions. A named pair
now hits half again as hard and attacks a fifth faster (once, when formed),
has room for a fifth part, says so on the bench card and glows hot pink. The
playtest had 0 of 8 recipe hints followed at the old +1 damage. 1065 unit and
76 browser tests pass; see TEST_EVIDENCE.md round 43.

Round 42 (2026-10-01): the finale is the hardest fight. The 2026-09-30
playtest won two full nights with the Developer down in about 20 s and
upstairs fights costing 0-2 damage, so regular monsters now get x1.15 /
x1.3 / x1.5 health on floors 2 / 3 / 4, and the Developer has 340 hp (was
240) with a tar barrage from phase one. The playtest log now records tar
hits as `roofer` and `barrage` instead of `other`. 1059 unit and 76 browser
tests pass; see TEST_EVIDENCE.md round 42.

Round 41 (2026-09-30): the small things. The depth-sort browser test no
longer flakes under load (it judged a second, later snapshot), start-up
canvas waits get 20 s instead of 5, and checkpoint validation closes the
three hand-edited-save holes from the 2026-09-19 review. 1055 unit and 76
browser tests pass (4 workers); see TEST_EVIDENCE.md round 41.

Round 40 (2026-09-30): the Developer wears the cream power suit he was
briefed with (navy vanished on the night roof), and Flashes: Reduced now also
steadies the HUD alarm banner and wanted stars, the white end of every
wind-up, the hurt blink, the boss card name, the clock-in flash and the
fusion banner. 1048 unit tests pass; see TEST_EVIDENCE.md round 40.

Round 39 (2026-09-30): Floor 4, the Roof, is the new finale. Beating the
Mall Owner now offers the escalator once more, to six rooms out under the
night sky (Roof Access, Skylight Walk, HVAC Yard, Billboard Deck, Water
Tower, Helipad). The new Roofer lobs hot tar at where you stand (a landing
ring warns; the splash hurts; the puddle slows walking but not dashing), and
the Developer on the Helipad, the man who bought the mall to knock it down,
is the win: slams, blueprint volleys, then tar barrages and Roofers. The
floors are now one table (`sim/wing/floorSpecs.ts`), so the next floor or
level is an entry plus whatever tsc lists. PixelLab art for the roof, the
Roofer and the Developer; two new tracks. Dropped items now wait for the
janitor to step away before they can be picked back up (replacing round 36's
45-tick lock, which handed them straight back). See TEST_EVIDENCE.md round 39.

Round 38 (2026-09-30): the staple gun, mic stand and leaf blower icons are
redone (PixelLab, 32x32, palette forced from the earlier icons). The 14
candidate icons came from a fresh PixelLab run, since the round-36 jobs had
expired (`404 Result not found`). Picked: a stapler silhouette, the classic
mic on a stand filling the tile, and a handheld blower with a tube nozzle.
Before and after: `artifacts/neon-overhaul/round38-icon-redos.png`.

Round 37 (2026-09-30): the Flashes: Reduced setting now covers the newer
effects. Store alarm beacons hold lit instead of alternating, the Radio Shed
snow freezes, the fusion reveal bursts a third as many sparks and its stamp
shake follows the Shake setting (off = none), and a blackout fades in and out
over about a second instead of cutting. 1020 unit tests pass; see
TEST_EVIDENCE.md round 37.

Round 36 (2026-09-30): sell and drop items. X drops the held weapon as a
floor pickup (keeps its provenance and fusion, 45-tick pickup lock, the last
weapon is never dropped). At the Bench Warrant, pick one item and press X or
click SELL: half the shelf price, a quarter if stolen, a fusion pays the sum
of its parts. The restart spec's door step now re-centres like
`enterFirstCombat`. Not done: the staple gun, mic stand and leaf blower icon
redos (the container's proxy returns 403 for the PixelLab download host, so
the chosen jobs are still to be fetched). 1016 unit tests pass; see
TEST_EVIDENCE.md round 36.

Round 35 (2026-09-30): every store plays differently. The seven themed
stores get twists: Sports Locker's pitching machine fires down the aisle,
Hardware Hut's paint spills are slippery, Toy Box's wind-up toys shove the
janitor aside, Radio Shed's TV static hides whoever stands in it, Spiral
Records' listening booth doubles attack speed for 10 s once a visit, Slice
Station's oven blasts heat along the east wall, and Video World's rewind tile
undoes the last hit taken in the store. PixelLab props for the machine, toys,
booth and oven. The playtest log now records fusions and recipe hints, and
the boss card is 1.4 s (players skipped the 2 s card at 1.2-1.3 s). 1006
unit tests pass; see TEST_EVIDENCE.md round 35.

Round 34 (2026-09-30): fusions are a spectacle. A fused item's icon stacks
every part on the base with a glow that grows green, cyan, gold with the part
count. Fusing at the Bench Warrant raises the new icon out of a spark burst
under a rubber stamp (FUSED!, SIGNATURE!, MAXED OUT!), and the first time
the janitor ever makes a fusion a NEW FUSION DISCOVERED banner drops in
(SIGNATURE FUSION DISCOVERED with the running count for a named pair).
Fusions are logged the moment they are made, including pairs later fused
deeper (they were lost before). The Break Room's fusion catalog shows every
signature pair as icons, silhouettes until found, with a meter. Recipe hints:
some stores shelve both halves of a signature pair tied by gold sparks, and
the PA names the pair on the way in. Fixed: Free Refills could never be made
as a signature (its key was unsorted). 994 unit tests pass; see
TEST_EVIDENCE.md round 34.

Round 33 (2026-09-30): PixelLab art pass. The four themed stores that
borrowed another shop's front (Sports Locker, Hardware Hut, Toy Box, Radio
Shed) have their own PixelLab shopfronts, and all 64 placeholder item icons
(54 store items and the 10 rares) are now PixelLab art in the palette of the
earlier icons. 970 unit tests pass; see TEST_EVIDENCE.md round 33.

Round 32 (2026-09-30): the fusion game. Anything fuses with anything,
including things already fused, up to four items in one ($3 more per extra
item). Seven new themed stores (Sports Locker, Hardware Hut, Toy Box, Radio
Shed, Spiral Records, Slice Station, Video World) stock 54 new items that
fit them; Mall Mart is now the cheap general store. Enemies sometimes drop
items and every boss drops one of ten rares. Playtest tuning: harder Floor 1
fights, a fairer Mall Manager, a 210 hp Owner, a 2 s boss card, and a
getaway cash bonus. New item icons are placeholders pending PixelLab.
968 unit tests pass; see TEST_EVIDENCE.md round 32.

Rounds 28-31 (2026-09-29, recorded in TEST_EVIDENCE.md and the playbook):
concourse furniture, back-room props, the heist playtest log, store twists,
the heist recap and animated machines.

Round 27 (2026-09-29): the stores are inside. A storefront concourse is just
the mall, and the shop door in its back-wall art leads into a full-room store
in that shop's own style, walled in so the EXIT door is the only way out;
walking out secures stolen goods. Chevrons point to the door during an alarm.
922 unit tests pass; see TEST_EVIDENCE.md round 27.

Round 26 (2026-09-29): three backlog items. At four stars a Loss Prevention
agent who cannot be put down follows the janitor room to room (a mop swing
shoves him; laying low under four stars loses him). Walking into a boss room
now holds the fight for a mall-directory title card. Props have ambient life:
swaying palms, attract-mode arcades, a spraying fountain, dying neon tubes.
910 unit tests pass and the build is clean; see TEST_EVIDENCE.md round 26.

Round 25 (2026-09-29): shoplifting rebuilt as one loop. Grabbing an item
sets off the store alarm: Bargain Hunters at the door, Mannequins at the back,
four seconds to get out before a shutter locks you in with a second wave.
Heat is now a 1-5 star wanted level (extra security in fights, a price
surcharge, shed by clearing fights, carried up the escalator, paid out in score
and stubs). Stolen items are hot: +1 damage, but each keeps you a star wanted
until fused at the Bench Warrant. The in-run camera sweep, suspicion and
confiscation are gone (the M3 mode keeps them). See the playbook's Round 25 and
TEST_EVIDENCE.md round 25.

Round 24 (2026-09-29): two more Break Room perk lines. NEW SNEAKERS cuts the
dash cooldown by 10 ticks a level (two levels); the SHOP-VAC ATTACHMENT draws
loose change in from 40 px further a level (two levels). Both are clamped sim
perks, checkpointed, and older saves and careers load them as level 0. 849 unit
tests pass; see TEST_EVIDENCE.md round 24 for the browser run.

Round 23a (Daily Shift): a title button launches today's mall (seed hashed from
the local date, pinned so retries keep it) with standard-issue gear (no Break
Room perks). Best score and attempts per day are kept in
`dead-mall:daily:v1`; the title, clock-in and end card show the date. See
TEST_EVIDENCE.md round 23a.

Round 23b (2026-09-28): Floor 3, Food Court After Dark. Beating the Mall
Manager now offers the escalator to a third six-room wing (Food Court Seating,
Pizza Counter, Arcade, Kitchen Back, Loading Dock, Owner's Suite) with a new
enemy, the Mascot Brute (wind-up, straight charge, wall-stun for bonus damage),
and a new final boss, the Mall Owner (240 hp: tray volleys, a wall-shaking
charge, calls in brutes) with its own theme. The kill cam, dawn walk-out and
CLOCKED OUT card now follow the Owner; the Break Room pays for clearing Floor 2.
PixelLab art for both, `floor: 3` checkpoints, Floor 3 fixtures. 795 unit tests
pass; see TEST_EVIDENCE.md for the browser run (load-related flakes noted).

Round 22 (2026-09-28): the Break Room — meta-progression between shifts. Every
shift pays Pay Stubs (more for clearing Floor 1 and clocking out); the title's
Break Room spends them on perks (Seniority +$5, Dental Plan +1 heart, Coffee
Break +half a heart per cleared room) and locker weapons that start in hand.
Cleared floors are pinned up as polaroids; the best is Employee of the Month.
Perks are clamped sim data (`src/sim/run/perks.ts`) and checkpointed; the
career lives in this browser (`src/game/career/career.ts`). 765 unit and 66
browser tests pass.

Round 17 (2026-09-28): polish pass — title key art and layout, a redesigned
Mall Manager, sounds for the upstairs enemies, and five HUD overlap/clipping
fixes found by auditing every screen. 681 unit and 59 browser tests pass.
Committed locally, not pushed.

Round 16 (2026-09-28): every shift without `?seed=` now rolls its own mall
(the end card shows its number to share), and the upstairs enemies attack
more often after the first Floor 2 playtest. 676 unit and 59 browser tests pass.

Round 15 (2026-09-28): Floor 2 — a second six-room wing reached by the
escalator after Loss Prevention, with two new enemies (the Static, the Bargain
Hunter), a new boss (the Mall Manager) with his own theme, and upstairs fight
music. 670 unit tests and 58 browser tests
pass. Merged via PR #6. See the playbook's "Round 15" section.

Round 4 (combat readability): enemy wind-ups drawn from the sim's telegraph
state, exaggerated hit/kill/hurt feedback, a short hit stop, and PixelLab
attack + death animations for the Spitter, Hanger and boss. See the playbook's
"Round 4" section.

- All six room roles are themed by a pure dressing planner (storefront wall,
  props on every collision rectangle, lights, neon) with a multiply lightmap,
  additive glow and adaptive bloom.
- Whole-room fixed 960x600 stage (Isaac framing) with a 3/4 storefront band.
- PixelLab art: 11 storefront/counter panels, 8 props, animated Hanger and Loss
  Prevention Manager sheets, plus the earlier pass's enemies, items, portraits
  and decals (manifest: `public/assets/neon/manifest.json`).
- In-canvas HUD (portrait, hearts, hotbar, minimap, objectives, pickup log,
  boss bar, area title) derived from state by a pure model.
- Combat feedback: damage numbers, blood decals, sparks, shake, hurt flash.
- Gameplay: **Mall Tokens** drop from defeated monsters and pay into cash.
- The opening fountain is authored collision south of the door lane.

Verification is recorded in TEST_EVIDENCE.md. Not merged, pushed or approved;
awaiting the user's review against the baseline.

## 2026-09-27 — Opening presentation vertical slice: correction complete, visual approval pending

The production-presentation work is integrated on `codex/presentation-3quarter`
for one bounded slice: the stable `service_corridor` room is publicly presented
as **Opening Concourse**, with the approved local environment kit, Janitor,
Hanger, four-role civilian group, shallow three-quarter storefront treatment,
effects/depth/occlusion handling, and compact Night Shift HUD. The simulation,
six-room order, checkpoint schema, collision, economy, and combat rules remain
the M5 authority.

**Gate status: DONE_WITH_CONCERNS, not visually approved.** The correction pass
keeps the simulation unchanged while reserving a shallow HUD strip above the
canvas, keeping the full room identity and critical controls visible at both
1440x900 and 800x600, strengthening the opening's cyan/magenta signage and floor
inlay, and placing four approved civilians fully inside the initial camera.
The evidence bridge now reports their four distinct rendered IDs from actual
cropped-frame bounds rather than merely counting the ambience model.

The 27 runtime PNGs pass the shared-palette/alpha validator; typecheck, 43
focused presentation/HUD tests, 151 affected simulation/integration tests, all
513 unit/integration tests, the four-case evidence browser harness, the complete
57-case Chromium suite, and the production build pass. Ten restart cycles held
the opening at 31 static objects, 13 textures, 3 dynamic objects, 16 scene
display-list objects, one four-civilian in-frame ambience group, and identical
window/document/canvas listener signatures. Browser request capture reported
zero external HTTP(S) requests.

The two previously red Chromium cases were test-observation defects, not seeded
simulation or aim-threshold failures. Seeded offers had different live DOM data,
but `innerText` returned empty strings from the intentionally collapsed offer
disclosure; the test now reads trimmed text content. After a viewport resize,
Chromium exposed the resized canvas box one frame before Phaser updated its
camera projection; the test now waits for consecutive stable projection and
canvas dimensions while retaining the strict `> 0.85` direction cosine. A
separate parallel M4 origin check was also measuring a still-moving carrier
after its projectile poll; it now parks and samples the carrier immediately
before the real pointer press and tightens the allowed origin distance from 48
to 12 units. No gameplay assertion was lowered.

The four required browser captures are in
`artifacts/presentation-vertical-slice/`. Native-scale inspection confirms four
distinct civilians plus the Janitor in the busy and compact opening captures;
the HUD ends above the canvas and preserves the complete room title at both
sizes. Cyan/magenta storefront signage, light bands, and floor borders now read
clearly. These improvements still do **not** justify broad rollout: beige
terrazzo remains the largest visual field, so the room is not uniformly
neon-heavy; evacuation urgency remains subtle in a still; and the existing Food
Court remains gray/olive vector graybox outside this opening-only art scope.
The corrected first-combat evidence no longer accepts ordinary Hanger pursuit
streaks as a telegraph: it requires an authoritative Spitter windup, the matching
renderer cue, and a 48-pixel in-canvas margin. Native inspection now shows two
large bright-yellow rings with long aim lines around visible Spitters. Direct
user review is still required before integrating changes into this baseline.
The user has since authorized Claude to explore broader changes on a separate
branch within the original game vision; see `CLAUDE_HANDOFF.md`.

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

Clearing a room that authored a fight restores 2 health, up to the maximum of 6. The safe rooms recover nothing, so this is a reward per fight rather than per doorway, and it is small enough that a player still leaves every fight worse than they entered it.

Night Shift also has sound, synthesized with oscillators and requiring no audio assets: swings, shots, impacts, Wet and electrical conduction, purchases and thefts, confiscation, enemy deaths, the boss's escalation, telegraph, and volley, checkpoints, room clears, a PA chime on entering a room, and terminal stings. Sound starts on the first real input and is mutable from the HUD button or the M key. Sound is wired into Night Shift only; the four earlier modes remain silent.

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

**Known issues carried forward:** none from the 2026-09-19 review. The three hand-edited-save holes were closed in round 41 (a fight room skipped, a ground-floor item owned from an offer still on sale, a fusion id reused); "cleared rooms ahead of the current room" turned out to be legal (the janitor can walk back west), so only skipped fights are rejected.

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

## 2026-09-30 — Standalone prop packs archived

Nine environment prop candidates are available under [docs/art/prop-packs/2026-09-30](docs/art/prop-packs/2026-09-30/README.md), with PNGs, Aseprite masters, source artwork, compact variants, and a portable handoff. This checkpoint adds documentation assets; game runtime content is unchanged. Publishing evidence is in the asset folder.

Round 55 (2026-10-01): floor-exclusive stores on floors 2-4 (two per floor,
`FLOOR_STORE_IDS`), so upstairs no longer reshuffles floor 1's shops. Retro Diffusion
shopfront art, and a twist each (glare, chime, mustard, cold snap, rod, pawn). 1178 unit tests and `npm run build` pass; the
browser gate was not run.

Round 56 (2026-10-02): leaner economy from the 2026-10-01 night. Token values
about halved and elites pay double (was triple): a floor of fights now buys ~3
shelf items (was 5-8). Each upstairs floor store shelves a $45 rare. 1189 unit
tests and the build pass.
