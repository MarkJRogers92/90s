# Task 6 — Civilian opening-concourse evacuation report

## Result

Implemented the approved cosmetic Opening Concourse civilian group. Four to six deterministic, seeded civilians use the approved shopper A, shopper B, clerk, and security idle/walk sheets. They transition monotonically from `busy` to `warning` at 55% of room width, `evacuating` at 72%, and `empty` after leaving the opening room. The controller reads run state only; it has no collider/body/save/checkpoint fields and does not change the M5 simulation.

## Files

- `src/game/view/ConcourseAmbience.ts` — presentation-only seeded lane/phase controller.
- `src/game/view/OpeningConcourseView.ts` — disposable civilian sprites, guarded texture fallback, brief sign/gate warning effect, and read-only `{ phase, visibleCount }` debug snapshot.
- `src/game/presentation/assets.ts` and `tests/unit/presentation-assets.test.ts` — typed civilian manifest records and dimensions.
- `public/assets/presentation/civilians/*.png` — eight approved runtime sheets.
- `docs/art/presentation-vertical-slice/civilian-contact-sheet.png` — approved contact sheet included as supplied.
- `artifacts/provenance/presentation-vertical-slice.json` — source paths, candidate origins, layouts, and SHA-256 hashes.
- `tests/unit/concourse-ambience.test.ts` and `tests/browser/night-shift.spec.ts` — unit and real-input coverage.

## TDD

- RED: `npx vitest run tests/unit/concourse-ambience.test.ts` failed because `ConcourseAmbience` did not exist (`Cannot find module '../../src/game/view/ConcourseAmbience'`).
- GREEN: after the minimal controller, the focused suite passed; its final run is 4/4. The controller tests deterministic 4–6 selection, authored nonoverlapping lanes, 55%/72% monotonic phases, paused tick behavior, reset, and absence from body/collider/checkpoint surfaces.
- REFACTOR: evacuation movement now uses phase-local elapsed ticks, so a long busy period cannot make civilians instantly disappear when evacuation begins.

## Validation

- `python3 docs/art/tools/validate_runtime_tree.py public/assets/presentation/civilians --palette docs/art/palettes/deadmall-global.json --quiet` — PASS: 8 files, binary alpha, 105-swatch shared palette. Native dimensions were additionally checked: every idle is 256x48 and every walk sheet is 192x384.
- `npx vitest run tests/unit/concourse-ambience.test.ts` — PASS: 4 tests.
- `npm test` — PASS: 33 files, 507 tests.
- `npm run typecheck` — PASS.
- `npx playwright test -c .task6-playwright.config.ts tests/browser/night-shift.spec.ts -g "civilians evacuate"` — PASS: Chromium real keyboard movement saw busy, warning, evacuating, then a fresh busy group after restart. The temporary local-only port-4174 config was removed afterward because port 5173 belonged to another worktree.
- `git diff --check` — PASS.

## Self-review and concerns

Reviewed the final diff for simulation, collision, checkpoint, seeded-wing, room-order, and combat changes: none were made. All created display objects are owned by `OpeningConcourseView` and destroyed on room exit/reset; absent civilian textures omit only that decorative sprite. No external release action was taken. No remaining concerns.
