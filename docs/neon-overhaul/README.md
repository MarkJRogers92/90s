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

## Round 10 — settings

- **Store** (`src/game/settings/settings.ts`): shake, freeze-on-hit (full /
  reduced / off), flashes (full / reduced), music and effects volume. Saved in
  this browser (guarded); garbage repairs to defaults. Presentation only —
  hit stop off just means the clock never holds.
- **Applied**: camera shake scales through `CombatFeedback.shake`; the scene
  scales the hit stop; reduced flashes drop solid-white sprite and corpse
  flashes, the full-screen hurt flash and the neon flicker, and soften the
  red vignette and heartbeat pulse; effects play through their own bus and the
  music bus follows its slider.
- **Dialog** (`src/game/ui/SettingsPanel.ts`): one neon form for the title
  (Settings) and the game (O, the SETTINGS button, listed on the pause card).
  Opening it mid-shift pauses; Esc closes it first without unpausing.

## Round 11 — first playtest: tuning, readability, new features

Scope note: the owner explicitly asked for new features past the M0-M1
boundary ("add whatever other features you think might be fun"); these are
additive, seeded and rule-owned by `src/sim`.

- **Playtest** (2 runs, both won, 0 and 2 damage, boss never landed a hit) →
  Hangers/Spitters 8 → 12 health, Spitters rest 90 → 66 ticks and shoot 150 →
  175 px/s, boss 60 → 90 health, chases 30 → 48 px/s, slam reach 44 → 52
  (`tests/unit/difficulty-tuning.test.ts`).
- **Store items readable from afar**: colored loot beams and pedestals (cyan
  weapons, green passives), 36 px ringed icons, name labels (nearest grows).
- **Cleanup Combo** (`src/sim/run/combo.ts`): landed blows chain; hurt or 2.5 s
  idle drops it; every x5 drops a bonus token pile; HUD meter + chime.
- **CLEARANCE elites** and **pretzels** (`src/sim/run/luck.ts`): ~18% of regular
  enemies spawn elite (2x health, 3x change, gold aura, tag); kills sometimes
  drop a pretzel that heals half a heart and waits until you need it. Rolls
  are an independent seeded hash, so wing generation is untouched.
- **Room events** (`src/sim/run/roomEvents.ts`): BLACKOUT (one combat room,
  flashlight cone and glowing eyes) and BLUE LIGHT SPECIAL (one item half
  price in `runOfferPrice`, blue beacon, tagged name, explained on the card);
  announced in the room title card.
- **Score and best run** (`src/game/score/score.ts`): score on the end card
  with a NEW BEST stamp; best shift shown on the title (this browser only).
- **Boss intro**: LOSS PREVENTION card with letterbox bars and a door slam.

## Round 12 — controller support

`src/game/input/gamepad.ts` maps the browser's standard gamepad layout to the
same intents as keyboard and mouse: left stick / d-pad move, right stick aims
(and fires when pushed all the way), RT attacks, A or LT dashes, X buys/uses,
Y steals, B recalls, LB/RB switch weapons, Start pauses. Radial deadzones,
press-edge one-shots, and the last-used device owns the aim (moving the mouse
takes it back). The scene reads the pad once per frame, so the pause, Bench
Warrant (A fuse / B cancel) and end-of-shift (A retry / B title) cards work
from the pad too; the pause card lists the pad layout when one is connected.

## Round 13 — the Mannequin

A new enemy with a signature rule (`src/sim/combat/mannequin.ts`): it only
moves when you are not looking. While the janitor's aim is within 35 degrees
of it with a clear line of sight it is frozen and harmless even at arm's
length; the moment you aim elsewhere it rushes at 160 px/s (faster than a
Hanger) and hurts on touch. 20 health, knocked back by the mop like a Hanger,
drops $3. The back hall always has two display mannequins; the food court has
one in ~40% of shifts (seeded open-grid spots clear of walls, doors and other
enemies; `rooms.ts`). Rooms now hold their authored enemies first, then only
mannequins.

Presentation: PixelLab "mannequin posed" (96 px, drawn at 72) with its stiff
8-direction walk and a template death fall; moving mannequins jitter like bad
stop-motion with red eyes in the blank face; a faint gaze cone (cyan while any
is frozen, red when none is) teaches the rule; a one-time MANNEQUINS hint after
the room title; a plastic creak when one starts moving; beige plastic chips and
broken-plastic decals instead of blood; its own playtest damage source.
`?fixture=mvp-back-hall` skips straight to them (dev only).

## Round 14 — the soundtrack, rebuilt

`src/game/audio/music.ts`: four sixteen-bar tracks and a tension layer, all
synthesized. New engine: a shared reverb on a generated impulse, a
tempo-synced echo, kick-driven sidechain ducking, a limiter, and new voices
(supersaw, pluck, FM bell, choir, drive bass, tremolo strings, drone, clap,
tom, crash, open hat). Voices carry `minIntensity`, so the arrangement builds
with the game's intensity (`musicState.ts`: enemies alive, last heart, boss
phase).

- "Attention Shoppers" (muzak, 92, swung): Rhodes comping, walking bass,
  vibraphone melody over C-major jazz changes.
- "Food Court Frenzy" (combat, 124, A minor): kick and pumping bass first;
  hats, claps, plucked arpeggio, pad, then a supersaw hook as the room fills.
- "Loss Prevention" (boss, 138, D minor Phrygian): drive bass, alarm stabs
  and a siren, choir; supersaw theme and tom fills in later phases; faster
  per phase.
- "Lights Out" (blackout, 76, E minor): heartbeat kick, drone, distant bells.
- Tension layer: tremolo strings while an unwatched mannequin moves.

`node scripts/render-music.mjs` renders each loop offline to WAV with RMS and
peak; MP3 previews are in `artifacts/neon-overhaul/music/`.

## Round 15 — Floor 2: the Upper Level

Beating Loss Prevention no longer ends the run: the end card says FLOOR
CLEARED and offers the ESCALATOR (R / Enter / pad A) or CLOCK OUT.

- **Sim** (`src/sim/run/floors.ts`): `ascendToFloorTwo` builds a new wing from
  `floorTwoSeed(seed)` with `generateWing(seed, 2)` — same six room ids and
  graph, new names (Escalator Landing, Upper West Shops, Cinema Lobby, Upper
  East Shops, Parking Stairwell, Management Suite), variant-max enemy counts —
  and carries inventory, cash and stats, healed. Checkpoints save `floor: 2`.
- **The Static** (`staticEnemy.ts`, 14 hp): drifts, locks onto where you
  stand, then blinks there and shocks everything within 48 px. Dash or move.
- **The Bargain Hunter** (`shopper.ts`, 18 hp): sees you from 320 px, winds up
  a lane, then charges at 9 px/tick; only the charge hurts, and a wall stuns
  it. Spawns with a 50-tick beat so one by the door can't hit you on entry.
- **The Mall Manager** (`BOSS_CONFIGS.manager`, 150 hp): bigger slam, a
  seven-shot volley, summons Bargain Hunters. Own intro card, boss bar name.
- **Presentation**: upper-floor dressing (`upperFloor` in `roomDressing.ts`:
  cinema, arcade, carpet, sodium-lit stairwell, gold MANAGEMENT suite),
  cyan blink rings and charge lanes as wind-ups, PixelLab art for all three.
- Dev fixtures: `mvp-floor-two`, `mvp-floor-two-lobby`, `mvp-floor-two-boss`.
- **Music** (`music.ts`, picked in `musicState.ts` by `wing.floor`): upstairs
  fights play "Escalator Rush" (128, F sharp minor: chugging drive bass,
  cinema-organ stabs, bell arpeggio, supersaw hook); the Mall Manager gets
  "Performance Review" (146, C minor with a Neapolitan D flat: brass-like
  fanfare, march roll in phase 2, a cash-register ding-ding, faster by phase).
  Muzak between fights is shared. Previews in `artifacts/neon-overhaul/music/`.
- **Playtest log**: records carry `floor: 2`; Static shocks and Bargain Hunter
  charges are their own damage sources; the summary keys upstairs rooms as
  `2:<roomId>` so the Cinema Lobby never merges with the Food Court.

## Round 16 — a new mall every shift, sharper upstairs

- **Seeds** (`src/game/run/shiftSeed.ts`): without `?seed=` every fresh shift
  rolls a mall (1..999,999); RETRY after dying and Restart replay the same
  one; NEW SHIFT after a win rolls again. `?seed=N` pins the mall for sharing
  and for the browser tests (those that depend on a layout pin it). The end
  card's MALL row shows the number to share (the floor-1 seed, upstairs too).
  Before this, every shift without `?seed=` was mall 0.
- **Tuning from the first Floor 2 playtest** (a win with 3 damage, all from the
  Manager's volley; Statics and Bargain Hunters landed nothing in 10 kills):
  Static lock-on 42 → 34 ticks and drift 80 → 64; Bargain Hunter recovery 40 →
  24 ticks and walk 55 → 70 px/s. Wind-ups stay dodgeable on foot (asserted in
  `difficulty-tuning.test.ts`).

## Round 17 — polish pass

An audit of every screen (captures in `artifacts/neon-overhaul/audit/`), then:

- **Title**: PixelLab key art (`public/assets/neon/ui/title-keyart.png`, the
  janitor alone in a dead mall at night); Night Shift is one big pulsing
  clock-in button (no pulse under reduced motion); the older modes sit in a
  muted Prototypes row; two columns on wide screens, art hidden under 1100 px;
  Settings and Playtest panels dim the page behind them.
- **The Mall Manager, redesigned**: grey suit, blood-red tie, gold badge, red
  eyes; an 8-frame stalking walk and a falling-back death.
- **Sound**: the Static whines as it locks on and zaps when it blinks; a
  Bargain Hunter's charge is a runaway cart.
- **HUD fixes**: toasts (MANNEQUINS, new items) wait for the room title card
  instead of drawing over it; the nearest offer's grown name hides the
  neighbour names it would overlap; the Floor 2 map names its own rooms; the
  pickup log wraps at a word onto two lines instead of cutting mid-word; the
  dash hint sits under the janitor so it never stacks on damage numbers; the
  DOM boss chip moved off-screen (the canvas boss bar shows it).

## Round 18 — the escalator ride

Taking the escalator now plays a 3.6 s ride instead of a fade
(`src/game/ui/EscalatorRide.ts`, timing in the pure `escalatorRideModel.ts`).
Alex rides a neon escalator (yellow-edged steps, a bolted side panel with a
magenta underglow, glass and a moving handrail drawn in front of him) up the
diagonal while the ground floor's shops drop away and the cinema and arcade
fronts come down, under pendant lamps, downlights and skylight beams. UPPER
LEVEL lights at the halfway mark, then it fades to the landing with the PA
chime; a synthesized escalator hum plays on boarding. The simulation ascends
instantly and does not tick during the ride; any key, click or pad button
skips it after a 300 ms grace (so the press that chose the escalator does not
also skip it), and Esc cannot pause underneath it. The start-of-shift
controls card no longer repeats on Floor 2.

## Round 19 — cinematic bookends

Three set pieces, each timed by a pure, tested model in `src/game/ui/` and
drawn by a small Phaser class; all presentation only.

- **Clock-in cold open** (`ClockIn.ts`, `clockInModel.ts`): under a buzzing
  fluorescent tube, Alex's time card slides into a PixelLab punch clock,
  KA-CHUNK (stamp thud, jolt), and comes back out stamped a minute or two
  before midnight (read off the mall seed); NIGHT SHIFT lights up. It plays
  for a fresh shift (launch or NEW SHIFT), not for a retry, a continued run
  or a dev fixture. It never holds the run or swallows input: the concourse is
  calm, and the first key clears it and still reaches the game.
- **Boss kill cam** (`KillCam.ts`, `killCamModel.ts`): a white flash, the camera
  pushes in on the body with letterbox bars (the overlay is counter-scaled
  against the zoom), the HUD clears, the death fall plays in slow motion
  (`MvpRunView.setEffectsTimeWarp`), and a rubber stamp slams down —
  LOSS PREVENTED / YOU'RE FIRED. The end card waits for it.
- **Dawn ending** (`DawnEnding.ts`, `dawnEndingModel.ts`): after the Mall
  Manager, sliding doors part on a PixelLab sunrise over the empty parking
  lot; Alex walks out, shrinking to a silhouette; SHIFT COMPLETE / THANKS FOR
  SHOPPING AT DEAD MALL / STORE HOURS: NEVER AGAIN; the last shot holds under
  the CLOCKED OUT card.
- New synthesized cues: `stamp`, `dawn`. New dev fixture
  `mvp-floor-two-boss-win`. The debug snapshot reports `cinematic` so
  presentation-stability tests measure the concourse, not the cold open.

## Round 20 — the pink slip and the mall PA

- **Pink slip** (`PinkSlip.ts`, `pinkSlipModel.ts`): when Alex dies, a Notice
  of Termination flutters down (paper swish) with a reason fitting what landed
  the last blow — the playtest recorder's `lastDamageSource` (SLIPPED ON AN
  UNREPORTED SPILL, INSUBORDINATION TOWARD A DISPLAY, DISAGREEING WITH
  MANAGEMENT...) — takes a red FIRED stamp, then drops away. After a pink slip
  or kill cam the end card opens almost at once (`shiftCardDelayMs`, now in
  the pure model). Dev fixture `mvp-last-heart`.
