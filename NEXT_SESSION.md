# Next session

## Claude neon overhaul — start here

Latest (round 24, 2026-09-29): NEW SNEAKERS and SHOP-VAC ATTACHMENT perk lines
(`src/sim/run/perks.ts`, `PERKS` in `src/game/career/career.ts`, icons drawn by
`docs/art/neon-overhaul/draw_perk_icons.py`). Tuning knobs: 10 ticks and 40 px
per level in `perksFor`, 5 px/tick pull in `TOKEN_MAGNET_SPEED`.

Open design question raised by the owner: shoplifting feels bolted on. Heat
never goes down and only speeds up suspicion and costs score, so the HUD's
LOSE THE HEAT objective can never be completed. A rework proposal is in the
round 24 reply; no stealing code has changed yet.

In this cloud container, run the browser suite with a config that sets
`launchOptions.executablePath: '/opt/pw-browsers/chromium'`; four tests fail
here on `main` too (a console 404 and one timeout).

Latest (round 22): the Break Room. Career rules and storage are in
`src/game/career/career.ts`, the run-side perks in `src/sim/run/perks.ts`, the
panel in `src/game/ui/BreakRoomPanel.ts`, and the art in
`public/assets/neon/ui/breakroom/`. To try it with money, set
`localStorage['dead-mall:career:v1'] = '{"version":1,"stubs":200}'` and reload.
Tuning knobs: stub pay in `stubsForShift`, prices in `PERKS` / `LOCKER_ITEMS`.
Possible next steps: more perk lines (a dash upgrade, a
starting token magnet), Floor 3, and seasonal wall resets.

Branch `claude/neon-overhaul` in `.worktrees/neon-overhaul`. Read
[`docs/neon-overhaul/README.md`](docs/neon-overhaul/README.md) first.
Round 4 added `src/game/view/combatBeats.ts` (pure rules) and reworked
`CombatFeedback.ts`. Hit stop lives in `MvpRunScene.update`. New enemy
animations are promoted with `docs/art/neon-overhaul/promote_anim.py`.

    npm install
    VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort

Open http://127.0.0.1:4180, choose **Night Shift**. Before/after captures are
in `artifacts/neon-overhaul/` (`before/` holds the baseline's own evidence).
If port 5173 is taken by another worktree, run the browser gate with
`PW_PORT=4191 npx playwright test`.

Latest (round 15): Floor 2 — beat Loss Prevention, take the escalator, face
Statics, Bargain Hunters and the Mall Manager. Jump in with
`?fixture=mvp-floor-two`, `mvp-floor-two-lobby` or `mvp-floor-two-boss`.
Committed locally on `claude/neon-overhaul`; not pushed until the owner says so.

Open follow-ups: a human playtest of Floor 2 difficulty (use the playtest
log; it now separates upstairs rooms and attackers), a purpose-made Alex portrait, folding the duplicate DOM
status bar into an off-canvas panel, and device/Safari performance checks.
Nothing is pushed, merged or published.

The Opening Concourse production-presentation vertical slice is implemented on
`codex/presentation-3quarter` in `.worktrees/presentation-3quarter`. Verify the
actual branch and working tree before trusting this note.

The user has paused local iteration and requested a GitHub handoff for Claude
Opus 5.5. Read [`CLAUDE_HANDOFF.md`](CLAUDE_HANDOFF.md) first. Resume only when
the user asks. Claude is invited to review the whole project and change any
parts needed to achieve the original 80s/90s mall roguelike vision; this
worktree remains the untouched comparison baseline. Claude's work belongs on a
separate branch/worktree and must remain unmerged, unpublished, undeployed, and
unreleased unless separately approved. The handoff branch is
`origin/codex/presentation-3quarter`.

For a later visual review, open the local game, choose **Night Shift**, and
compare the playable calm, evacuation, and first-combat transition with:

- `artifacts/presentation-vertical-slice/opening-busy.png`
- `artifacts/presentation-vertical-slice/opening-evacuation.png`
- `artifacts/presentation-vertical-slice/first-combat.png`
- `artifacts/presentation-vertical-slice/compact-800x600.png`

Port 5173 was occupied by another worktree during Task 8. A safe local launch is:

    npx vite --host 127.0.0.1 --port 4176 --strictPort

Then open `http://127.0.0.1:4176`, choose **Night Shift**, move with WASD, aim
with the pointer, attack with the primary mouse button, and press Escape to
pause. The branch is pushed to GitHub for handoff, but is not merged, published,
deployed, released, or approved for broader art rollout.

The correction pass resolved the previous framing and HUD blockers: native-scale
captures show four distinct civilians inside the initial camera; the HUD is
entirely above the canvas at 1440x900 and 800x600; and the full room identity,
critical values, objective/context, actions, and controls remain visible. Cyan
and magenta signage, light bands, and floor borders are also materially stronger.

Review these remaining concrete concerns before approval:

- beige terrazzo is still the dominant surface, so the opening is not uniformly
  neon-heavy even with stronger cyan/magenta accents;
- evacuation warning/flicker remains subtle in a single still;
- the existing Food Court remains gray/olive vector graybox. Converting it was
  outside the original Codex slice, but Claude may change it on the separate
  experiment branch if that helps realize the whole-game vision.

The first-combat capture concern is resolved in the evidence packet: the harness
now waits for an authoritative on-screen Spitter telegraph matched to the
renderer, and the native 1440x900 still shows two large yellow windup rings with
long aim lines. Hanger movement streaks no longer satisfy that capture test.

This baseline records an opening-only Codex slice. The user has since authorized
Claude to review and change other rooms or systems as needed within the original
vision; see `CLAUDE_HANDOFF.md`. Keep Claude's experiment separate until the
user reviews and chooses what to adopt.

The automated gate is clean for this scope: asset validation, typecheck, 513
unit/integration tests, the 4-case evidence harness, 10 lifecycle cycles, local-
request assertions, the complete 57-case Chromium suite, and the production
build passed. The former seed test now reads the actual hidden offer text rather
than empty `innerText`, and the resized-aim test waits for the camera projection
to consume the resize while keeping its strict direction-cosine threshold. A
parallel M4 origin check now samples the carrier immediately before firing and
tightens its origin allowance rather than comparing with a later moving target.

WebKit, Safari, Windows, physical devices, physical-device performance, and
human feel remain untested. Broader room rollout remains explicitly unstarted.
