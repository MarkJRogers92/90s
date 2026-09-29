# Next session

## Start here (updated 2026-09-29)

The repository now lives at `~/code/90s` (it moved from
`~/Documents/Github Code/90s`). The live work is branch `claude/neon-overhaul`
in `.worktrees/neon-overhaul`, fast-forwarded to `origin/main` at `ac58121`
(PR #15). Rounds 18–25 reached `main` through PRs #8–#15; PR #15 came from
`claude/jolly-pascal-cc520j`, so check `git log HEAD..origin/main` before
starting and fast-forward if needed.

Read [`docs/neon-overhaul/README.md`](docs/neon-overhaul/README.md) first. It
is the playbook: architecture, art pipeline, and a section per round with its
tuning knobs.

    npm install
    VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort

Open http://127.0.0.1:4180 and choose **Night Shift** (or **Daily Shift**). If
port 5173 is taken by another worktree, run the browser gate with
`PW_PORT=4191 npx playwright test`.

Last gate (round 26): `tsc` clean, 910 unit tests, `npm run build` passes;
see TEST_EVIDENCE.md round 26 for the browser run.

## What the game has now

- **Three floors**, six rooms each, reached by the escalator:
  - Floor 1 ends with the Loss Prevention Manager.
  - Floor 2 (Statics, Bargain Hunters) ends with the Mall Manager.
  - Floor 3, Food Court After Dark (Mascot Brute), ends with the Mall Owner.
  - Jump in with `?fixture=mvp-floor-two`, `mvp-floor-two-boss` and the
    Floor 3 fixtures listed in the playbook.
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
- **Void the Warranty** (round 23c): any two items fuse at the Bench Warrant.
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
- Two browser specs flake under host load. Harden their waits the way round
  23 did.
- Checkpoint validation still accepts some hand-edited saves (see STATUS.md,
  "Known issues carried forward").
- `artifacts/neon-overhaul/audit/` holds 14 untracked weapon and effects
  audit captures. Commit them as evidence or delete them.

## Ideas backlog

Candidates, not commitments. Pick with the owner.

**Heist follow-ups**
- Blackouts silence the alarm (option E).

**Content**
- Floor 4 / the Roof or Parking Garage, or a Basement Service Tunnels
  secret floor.
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
