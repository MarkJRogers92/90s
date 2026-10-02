# Next session

## Start here (updated 2026-10-01)

`origin/main` is at round 57 (merge `4cf40da`): a bot playtester, the staff
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
