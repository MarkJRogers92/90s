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

Review these concrete concerns before approval:

- only about two of the four rendered civilians read clearly in the initial
  camera frame;
- the compact HUD covers a substantial upper-left part of the playfield,
  truncates the room identity, and overlaps a character, especially at 800x600;
- the opening reads bright and specific but predominantly beige/teal rather than
  strongly neon-heavy;
- the first Food Court combat has readable yellow warning rings/lines and the
  finished Hanger, but its environment and two enemies still read as graybox or
  fallback presentation.

If the user requests corrections, keep them inside this same slice and get a new
visual decision afterward. Do not treat correction authorization as permission
to convert other rooms.

The automated gate is also not fully clean. Asset validation, typecheck, 510
unit/integration tests, the 4-case evidence harness, 10 lifecycle cycles, local-
request assertions, and production build passed. The complete Chromium suite
passed 55/57; two existing Night Shift assertions reproduce red:

- fixed seeds 7, 99, and 2024 currently show the same first-store text as seed
  4242 in the browser variation test;
- resized real-input aim measures cosine `0.8480714938237034` against a strict
  `> 0.85` threshold.

Diagnose those failures in a separately authorized owner pass before claiming a
clean browser gate. Do not weaken either assertion merely to turn it green.

WebKit, Safari, Windows, physical devices, physical-device performance, and
human feel remain untested. Broader room rollout remains explicitly unstarted.
