# Task 7 report — compact mall-first HUD

Status: DONE

## Delivered

- Replaced the Night Shift inspector wall with a compact upper-left status placard.
- Kept health, cash, heat, room, objective, and nearby interaction permanently visible.
- Moved inventory provenance, primary/carrier detail, trace, checkpoint state, and recent feedback into a collapsed native `details` inspection drawer.
- Kept the original HUD model, IDs, action handlers, checkpoint flow, simulation, room ordering, pointer projection, and read-only debug bridge intact.
- Show store offers only in store rooms; fusion choices remain visible whenever the preview is active.
- Added disclosure focus restoration and compact, internally scrolling small-viewport presentation.

## Test-first evidence

`npx vitest run tests/unit/mvp-run-hud.test.ts` was captured red before production changes: all three expectations failed because the status bar, collapsed drawer, and hidden contextual offer region did not yet exist. The same command passed after implementation (3/3).

## Validation

- `npx vitest run tests/unit/mvp-run-hud.test.ts` — 3/3 passed.
- `npm run typecheck` — passed.
- `npm test -- --no-file-parallelism` — 34 files / 510 tests passed.
- Targeted Chromium on an isolated local Vite port — 6/6 passed: 800x600 overflow/critical-values/focus-return, 1440x900 center clearance, real movement/attack/Food Court combat, real keyboard purchase, pause/resume/restart checkpoint, and Bench Warrant fusion/real aim input.
- Direct visual inspection of the Opening Concourse screenshot at 1280x720 — compact HUD remains at the upper-left and leaves the fountain/central concourse readable.
- `git diff --check` — passed.

## Constraints honored

No external network, paid generation, push, merge, publish, deploy, or release action was performed.

## Concern

The inspection disclosure stays closed by default, as intended. Its expanded height is intentionally bounded and scrolls internally on 800x600; contextual offers and fusion controls are exposed only when their simulation state is active.
