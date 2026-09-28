# Neon overhaul — how the mall is drawn, and how to extend it

Branch `claude/neon-overhaul`, forked from `codex/presentation-3quarter` (left
untouched as the comparison baseline). Target look: the user's DEAD MALL key
art — a dark 90s mall lit by neon and warm light pools, 3/4 storefronts with
lit interiors, blood on the floor, and an Isaac-style HUD.

## What changed and why

| Problem in the baseline | Change |
|---|---|
| Flat, evenly lit rooms; beige terrazzo everywhere | Multiply **lightmap** per room (ambient mood + light pools) with an additive **glow** layer and adaptive **bloom** |
| Only the opening had art; every other room was gray vector boxes | A data-driven **room dressing planner** themes all six room roles |
| Storefronts were shallow strips with Courier labels | 160 px **PixelLab storefront panels** on a 3/4 back wall, **procedural neon signs** in an original pixel font, with floor reflections |
| A scrolling 640x360 window onto a 960x480 room | A fixed **960x600 stage**: the whole room plus a 120 px storefront band, always on screen (Isaac framing) |
| Purple squares for enemies | PixelLab **8-facing sheets** for Hanger (skitter walk), Spitter, and the Loss Prevention Manager (stalk walk) |
| No hit feedback | **Damage numbers, blood decals, sparks, screen shake, hurt flash** |
| A debug-style DOM text strip | An in-canvas **game HUD**: portrait, hearts, hotbar with item icons, wing minimap, objectives, pickup log, boss bar, neon area title cards |
| Starting $30 was the only money in a run | **Mall Tokens** (gameplay): monsters drop change, the janitor sweeps it up, so fights fund shopping |

## Architecture

```
src/game/presentation/
  neon/pixelFont.ts            original 5x7 font: signs + HUD text
  neon/proceduralTextures.ts   lights, shadows, token, hearts, floors, neon signs, labels
  lighting/LightingLayer.ts    lightmap (MULTIPLY), flicker, adaptive bloom
  rooms/roomDressing.ts        PURE planner: WingRoomDefinition -> DressingPlan
src/game/view/
  MallRoomView.ts              draws a DressingPlan; owns lights, props, civilians
  CombatFeedback.ts            numbers, blood, sparks, shake (renderer memory only)
  MvpRunView.ts                actors, stores, tokens, dynamic lights
src/game/ui/
  gameHudModel.ts              PURE: run state -> hearts/objectives/minimap/hotbar
  GameHud.ts                   draws the model, screen-fixed
src/sim/run/tokens.ts          Mall Tokens (the one simulation feature)
```

Layer order (see `presentation/depth.ts`): floor → decals → back wall →
low props → **y-sorted props + actors** → railing → **lightmap** → **glow** →
effects/telegraphs (unlit, always readable) → prompts → HUD.

The simulation stays authoritative. The only sim changes are the Mall Tokens
and the Opening Concourse fountain, which is now authored collision
(`OPENING_FOUNTAIN`), placed south of the door lane.

## Extending it to the rest of the game

**A new variant of an existing room role** needs nothing: the planner covers
every authored collision rectangle with a prop chosen by the rectangle's shape
and the room's theme (`coverWall`). `tests/unit/room-dressing.test.ts` fails if
any wall is left uncovered, any decor blocks a doorway lane, or a texture is
unregistered.

**A new room role** (e.g. a parking garage, a cinema auditorium):

1. Add a theme function in `roomDressing.ts` returning a `DressingPlan`:
   storefront panels for the back wall, floor style, ambient colour, props,
   lights, neon. Keep ambient darker the deeper the room is in the shift (a
   test asserts the mood progression).
2. Add it to `planRoomDressing`.
3. If it needs new art, generate it (below) and register it in
   `FACADE_TEXTURES` / `PROP_TEXTURES`.

**A new store template**: add an entry to `STORE_LOOKS` (panel, neon colour,
subtitle, interior floor, shelf fixture). The sign text is always the store's
simulation name, so HUD, sign and shop logic can never disagree.

**A new enemy kind**: generate an 8-direction PixelLab character, animate it,
pack it with `pack_character.py`, add it to `ENEMY_TEXTURE_KEYS` and
`enemySpriteSheet`.

## Art pipeline

All runtime art is local under `public/assets/neon/`, listed with source and
sha256 in `public/assets/neon/manifest.json`.

