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

## 2026-09-13 — M1 final review closure

Red proof:

- npm test -- --run tests/unit/combat.test.ts — the new simultaneous move/fire boundary test failed because movement incorrectly extended mop reach before attack acceptance.
- npx playwright test tests/browser/combat.spec.ts tests/browser/restart.spec.ts — three expected failures showed that scaled pointer targeting, a live restart encounter, and the loss/restart branch were not yet exercised.

Final automated gate after the fixes:

- npm run typecheck — exit 0.
- npm test — exit 0; 3 files and 20 tests passed.
- npm run test:browser — exit 0; 7 Chromium tests passed.
- npm run build — exit 0; Vite 8.3.0 created production output in dist/.
- rg scan of production JavaScript for the debug global and all three test-fixture names — no matches.

The browser suite now proves scaled canvas-to-world pointer mapping and directional damage, ten generations of defeating and restoring a live two-enemy encounter through real input, and the Shift ended/full-health restart branch. A scoped independent re-review found all five review findings addressed and no new breakage. A production preview smoke reported one canvas, one HUD, no debug bridge, no error overlay, and no page or console errors.

## 2026-09-13 — M2 interaction lab

Red proof was captured for the loadout compiler, status/event pipeline, projectile interactions, Wet-only conduction, direct Sticky ordering, transient projectile cleanup, and the two final visual-state regressions. The first Task 4 Playwright RED could not run inside the nested DeepSeek sandbox because localhost binding was blocked; the parent environment later ran the authored browser suite successfully.

Final automated gate from the milestone worktree at `848bd693876c23ecf5f10a320140d2b9c68be75c`:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 9 files and 123 tests passed.
- `npm run test:browser` — exit 0; 12 Chromium tests passed with 4 workers.
- `npm run build` — exit 0; 32 modules transformed and production output created in `dist/`.
- Production scan for `__DEAD_MALL_DEBUG__`, `VITE_ENABLE_DEBUG_BRIDGE`, `installDebugBridge`, and development fixture names outside source maps — no matches.

The browser suite proves the visible Interaction Lab launch, one canvas and one HUD, Soaker + Bath + Rewinder outbound/return/one-burst lifecycle through real pointer input, Mop + Rewinder limited applicability, real ownership/primary resets, generation changes, 800 by 600 usability, no horizontal overflow, and all seven M1 startup/combat/restart regressions.

Production preview inspection at 1440 by 1000 reported one canvas, one HUD, one Interaction Lab region, eight item cards, no framework error overlay, no page or console errors, and requests only to `http://127.0.0.1:4173`. The captured artifact is `artifacts/m2-interaction-lab.png`.

DeepSeek Flash performed the substantial M2 implementation through eight bridge calls including the initial read-only probe. One final visual-repair call returned a malformed completion envelope, but its exact three-file patch was inspected, all gates passed, and the parent recorded commit `848bd69`. The bridge's Sol-backed parent coordinated and reviewed those calls; it was not the implementation worker.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or human feel/playtest. The graybox/vector art is not the production pixel-art pass.

## 2026-09-13 — M3 shoplifting loop

Baseline:

- `npm test` before M3 — 9 files and 123 tests passed.
- Explicit 90-second read-only startup probes reached the exact clean M3 worktree through contributor Muse and DeepSeek with `network_access:false`; neither changed a file. An unqualified Muse probe remained on the standard model, confirming fail-closed contributor consent.

Red proof:

- Task 1 catalog and command tests failed because `src/sim/shop` did not exist; the completed foundation passed 60 focused tests and raised the full suite to 183 tests.
- Task 2 security/tick tests failed before deterministic sight and wing updates existed; the completed rule lane passed 9 focused loop tests and raised the full suite to 195 tests.
- The first host M3 browser run passed 7/11 and failed four real flows: single E purchase, single F theft, retained confiscation feedback, and single E mall exit. Queueing discrete E/F presses until the fixed tick consumes them and retaining authoritative trace feedback made all 11 pass.
- Final review's ordinal-ID test failed as expected: `nearestAvailableOffer()` returned `a_thing` instead of ordinal-first `a-thing` under `localeCompare()`. The implementation now uses explicit ordinal comparison.
- Final review's terminal browser test failed as expected because Escape changed a completed wing from `paused:false` to `paused:true`. `WingScene` now ignores pause/blur mutations outside `shopping` state.
- The authoritative confiscation wording test failed against the old presentation-dependent sentence. The command now publishes `Confiscated ...`, and the HUD renders the event verbatim.

Final automated gate from reviewed implementation checkpoint `32873ec58355f8e4ad512d29a7dfcdef098980f3`:

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 13 files and 196 tests passed.
- `npx playwright test tests/browser/shoplifting-loop.spec.ts` — exit 0; 11 targeted Chromium tests passed.
- `npm run test:browser` — exit 0; 23 Chromium tests passed with 4 workers.
- `npm run build` — exit 0; Vite transformed 43 modules and created production output in `dist/`.
- `if rg -n '__DEAD_MALL_DEBUG__|VITE_ENABLE_DEBUG_BRIDGE|m3-buy-proof|m3-steal-proof|m3-caught-proof|m3-exit-proof' dist/assets --glob '*.js'; then exit 1; fi` — exit 0 with no matches.

