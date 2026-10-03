# Visual roadmap

The presentation backlog for Night Shift, written so any agent (Claude, GPT/Codex
or a person) can pick up one item cold. Started 2026-10-03 after a review of
PRs #47–#50. Update the **Status** column and the item's notes when you land
or start something; keep items small enough for one PR.

## Before you start any item

- Read `AGENTS.md`, `STATUS.md` and `NEXT_SESSION.md` first. Gameplay rules
  stay in `src/sim`; every item here is presentation only. If a change needs
  `src/sim`, stop and ask the owner.
- Test first: write the failing unit test, watch it fail, implement, then run
  the adjacent tests (`npx vitest run tests/unit/<area>*`), `npx tsc --noEmit -p .`
  and finally the full `npx vitest run`.
- **Look at it live.** A real browser works in cloud sessions now:

      VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort &
      CHROME=/opt/pw-browsers/chromium node scripts/live-capture.mjs \
        --fixture mvp-back-hall --target hanger --attack --out artifacts/live-qa/<item>/shot

  It launches Night Shift on a fixture, screenshots the room, walks to and
  hits enemies (`--attack`, optionally only one `--target` kind), and logs the
  renderer's own texture/frame evidence for each hit. The browser suite runs
  the same way: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`.
  On the owner's Mac, drop the env vars.
- Art: prefer **derived** art (a committed script that re-poses existing sheets,
  as `art/enemy-reactions/hanger/build_hanger_reactions.py` does): free,
  reproducible, and pixel-identical in palette. PixelLab / Retro Diffusion cost
  real money; ask the owner before spending, and keep sources under `art/`.
- Never hide a telegraph. A hurt/flash pose may only replace an attack pose
  when that attack has no timed wind-up in the sim (see `hurtOutranksAttack`
  in `src/game/view/EnemyReactionView.ts`).
- Record evidence in `TEST_EVIDENCE.md` and the status line in `STATUS.md`.

## Status at a glance

| ID | Item | Status | Size |
|---|---|---|---|
| V0 | Live visual QA of the 2026-10-03 batch (PRs #47–#50) | **done** 2026-10-03 (`scripts/live-qa-sweep.mjs`) | S |
| V1 | Native hurt reactions for the remaining enemies | **Hanger done**; 16 kinds left | M per batch |
| V2 | Authored attack sheets for wind-up enemies and bosses | **Spritzer, Mascot, Roofer done**; others open | L |
| V3 | Native effects for the 67 remaining weapons (by family) | **thrown + water + spray done** (18); 49 left | M per family |
| V4 | Alex: dash and ranged-aim animations | **dash done**; aim pose open | M |
| V5 | Purpose-made Alex HUD portrait (56 px) | open | S |
| V6 | CRT/VHS post-process toggle | open | M |
| V7 | Skylight/roof weather | open | M |
| V8 | Per-floor colour grading | open | S |
| V9 | Colourblind-safe telegraph shapes | open | M |
| V10 | Elite trait glyphs (Swift / Volatile) | **done** 2026-10-03 | S |
| V11 | Remaining vector rooms and earlier modes to the neon kit | open | L |
| F1 | HUD toolbar covered the PA ticker | **done** 2026-10-03 | — |
| F2 | Stage off-centre on every window wider than 16:10 | **done** 2026-10-03 | — |
| B1 | Browser: Bench Warrant car shots spec fails (also on main) | **done** 2026-10-03 | — |
| B2 | Browser: prop-test-room keyboard walk times out (also on main) | **done** 2026-10-03 | — |

---

## V0 — Live visual QA of the 2026-10-03 batch

Every PR in #47–#50 shipped with "live QA outstanding". The first real-browser
captures and the first full browser-suite run (2026-10-03, `artifacts/live-qa/`)
found two layout defects (F1, F2, both fixed) and two failing specs that fail on
`main` too (B1, B2). They also confirmed that the Mannequin and Hanger
reactions, loot labels and HUD render.

**Done 2026-10-03.** `scripts/live-qa-sweep.mjs` captures the whole set in one
run (images in `artifacts/live-qa/sweep/`). It found no new defects, and every
page logged zero console errors. What it checked:
- the arsenal's 9 weapons mid-attack (grips plus effects);
- the 10-weapon dense dock ("1-9 OF 10 / Q WHEEL");
- the five-star wanted strip, which reads whole after #50;
- Static hits on Floor 2;
- the stage and menu at 390×844, 1920×1080 and 3440×1440 (centred, toolbar
  in its corner).

Notes for the next sweep:
- In the food court a held weapon can look as if it floats over a headless
  Alex in small crops. That is the room's spotlight leaving his torso in
  shadow, not a sprite defect: the renderer reports the full idle frame.
  Check at 1920×1200 before filing it.
- On a phone in portrait the 960×600 stage draws at 0.4×, so in-canvas HUD
  text is unreadable. Landscape is the supported phone orientation; a
  portrait HUD would be a new item.
- Not yet captured live: the Alex hurt and death sheets, and the escalator
  and ending cinematics.

Re-run the sweep after any presentation change.

## V1 — Native hurt reactions for the remaining enemies

**Done:** Mannequin, Static (PR #48), Hanger (2026-10-03). Every other kind
still gets the generic white flash, blood star, ring and blood decals.

Pattern (copy the Hanger):
1. Add the kind to `MATERIAL_REACTIONS` in `src/game/view/EnemyReactionView.ts`:
   hurt/impact keys, frame size, scale and feet Y. The feet Y is
   `(walkCanvas - idleFrame) / 2 + idleFrame * 0.84`, the same as `syncActorSprite`.
2. Register both PNGs in `src/game/presentation/assets.ts` (`ENEMY_TEXTURE_KEYS`
   and `NEON_ASSETS`).
3. Build art: a 4-frame × 8-facing hurt strip at the walk canvas size (rows in
   `ACTOR_DIRECTION_ORDER`), and a 6 × 48 px impact strip in the enemy's own
   material.
4. Give the kind a hit branch in `CombatFeedback.onHit`, replacing blood with
   its material. Leave death feedback alone unless it gets a death strip too.
5. Decide `hurtOutranksAttack`: only for kinds whose "attack" pose is not a
   timed wind-up.
6. Tests: copy `tests/unit/hanger-reactions.test.ts`, and add the sizes to
   `tests/support/enemy-renderer.ts`.

Suggested order and materials (most-seen first):

| Kind | Walk canvas | Material | Notes |
|---|---|---|---|
| shopper (Bargain Hunter) | check sheet | cloth + coupon paper | Floor 1-2 staple |
| walker (Mall Walker) | 92 | tracksuit fabric, sweat drops | harmless until bumped |
| mascot (Mascot Brute) | check | foam-suit stuffing | its charge is telegraphed: attack keeps priority |
| roofer | 136 | tar flecks | lob is telegraphed: attack keeps priority |
| spitter | no walk sheet | green goo (already its spill colour) | idle-only; build from idle |
| elf, spritzer, poodle, goon | check | glitter, perfume mist, fur, ice | district monsters |
| bosses (lp_manager, manager, owner, developer, santa, glamour_queen, whiskers, zamboni) | 128–180 | per boss | bosses flinch shorter (2/2/3 ticks); never over a wind-up |

Accept: unit tests; a `live-capture.mjs --target <kind> --attack` log that
shows `<kind>-hurt` frames; no blood decals for that kind on a hit.

## V2 — Authored attack sheets for wind-up enemies and bosses

Only the Hanger, Spitter and Loss Prevention Manager have attack sheets.
Everyone else telegraphs with a procedural squash and tint, and
`enemySpriteSheet` already names `neon:enemy:<kind>-attack` keys that do not
exist yet (they fall back safely). The bot's reaction-delay sweep
(`docs/neon-overhaul/balance/round57-reaction.md`) says the Perfume Spritzer
and the Volatile fuse are the tightest to read, so start there, then the
Mascot charge and the Roofer lob, then the bosses.

Contract: the same canvas and 8 rows as the walk sheet. The frame count is
free: `attackFrameFor` splits frames into wind-up (2/3) and release (1/3)
from the sim's telegraph progress, so the art must make the wind-up read
before the release. Needs new art (PixelLab or Retro Diffusion): ask the
owner. Accept: wind-up visible from the first telegraph tick in a live
capture, and `npm run balance:reaction` unchanged (presentation only).

**Done 2026-10-03: Spritzer, Mascot Brute, Roofer.**
- Six-frame sheets are *derived* from each walk sheet by
  `art/derived-poses/build_poses.py`: four frames of anticipation (lean
  away, crouch) and two of release (lunge along the facing). There was no
  generation spend.
- `attackFrameFor` previously mapped only spit and slam wind-ups to attack
  frames. It now maps **charge** and **lob** too: anticipation over the first
  85% of the telegraph (`WINDUP_RELEASE_AT`), then the release frames. So the
  Bargain Hunter, Poodle and Elf pick up a sheet the moment one exists:
  derive it with the same script, add a `neon()` entry, done.
- Live renderer evidence (`actorPresentation.enemies`, new in the debug
  bridge) showed all 6 frames of each sheet during real telegraphs.
- Honest limit: the existing wind-up glow tint still dominates late in the
  telegraph (the Mascot washes near-white), so the new frames add body
  language under it rather than replacing it. Easing that tint is a design
  call for the owner.
- Retro Diffusion was tried for a true new pose ($0.18, about $3.50 left).
  The pose was good, but it came out about 1.5× scale and changed the
  palette, and per-facing generations would drift, so derived art won for
  now.

Still open: Bargain Hunter, Poodle, Elf and Goon, and the bosses.

## V3 — Native effects for the remaining weapons (49 of 67 left)

The list is in `diagnostics/weapon-visuals/remaining-effect-roster.json`
(31 melee, 18 projectile since the thrown, water and spray families landed). Work by family rather than by item: one sheet each
in `public/assets/neon/weapon-effects/`, mapped in `src/game/view/weaponEffects.ts`.

| Family | Weapons (examples) | Effect |
|---|---|---|
| blunt swing | aluminum_bat, hockey_stick, golf_club, pipe_wrench, claw_hammer, mic_stand, candy_cane, pretzel_rod, dough_roller | dust-arc smear plus a 2-frame impact star |
| blade swing | pizza_cutter, salon_scissors, hedge_trimmer, figure_skate, foam_sword | thin glint arc (extend the cutter-slice sheet) |
| music | electric_guitar, keytar, drumsticks, boombox | note/sound-ring arc |
| water | garden_hose, super_soaker_50, super_soaker_cps, soda_gun, watering_can, water_balloons | reuse soaker-water, recoloured per source |
| spray | hairspray, flea_spray, ketchup_bottle, whoopee_cushion | mist puff (extend extinguisher-foam) |
| thrown | dodgeball, football, pog_slammer, laserdisc, jawbreaker, hockey_puck, garden_gnome, squeaky_toy | the item's own icon, spun (cheapest: no new art) |
| energy | laser_pointer, lightsaber_toy, laser_tag_rifle, flash_camera, lava_lamp, game_brick, camcorder | thin beam/bolt with a bloom core |
| mechanical | staple_gun, slingshot, tennis_ball_launcher, gumball_launcher, pepperoni_launcher, marshmallow_shooter, seed_spreader | small projectile sprite per item |

**Thrown: done 2026-10-03.** The eight thrown weapons now fly as their own
inventory icon: balls, discs, the gnome and the puck spin and roll the way they
travel, and the football flies point-first with a wobble. See `THROWN` in
`src/game/view/weaponEffects.ts`, the dev fixture `?fixture=mvp-thrown`
(slots 2-9) and `artifacts/live-qa/thrown/thrown-in-flight.png`. Fusions throw
the shooter inside them.

**Water: done 2026-10-03.**
- The Super Soaker 50 and CPS keep the soaker sheet.
- The hose, soda gun and watering can get exact four-colour palette swaps of
  it: tap blue, cola brown with cream fizz, and a pale shower. They are built
  by `art/weapon-effects/derived/build_water_variants.py`, which refuses to
  run if the soaker's palette changes.
- Water balloons lob as their own wobbling icon.
- Muzzle releases use each weapon's own water.
- Dev fixture `?fixture=mvp-water` (slots 2-7);
  `artifacts/live-qa/water/water-in-flight.png`.

**Spray: done 2026-10-03.**
- Hairspray (lilac with gold flecks), flea spray (green), ketchup (red with
  mustard flecks) and the whoopee cushion (a sickly puff with pink flecks)
  are five-colour palette swaps of `extinguisher-foam`, built by
  `art/weapon-effects/derived/build_spray_variants.py`.
- Each is sized to its own hitbox, and each releases its own mist at the
  nozzle.
- Dev fixture `?fixture=mvp-spray`. They read as short puffs, like the
  extinguisher.

Next: **energy** (laser pointer, lightsaber, laser tag rifle and others) needs
a new beam sheet. **Mechanical** shooters could reuse their icons the way the
thrown family does.

Keep the 240 fixed-seed replay
(`diagnostics/weapon-visuals/replay.test.ts`) unchanged.

## V4 — Alex: dash and ranged-aim animations

Alex has idle, walk, swing, hurt and death sheets. The dash is procedural ghost
copies (`dashPose`, the dash ghosts in `MvpRunView`), and firing a gun reuses
the body pose. Add `alex-dash.png` (4 frames: lean, stretch, smear, recover)
and an aim pose (1-2 frames with the arms forward). A derived dash (re-posed
walk frames plus a motion smear) is possible with the Hanger script approach.
Accept: the dash reads in a live capture at 1x, and the ghosts still follow
Flashes: Reduced.

**Dash done 2026-10-03.**
- `alex-dash.png` has 4 frames × 8 facings at the 64 px walk canvas, derived
  by `art/derived-poses/build_poses.py`: lean in, stretch plus motion smear,
  smear fading, recover.
- It plays across the sim's 12-tick dash, outranks a swing and yields to
  hurt and death. It replaces the procedural stretch; the dash ghosts
  remain.
- It draws along the **dash direction** (`dashX`/`dashY`), not the aim.
  Live QA caught the first version leaning toward the mouse.
- Preview: `art/derived-poses/preview.png`.

**Aim pose still open.** Re-posing cannot invent forward arms: this one
needs a generation or hand-pixelled frames.

## V5 — Purpose-made Alex portrait

The HUD draws `portraits/alex.png` at 56 px. Author a 56 or 64 px portrait (a
bust with the janitor cap and name tag) with a hurt variant, so the hurt tint
is not the only cue. Already an open follow-up in NEXT_SESSION.

## V6 — CRT/VHS post-process toggle

Phaser's post pipeline is unused. Add an opt-in Settings switch (default off)
for scanlines, slight barrel distortion and chroma bleed. Respect Flashes:
Reduced (no rolling bar). Keep the cost low: one fragment shader, and verify
the frame time stays the same in a live capture on the roof (the busiest
lighting).

## V7 — Skylight and roof weather

Rain streaks and puddle glints on Floor 4 and in rooms with skylights, plus an
occasional lightning flicker (suppressed under Reduced). Drive it from the
seed so it is deterministic in captures. Presentation only: rain must not make
anything Wet.

## V8 — Per-floor colour grading

Add a multiply/overlay tint per floor on top of the existing lightmap: warm
food court (3), cool management (2), sodium-orange roof (4). One table entry
per floor next to `floorSpecs` presentation data. Accept: side-by-side live
captures of all four floors.

## V9 — Colourblind-safe telegraphs

Telegraphs differ only by colour (magenta shots, red/green wind-up rings).
Add a second channel: dashes for charge lanes, a hatched fill for slam areas,
a ring with pips for fuses. Optionally a Settings palette (deuteranopia-safe).
Accept: a greyscale screenshot still separates every telegraph.

## V10 — Elite trait glyphs

Swift (cyan) and Volatile (orange) differ by aura colour only. Add a small
glyph to the price tag (a chevron for Swift, a fuse spark for Volatile). This
answers the round-57 playtest question about telling them apart.

## V10 done (2026-10-03)

The elite traits now read by shape as well as colour:
- Clearance: a price-tag glyph and one solid ring.
- Swift: a `>>` chevron and a dashed ring that turns (still under Flashes:
  Reduced).
- Volatile: a lit-fuse glyph and a double ring.

They stay distinct in greyscale (`artifacts/live-qa/elites/elite-marks.png`).
See `src/game/view/eliteMarks.ts` and the dev fixture `?fixture=mvp-elites`.
This also covers part of V9 (colour-blind telegraphs) for elites.

## V11 — Remaining vector rooms and earlier modes

The earlier modes (Start Shift, Interaction Lab, Shoplifting Loop, Void the
Warranty) keep their graybox look. Night Shift is the game, so this is the
lowest priority. Convert only if the owner wants those modes kept.

---

## F1 — HUD toolbar covered the PA ticker (fixed 2026-10-03)

Found by the first live capture: the Menu/Fullscreen buttons were centred at
the top and sat on the PA ticker whenever the stage reached the top of the
window (most 16:9 and 16:10 desktops). They now sit in the free top-right
corner, 28 px tall for mouse users. Touch screens and small screens keep 44 px
targets in their own safe rail. See `tests/unit/viewport-layout.test.ts`.

## F2 — Stage off-centre on wide windows (fixed 2026-10-03)

On any window wider than 16:10 the stage sat right of centre: 32 px at
1280×720, 48 px at 1920×1080 and 284 px at 3440×1440. Phaser centres the canvas
with margins, but the base `#game-host { place-items: center }` also applies to
block layout in current Chromium, so the canvas's margin box was centred a
second time. The fix is `place-items: normal` in run mode. Found by the
existing `viewport-layout.spec.ts`, which had never been executed until now.
Before/after: `artifacts/live-qa/centering-and-toolbar-before-after.png`.

## B1 — Bench Warrant car shots browser spec (fixed 2026-10-03)

The cause was the test, not the game: Party Popper confetti lives only a few
ticks, so a snapshot taken after releasing the button raced the shots' expiry.
The spec now reads the shots while the button is held, with the same "began at
the car" assertion. Original notes:

`tests/browser/night-shift.spec.ts` "the Bench Warrant kiosk previews and
fuses the car, and shots then start at the car" fails on `main` and here: no
player shot exists at the post-click snapshot (`shots.length` is 0). Look at
the timing first (the 140 ms mouse hold against the shot's lifetime under
load), then at whether a click on the car's position can land on a DOM
control. Run it alone with
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/browser/night-shift.spec.ts:1079`.

## B2 — prop-test-room keyboard walk times out (fixed 2026-10-03)

The walk was not stuck. It takes about 2.7 minutes serially, in short
overshoot-safe key pulses around three props, so 90 s always timed out. The
budget is now 240 s. Original notes:

`tests/browser/prop-test-room.spec.ts` times out inside `walkTo`
(`tests/browser/keyboardNavigation.ts`) on `main` and here. That helper has a
history of overshoot under latency (see STATUS, 2026-10-02). Reproduce it
alone and log the player's position per pulse.