```bash
# promote sources in docs/art/neon-overhaul/pixellab/ (+ the earlier art pass)
python3 docs/art/neon-overhaul/import_assets.py --legacy <extracted public/assets>
# pack a PixelLab character export into a walk sheet (8 rows, game facing order)
python3 docs/art/neon-overhaul/pack_character.py <export dir> <animation> <out.png>
```

The `--legacy` tree is `public/assets` from `codex/pixellab-aseprite-proof`
(`git archive codex/pixellab-aseprite-proof public/assets | tar -x -C /tmp/pl`).

PixelLab recipe that produced consistent storefronts (`create_map_object`,
`low top-down`, 288x160 or 256x160, high detail, detailed shading, selective
outline):

> 1990s shopping mall **\<kind of store\>** front seen from slightly above,
> **\<what is in the windows\>**, **\<interior light colour\>**, dark pillars on
> both sides, open doorway in the middle, **blank dark sign band across the top**

The blank sign band matters: text is never generated. Signs are set in the
pixel font by `ensureNeonSign`, so they are always legible and always match
the simulation's names. Props use `high top-down` at roughly the size they
will be displayed.

Generation spend for this pass: 62 PixelLab generations (1,215 → 1,153 remaining in the cycle).

## Checking the look

```bash
VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort
node scripts/capture.mjs http://127.0.0.1:4180 artifacts/neon-overhaul opening storefront foodcourt boss
node scripts/playtest-fight.mjs http://127.0.0.1:4180 artifacts/neon-overhaul
```

Both scripts launch Chromium on the Metal GPU so captures include bloom.
Bloom is skipped automatically on software renderers (headless CI), and
dropped at runtime if a real device cannot hold 45 fps.

## Round 2 — UI, weapons, swing, characters

- **Weapon switching** (`src/sim/run/weapons.ts`): weapons (items with an attack)
  are numbered 1..n; passives are always on. Keys 1-9, Q / Shift+Q, mouse
  wheel, or click a hotbar slot. Tests: `tests/unit/run-weapons.test.ts`.
- **HUD at pixel x2** (`GameHud.ts`): equipped weapon name + plain-English blurb
  (`itemBlurbs.ts`), numbered slots, an ALWAYS ON passive strip, key-cap
  prompts, new-item toasts that say how to use the item, a start-of-shift
  controls card. Redraws only when its content changes (software renderers).
- **Mop swing** (`WeaponView.ts`): the sim's hit window is 6 ticks, so the
  view plays a 16-tick swing drawn at the weapon's true range/half-angle, with
  the equipped weapon sprite in hand. The janitor faces the aim.
- **64px PixelLab characters**: Alex (empty hands, so the held weapon is the
  equipped one) and four shoppers, packed by `fetch_character.sh` /
  `pack_character.py` (`--rotations` for idle strips). Frame sizes are read
  from the textures, so regenerating at another size needs no code change.
- Replaced props: the Bench Warrant repair desk and a straight planter box.

## Round 4 — combat readability: see it coming, feel it land

Everything here is presentation read from authoritative state; no damage,
timing or AI rule changed. Pure rules live in `src/game/view/combatBeats.ts`
(tests: `tests/unit/combat-beats.test.ts`).

- **Wind-ups** come from the simulation's own telegraph fields, so every
  warning is the real attack: the Spitter's dashed spit lane along its locked
  aim, the boss slam ring at the authored reach filling from the centre, the
  volley's five real angles, and a big pixel "!". Hangers have no telegraph —
  they hurt by touch — so they rear up and their claws flare red inside
  `HANGER_WARN_DISTANCE`. Charging sprites swell/rise, tremble, glow the
  attack colour and flash white on the release tick.
- **Landing** (`CombatFeedback.ts`): the struck sprite goes solid white and
  snaps back along the hit with a squash-and-stretch spring (`hitReaction`),
  a comic impact star and ring pop at the contact point, blood sprays through
  the enemy, damage numbers pop oversized, kills throw a splat, shockwave and
  a word (WHAM! SPLAT! BONK! MOPPED! CLEANUP!; the boss gets CLOSING TIME!).
  The slam shockwaves and scorches the floor whether or not it connects.
  Getting hurt: star + shockwave on Alex, knockback, a red edge vignette,
  OUCH!/CRUNCH!, a big -N, and the HUD hearts pop and wobble.
