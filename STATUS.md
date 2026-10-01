# Status

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