The targeted browser suite proves launch, one canvas/HUD, two stores/eight offers, a real purchase, theft/Hidden/escape, confiscation and continuation, terminal summary and freeze, ten clean restarts, 800×600 reachability, pause/blur cleanup, return to title, and preserved M1/M2 launches. The full browser suite keeps every prior M1/M2 browser regression green.

Direct production inspection:

- 1440×900: real keyboard movement reached Extension Cord; E changed cash from `$30` to `$18`, changed inventory to `PURCHASED 1 · STOLEN 0`, and displayed the purchase event. One canvas, one HUD, eight offers, no horizontal overflow, no debug bridge, no page/console errors, and only `http://127.0.0.1:4173` requests.
- 800×600: document width stayed 800/800 with one canvas and eight offers. The HUD measured 486px client height and 796px scroll height; scrolling from 0 to 310 brought Restart and Return to title into the viewport. No page/console errors and only local-origin requests.
- Visual artifacts: `artifacts/m3-shoplifting-loop.png`, `artifacts/m3-shoplifting-loop-800x600.png`, and `artifacts/m3-shoplifting-loop-800x600-scrolled.png`.

Independent GPT review found two Important issues (terminal pause mutation and locale-sensitive tie-breaking); both were fixed with red-green proof. Its post-fix re-review found no Critical or Important issue. Minor remaining uncertainty is limited to the immutable-input expectation for custom injected item catalogs; production uses a deep-frozen catalog.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or human feel/playtest. Prices, sight timing, Heat escalation, and the buy-versus-steal choice still require hands-on evaluation. The graybox/vector art is not the production-art pass.

## 2026-09-13 — M4 void the warranty

Final automated gate from implementation checkpoint `cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` on branch `codex/m4-void-the-warranty` (branch start `10765d10fb4703ae8fe7bae34da24b8f173dfffa`):

- `npm run typecheck` — passed.
- `npm test` — passed; 18 files and 289 tests.
- `npx playwright test tests/browser/void-the-warranty.spec.ts` — passed; 7/7 Chromium tests.
- `npm run test:browser` — passed; 31/31 Chromium tests.
- `npm run build` — passed; Vite transformed 55 modules and emitted `dist/index.html` 9.81 kB (2.34 kB gzip), CSS 8.29 kB (2.27 kB gzip), and JavaScript 1,495.73 kB (390.82 kB gzip).
- `rg -n --glob '*.js' --glob '!*.map' "__DEAD_MALL_DEBUG__|VITE_ENABLE_DEBUG_BRIDGE|bench-doorway" dist` — no matches.
- `git diff --check` — passed.

Direct production inspection of the current `dist/`, served locally at `http://127.0.0.1:4174` because port 4173 was already occupied by an older unrelated preview and was left untouched (server stopped afterward):

- 1440x900: one canvas and one visible Bench HUD; body width 1440, scroll width 1440, so no horizontal overflow; production debug bridge absent; clean preview visible; HUD client height 786 and scroll height 1074; Clean soaker, Stolen popper, Unsupported mop, Confirm fusion, Cancel fusion, Acquire late pickup, Restart bench, and Return to title were all reachable; zero page errors, zero console errors, zero external-origin requests, and three local requests.
- 800x600: one canvas and one visible Bench HUD; body width 800, scroll width 800, so no horizontal overflow; production debug bridge absent; clean preview visible; HUD client height 486 and scroll height 1074; all scenario and transaction controls above remained reachable by scrolling; zero page errors, zero console errors, zero external-origin requests, and three local requests.
- Screenshots: `artifacts/m4-void-the-warranty.png` (1440x900, SHA-256 `9c615882c80f82b07f8872632758c05ec9a268d548a95e36e7f25e1ab815bd4a`) and `artifacts/m4-void-the-warranty-800x600.png` (800x600, SHA-256 `7f10a5f9efdf45252e6e6f08839da5ac160ba97318158ab889eedb7b8939ecbf`).

Independent review: contributor Muse reviewed the actual range `10765d10fb4703ae8fe7bae34da24b8f173dfffa..cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` read-only at `xhigh`. It reported no Critical or Important findings and approved Task 6 documentation. Non-blocking observations preserved: the first-tick projectile hold is intentional so a fresh projectile can be observed before movement; a doorway transition tick can consume held fire once in the destination, but the scene immediately clears input and prevents multi-step leakage; the development-only `bench-doorway` fixture temporarily teleports the player without the carrier, and the authoritative leash correction closes the transient gap; the protected M2/M3 catalog subset uses the first eight definitions with exact-order regression coverage; browser origin proof uses a 48-unit deterministic allowance plus a closer-to-car-than-player assertion.

Muse bridge health: the bridge originally accepted `reasoning_level: max` for contributor Muse even though that provider invocation exits before a turn begins. Minimal probes reproduced the zero-turn failure at `max` and succeeded at `xhigh`. A local bridge correction now advertises and accepts Muse levels through `xhigh` only, rejects `max` with a clear contract error, and leaves DeepSeek's `max` support unchanged. Host checks passed: 26/26 focused bridge tests, 191/191 full bridge tests, and `git diff --check`. The bridge repository was intentionally dirty before this work, so these changes remain unstaged and uncommitted. A fresh Work session is required to load the updated MCP schema.

Coverage not run: WebKit, Safari, Windows browser/device, physical-device performance, audio, or human feel/playtest. Fusion balance and bench feel still require hands-on evaluation. The graybox/vector art is not the production-art pass. Disk durability, production art, audio, and M5 behavior are not claimed.