- **Hit stop** (`MvpRunScene.update`): the fixed-step clock holds 45-160 ms
  (420 ms on the boss kill) after a beat — exactly like a very short pause.
  Held input stays held, queued presses wait. Beats in one frame never stack.
- **Enemy globs** are drawn as outlined magenta blobs with a trail; the solid
  core is the hitbox.
- **Attack and death sheets**: when `enemies/<kind>-attack.png` loads, the
  wind-up scrubs its first two-thirds in step with the telegraph so the strike
  frame lands on the tick the simulation fires (`attackFrameFor`); a
  `<kind>-death.png` plays where the enemy fell, facing the janitor. Both
  are optional — without them the vector/pose effects still play.
- `pack_character.py` now mirrors a missing east-side facing from its
  west-side twin, so PixelLab animations need 5 directions, not 8.
- `node scripts/capture-beats.mjs <baseUrl> <outDir>` screenshots each beat.
- **Sound for the beats** (`src/game/audio/`, still fully synthesized, no
  files): enemy hits were silent before (the `hit` recipe existed but no cue
  fired it) — now `hit` / `hit_heavy` fire when an enemy loses health without
  dying, kills get a splat, thump and comic sting, the boss gets `boss_down`,
  Spitters get a rising gargle for the whole telegraph plus a wet `spit`, and
  the slam lands with a boom hit or miss. The boss wind-up rises for exactly
  the 36-tick telegraph. Getting hurt plays a crunch, then the scene calls
  `audio.muffle(ms)`: a master low-pass closes for the hit stop and reopens.
  Cues are derived from state changes, so they fire on the frozen frame.

## Round 5 — Alex's swing, flinch and death

- PixelLab sheets `public/assets/neon/player/alex-{swing,hurt,death}.png`
  (8 rows, same layout as the walk; action canvases grow around the 64px idle
  canvas and the feet are placed from the idle frame). `playerBodyAction`
  (`combatBeats.ts`) picks one: death overrides everything and holds its last
  frame, a hit interrupts a swing, and the swing scrubs in step with the
  visible 16-tick swing (melee only; guns keep the walk/idle body).
- `WeaponView.noteAttack` is idempotent, so the body asks for the swing
  before the weapon draws and both start on the same frame.
- Sheet provenance: the swing is the v3 "sweep" (south/west/north; the
  first "swing" attempt flapped its arms and baked in a stick, so it was
  replaced). The hurt sheet combines the v3 "flinch" south row (first 6
  frames) with the `taking-punch` template's west row. Death is the
  `falling-back-death` template.
- Game over: the sim clock stops, so combat feedback switches to a real-time
  clock (`MvpRunView.effectsTick`) and the last hit's effects finish and fade
  instead of freezing over the body; wind-ups and the hurt ring/flicker are
  hidden once the shift is over; the blow that ends the shift now gets its
  own impact (feedback is only suppressed by the pause menu).

## Round 6 — end card, status bar, fairness, dash, performance

- **End-of-shift card** (`src/game/ui/ShiftCard.ts`, model
  `shiftCardModel.ts`): SHIFT OVER / CLOCKED OUT drawn in-canvas on real time
  (the sim clock is stopped), after the death fall; rows reveal one by one;
  RETRY / NEW SHIFT (R, Enter) and TITLE (T) are clickable.
- **Status bar**: the DOM status bar and summary sit off-screen at natural
  size in run mode (`styles.css`), still read by assistive tech and the
  browser tests; only the action row stays above the canvas.
- **Fairness** (measured, not guessed — sim-level scripted brawler over 150
  seeded runs): ~80% of room-entry damage was Hanger contact, because a Hanger
  closed the gap within one mop cooldown. Melee hits now knock Hangers back
  48 px (`MELEE_KNOCKBACK`). Knocking back Spitters was tried and measurably
  worse (you chase a shooter through its fire), and staggering Spitter
  openers was tried and reverted (no improvement). The bot's win rate is too
  sensitive to its own logic to tune by; use a human playtest for difficulty.
- **Dash** (`src/sim/combat/dash.ts`): Space, 126 px over 12 ticks, enemy
  hits cannot land and globs pass through, 45-tick cooldown; own timers so it
  never reads as "just hurt". Whoosh, cyan afterimages, dust puff, stretch.
- **Heavy hits** start at 5 damage (`HEAVY_HIT_DAMAGE`), above the mop's 4.
- **Performance** (`node scripts/perf-fight.mjs`): M2 GPU 60 fps median /
  60 p10 in a Food Court fight; SwiftShader software GL 30 / 29 (bloom
  auto-disabled). Real low-end laptops, Safari and Windows remain untested.

