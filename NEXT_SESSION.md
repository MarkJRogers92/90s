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

Last gate (round 25): `tsc` clean, 880 unit tests, `npm run build` passes;
browser suite 72/74 in one run, and the other two are load-sensitive and pass
alone. See TEST_EVIDENCE.md rounds 23–25.

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

- Grab and run:
  - Is the 4 s alarm the right length?
  - Are Hunters guarding the store door fair on Floor 1?
  - Does +60 score per star over-reward stealing?
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
- A Loss Prevention stalker who hunts you at 4+ stars (option G).

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
- Boss intro title cards.
- Idle and ambient animations for props.

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
