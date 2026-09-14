# Status

**Current milestone:** M4 Void the Warranty implemented and verified locally; ready for user playtest.

**Playable result:** The title screen now launches four separate modes. **Start shift** preserves the M1 combat room, **Interaction Lab** preserves the M2 item sandbox, **Shoplifting Loop** preserves the M3 deterministic two-store wing, and **Void the Warranty** launches the M4 bench-fusion mode. M4 supports Clean soaker, Stolen popper, and Unsupported mop scenarios, Confirm and Cancel fusion, Acquire late pickup, Restart bench, and Return to title under the shared Emitter Mount rule.

Bench fusion rules remain renderer-independent under `src/sim/bench` and `src/sim/fusion`. Phaser collects input, advances the fixed-step loop, and presents authoritative state.

**Latest verification (2026-09-13) from implementation checkpoint `cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f`:**

- `npm run typecheck` — passed.
- `npm test` — passed; 18 files and 289 tests.
- `npx playwright test tests/browser/void-the-warranty.spec.ts` — passed; 7/7 Chromium tests.
- `npm run test:browser` — passed; 31/31 Chromium tests.
- `npm run build` — passed; Vite transformed 55 modules and emitted `dist/index.html` 9.81 kB (2.34 kB gzip), CSS 8.29 kB (2.27 kB gzip), and JavaScript 1,495.73 kB (390.82 kB gzip).
- `rg -n --glob '*.js' --glob '!*.map' "__DEAD_MALL_DEBUG__|VITE_ENABLE_DEBUG_BRIDGE|bench-doorway" dist` — no matches.
- `git diff --check` — passed.
- Contributor Muse reviewed the actual range `10765d10fb4703ae8fe7bae34da24b8f173dfffa..cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` read-only at `xhigh`, reported no Critical or Important findings, and approved Task 6 documentation.

**Direct production inspection:**

- The current `dist/` was served locally at `http://127.0.0.1:4174` because port 4173 was already occupied by an older unrelated preview and was left untouched. The production build was inspected with installed Playwright and the server was stopped afterward.
- At 1440x900: one canvas and one visible Bench HUD; body width 1440 and scroll width 1440 with no horizontal overflow; production debug bridge absent; clean preview visible; HUD client height 786 and scroll height 1074; Clean soaker, Stolen popper, Unsupported mop, Confirm fusion, Cancel fusion, Acquire late pickup, Restart bench, and Return to title were all reachable; zero page errors, zero console errors, zero external-origin requests, and three local requests.
- At 800x600: one canvas and one visible Bench HUD; body width 800 and scroll width 800 with no horizontal overflow; production debug bridge absent; clean preview visible; HUD client height 486 and scroll height 1074; all scenario and transaction controls above remained reachable by scrolling; zero page errors, zero console errors, zero external-origin requests, and three local requests.
- Screenshots: `artifacts/m4-void-the-warranty.png` (1440x900, SHA-256 `9c615882c80f82b07f8872632758c05ec9a268d548a95e36e7f25e1ab815bd4a`) and `artifacts/m4-void-the-warranty-800x600.png` (800x600, SHA-256 `7f10a5f9efdf45252e6e6f08839da5ac160ba97318158ab889eedb7b8939ecbf`).

**Repository state:** Branch `codex/m4-void-the-warranty` in the local linked worktree `/Users/markrogers/Documents/Github Code/90s/.worktrees/m4-void-the-warranty`, backed up to the same branch on `origin`. The M4 implementation checkpoint is `cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` from branch start `10765d10fb4703ae8fe7bae34da24b8f173dfffa`. M4 has not been merged, published, deployed, or released.

**Known uncertainty:** Non-blocking review observations: the first-tick projectile hold is intentional so a fresh projectile can be observed before movement; a doorway transition tick can consume held fire once in the destination, but the scene immediately clears input and prevents multi-step leakage; the development-only `bench-doorway` fixture temporarily teleports the player without the carrier, and the authoritative leash correction closes the transient gap; the protected M2/M3 catalog subset uses the first eight definitions with exact-order regression coverage; browser origin proof uses a 48-unit deterministic allowance plus a closer-to-car-than-player assertion. Fusion balance and bench feel still require the user's hands-on playtest. The graybox/vector presentation is not a production-art pass. Disk durability is not claimed. WebKit, Safari, Windows/device coverage, audio, and physical-device performance were not run.

**Next:** Stop at M4. Run a hands-on Void the Warranty playtest; do not begin M5 without new authorization.
