# Status

**Current milestone:** M5 MVP run implemented and reviewed locally; ready for user playtest.

**Playable result:** The title screen now launches five modes. **Start shift** preserves the M1 combat room, **Interaction Lab** preserves the M2 item sandbox, **Shoplifting Loop** preserves the M3 deterministic two-store wing, **Void the Warranty** preserves the M4 bench-fusion mode, and **Night Shift** launches the M5 MVP run. **Continue run** is enabled only when a valid local checkpoint exists.

Night Shift is one short seeded mall wing: a safe service corridor with the Bench Warrant kiosk, two seeded storefronts drawn from four authored templates, two combat rooms whose doorways stay locked until they are cleared, and a sealed security office holding the Loss Prevention Manager boss. The run carries one provenance-bearing inventory, compiles its loadout from purchases, thefts, and fusion, tracks cash, Heat, and suspicion, and writes a versioned checkpoint at every room boundary. Winning clears the checkpoint; dying keeps it so the shift can be retried from the last boundary.

Wing generation, run state, economy, transitions, the boss, and checkpoint validation remain renderer-independent under `src/sim/wing` and `src/sim/run`. Phaser collects input, advances the fixed-step loop, and presents authoritative state.

**Latest verification (2026-09-13) from implementation checkpoint `c3a263b`:**

- `npm run typecheck` — exit 0.
- `npm test` — exit 0; 24 files and 431 tests passed.
- `npx playwright test tests/browser/night-shift.spec.ts` — exit 0; 11 Chromium tests passed, including a real boss kill that publishes the terminal summary and clears the checkpoint.
- `npm run test:browser` — exit 0; 42 Chromium tests passed across all six modes.
- `npm run build` — exit 0; Vite production output created in `dist/`.
- Production JavaScript scan for the debug bridge, debug flag, and every M5 fixture name — no matches outside source maps.
- Direct production inspection at 1440x900 and 800x600 — one canvas, one run HUD, no horizontal overflow, no debug bridge, no page or console errors, and only local-origin requests. Screenshots: `artifacts/m5-mvp-run.png` and `artifacts/m5-mvp-run-800x600.png`.
- Independent cross-family review — Muse reviewed the wing, run, economy, and checkpoint modules read-only at high reasoning, and DeepSeek reviewed the boss and presentation read-only at high reasoning. Every Critical and Important finding was repaired with a regression test in `c3a263b`.

**Repository state:** Branch `codex/m5-mvp` in the local linked worktree `/Users/markrogers/Documents/Github Code/90s/.worktrees/m5-mvp`, started from the M4 tip `ff2dcf5`. Nothing from M5 has been pushed, merged, published, deployed, or released.

**Known uncertainty:** The art is deliberate graybox/vector work and there is no sound. Balance is unplayed: wing pacing, store placement, boss difficulty, and checkpoint cadence all need the user's hands. Phase-3 boss summons are allowed once per boss encounter rather than once per save slot, because checkpoints deliberately exclude room-local entity state. WebKit, Safari, Windows, device coverage, and physical-device performance were not run.

**Next:** Stop at M5. Run a hands-on Night Shift playtest; do not begin M6 without new authorization.
