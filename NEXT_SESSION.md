# Next session

The Opening Concourse production-presentation vertical slice is implemented on
`codex/presentation-3quarter` in `.worktrees/presentation-3quarter`. Verify the
actual branch and working tree before trusting this note.

The next bounded action is **user visual review**, not another room conversion.
Open the local game, choose **Night Shift**, and compare the playable calm,
evacuation, and first-combat transition with:

- `artifacts/presentation-vertical-slice/opening-busy.png`
- `artifacts/presentation-vertical-slice/opening-evacuation.png`
- `artifacts/presentation-vertical-slice/first-combat.png`
- `artifacts/presentation-vertical-slice/compact-800x600.png`

Port 5173 was occupied by another worktree during Task 8. A safe local launch is:

    npx vite --host 127.0.0.1 --port 4176 --strictPort

Then open `http://127.0.0.1:4176`, choose **Night Shift**, move with WASD, aim
with the pointer, attack with the primary mouse button, and press Escape to
pause. The branch is not pushed, merged, published, deployed, released, or
approved for broader art rollout.

The correction pass resolved the previous framing and HUD blockers: native-scale
captures show four distinct civilians inside the initial camera; the HUD is
entirely above the canvas at 1440x900 and 800x600; and the full room identity,
critical values, objective/context, actions, and controls remain visible. Cyan
and magenta signage, light bands, and floor borders are also materially stronger.

Review these remaining concrete concerns before approval:

- beige terrazzo is still the dominant surface, so the opening is not uniformly
  neon-heavy even with stronger cyan/magenta accents;
- evacuation warning/flicker remains subtle in a single still;
- the first-combat evidence is captured during a real telegraph, but the warning
  boxes/streak are less clear in the still than in motion;
- the existing Food Court remains gray/olive vector graybox. Converting it was
  explicitly outside this opening-only correction scope.

If the user requests corrections, keep them inside this same slice and get a new
visual decision afterward. Do not treat correction authorization as permission
to convert other rooms.

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