- **Mall PA** (`paModel.ts`, `PaTicker.ts`): `PaDirector` watches run state and
  speaks on the boss room, the upper level, blackouts, Blue Light Specials,
  a first drop to the last heart in a room, rising heat, big combos, some
  room entries, and long quiet stretches — with a 12 s cooldown (boss,
  upstairs and room events cut in), a 3 s quiet start for the cold open, and
  seed-picked lines. The ticker: a ding-dong, then an amber LED line typed
  out (a cropped monospace label) over a garbled `pa_voice` babble; it waits
  out cinematics and clears when the shift ends.

## Round 21 — the top HUD steps aside; weapons you can tell apart

- **Top HUD** (`hudExpanded`, `collapsedObjective` in `gameHudModel.ts`): the
  objectives and wing map show in full for 5 s on entering a room and 4 s
  after an objective appears or completes (ticking counts don't reopen it),
  and whenever paused, holding Tab, or the shift is over; otherwise they
  collapse to two slim corner chips (the current objective, and a row of room
  pips), so the storefront art stays visible.
- **Bug fixed** (`buildPlayerProjectileSpec`): every projectile weapon fired
  the first-owned weapon's shot (buy a Bottle Rocket Pack first and the
  Soaker fired rockets). It now fires the equipped weapon's own payload.
- **Every weapon reads differently** (`projectileStyle.ts`, drawn by
  `MvpRunView.drawShot`, at well above hitbox size with its own light):
  Soaker droplet, Party Popper confetti, Bottle Rockets with a flame trail,
  Extinguisher cloud, Paint Marker dart, Foam balls, Slushie. Bubbles are
  iridescent; sticky shots drip; rewinding shots get a VHS-blue ghost;
  conductive shots crackle.
- **Chains are lightning**: the sim records each conductive chain's path
  (`RunState.chainArcs`, kept 18 ticks, never read by a rule) and the view
  draws a jagged three-layer bolt between the enemies with a flash at each.
- **Statuses**: Wet enemies tint blue, drip and stand in a puddle; Sticky
  ones tint amber with goo strands.
- **RC car**: a PixelLab red racer that faces its direction of travel,
  bounces and kicks up dust, idles with a rattle, has a mode-coloured floor
  ring and blinking antenna, a radio link of dots back to Alex, and sparks
  when it bumps an enemy. Dev fixture `mvp-arsenal` holds every weapon.

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

## Round 23b — Floor 3: Food Court After Dark

Beating the Mall Manager no longer ends the night: the card says FLOOR CLEARED
and offers the ESCALATOR, the ride plays (now titled FOOD COURT / LEVEL 3), and
a third wing begins. Beating **the Mall Owner** on Floor 3 is the win: kill cam
("GOING OUT OF BUSINESS"), the dawn walk-out, then CLOCKED OUT.