## Round 7 — reading your own state

Pure rules in `src/game/view/playerCues.ts` (tests: `player-cues.test.ts`).
- **Dash readiness**: a thin cyan ring under the janitor refills over the
  cooldown and flashes white when the dash is back.
- **Dash hint**: `SPACE: DASH!` pops over the janitor when a spit (within
  ~25 degrees of its aim), volley, or slam (inside its reach) past a third of
  its wind-up is aimed at them and a dash is ready. Retires after 3 dashes a
  run. Kept on screen near walls; hidden while paused.
- **Last heart**: at 2 health or less a lub-dub heartbeat plays on a real-time
  timer (faster at half a heart) and the red edge vignette pulses with it.
- **Arrivals**: enemies rise out of the floor with a flash and a floor ring the
  first time they are seen in a room (boss summons included), instead of
  popping in; the camera fades in from the mall's dark on every door.
- **Pause card** (`src/game/ui/PauseCard.ts`): neon PAUSED, the controls
  (including SPACE DASH) and ESC TO RESUME, instead of one DOM line.

## Round 8 — soundtrack, store card, Bench Warrant card

- **Soundtrack** (`src/game/audio/music.ts`, pick in `musicState.ts`): warped
  electric-piano muzak in quiet rooms, four-on-the-floor synthwave while
  enemies live, a broken-beat D minor Loss Prevention theme that speeds up
  with his phase. Tracks are data (sixteenth steps, MIDI notes) booked 0.25 s
  ahead on the Web Audio clock and crossfaded on their own gains. Paused
  ducks it, shift end silences it, `N` toggles music alone, and it runs
  through the master bus (mute and the hurt muffle apply). Verified by
  offline-rendering each track in Chromium: non-silent, no clipping.
- **Store card**: standing at an offer shows its icon, name and price, what
  it does (`itemBlurbs.ts`), WEAPON/PASSIVE, the keys (greyed when refused)
  and the deciding line — `NEED $N MORE`, `HANDS FULL`, or the real steal
  cost (`+15 HEAT AT THE EXIT`, less with the Smuggle Pouch). It flips to the
  top when the janitor is in the lower half so it never covers the shelf.
- **Bench Warrant card** (`src/game/ui/BenchCard.ts`, model
  `benchCardModel.ts`): ingredients with icons, what they become, a
  before/after table, fee vs cash, the permanence warning, and FUSE (Enter)
  / CANCEL (Esc) buttons. Replaces the dense DOM modal; the DOM copy keeps
  only its two buttons in the top strip (text off-screen for assistive tech
  and the tests). The pause card no longer shows under an open preview.

## Round 9 — playtest log

- **Recorder** (`src/game/playtest/recorder.ts`): compares consecutive run
  snapshots, like the audio cues, and builds one record per shift — time,
  kills and damage by source per room (Hanger touch, Spitter glob, boss slam,
  boss volley, other), dashes, bought/stolen, what landed the final blow, and
  the outcome (won / dead / quit on restart or return to title).
- **Log** (`src/game/playtest/log.ts`): this browser's localStorage only, off
  until switched on, newest 50 runs, every storage call guarded. Nothing is
  sent anywhere (the repo's no-telemetry rule).
- **Title → Playtest stats**: the switch, a summary (win rate, where shifts
  end, damage by source, average time per room, most bought), the last 10
  runs, Copy as JSON (to paste back for tuning) and Clear.

## Known gaps / next steps

- Round 3 finished the cast at 64px: a portrait generated from Alex's
  sprite, and fresh 64px Hanger (skitter walk), Spitter and Loss Prevention
  Manager (stalk walk, drawn at 2x as a boss). Two stalled Hanger directions
  (east, south-east) are mirrors of west/south-west. Rotating an existing
  sprite with PixelLab keeps its size, so upscaling needs fresh generation.
- The DOM status bar above the canvas is still required by the browser tests
  (HP/cash/room/objective must stay visible there); it now duplicates the
  in-canvas HUD. Folding it into an accessible off-canvas panel is the next
  UI cleanup.
- Earlier modes (Start shift, Lab, Shoplifting Loop, Void the Warranty) keep
  their original presentation; Night Shift is the game.
- Physical-device, Safari and Windows performance are untested.
