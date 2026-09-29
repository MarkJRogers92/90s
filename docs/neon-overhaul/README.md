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
- **Gotcha found on the way**: `Container.setScrollFactor(0)` does not reach
  a container's children in Phaser unless `updateChildren` is passed, which
  matters as soon as the camera zooms or scrolls under a screen overlay.
- **Unplayed**: whether the stalker at 150 px/s is oppressive or ignorable,
  whether 4 stars is the right threshold, and whether 2.6 s of boss card is
  welcome on a retry (it plays on every entry; consider first-entry only).