- **Sim**: `floors.ts` generalises the escalator to `ascend(state)` (and
  `floorOf`, `floorThreeSeed`, derived from the floor-2 seed); `ascendToFloorTwo`
  still works. Gear, cash, stats and perks carry; health is restored to the
  perk-adjusted maximum. `generateWing(seed, 3)` keeps the six-room shape under
  new names (Food Court Seating, Pizza Counter, Arcade, Kitchen Back, Loading
  Dock, The Owner's Suite), full-strength fights, and mixes Statics, Bargain
  Hunters and the new brute into the hanger/spitter slots. Checkpoints save
  `floor: 3`; `createMvpRun` takes `floor: 1 | 2 | 3`.
- **Mascot Brute** (`combat/mascot.ts`, 34 hp): plods, winds up for 46 ticks
  (locked lane, drawn as a charge lane), charges 26 ticks at 10.5 px/tick for 2
  damage. A wall or obstacle stuns it for 110 ticks and stunned brutes take
  x1.5 damage (`vulnerableDamage`, applied to mop hits and projectiles). Enters a
  room with a 60-tick beat.
- **The Mall Owner** (`BOSS_CONFIGS.owner`, 240 hp, radius 28): phase 1 slam and a
  five-tray fan volley; from phase 2 every other attack is a straight charge
  (36 ticks at 9.5 px/tick, 2 damage) with a wind-up lane. Hitting a wall shakes
  the room (view: shake + a ring of 10 trays), and stuns the Owner for 100
  ticks, open to x1.5 damage. Phase 2 calls in one Mascot Brute, phase 3 two more.
- **Presentation**: `topFloor` dressing (greasy orange and teal neon, dead
  menus, dark arcade cabinets, the gold-and-magenta Owner's suite); tracks
  "Arcade After Dark" (122 bpm, G minor) and "Hostile Takeover" (152 bpm, B minor);
  PA lines, pink-slip reasons (DISRESPECTING THE MASCOT, HOSTILE TAKEOVER),
  boss intro card and bar name, Floor 3 map names, PixelLab sprites for the brute
  and the Owner (`mascot-*`, `owner-*` in the manifest).
- **Career**: `ShiftResult.floorTwoCleared` adds FLOOR 2 CLEARED (9 stubs);
  `won` (CLOCKED OUT, 14 stubs) now means the Owner is down. The shift card's
  REACHED row reads `FLOOR 3 - n/6` and scoring counts rooms on all three floors.
- **Playtest**: damage sources `mascot` and `ownerCharge`; log records carry
  `floor: 2 | 3` and the summary keys rooms as `3:<roomId>`.
- **Fixtures**: `mvp-floor-three`, `-lobby` (Arcade), `-boss`, `-boss-win`;
  the debug snapshot reports `floor`. `mvp-floor-two-boss-win` now leads to
  the escalator, not CLOCKED OUT.
- Balance: the Break Room's +2 hearts (Dental Plan) make Floor 3 fair; nothing
  else was retuned. Untested by human playtest yet.

## Round 23c: Void the Warranty — fuse any two items

- **Rule:** any two standalone items fuse at a Bench Warrant. The RC car still
  only takes a shooter (Emitter Mount); everything else makes a *hybrid*.
- **Derived, not authored:** a hybrid's id is `hybrid__<base>__<ingredient>`
  and its `ItemDefinition` is computed by `hybridDefinition()` in
  `src/sim/fusion/hybrid.ts`. Saves store only the two ingredient leaves, so
  every pair works and old saves never reference a missing recipe.
- **Which is the base:** melee > ranged > modifier > utility; ties keep pick
  order. Ranged + ranged merges volleys (the second fan widened x1.6), melee +
  melee makes one heavy swing, melee + ranged swings *and* fires (the only
  resolver change: a direct attack also spawns its own payload), and any
  modifier fused in is overclocked (status x1.5, chain +1 target, range +60,
  geometry x1.5). Every fused weapon gets +1 damage; the 16 named signature
  pairs another +1.
- **Economy:** $5, or $3 when both ingredients were bought. A wallet or fanny
  pack fused into anything is overclocked by the economy rules ($3 off, +1
  carry).
- **Where:** service corridor and back hall on every floor; a bench opens only
  when the room is clear.
- **UI:** `BenchCard` is a picker — numbered tiles (click or 1-9), the pair,
  the named result and plain-words highlights, fee against cash. `fuse` sound
  and a FUSED! burst on commit; fused shots use the base's look trimmed in the
  ingredient's colour.
- **Meta:** the Break Room's fusion log counts signatures found and fusions
  made (recorded when the end card settles).

## Round 24: New Sneakers and the Shop-Vac Attachment

Two more Break Room perk lines, the "dash upgrade" and "token magnet" named in
round 22's next steps.

- **NEW SNEAKERS** (12, 28 stubs): each level takes 10 ticks off the dash
  cooldown (45 → 35 → 25). `ShiftPerks.dashCooldownCut` (clamped to 20) reaches
  the combat tick as `tickRun(..., { dashCooldownTicks })`, so the shared dash
  rule stays perk-agnostic; `runDashCooldown(state)` is the one source, and the
  view's readiness ring fills over the shortened cooldown.
- **SHOP-VAC ATTACHMENT** (10, 24 stubs): each level widens the reach loose
  change is drawn in from by 40 px (`ShiftPerks.tokenMagnet`, clamped to 80;
  `tokenMagnetReach`). Inside the reach a pickup slides 5 px per tick toward
  the janitor and is paid at the usual 22 px radius. A pretzel is only drawn in
  when the janitor is hurt, matching when it would be eaten.
- **Saves:** both fields are checkpointed with the other perks. A checkpoint or
  career written before this round simply lacks them and loads as level 0; a
  checkpoint carrying values the Break Room never sells is refused.
- **Art:** `perk-sneakers.png` and `perk-shopvac.png`, pixel-drawn in Pillow by
  `docs/art/neon-overhaul/draw_perk_icons.py` (as the locker icon was), 48x48,
  in the manifest.
- **Clock-in:** the benefits line names NEW SNEAKERS and SHOP-VAC.

## Round 25: grab and run, the wanted level, hot goods

The owner felt shoplifting was bolted on: in the shift it was the M3 camera
sweep (stand still, wait for the cone, get teleported back when caught), Heat
never went down and only cost score, and the LOSE THE HEAT objective could not
be completed. It is now one loop of three parts. The separate M3 Shoplifting
Loop mode keeps its own camera rules unchanged.

- **Grab and run** (`src/sim/run/heist.ts`): F on a shelf item sets off the
  store alarm (`state.alarm`, room-local, never checkpointed). Two Bargain
  Hunters appear either side of the store door (36-tick beat before their
  first wind-up) and two display Mannequins wake in the back corners; three
  stars adds a third Hunter. The janitor has `ALARM_TICKS` (240, 4 s; +90 with
  the Reinforced Fanny Pack) to cross the store door, which secures the item as
  before. Too slow: the shutter becomes a wall across the door
  (never while the janitor stands in it), `LOCKDOWN_HEAT` (+20) is added and
  two more Hunters come down the side aisles. When every enemy in the room is
  down the shutter lifts. Nothing is ever confiscated; suspicion stays 0.
- **Wanted level** (`src/sim/run/wanted.ts`): 20 Heat is a star, five at most.
  A secured theft is +20 (one star). Each star adds one guard to every fight
  room and boss room (`WANTED_SECURITY`: Mannequin, Hunter, Mannequin, Hunter,
  placed on seeded spots with their own luck key so a clean run is unchanged),
  and $2 to shelf prices. Clearing a fight sheds 10 Heat (`LAY_LOW_COOLING`).
  Heat now rides the escalator. Score gives +60 per star at the end instead of
  -5 per Heat, and the Break Room pays a FIVE-FINGER BONUS stub per star.
- **Hot goods**: a stolen leaf that is not fused deals +1 damage (applied to
  the compiled loadout in `compileRunLoadout`, so item definitions are
  unchanged), and each one held keeps Heat at least one star
  (`hotHeatFloor`). Fusing it at the Bench Warrant launders it: the hybrid is
  not hot, and the bench says "Laundered a hot item".
- **Fanny Pack**: its "-5 Heat per theft" was meaningless under the hot floor,
  so it now adds 1.5 s to the alarm (it still carries a second item).
- **Presentation**: the camera cone is gone. The store gets flashing red
  beacons and lights, a SHUTTER n countdown over the door and a roll-down
  grille that creeps down over the countdown (`src/game/view/alarmCues.ts`)
  and is solid when locked. The canvas HUD shows five wanted stars in the
  vitals panel, an alarm banner under the PA ticker, and HOT tags on stolen
  weapon slots; objectives read GET OUT! SHUTTER IN n / LOCKED IN - TAKE DOWN
  SECURITY / WANTED ** - CLEAR FIGHTS TO LAY LOW / HOT GOODS - LAUNDER AT THE
  BENCH. The PA announces a FIVE-FINGER DISCOUNT, the lockdown, three stars and
  laundering; the synth adds alarm, shutter, lift, wanted and launder cues.
  The end card's HEAT row is now WANTED.
- **Tuning knobs**: `ALARM_TICKS`, `LOCKDOWN_HEAT`, `alarmSpawnSpots`,
  `HEAT_PER_STAR`, `LAY_LOW_COOLING`, `WANTED_SURCHARGE_PER_STAR`,
  `WANTED_SECURITY`, `HOT_DAMAGE_BONUS`, `WANTED_STAR_SCORE`.
- **Unplayed**: whether 4 s is right, whether the Hunters at the door are fair
  on Floor 1 (it is the first place a Floor 1 player meets them), and whether
  +60 score a star makes stealing too attractive.

## Round 26: the Loss Prevention stalker, boss title cards, ambient props

Three items from the NEXT_SESSION ideas backlog.

- **Loss Prevention stalker** (`src/sim/run/stalker.ts`): at four stars
  (`STALKER_MIN_STARS`) an agent who cannot be put down follows the janitor
  from room to room. He is run state beside the room (`state.stalker`), like
  the car, not an enemy: he never locks a door, never blocks a room clear,
  and is never checkpointed. Each room change clears him; three seconds later
  (`STALKER_ARRIVAL_TICKS`) he walks in through the door the janitor used.
  He hunts at 150 px/s (the janitor walks at 210), a touch costs one heart
  and he steps back for `STALKER_WRITE_UP_TICKS`, and a mop swing shoves him
  `STALKER_SHOVE_DISTANCE` and staggers him. Losing him means dropping below
  four stars (lay low, launder). He never enters a boss room.
  Presentation: `src/game/view/stalkerCues.ts` (strobing door warning with a
  countdown, a cold-tinted `lp_agent` drawn from the LP Manager's sheets at
  80 px, a flashlight beam, WRITTEN UP!, stars when shoved), PA lines
  `stalker`/`stalker_lost`, the objective LOSS PREVENTION ON YOU, and synth
  cues `stalker_in`, `write_up`, `stalker_shove`. Try `?fixture=mvp-wanted`.
- **Boss title cards** (`src/game/ui/BossIntro.ts`, `bossIntroModel.ts`):
  walking into a boss room holds the fight for `BOSS_INTRO_MS` (2.6 s) with
  letterbox bars, a camera lean toward the boss, and a brass MALL DIRECTORY
  plaque (floor and room, YOU ARE HERE, the neon name stuttering on, the
  original taglines). A fresh key, click or pad button skips; auto-repeat of
  a held movement key does not. It replaces the in-canvas HUD's tick-driven
  boss card, which would have frozen under the hold. The view's effects clock
  now keeps running while a cinematic holds the sim
  (`MvpRunView.advanceHeldEffects`), so the boss finishes his spawn-in on
  camera. Fixture-placed boss rooms get no card, so the browser specs are
  unaffected. Try `?fixture=mvp-boss-door` and walk east.
- **Ambient props** (`src/game/view/propAmbience.ts`, applied in
  `MallRoomView.renderProps`): palms sway, the kiddie ride rocks now and then,
  arcade cabinets cycle attract colours, the claw machine chases, the vending
  machine buzzes, the ATM blinks, the CCTV desk rolls, the globe fountain
  sprays and ripples, and about one sign in three has a dying tube. All pure
  in (tick, seed). Screens drop to standby in a blackout, and the tube
  stutter respects reduced flashes.
- **Follow-up visuals (same round)**: the plaque carries a mugshot, a
  head-and-shoulders crop of the boss's south idle frame (`portraitCrop`);
  red and blue wash in from the screen edges and spill across the
  storefronts while Loss Prevention is in the room (`policeWash`, steady
  violet under reduced flashes, which now also holds the door warning red);
  and dust motes climb through every light pool of radius 70+ (`dustMotes`).
- **Gotcha found on the way**: `Container.setScrollFactor(0)` does not reach
  a container's children in Phaser unless `updateChildren` is passed, which
  matters as soon as the camera zooms or scrolls under a screen overlay.
  And never `texture.add()` a named frame to a shared single-frame sheet:
  the first added frame becomes the texture's default, so every sprite made
  from it afterwards draws that crop. Use `setCrop` on the image instead.
- **Unplayed**: whether the stalker at 150 px/s is oppressive or ignorable,
  whether 4 stars is the right threshold, and whether 2.6 s of boss card is
  welcome on a retry (it plays on every entry; consider first-entry only).

## Round 27: store interiors

The owner could not read the stealing loop, and asked why items sat in the
middle of the floor. The cause was a leftover from M3: each store was a
rectangle on the concourse floor with no walls, items floating over it, and a
96 px "door" on its bottom edge that was the only crossing that secured a
theft. Walking off the side of the rug looked like leaving and did nothing.

- **The stores are inside now** (`src/sim/run/storeInterior.ts`). A
  storefront room's concourse has the shop in its back-wall art; walking into
  its door (or E at `STORE_ENTRANCE`) sets `state.room.interior` and swaps the
  room's walls for `interiorWalls(store)`: everything but the store floor,
  with a gap for the door. The shelves only answer from inside
  (`nearestRunOffer`). Walking out through the door secures carried thefts
  (the old crossing rule), ends the alarm, drops the alarm's guards, and puts
  the janitor back on the concourse at `STORE_EXIT_ARRIVAL`.
- **Full-room stores**: `generateRunWing` scales every store template's
  bounds, door and offer positions up to `INTERIOR_BOUNDS`, so the alarm,
  guard spots, shutter and securing rules in heist.ts and economy.ts run
  inside unchanged. Offer ids and stock are untouched; `createMvpRun` and
  both checkpoint paths use it. The front wall sits at y = 360 so the door
  clears the bottom HUD panels. The M3 Shoplifting Loop mode keeps its own
  stores. `interior` is never checkpointed; a restore starts on the concourse.
- **Each store has its own look** (`storeInterior()` and `INTERIOR_LOOKS` in
  `roomDressing.ts`): Mall Mart grocery gondolas and carts, Cinema Snacks
  vending machines and condiments, Arcade Annex cabinets, claw machines and a
  kiddie ride, Department Outlet clothing racks and a bunny suit, each with
  its floor, lights, neon name across the back wall, a display behind every
  item, checkouts by the door, and a lit EXIT. `MallRoomView` rebuilds on
  entering or leaving, draws solid side walls and a shop-window front wall
  with the door, and the title card replays with the store's name.
- **Readability**: the concourse door has a lit mat and climbing chevrons,
  the objective reads STEP INTO <STORE>, the prompt reads E ENTER, and while
  the alarm rings chevrons on the floor run from the janitor to the door.
  Loss Prevention follows the janitor in through the shop door.
- **Fixtures**: `mvp-store-front` (concourse, below the door) and
  `mvp-storefront` (inside, at the shelf nearest the door).
- **Unplayed**: whether 4 s is still fair from the back shelves of a
  full-room store.
- **Two shops per storefront (27b)**: every floor's wing has four store
  templates and uses two; `generateRunWing` gives each storefront room one
  of the two left over as a second shop (`room.stores`, read through
  `roomStores`), with its own seeded four-item window, so a shift visits all
  four stores. The shopfronts stand left and right on the back wall, centred
  on `STORE_ENTRANCE_XS` (240, 720); `state.room.storeIndex` says which one
  the janitor is inside and `activeStore` reads it. Shelves, alarm banner,
  PA, dressing and title card all follow the active shop; the concourse
  title is now the wing's room name (WEST SHOPS), and the objective lists
  both shops.

## Round 28: a concourse worth crossing

With the stores moved inside, the storefront concourses were bare. Six new
PixelLab props (`create_map_object`, high top-down, high detail, detailed
shading, selective outline, generated at display size): a pretzel cart, a
seating island, a pair of massage chairs, a photo booth, a gumball stand and
a blank sale sign. The first pretzel cart came back with generated lettering
on its sign and was regenerated with "no text, no lettering": text in this
game is always the pixel font. Seven generations (817 → 810 this cycle).

- **Placement and collision** come from one list, `CONCOURSE_FURNITURE` in
  `storeInterior.ts`: `generateRunWing` adds each piece's `footprint` to the
  storefront's walls, and `storefront()` in `roomDressing.ts` places the art
  from the same list (and does not dress those footprints with planters, as
  it does other collision). Footprints stay out of the lane between the side
  doors, and the cart and chairs sit above the bottom HUD panels.
- The photo booth glows and, every eight seconds, fires four camera flashes
  (none under reduced flashes). The big pieces fade when the janitor walks
  behind them.
- Sources in `docs/art/neon-overhaul/pixellab/`, promoted with the import
  script's own crop and recorded in `manifest.json`; the script's `PROPS`
  list includes them for a future full re-run.

## Round 29: the back rooms

Eight more PixelLab props (same recipe, eight generations, 810 → 802) for
the rooms that had only two or three loose props. They are decoration with
no collision, placed along the walls clear of every seeded wall layout
(probed across 57 seeds and all three floors) and of the Bench Warrant
kiosk, so no fight changes. Floors 2 and 3 inherit them through
`upperFloor`/`topFloor`.

- **Back hall**: Alex's own janitor cart beside the wet-floor sign, a row of
  staff lockers, and a floor buffer.
- **Security office**: a wire cage of confiscated shoplifted goods, filing
  cabinets and a water cooler.
- **Food court**: a tray-return station and a bank of trash cans.

## Round 30: a playtest that answers the tuning questions

The playtest log could not see anything from rounds 25–28. It now records,
per run (all optional fields on version 1, so older logged runs still load):

- **Loss Prevention** as a damage source (`stalker`; classified first, from
  his own write-up count, so a Hanger beside him never takes the blame),
  with his arrivals, write-ups and shoves. The pink slip reads WRITTEN UP ONE
  TIME TOO MANY.
- **Store alarms**: each one's outcome (`escaped` with the seconds left on
  the countdown, `lockedEscaped`, `locked`, `dropped`) and the stars when it
  went off; the **peak wanted level**.
- **Store visits**: which shop, seconds inside, items bought and thefts
  secured on that visit (from the inventory's `sourceLocationId`).
- **Boss cards**: seconds watched and whether they were skipped.

The title screen's playtest panel summarizes all of it (alarms with the
average time to spare, Loss Prevention totals, stores visited, boss cards
skipped), and Copy still exports the raw JSON.

Also this round:
- The boss card now plays on the **first entry only** per mall (seed),
  floor and room, remembered across retries; a new shift plays it again.
- Mall Mart no longer sells the janitor's own mop (an M3 leftover); that
  shelf holds Bubble-Bath Concentrate.

## Round 31: stores that play differently, a heist recap, living machines

- **Store twists** (`src/sim/run/storeTwists.ts`, room-local `state.room.twist`,
  never checkpointed; each announces itself on entry via `TWIST_HINTS`):
  - *Arcade Annex*: the first display cabinet down the east wall
    (`ARCADE_CABINET`) takes $2 a play (E) with a 45-tick cooldown and pays by
    `ARCADE_PRIZES` (2% $20, 10% $6, 30% $3): about $1.90 back per $2.
  - *Cinema Snacks*: butter. The janitor's step feeds a slide velocity with
    `BUTTER_GRIP` 0.09: it settles at walking speed, builds over a few steps
    and glides ~35 px after letting go. Dashes are unaffected.
  - *Department Outlet*: four mannequins stand posed in the aisle
    (`DISPLAY_MANNEQUIN_SPOTS`, `EnemyState.dormant`): skipped by the enemy
    tick, no health bar, no mannequin tip; the alarm (or a blow) wakes them.
  - *Mall Mart*: three carts in the aisle (`CART_SPOTS`). Running into one
    kicks it off at `CART_KICK_SPEED`; a rolling cart deals `CART_DAMAGE` and
    knocks a guard back once per push. The decorative corner carts were
    removed so a still cart never misleads.
  - Dev fixture: `?fixture=mvp-store&store=<template id>` enters that store
    when the mall has it.
- **Heist recap**: the end card gains a HEIST row (`heistRecap` in
  `shiftCardModel.ts`) from the playtest recorder's record when the shift
  stole or met Loss Prevention; rows tighten to 23 px past ten.
- **Art**: the sale signs are a new wide PixelLab board facing the camera
  with SALE in the pixel font; arcade cabinets and claw machines play
  PixelLab `animate_image` loops (9-frame strips at ~8 fps, one generation
  each). `MallRoomView.ensureFrames` numbers a strip's frames before the image
  is sized; the first added frame becomes the texture default, which here is
  wanted (frame 0 is the still sprite). Three generations this round.

## Round 32: fuse anything with anything, a mall full of stores, drops

From the first real playtest log (21 shifts) and the owner's direction that
"a dumb amount of items and fusions" is the game's gimmick.

- **Tuning** (`tests/unit/playtest-tuning-round32.test.ts`): Floor 1 food
  court and back hall fights start at three enemies; the Mall Manager volleys
  five prongs at 2.6 (was seven at 2.9, and he hit in every Floor 2 boss
  fight); the Mall Owner has 210 hp (was 240); the boss card plays for
  `BOSS_INTRO_MS` 2000 (players skipped it at ~1.9 s); a clean getaway pays
  `getawayBonus` ($4 an item, +$4 for two or more) on top of the goods. The
  SPACE DASH hint already existed (`shouldHintDash`).
- **Deep fusion** (`fusion/hybrid.ts`, `fusion/inventory.ts`): a hybrid goes
  back on the Bench Warrant with an item or another hybrid, up to
  `MAX_FUSION_PARTS` (4). `HybridComposite.primary/carrier` are `FusionPart`
  (a leaf or a hybrid). Nested ids bracket hybrid parts,
  `hybrid__(hybrid__a__b)__c`, so two-item ids and old saves are unchanged.
  `build()` keeps everything the base already did (`carried`), merges two
  shots into one volley (`combinedPayload`) and stacks the fused damage.
  Fee: `hybridFee(parts, clean)` = $5 + $3 per item past the second, -$2 when
  nothing is stolen. An Emitter Mount cannot be fused again, and the RC car
  only carries a single unfused shooter. Helpers: `compositeLeaves`,
  `fusionPartCount`, `isCleanPart`, `rootItemId` (icons and shot looks use
  the root item).
- **Store roster** (`items/storeRoster.ts`): one list is an item's whole
  content (definition from existing effect kinds, fusion noun and adjective,
  blurb, price band). 54 store items plus 10 rares; the catalog is 88.
  `STORE_STOCK` says who sells what; `wing/templates.ts` `themedStore()`
  shelves them (`shelve`: six spots, any four in a row on distinct spots,
  priced mid-band). Seven new stores: Sports Locker, Hardware Hut, Toy Box,
  Radio Shed, Spiral Records, Slice Station, Video World; a shift visits four
  of the eleven. Mall Mart is now the general store: twelve items at the
  bottom of each band. 24 new signature fusions.
- **Drops** (`run/drops.ts`): a kill leaves an item `ITEM_DROP_CHANCE` 4% of
  the time, an elite 30% (a quarter of those rare), as a `kind: 'item'`
  pickup in `room.tokens` (not checkpointed). Every boss hands a rare
  straight into the inventory. Picked-up goods are `acquisitionKind: 'found'`
  (clean). Rares (`RARE_ROSTER`) are never sold.
- **Bench card**: up to 16 tiles (smaller past nine; keys pick 1-9, clicks
  any); a fusion tile shows `xN` parts.
- **Art**: shopfronts and interiors for the new stores reuse the existing kit
  (`STORE_LOOKS`, `INTERIOR_LOOKS`). The 64 new item icons are placeholders
  from `scripts/placeholder-icons.mjs` (16x16 silhouettes doubled, per-item
  colours), marked `PLACEHOLDER` in the manifest. PixelLab was not connected
  in this cloud session. Screens: `artifacts/neon-overhaul/round32/`.

## Round 33: PixelLab art pass

- **Shopfronts**: `sports`, `hardware`, `toys` and `radio` in
  `FACADE_TEXTURES` (288x160, the storefront recipe above). `storeFacade()`
  names a store's front; a test keeps every store on a front of its own.
  Spiral Records, Video World and Slice Station already had fitting fronts.
  Radio Shed needed a second try: "radio store" alone drew an outdoor street,
  so say "indoor shopping mall" and "tiled mall floor".
- **Item icons**: `create_image_pixflux`, 32x32, `high top-down`, single black
  outline, detailed shading, and a forced palette (`color_image`) quantised
  from the 24 earlier icons plus a five-step gold ramp for rares. Sources in
  `docs/art/neon-overhaul/pixellab/items/`; runtime copies get binary alpha.
  `scripts/placeholder-icons.mjs` is gone (re-running it would have
  overwritten the art). Weakest reads, worth a redo: staple gun and leaf
  blower (both look like flashlights), mic stand (small).
- PixelLab runs at most 8 jobs at once; the no-auth `download_url` of a
  finished job can be fetched with curl, so batches do not need `get_image`.
- Spend: 69 generations (799 -> 730). Screens: `artifacts/neon-overhaul/round33/`.

## Round 34: fusions as a spectacle

- **Fused icons** (`presentation/fusedIcon.ts`, pure plan;
  `fusedIconTexture.ts`, `usableItemIcon(scene, id)`): base icon at 32 px,
  the other parts at 16 px on its corner over dark plates, a pixel glow grown
  from the silhouette (1/2/3 px, green/cyan/gold for 2/3/4 parts), cached as
  `neon:fused:<id>`. The HUD hotbar, passives and bench tiles use it (the
  bench model now passes a hybrid's own id). The held weapon and floor
  pickups keep the base icon.
- **Discovery** (`career.ts` `discoverFusion`): logs a fusion and every step
  nested in it as it is made, and reports `firstTime`, the signature name and
  the running count. The scene saves the career right away, so a quit
  mid-shift keeps the find. `fusionLog` counts nested steps too, and each
  entry carries its pair's `itemIds`.
- **Reveal** (`ui/fusionRevealModel.ts` pure; `MvpRunView.celebrateFusion`;
  `ui/FusionReveal.ts` banner): sparks rush in and burst, the fused icon
  rises, the stamp slams with a small shake at 560 ms; the banner follows at
  650 ms on the half of the screen away from the janitor. All scene tweens,
  so it plays while the sim is paused or not.
- **Catalog** (Break Room): pair icons per signature, `brightness(0)`
  silhouettes until found, a gold meter.
- **Recipe hints** (`sim/run/recipeHints.ts`, applied in `generateRunWing`):
  a shop whose window holds a whole signature pair marks it; one in
  `RECIPE_HINT_ODDS` (3) of the rest that stock a pair swaps its last other
  offer for the missing half (same spot, authored price, id and `offerIds`
  updated). `WingOffer.pairedWith` names the partner. The view ties the pair
  with running gold sparks and diamonds; `PaDirector` says a `recipe` line on
  entering a store with both halves still on the shelf (`recipeLine` falls
  back to short nouns past 56 characters).
- Signature keys are normalised with `pairKey` at load (`AUTHORED_SIGNATURES`),
  so a pair authored in either order matches; a test checks every one.
- Verifying tween timing in the browser pane: its screenshots lag the key
  events, so fire the key from `javascript_tool` and `await` a fixed delay
  before the screenshot. Screens: `artifacts/neon-overhaul/round34/`.

## Round 35: every store plays differently, fusion logging, a shorter boss card

- **Store twists** (`sim/run/storeTwists.ts`, room-local like round 31's; the
  twist's `age` is the clock the cycling ones run on; hazards respect dashes
  and invulnerability through `hurtJanitor`):
  - *Sports Locker*: `PITCHING_MACHINE` on the west wall fires every
    `PITCH_INTERVAL_TICKS` (150) after a `PITCH_WINDUP_TICKS` (40) wind-up
    that lights the lane; a ball hurts the janitor 1 or a guard
    `BALL_DAMAGE_ENEMY` (3).
  - *Hardware Hut*: `PAINT_SPILLS` are butter at `PAINT_GRIP` 0.12; dry floor
    grips at once.
  - *Toy Box*: four toys waddle the aisle at `TOY_SPEED`; a bump shoves the
    janitor `TOY_SHOVE` (18 px), no damage, then that toy waits 30 ticks.
  - *Radio Shed*: `STATIC_ZONES` (two bands between the shelf columns, so a
    shelf is never hidden) are on 140 of every 250 ticks; `staticHides`. The
    view draws opaque snow above the actors, which hides wind-ups too.
  - *Spiral Records*: `LISTEN_TICKS` (90) in `LISTENING_BOOTH` gives
    `GROOVE_TICKS` (600) of double-speed attack recharge, once a visit.
  - *Slice Station*: `OVEN_ZONE` cycles idle 135 / warn 45 / blast 60 ticks;
    one burn a blast, `OVEN_ENEMY_DAMAGE` 2 to guards every 20 ticks.
  - *Video World*: `REWIND_TILE` restores the last hit taken in the store,
    once a visit; stepping on it unhurt does not spend it.
- **Art**: PixelLab props `pitching-machine`, `wind-up-toy`,
  `listening-booth`, `pizza-oven` (`create_map_object`, high top-down, four
  generations). Paint, static and the tile are drawn.
- **Playtest log**: `RunRecord.fusions` (name, parts, signature, first time,
  from the scene's `noteFusion`) and `recipeHints` (a store entered with a
  pair on the shelf, and whether both halves left with the janitor). The
  summary and the Playtest panel show both. `shelvedSignaturePair` moved to
  `recipeHints.ts` and is shared by the PA and the recorder.
- **Boss card**: `BOSS_INTRO_MS` 1400 (was 2000); the name lights at 380 ms
  and holds to the 300 ms fade.
- Browser pane gotcha: a hidden pane throttles rAF to ~1 fps, so the game
  looks broken. Check `document.hidden` before chasing a frame-rate bug.


## Round 36: sell and drop

- Rules live in `src/sim/run/resale.ts` (`resaleValue`, `keepReason`; tests in
  `tests/unit/sell-drop.test.ts`). Half the shelf price, a quarter when
  stolen, a fusion pays the sum of its parts. The last weapon is never sold
  or dropped.
- Drop: `KeyX` in `MvpRunScene.ts` drops the held weapon as a floor pickup
  with its provenance and fusion and a 45-tick pickup lock.
- Bench: `sale` in `benchCardModel.ts`, a SELL button in `BenchCard.ts`
  (pick one tile, X or click). X is in the GameHud and PauseCard legends;
  PauseCard `CARD_H` is 386.
- Spec note: `presentation-evidence.spec.ts:269` re-centres with
  `nudgePlayerY` before the east door. It needs <= 2 workers on 4 cores.

## Round 37: reduced flashing

`flashes: 'reduced'` (Settings) already softened hits and the police wash. It
now also: holds alarm beacons steady (`alarmCue(..., steady)`), freezes the
Radio Shed snow (`flickerTick`), cuts fusion-reveal sparks to a third
(`revealSparkCount`), scales the stamp shake by the Shake setting, and eases
blackouts over `BLACKOUT_FADE_FRAMES` (`blackoutFade.ts`, applied in
`MallRoomView.renderLighting`). Sim rules are untouched.

## Round 39: Floor 4, the Roof (the new finale)

Beating the Mall Owner now clears Floor 3 and offers the escalator to the
Roof. Beating **the Developer** on the Helipad is the win.

- **Floor table** (`sim/wing/floorSpecs.ts`): each floor's room names, boss,
  full-strength fights, enemy mix and wing-seed derivation, plus
  `FINAL_FLOOR`. The game side keeps one `Record<FloorNumber, ...>` per
  concern (HUD names/objectives, PA, fight music, dressing, escalator ride,
  pink slip). **To add a floor**: extend `FloorNumber` and `FLOOR_SPECS`,
  and tsc lists every table left to fill. A test pins seed 5's fights on
  floors 1-3 so a new floor can't disturb the ones below.
- **The Roofer** (`combat/roofer.ts`, 20 hp): keeps `ROOFER_FLEE_RANGE` (200)
  between throws; lobs a bucket at the janitor's spot with a
  `ROOFER_LOB_TICKS` (54) flight; `TAR_SPLASH_RADIUS` 36 hurts 1. Every
  bucket leaves a puddle (`combat/tar.ts`: `RunState.tar`, up to 6,
  `TAR_PUDDLE_TICKS` 300) that slows walking to `TAR_SLOW` 0.55; dashes are
  not slowed. Roofers take Spitter slots on the Roof (45%).
- **The Developer** (`BOSS_CONFIGS.developer`, 340 hp since round 42): slam and a
  five-blueprint fan; from phase 2 every other attack is a `tarBarrage`
  (3 rings, 5 in phase 3, 72 px around the janitor, 60 ticks, landing like
  a Roofer's). Calls one Roofer at phase 2, two more at phase 3.
- **Presentation**: `lob` wind-up (landing ring + arcing bucket), tar on the
  floor decal layer; `roofFloor` dressing (gravel floor, moonlight, sodium
  door lamps, PixelLab back walls `roof-hvac`, `roof-billboard`,
  `roof-water-tower`, `roof-access`; collision props become `acUnit`,
  `ventStack`, `skylight`; mall furniture stays downstairs); the Helipad's
  billboard reads COMING SOON / LUXURY CONDOS over an H ring; tracks
  "Rooftop Nocturne" (132, E minor) and "Demolition Order" (156, C sharp
  minor); PA, pink slip (CONDEMNED WITH THE BUILDING), kill cam
  (DEMOLITION CANCELLED), boss card (ROOF - HELIPAD).
- **Sprites**: PixelLab `create_character` (standard, 8 directions) with
  `walking-6-frames` and `falling-back-death` templates on 5 or 3
  directions (the packer mirrors the rest). PixelLab grew the canvases to
  136 and 180 px, so `ROOFER_DISPLAY_SIZE` / `DEVELOPER_DISPLAY_SIZE` keep
  them in scale, and `shift_frames.py` dropped the Roofer's feet into line
  with the other sheets (the game anchors frames at 84% of their height).
- **Career**: FLOOR 3 CLEARED pays 12 stubs; CLOCKED OUT means the
  Developer is down.
- **Drops** (on top of round 36): a dropped item is picked back up only after
  the janitor steps out of `TOKEN_PICKUP_RADIUS` and returns (`awaitingStepOff`),
  replacing the 45-tick lock.
- **Fixtures**: `mvp-floor-four`, `-lobby` (HVAC Yard), `-roofer`, `-boss`,
  `-boss-win`.

## Round 42: the finale is the hardest fight (playtest 2026-09-30)

Two full four-floor nights were won with the Developer down in 19-21 s for
0-3 damage, the easiest boss of the night, and floors 2-4 cleared with 0-2
damage a fight: 4-part fusions by floor 2 had outgrown the monsters.

- **Floor toughness**: `FloorSpec.enemyHealthScale` (1, 1.15, 1.3, 1.5)
  multiplies the health of a floor's authored monsters in `spawnEnemy`
  (rounded, before the elite x2). Bosses keep their configs; mannequin
  displays and wanted-level security are heist mechanics and stay as they are.
- **The Developer**: 340 hp (was 240); `tarBarrage.counts` per phase
  `[2, 3, 5]`, so the barrage starts in phase one.
- **Playtest log**: damage sources `roofer` (a bucket) and `barrage` (the
  Developer's), told apart by a fresh puddle under the janitor and whether
  the boss's buckets in the air just dropped. Before this both were `other`.
  Pink slips: TARRED ON THE ROOF, BURIED IN HOT TAR.

## Round 43: signatures are the best fusions (playtest 2026-09-30)

At +1 damage a named pair lost to any random 4-part fusion, and 0 of 8
recipe hints were followed. Now (`sim/fusion/hybrid.ts`):

- When a signature pair is formed, `signatureTier` raises the plain rule's
  result by `SIGNATURE_DAMAGE_SCALE` (x1.5, rounded up, swing and shots) and
  `SIGNATURE_COOLDOWN_SCALE` (x0.8 cooldown, at least 8 ticks). Applied once:
  fusing more onto it builds on the boosted stats.
- `maxPartsFor`: anything that `containsSignature` holds `SIGNATURE_MAX_PARTS`
  (5); everything else stops at `MAX_FUSION_PARTS` (4). The fifth part's icon
  sits in the top-left spot; names go to MK V.
- The bench card leads with SIGNATURE: +50% DAMAGE, 20% FASTER, ROOM FOR A 5TH
  PART; a fusion holding a signature glows hot pink (`fusedIcon.ts`).
- Pieces 2 and 3 of the plan landed in round 44.

## Round 44: shelf deals and late-game money (playtest 2026-09-30)

0 of 8 recipe hints were followed, 13 items were bought by floor 3, and one
Roof run visited no store at all.

- **The pair deal** (`economy.ts`): `runOfferPrice` takes `PAIR_DEAL_SCALE`
  (x0.75, rounded up, after the Blue Light half) off a recipe-hint half when
  the janitor `holdsPairPartner` as a plain, unfused item.
- **The store card** (`gameHudModel.ts` `pairLine`, drawn by `GameHud`): a
  recipe-hint half gets a pink line, PAIRS WITH <PARTNER> -> <SIGNATURE>:
  +50% DMG, and - 25% OFF once the deal applies (`signatureName` in
  `hybrid.ts`).
- **Rares on the shelves** (`storeInterior.ts` `shelveRare`): on floors whose
  `FloorSpec.rareOnShelf` (3 and 4), one seeded store swaps its last
  non-hint offer for a seeded rare at `RARE_SHELF_PRICE` ($45). It buys,
  steals and checkpoints like any shelf item, so it is also a heist target.
  (Planned as a Bench Warrant "Lost & Found"; a shelf item reused every
  existing system.)
- **Leftover cash** (`career.ts`): a clock-out pays LEFTOVER CASH, a stub for
  every `LEFTOVER_CASH_PER_STUB` ($20) in hand.
- **Fixture**: `?fixture=mvp-store&store=<id>` takes `&floor=N` (climb
  first) and `&at=<item id>` (stand at that shelf item), e.g.
  `store=spiral-records&at=record_toss&seed=1` for a pair card,
  `store=mall-mart&at=trapper_keeper&floor=3&seed=7` for a rare.

## Round 45: two wings a floor (owner's ask: floors ~1.5x longer)

- **Sim** (`floorSpecs.ts`, `generateWing`, `rooms.ts`, `floors.ts`): a floor
  is a first wing (`GeneratedWing.part: 1`) and the boss wing (no `part`, so
  every save from before is a boss wing). The first wing has its own names
  (`FloorSpec.firstWingNames`; Floor 1's opens in the Opening Concourse, its
  boss wing now starts in the East Concourse), drawn rather than
  full-strength fights, and ends in the **Lockdown**: `LOCKDOWN_SIZE` (5)
  elites of the floor's mix in a ring, won when the room is clear
  (`bossDefeated`). `ascend`: first wing -> the same floor's boss wing
  (`bossWingSeed`), boss wing -> the next floor's first wing.
  `climbToBossWing` for fixtures and tests that mean "the floor-N boss".
  One rare a floor, in the boss wing. Checkpoints carry `part`.
- **Game**: new shifts start on part 1; dev fixtures start from the boss wing
  (so every existing fixture keeps its meaning) and `?fixture=mvp-lockdown
  &floor=N` stands at a Lockdown door. The stairs are a fade, not the
  escalator. Shift card: LOCKDOWN LIFTED / STAIRS, REACHED "WING 1 - n/6",
  scoring counts every wing below, and a Roof Lockdown clear is never the
  night's win (it would have paid CLOCKED OUT). HUD: REACH / SURVIVE THE
  LOCKDOWN, first-wing map names; PA lockdown and stairs lines; first-wing
  room titles from the wing's names; the controls card on Floor 1's first
  wing only; the playtest log keys first-wing rooms as `<floor>a:<room>`.
- **Known gap**: a first wing reuses its floor's dressing, so its back-wall
  signs are the boss wing's (Floor 2's Lockdown room still says MANAGEMENT).


## Round 46: mannequins freeze after a bite (playtest 2026-10-01)

A biting Mannequin freezes for `MANNEQUIN_BITE_FREEZE_TICKS` (90) in
`src/sim/combat/mannequin.ts`, reusing `stunnedTicks`; it reads as a watched
(frozen) mannequin everywhere, so the view and cues needed nothing.

## Round 47: floor events, a leading barrage, riskier heists (playtest 2026-10-01)

- **Floor events** (`src/sim/run/wingEvents.ts`): every wing but the night's
  first rolls `WING_EVENT_CHANCE` (0.7) for one of `outage`, `sprinklers`,
  `clearance`. Pure function of the wing (one `luck` draw), never stored.
  - outage: `roomEventFor` returns `blackout` for every room without a store
    or boss, so the flashlight view, music and title card come for free; the
    alarm gets `OUTAGE_ALARM_BONUS`.
  - sprinklers: every enemy is re-soaked (`SPRINKLER_WET_TICKS`) before each
    combat tick, so conduction chains everywhere; `game/view/sprinklerRain.ts`
    draws the spray.
  - clearance: `CLEARANCE_PRICE_SCALE` on the tag (in `runOfferPrice`), and a
    Bargain Hunter in every regular fight (`buildRoomCombatState`).
  - The PA announces it as the wing starts (`wing_<event>` lines), the title
    card names it (`roomTitleSubtitle`), and the log records `event`.
  - To add one: extend `WING_EVENTS`, give it a rule, a PA line and a
    subtitle. Dev fixture: `?fixture=mvp-event&event=<name>` then NIGHT SHIFT.
- **Barrage lead**: `tarBarrage.leadTicks` (45) aims the Developer's ring at
  `player + velocity * leadTicks`; `PlayerState.velocityX/Y` is set by
  `movePlayer`.
- **Heists**: `ALARM_TICKS_BY_FLOOR` (210/190/170/150) and
  `ALARM_GUARD_BEAT_BY_FLOOR` (24/18/12/6) in `src/sim/run/heist.ts`.
- **Fix**: leaf ids are fresh across the night (`freshLeafInstanceId`):
  re-buying an item on a later floor used to break every later fusion.

## Round 48: the owner's queue (signs, pairs, the Mall Walker)

- **First-wing signs**: `FIRST_WING_SIGNS` in `roomDressing.ts` (by floor and
  room, left to right) relabels the floor's own shopfronts on part-1 wings;
  colours, panels and light are untouched.
- **Signature pairs**: 17 more in `AUTHORED_SIGNATURES` (`hybrid.ts`); every
  store template now stocks at least three (test: `more-signatures`). Hints
  stay occasional: `pairUpStock` rolls `RECIPE_HINT_ODDS` before marking a
  whole pair too.
- **The Mall Walker** (`combat/walker.ts`, 16 hp): calm, it walks a 220x100
  loop round its spawn and does not count for `hasLivingEnemies`; touched or
  hit it is `provoked`, chases at 120 px/s, hurts 1 on touch, then backs off
  `WALKER_BACKOFF_TICKS` (45). Worth 8 change. `WALKER_CHANCE` (0.4) of
  Floor 1-2 regular fights (`rooms.ts`). Log source `walker`; pink slip
  LAPPED BY A MALL WALKER. Sprites: PixelLab character
  `287ef491-a0c0-4326-a4f6-2b5fd114f5db` (64 px standard, 92 px canvas).

## Round 49: a much bigger Break Room

- **Benefits** (`career.ts` `PERKS`, 11): six new ones reach the run as
  round-49 `ShiftPerks` fields (`perks.ts` `EXTRA_PERK_LIMITS`, read with
  `perk(state, name)`): LOOKOUT `alarmBonus` (+20 ticks/level), DEEP POCKETS
  `carryBonus`, EMPLOYEE DISCOUNT `shelfDiscount`, BENCH TECHNICIAN
  `fusionRebate` (+$2/level, refunded by `takeFusion` in `bench.ts`), LUCKY
  PENNY `snackBonus` (`snackChance`), SECOND WIND `secondWinds`.
- **Charges**: `secondWinds`, `freeFusions` and `quietGrabs` are spent with
  `spendCharge` (death check in `evaluateTerminal`, fusion fees, the first
  grab in `stealRunOffer`). They live in `state.perks`, so they ride the
  escalator and the checkpoint as they stand.
- **Locker**: 10 weapons (`LOCKER_ITEMS`, allow-list `LOCKER_ITEM_IDS`).
- **Vending machine**: `VENDING_ITEMS` (Energy Drink, Lunch Money, Fusion
  Coupon, Fake Mustache) go in `career.bag` (max `BAG_LIMIT` each);
  `clockIn` eats one of each when a shift starts (`MvpRunScene.shiftPerks`).
  Daily Shifts take nothing.
- The clock-in card names benefits, five at most (`BENEFITS_SHOWN`).
- Icons: 10 PixelLab `create_image_pixflux` 48x48 (`perk-*`, `vend-*`).

## Round 50: the mall districts (an expansion)

About half the nights, a floor's first wing is its **district** instead: a
themed wing with its own rooms, stores, items, monster, mini-boss, art and
music. Boss wings never change, and regular wings draw exactly as before.

| Floor | District | Stores | Monster | Mini-boss (Lockdown room) | Track |
|---|---|---|---|---|---|
| 1 | Holiday Village | Candy Cauldron, Novelty Nook | Animatronic Elf | Mall Santa | Silent Mall |
| 2 | Glamour Row | Glam Snaps, Hair Affair | Perfume Spritzer | The Glamour Queen | Strike a Pose |
| 3 | Pet Paradise | Pet Palace, Green Thumb | Rabid Poodle | Mr. Whiskers | Feeding Frenzy |
| 4 | Skate Arena | Skate Shack, Cocoa Hut | Hockey Goon | The Zamboni Driver | Organ on Ice |

- **Sim** (`sim/wing/districts.ts`): `districtRoll(seed, floor, part)` (its own
  draw, `DISTRICT_CHANCE` 0.5) sets `wing.district`. `generateWing` swaps in
  the district's names and its two stores (the template shuffle is still drawn,
  so later draws line up), and a district monster takes `enemyShare` percent
  of fight slots. `buildRoomCombatState` puts the `miniBoss` in the Lockdown
  room instead of the elite wave. Checkpoints regenerate it from the seed.
- **Stores** (`DISTRICT_STORE_TEMPLATES`, never in the regular shuffle): eight
  stores, 37 new items in `STORE_ROSTER`, 29 more signatures (every store has
  three or more), and a twist each in `storeTwists.ts`: Candy Cauldron's free
  sample bowl, Novelty Nook's joy-buzzer tiles (stun guards), Glam Snaps'
  studio flash (freezes whoever is in the lane), Hair Affair's hairspray haze
  (sticky guards), Pet Palace's parrot (alarm −60 ticks), Green Thumb's cactus
  pots (prick everyone), Skate Shack's skates (+35% step), Cocoa Hut's punch
  card (every second buy free).
- **Monsters** (`combat/districtEnemies.ts`, perfume in `perfume.ts`): the Elf
  hops to a marked ring and stomps; the Spritzer keeps away and leaves
  slowing clouds; the Poodle crouches and dashes a short lane (8° zig); the
  Goon skates with momentum, body-checks at speed and slaps pucks. Each
  telegraph reuses a known wind-up shape (`combatBeats.ts`).
- **Mini-bosses** are `BOSS_CONFIGS` entries (75/120/170/260 hp, under each
  floor's boss): Santa lobs coal (the tar barrage) from phase 2; the Queen
  fans seven flash bulbs; Whiskers and the Zamboni Driver charge.
- **Presentation**: `DISTRICT_LOOKS` in `roomDressing.ts` (walls, floor,
  light; furniture stays the floor's so collision dressing never moves; the
  rink uses the mall's furniture and an `ice` floor), `DISTRICT_SPRITES` in
  `ActorSpriteView.ts`, `DISTRICT_HUD`, PA `district_*` / `miniboss_*`, boss
  cards, kill stamps, `musicCue` (district track; ×1.06 for its mini-boss).
- **Art**: Retro Diffusion `rd_plus__default` 288x160 for the 16 facades
  ($0.06 each); PixelLab characters (64 px monsters on 92 px canvases, 112 px
  bosses on 160 px; quadrupeds via the dog/cat templates, their deaths built
  by `quadruped_death.py`); PixelLab 32x32 item icons snapped to the earlier
  icons' palette. Dev fixtures: `?fixture=mvp-district&floor=N&room=<id>&store=1|2`.
- **To add a district**: a `DISTRICTS` entry (names, two stores, monster,
  mini-boss), its stores and stock, a twist each, a monster update, a boss
  config, then the game tables tsc lists (sprites, HUD, PA, looks, music).

## Round 54: polish (palms, the toppled rack, a flaky test)

Three small items from the 2026-10-01 playtest and the art backlog.

- **Tall props fade properly.** A palm at 50% opacity laid a green net of
  fronds over the janitor standing behind it. `MallRoomView.render` now uses
  `presentationOcclusionAlpha` (it was tested but unused; the view had an
  inline copy). Knobs in `presentation/occlusion.ts`: `OCCLUSION_MIN_ALPHA`
  (0.3, was 0.5), `ACTOR_HALF_WIDTH` (14: the fade starts when the janitor's
  body, not just the foot point, slips behind the prop), and an edge ramp.
  The view eases toward the target (30% a frame) so props fade, not pop.
  Applies to every occluder (fountain, pillar, bunny, crates, photo booth...).
  Monsters behind a prop do not fade it; only the janitor does.
- **The approved toppled rack** (Forge, finished in Aseprite) is in:
  `props/rack-toppled.png` (120x70, `PROP_TEXTURES.rackToppled`, source
  `docs/art/neon-overhaul/aseprite/rack-toppled-merged.aseprite`). The pure
  `view/toppledRack.ts` picks the pose: an east or west fall shows the art
  scaled to the wall's 96 px, mirrored for west; a fall toward or away from the
  camera keeps the old turned-over standing sprite, since a side-on rack would
  lie across the aisle there. Dev: `?fixture=mvp-hero&props=used` (an east fall).
- **`districts.test.ts` no longer brushes the 5 s timeout.** Its odds check
  built about 800 full runs (1.9 s); it now runs on `districtRoll` and a
  smaller test confirms `createMvpRun` applies the roll.

## Round 53b: the secret back room

- `sim/run/secretRoom.ts`: `secretFor(wing)` (seed-derived, `SECRET_CHANCE`
  0.6) puts a machine at `SECRET_MACHINE` on the first peaceful storefront,
  with a rare prize. `nearSecretMachine` adds a `secret` interaction; E runs
  `enterSecretRoom`, which marks it spent (`secretsDone`, checkpointed and
  optional) and makes the room an interior with `SECRET_STORE_INDEX` (9),
  which no store has, so `activeStore` stays null and store rules sleep.
- `updateSecretRoom` (after the store alarm each tick): a wave of
  `SECRET_WAVE_SIZE` monsters of the wing's own kinds every
  `SECRET_WAVE_TICKS`, at least 160 px off; at `SECRET_TICKS` (20 s) they
  vanish, the exit wall lifts, the prize drops and `SECRET_CASH` pays; out
  the passage is `leaveSecretRoom`.
- View: `roomDressing.backRoom()` (concrete, crates, lockers, cage, EMPLOYEES
  ONLY), `MvpRunView.drawSecret` (the flickering machine, `?`, countdown,
  grille, chevrons out), HUD objective and title card, `secret_open` and
  `secret_won` sounds, `secretPhase` in the debug snapshot. Fixture:
  `?fixture=mvp-secret` (`&inside=1`).

## Round 53: hero fusions and mall props

- **Hero fusions** (`sim/fusion/heroPairs.ts`, `heroes.ts`; behaviour in
  `sim/combat/heroes.ts`). `HERO_FUSIONS` names three signature pairs;
  `heroOf(id)` finds one at any depth, so fusing more on keeps the move.
  The central tick calls `heroAttack` when an attack is accepted and
  `updateHeroes` each tick; state is `RunState.hero` (room-local).
  - Greatest Hits: `RECORD_MAX` 3 orbiting records (cut 2, every 20 ticks
    per monster); the next attack flings them (6 each).
  - Comedy Hour: a decoy thrown up to 180 px, `DECOY_TICKS` 150. Monsters
    within `DECOY_LURE_RADIUS` 260 update as if the janitor stood there
    (`withLure`, which also makes the real janitor untouchable through
    that update); then it bursts (8, radius 80, a shove and a daze).
  - Movie Night: every `BEAM_COOLDOWN_TICKS` 90, a beam to the first wall
    (`BEAM_LENGTH` 420, half-width 26): 4 damage and `BEAM_DAZE_TICKS` 60.
  - `EnemyState.dazedTicks`: a generic stun, skipped by bosses; the enemy
    update (now `updateEnemyAt`) skips a dazed monster.
  - The bench says `HERO: ...` first and labels the card HERO FUSION.
- **Mall props** (`sim/combat/props.ts`, placed by `rooms.ts mallProps`).
  `PROP_CHANCE` 0.85 of regular fights get two or three of cart / soda /
  rack, seed-derived, 40 px off any wall (a rack 120, so a fallen one can
  never close a pocket). Hit by a swing that starts this tick or a player
  shot passing within 34 px. Cart: rolls (8 px/tick), 5 damage per monster
  per push. Soda: solid; bursts once, 2 damage and a radius-90 Wet puddle
  for 600 ticks. Rack: solid; falls away from the hit into a 96x18 wall,
  5 damage and a daze to anyone under it, who is pushed clear.
- **View**: `game/view/HeroPropView.ts` (records, chicken, beam and its
  silhouette, burst, dazed stars, props with their own light). Sounds:
  `cart_roll`, `soda_burst`, `rack_fall`, `record_spin`, `record_fling`,
  `squawk`, `decoy_burst`, `projector`. Debug snapshot: `props`, `hero`.
- **Art**: PixelLab pixflux sprites in `props/` (`soda-machine`,
  `soda-machine-broken`, `rack-of-clothes`, `mall-cart`; raw in
  `docs/art/neon-overhaul/pixellab/prop-*.png`, binary alpha, cropped). Two
  tries at a toppled rack both came out standing, so a fallen rack is the
  standing sprite rotated so its top points the way it fell (squashed when
  it falls away from the camera).
- **Fixture**: `?fixture=mvp-hero&hero=greatest_hits|comedy_hour|movie_night`
  (a food court with all three props and no room event; `&props=used`
  starts them knocked over).

## Round 52: review fixes

- **Swept movement.** `moveCircle` splits any move into steps of at most
  `MAX_STEP` (4 px), each with the old axis-by-axis wall check. Ordinary
  steps (under 4 px a tick) are unchanged; a mop's 48 px knockback can no
  longer hop a dropped shutter.
- **Bench pages.** `buildBenchCardModel(state, page)` returns nine tiles a
  page (`BENCH_TILE_LIMIT`, one per number key) plus `page`, `pageCount` and
  `picked` (the pair, wherever it is). `BenchCard` keeps the page, Q/E or
  the arrow keys or the < > buttons turn it, and a turn rebuilds the model at
  once so a number key in the same frame picks off the new page. Dev:
  `?fixture=mvp-workbench&items=20`.
- **One sample a wing.** `MvpRunState.samplesTaken` ("room:store") is set by
  the Candy Cauldron and checkpointed (optional; older saves load as none).
  A new wing starts empty.

## Round 51: art re-rolls

- The Glamour Queen's north walk and the Rabid Poodle's south run (dropped by
  PixelLab's GPU in round 50, so they borrowed a neighbour) are re-generated
  into their animation groups and re-packed.
- Mr. Whiskers is a new PixelLab character (`aaf35aa7-...`, cat template,
  best of three: a lion-template candidate lost its bow tie, a third had no
  legs): hunched, snarling, claws out, collar and bow tie kept. Walk on three
  directions; death by `quadruped_death.py` as before.

## Round 55 - floor-exclusive stores

Playtest 2026-10-01: going upstairs felt like floor 1 again. Floors 2-4 now each
open one of their own two stores in `storefront_a` (`FLOOR_STORE_IDS` in
`wing/templates.ts`), first and boss wings alike; districts still override.
Floor 1 and the regular 11-store pool draw exactly as before: the pick uses its
own rng (`FLOOR_STORE_SALT`), so no other draw moves.

| Floor | Stores |
|---|---|
| 2 | Shade Station, Page Turner Books |
| 3 | Pretzel Pit, Frosty Freeze |
| 4 | Antenna Annex, Pawn Palace |

- Stock reuses existing items (`STORE_STOCK`); six new signature pairs keep
  every store at three or more.
- **Art:** the six shopfronts are Retro Diffusion `rd_plus__default` (288x160,
  blank sign band, $0.36 for the set), sources in `docs/art/neon-overhaul/retrodiffusion/`.
- **Twists** (`storeTwists.ts`, tuning knobs are the exported constants):
  - Shade Station: a sun-glare band sweeps west to east (`GLARE_SWEEP_TICKS`)
    and blinds guards in it; the janitor wears shades.
  - Page Turner Books: the alarm runs `LIBRARY_ALARM_BONUS` (45) ticks longer.
  - Pretzel Pit: mustard spills halve the janitor's steps (`MUSTARD_SLOW`) and
    make guards sticky.
  - Frosty Freeze: the machine hums for 1 s, then a cold snap freezes the
    janitor (0.67 s) and guards (1.5 s) within `COLD_SNAP_RADIUS`.
  - Antenna Annex: every `ROD_ZAP_TICKS` the rod hits the nearest guard in range
    for `ROD_DAMAGE`, and the janitor if within `ROD_TOO_CLOSE`.
  - Pawn Palace: stand at the counter 1 s to sell half a heart for
    `HOCK_PRICE` ($6), once a visit, never below one heart.
  Not yet seen in play.

## Round 56 - a leaner economy

Playtest 2026-10-01 (a won night, 16.8 min): five things bought on Floor 1,
one more all night, and the new floor stores walked past. Owner: money is too
common, so the janitor is overpowered by Floor 2 and has nothing left to buy.

Measured with `tests/unit/lean-economy.test.ts` (every monster a wing spawns,
Lockdown elites and walkers included, killed and swept up):

| Floor | Fights paid before | Now | Items at the median shelf price |
|---|---|---|---|
| 1 | $72 | $40 | 5.5 -> 3.1 |
| 2 | $82 | $45 | 6.8 -> 3.8 |
| 3 | $98 | $46 | 8.2 -> 3.8 |
| 4 | $81 | $42 | 5.4 -> 2.8 |

- `MALL_TOKEN_VALUE` (`run/tokens.ts`) roughly halved; the Mall Walker still
  pays the most of any regular (4).
- `ELITE_TOKEN_MULTIPLIER` (`run/luck.ts`) 3 -> 2.
- The $30 starting float is unchanged.
- Every upstairs wing with a floor-exclusive store shelves a rare in it at
  `RARE_SHELF_PRICE` ($45), so Floors 2-4 each have something worth saving a
  floor of change for. Wings without one (districts) keep the old rule.

## Round 57 - a bot playtester, a route choice, a coach, a daily rule

Seven things from the "what next" brainstorm (2026-10-01), built in the order
that makes the first one useful to the rest.

### The bot playtester (`tests/balance/`, `npm run balance`)

Rounds 42-56 were tuned from one human log and tool-driven input that was too
slow to judge. The sim is deterministic by seed, so a scripted janitor can play
thousands of nights headlessly through the same `tickMvpRun` input the keyboard
feeds.

- `bot.ts`: one `botInput(state, memory, options)` per tick. Skills bracket the
  difficulty: `naive` walks up and swings; `dodger` also sidesteps and dashes
  from wind-ups; `pro` also steps out of enemy shots and backs off while its
  swing recovers; `expert` (added after the first baseline) plays like `pro`
  but scores sixteen headings against every charge lane, slam and shot at once
  (`danger.ts`) and takes the safest. `shop: 'buy'` visits every store and buys the dearest thing
  it can pay for (and equips the best damage-per-second weapon);
  `route: 'shortcut'` crawls through the staff passage when the wing has one.
  Left out on purpose: stealing, the Bench Warrant, the arcade, the secret room.
- `path.ts`: a grid navigator (BFS distance field from the goal over
  `combat.walls`, straight line when clear). Without it the bot jams on the
  opening concourse's pillars.
- `harness.ts`: `playWing`, `playNight`, driving the real `PlaytestRecorder`,
  so the numbers match what a human's Playtest log would say.
- `report.ts` + `balance.test.ts`: `npm run balance` (40 nights a bot),
  `BALANCE_NIGHTS=200`, `BALANCE_BOTS=pro:buy:shortcut,...`, `BALANCE_OUT=`.
  Not part of `npm test`; it writes `test-results/balance.md` (vitest hides a
  passing test's log). Every Playwright run empties `test-results/`, so use
  `BALANCE_OUT=docs/neon-overhaul/balance/<name>.md` for a report worth keeping.
- Baseline: [`balance/round57-baseline.md`](balance/round57-baseline.md), 100
  nights, four bots. Re-run after any balance change and say what moved.

Bugs the bot found in itself, worth knowing when extending it: a shot or a
swing is stopped by a pillar corner (the widest projectile is radius 10, so
line of sight uses 11), and monsters jam against pillar corners, so a fight
that does no damage for 10 s makes the bot circle its target.

What it says (round 56 build, 100 nights): the `pro` bot wins 54% of nights
without shopping and 63% with; Floor 1 costs it under a heart a wing (matching
the human log's "0-2 damage"). Its first reading was that Floor 3's Owner's
Suite (14-17 of ~45 deaths) and Floor 2's Portrait Studio were the deadliest
wings and that the finale was easier than the Owner. **Those were the bot, not
the game** (the follow-up below, which corrected itself twice): a bot that
scores every hazard at once wins 95% of nights and loses under a heart in any
wing. Treat any single-bot hot spot as a lead to check with a better bot, not a
verdict.

### The expert bot (a follow-up that corrected the first reading)

`tests/balance/danger.ts` and `skill: 'expert'`. It decides what it wants as the
`pro` does, then runs every decision (fight, shop, walk to the door) through a
lookahead: sixteen headings, 48 ticks, against every Mascot, Bargain Hunter and
Owner charge lane (locked at the start of the wind-up, so the danger is known),
every boss slam, every enemy shot and every Volatile fuse. It takes the safest
heading, keeps last tick's choice while it is still as good (without that two
equal ways out trade places every tick and the bot shuffles in the lane: found
from a trace, pinned by a test), and dashes only when walking cannot get clear.
`tests/balance/duel.ts` (one monster, an empty room) and `scenarios.ts` (a
boss room with the starting mop) put a bot in a fixed fight, so a change to the
bot or a monster is a number. The unit tests pin the evaluator
(`balance-danger.test.ts`) and the results (`balance-expert.test.ts`).

What it showed ([`balance/round57-expert.md`](balance/round57-expert.md), 100
nights; it overturned something written the step before, twice):

- The Owner's Suite was the bot: 82% cleared and 4.5 health for `pro`, 100% and
  0.6 for an expert that scores every lane, slam and shot at once (the `pro`
  replay lost exactly 4 every time: it retreated along the Owner's charge lane and
  ignored two Mascot lanes while dodging a tray).
- The Volatile burst cost `pro` and a fuse-blind expert 0.7-0.8 health a Floor 1
  wing and costs a fuse-aware expert nothing: fair if you can see the ring.
- "The Helipad is the hardest boss" was also the bot. The expert's 2.0 health
  there and 1.5 a wing from Glamour Row's perfume were lobs it could not see.
  Alone, a Roofer or Spritzer never hit any dodging bot; with two bruisers on the
  janitor `pro` and the blind expert were hit by 96 of 96 lobs, because a bot
  swinging at something else stands on the ring (only 12% of 323 traced hits were
  while slowed in tar or perfume). With lobs, buckets and slow zones modelled the
  same fight is dodged 96 of 96 times.
- So a bot that sees everything wins 95% of nights and loses at most 1.1 health
  in any wing (boss wings 0.2-0.8); `pro` wins 67%. That gap is attention. Every
  hazard is dodgeable if you are looking at it; what matters for a human is how
  much time each gives. The doc tabulates it from the constants (the Spritzer's
  0.5 s wind-up leaves 17 ticks, 0.28 s, after walking clear; the Roofer's gives
  43), though that table assumes a standing player.

### Reaction delay (`npm run balance:reaction`)

`BotOptions.reaction` (ticks, 60 a second) makes the expert learn of a hazard
only after it has been in view that long (each danger has a `key`: what resolves
and the absolute tick it does, stable while a wind-up counts down), and
`dashes: false` takes the dash away. `tests/balance/reaction.ts` sweeps the
delay 0-54 ticks against each hazard and reports the hit rate, with a "never
reacts" bot as the reference for "dodged" (20% of it); it is the measurement
behind [`balance/round57-reaction.md`](balance/round57-reaction.md). Findings: the
tightest hazards are the Perfume Spritzer's spritz and the Volatile fuse (a walker
needs to react inside 0.2 s; with a dash, 0.4 and 0.5), the Bargain Hunter is
0.4 s either way, the Mascot Brute and the Roofer are comfortable, and the Mall
Owner is the one fight where a pure reaction is not enough (it loses to him at
0.3-0.4 s because it never learns his rhythm). Lengthening the Spritzer's wind-up
from 30 to 42 ticks would double the walker's allowance (0.2 s to 0.4 s); a
48-tick fuse would stop being a hazard at all in those scenes. Neither is
changed: they are the owner's call after a human playtest.

Getting there changed the evaluator in ways worth knowing. Paths are priced in
expected **health** (each hit once, with the 60 ticks of grace after it), not a
weight per tick of contact: the per-tick sum made five trays outweigh one charge
lane and the bot took the charge. The look-ahead is 72 ticks. A boss's volley
**wind-up** (up to 45 ticks) is a fan of trays that has not been fired yet and is
modelled, because without it a point-blank volley arrives faster than any
reaction delay and every slow-reaction Owner fight is lost for a reason that is
not the game's. The tests pin the key stability, the delay filter, the dash
switch, the expected-damage pricing and the Owner survival at 0.3 s but not 0.5 s.

### Wanted clarity

`wantedBrief` (`sim/run/wanted.ts`) says what the stars mean right now:
guards (one a star), the shelf surcharge, Heat to the next star, and whether
hot goods are what hold the stars on. `wantedLineFor` (`ui/gameHudModel.ts`)
turns it into one line, drawn above the vitals panel: `SHELVES +$4  2 EXTRA
GUARDS  NEXT * IN 15`, `LOSS PREVENTION FOLLOWS` from four stars, `1 HOT ITEM
HOLDS YOUR STAR` while stolen goods hold the Heat at its floor.

### The staff passage (the route choice)

`sim/run/shortcut.ts`. About half of wings (`SHORTCUT_CHANCE`) have a STAFF ONLY
hatch on a safe storefront concourse. E at it skips the next fight room: the
janitor comes out two rooms on, the skipped room is marked cleared, and
security notices (`SHORTCUT_HEAT` 20 Heat, one star). It forfeits what a fight
pays: tokens, drops, the +2 clear heal, the Heat a clear sheds. Seed-derived, one
use a wing; the spent hatch is recorded in `secretsDone` as `100 + room index`
(the checkpoint validator wants digits), the skipped room in `clearedRooms`
(which is what keeps the checkpoint legal). `moveToRoom`
(`sim/run/roomTransition.ts`) now does every room change, doorways included.
Two spots: the first concourse skips the first fight (room 1 to 3), the second
skips the Back Hall (3 to 5, straight to the boss or the Lockdown).

Balance, 200 nights of the `pro` shopper ([`balance/round57-shortcut.md`](balance/round57-shortcut.md)):
60% won taking every door, 59% taking every hatch, within noise (about 3.5 points). It is neither a trap nor a
dominant road; skipping into the Lockdown without the heal costs the most
(Floor 3 first-wing deaths 13 against 9). To change the price, move
`SHORTCUT_HEAT`; to change how often, `SHORTCUT_CHANCE`.

### The coach (an optional guided first shift)

`ui/coachModel.ts`: `nextCoachTip(state, shown)` returns the first applicable
tip not yet said, from the run's own state (so it cannot disagree with the
game): a nudge to the east door (10-30 s in the first room, after the controls
card), the shop door, E and F in a store, wind-ups and the dash, weapon
switching, the bench, wanted stars. `GameHud.trackCoach` shows each once as a
7 s toast. On for a janitor's first `COACH_SHIFTS` (2) shifts, off in dev
fixtures, and a Settings toggle ("Coach tips", `GameSettings.coach`) turns it
off at once.

### The daily rule

`sim/run/nightRules.ts`: four rules, each one clamped number on a rule the run
already had: Glass Janitor (`runMaxHealth` -2), No Breaks (`roomClearHeal` 0),
Inflation (`runOfferPrice` +$3), Short Fuse (`alarmTicksFor` -60 ticks).
`dailyRule(date)` (`game/run/dailyShift.ts`) rotates by day number, so any four
days use all four. The title shows today's rule; the clock-in card names it;
`MvpRunState.rule` rides the escalator and the checkpoint (an unknown rule in a
save is refused). Only the Daily Shift sets it today; `createMvpRun(seed, {rule})`
takes it for anything else.

### Elite traits

`sim/combat/eliteTraits.ts`. Every Clearance elite now has a trait rolled from
the seed (`rollEliteTrait`): SWIFT (`SWIFT_SPEED_MULTIPLIER` 1.35, in
`effectiveSpeedMultiplier`, so Sticky still slows it) or VOLATILE (a lit fuse
where it fell, `VOLATILE_FUSE_TICKS` 36, then 1 damage inside
`VOLATILE_BURST_RADIUS` 76 unless the janitor is dashing or in grace). The view
draws a cyan or orange aura, the trait as the tag, and the fuse ring
(`ELITE_LOOK`, `drawBursts` in `view/MvpRunView.ts`). The playtest log has a
`burst` damage source. The Lockdown's five elites carry traits too.

### The seed card

`shareCardText` (`ui/shiftCardModel.ts`): five short lines of plain text
(mall number, result, score and time, how far, and `?seed=N` to replay it; on a
Daily Shift the day and its rule). No link, nothing leaves the machine. The end
card has a COPY CARD button (key C) beside RETRY and TITLE.

### Not done (needs art and a decision)

- A **second playable employee**: the portraits `employee.png` and
  `teenager.png` exist, but the in-world sprite (8-direction idle, walk, swing)
  is Alex only. Needs a PixelLab character and a kit (see NEXT_SESSION.md).
- A **secret floor** (Parking Garage or Basement): a data entry in
  `floorSpecs.ts` plus whatever `tsc` lists, but it needs dressing, music and a
  way in that the owner picks.

Dev fixtures added: `?fixture=mvp-hatch&seed=7` (beside a staff passage),
`&enter=1` on `mvp-lockdown` (steps into the Lockdown, to see elite traits) and
`?fixture=mvp-volatile&seed=7` (one posed single-hit Volatile elite beside the
janitor; `tests/browser/volatile-burst.spec.ts` kills it with the real mouse,
catches the fuse ring and checks the blast takes a health).

## Round 58 - a visual review of every floor

The owner's review (2026-10-05): stray neon lines across the top of each
room, rings round the fountain, small assets that did not look right, and
four floors that played and looked alike. Every room on every floor was
captured before and after (`scripts/floor-sweep.mjs`, below).

- **No floor neon.** The full-width strips (y 60, 176, 304) and the fountain
  rings are gone from every plan. Only the Helipad keeps its landing ring, and
  only in the boss wing (the Roof's first-wing boss room is a machine room).
- **Sign reflections** are only drawn on polished floors (terrazzo, checker,
  linoleum, ice); on carpet, concrete and gravel they read as mirrored ghost
  text. `DressingPlan.signReflections`, set once in `planRoomDressing`.
- **Nothing is squashed to fit.** `coverWall` used to stretch sprites to the
  collision box (planters 0.6x, desks 0.7x, the Roof's stand-ins up to 1.9x).
  It now tiles or scales at each sprite's own aspect (`atWidth`), checked for
  every prop on every floor (8% tolerance).
- **Blocks.** A bar of collision running away from the camera cannot be a
  sprite (sprites face the camera; stacked, they read as a ladder). It is now a
  fitted 3/4 box, `DressingPlan.blocks`, painted by `blockArt.ts` (pure pixel
  rects, tested) in one of seven materials: `planterBed`, `concrete`, `duct`,
  `balustrade` (an atrium well onto the floor below, which glows), `steel`,
  `counter`, `shelving`. Sprites stand on a block's top (`decor`). The top face
  is drawn under the actors; the near face sorts with them.
- **Decor gives way.** A free-standing prop that would be drawn on, or just
  behind, a collision rectangle is dropped (`overWall`). It caught floor 1's
  directory behind a planter.
- **Each floor's own layouts.** `FLOOR_ROOM_VARIANTS` in `templates.ts`: two
  per fight room for floors 2-4 (18 in all), `roomVariantsFor(role, floor)`.
  Floor 1 keeps `ROOM_VARIANTS` and draws exactly the wings it drew (pinned in
  `floor-layouts.test.ts`); a district wing also keeps floor 1's under its own
  dressing. Fight bands match floor 1's per room. The variant draw is one rng
  call either way, so later draws line up (floor 2's seed-5 fights are
  unchanged; floor 3's arcade fills its slots in a new order).
  - Floor 2: atrium wells and planter beds, velvet-rope cinema queues, a
    concession counter with popcorn carts, parking columns and jersey barriers.
  - Floor 3: seating islands and booths, arcade cabinet rows and air hockey,
    loading-dock pallets and concrete bays.
  - Floor 4: skylights and dishes, vented ducts, an HVAC grid and pipe runs,
    the water tower's legs and duct runs.
  Each is dressed by `LAYOUT_KITS` in `roomDressing.ts` (a kit by wall shape,
  or one piece per wall). `floor-layouts.test.ts` floods every layout at a
  Mascot Brute's radius: both doors, the entry, every spawn slot and the bench
  are reachable, side-door lanes and the staff hatch are clear.
- **Storefront concourses** stand their floor's own furniture
  (`concourseFurniture(floor)` in `storeInterior.ts`, collision and art from
  one list as before), on carpet (2), checker (3) or a concrete deck (4), with
  their own loose decor (`STOREFRONT_LOOSE`).
- **Shop interiors** were scaled-up legacy thumbnails (a 48x30 VHS shelf, a
  30x46 gondola). Now six fit-out styles (`INTERIOR_STYLES`: aisles, boutique,
  food, arcade, garden, candy) line the back wall end to end, fit shelving or
  counter blocks into the solid strip down each side wall (so nothing looks
  solid where you can walk), stand a display table under every item and a till
  either side of the door.
- **Light.** Floors 2-4 were too dark to read (the Roof's ambient was
  `0x161c30`); ambients are raised and the Roof's moonlight is stronger.
- **Art.** Eleven PixelLab `create_map_object` props (13 generations; 3 left
  this cycle), sources and `report.json` in
  `docs/art/neon-overhaul/pixellab/round58/`. Nine are used. `escalator` and
  `stacked-chairs-table` came back isometric and are not wired in.
- **Balance** (`docs/neon-overhaul/balance/round58-layouts.md`): floor 1
  unchanged row for row. Over 160 nights the shopping pro bot wins 61% -> 57%
  and the expert 94% -> 89%, the deaths moving from the Owner's Suite to the
  floors' middle fights (F2b, F3a). The owner wants harder; not tuned back.

### Looking at every room

```bash
VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort
node scripts/floor-sweep.mjs --out artifacts/floor-sweep/now [--seed 3] [--floors 2,3] [--parts boss,first] [--rooms food_court]
```

It uses the dev fixture `?fixture=mvp-room&floor=N&room=<id>[&part=1][&store=1|2][&enemies=1][&event=none]`;
`event=none` walks forward to a seed with no floor or room event, so an
outage does not hide the room.
