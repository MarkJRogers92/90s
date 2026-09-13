# Status

**Current milestone:** M3 Shoplifting Loop implemented and verified locally; ready for user playtest.

**Playable result:** The title screen now launches three separate modes. **Start shift** preserves the M1 combat room, **Interaction Lab** preserves the M2 item sandbox, and **Shoplifting Loop** launches M3's deterministic two-store wing. M3 supports buying, theft, security sight and suspicion, confiscation, store-exit securing, persistent Heat, factual item provenance, restart, return to title, and an intentional purchased/stolen/cash/Heat summary.

Shopping, economy, provenance, security, and transition rules remain renderer-independent under `src/sim/shop`. Phaser collects input, advances the fixed-step loop, and presents authoritative state.

**Latest verification (2026-09-13) from implementation checkpoint `32873ec58355f8e4ad512d29a7dfcdef098980f3`:**

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 13 files and 196 tests passed.
- `npx playwright test tests/browser/shoplifting-loop.spec.ts` — exit 0; 11 targeted Chromium tests passed.
- `npm run test:browser` — exit 0; 23 Chromium tests passed, including all M1-M3 browser flows.
- `npm run build` — exit 0; Vite transformed 43 modules and created production output in `dist/`.
- Production JavaScript scan for the debug bridge, debug flag, and all four M3 fixture names — no matches outside source maps.
- Independent GPT actual-diff review and post-fix re-review — no unresolved Critical or Important finding.

**Direct production inspection:**

- At 1440×900, a real keyboard purchase changed cash from `$30` to `$18`, marked one item purchased, consumed the correct offer, and showed the authoritative recent event. The page had one canvas, one HUD, eight offer cards, no horizontal overflow, no debug bridge, no page/console errors, and requests only to `http://127.0.0.1:4173`.
- At 800×600, the page remained exactly 800 pixels wide with one canvas and eight offers. The 486-pixel HUD intentionally scrolls its 796-pixel contents; direct inspection reached both action buttons, with no page/console errors and only local-origin requests.
- Screenshots: `artifacts/m3-shoplifting-loop.png`, `artifacts/m3-shoplifting-loop-800x600.png`, and the supporting scrolled view `artifacts/m3-shoplifting-loop-800x600-scrolled.png`.

**Repository state:** Branch `codex/m3-shoplifting-loop` is local only. Nothing from M3 has been pushed, merged, published, deployed, or released.

**Known uncertainty:** Prices, sight timing, Heat escalation, and the buy-versus-steal decision still require the user's hands-on feel playtest. The graybox/vector presentation is not a production-art pass. WebKit, Safari, Windows/device coverage, audio, and physical-device performance were not run. Custom catalogs passed to `createWingRun()` are expected to remain immutable; the production catalog is deep-frozen.

**Next:** Stop at M3. Run a hands-on Shoplifting Loop playtest; do not begin M4 without new authorization.
