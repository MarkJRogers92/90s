# Test evidence

## 2026-09-13 — M0 foundation

Environment: macOS, Node 24.20.0, npm 11.19.0, Playwright Chromium desktop profile.

Red proof:

- npm run test:browser -- tests/browser/startup.spec.ts — exit 1 as expected; the Start shift action existed but canvas was not found.
- After initial implementation, the same test failed because Phaser created the canvas while its parent was hidden. The shell now reveals the parent before constructing Phaser.

Green proof:

- npm run typecheck — exit 0.
- npm run build — exit 0; Vite 8.3.0 produced dist/.
- npm run test:browser -- tests/browser/startup.spec.ts — 1 passed in Chromium.

Not yet run: unit/integration tests (M1 simulation does not exist yet), WebKit, Safari/device coverage, full M1 browser scenarios, restart loop, or human feel playtest.

## 2026-09-13 — M1 combat room

Red proof:

- npm test -- tests/unit/movement.test.ts — exit 1 with normalized direction and fixed movement behavior absent.
- npm test -- tests/unit/combat.test.ts — exit 1 with eight expected behavior failures covering cone geometry, wall blocking, cooldown, contact damage, Spitter timing, projectile cleanup, and lethal ordering.
- npm run test:browser -- tests/browser/combat.spec.ts — exit 1 before the run HUD, real input adapter, and debug snapshot existed.
- npm run test:browser -- tests/browser/restart.spec.ts — exit 1 before terminal UI and restart wiring existed.

Final automated gate:

- npm run typecheck — exit 0.
- npm test — exit 0; 3 files and 19 tests passed.
- npm run test:browser — exit 0; 6 Chromium tests passed with 3 workers.
- npm run build — exit 0; Vite 8.3.0 created production output in dist/.
- rg -n "__DEAD_MALL_DEBUG__" dist -g "*.js" — no match; the development global is absent from production JavaScript.

Browser scenarios exercised the real Start shift button, canvas visibility, WASD movement, pointer-held mop input, Escape pause/resume, blur pause, input/backlog clearing, responsive canvas bounds, and ten UI-driven restarts with one canvas and one HUD.

Visual inspection:

- artifacts/m0-title.png — actual local title screen.
- artifacts/m1-combat-room.png — actual local combat room while the mop sweep is active.
- Direct Playwright observation at 1440 by 900 reported one canvas, one HUD, tick 25, an active mop cooldown/sweep, two live enemy types, no Vite overlay, no page/console errors, and no external requests.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or user feel/playtest. The graybox/vector art is not the production pixel-art pass.
