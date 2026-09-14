# Next session

M5 is implemented on codex/m5-mvp in the linked worktree `.worktrees/m5-mvp`,
started from the M4 tip `ff2dcf5`. Verify the actual branch and working tree
before trusting this note.

Run it locally:

    npm install
    npm run dev

Open http://127.0.0.1:5173 and choose **Night Shift**. Move with WASD, aim with
the pointer, attack with the primary mouse button, press E to buy, use a door,
or open the Bench Warrant kiosk, press F to steal, press R to recall a fused
carrier, and press Escape to pause. **Continue run** on the title screen resumes
the last room boundary, and `?seed=12345` replays a specific wing.

The M5 fun gate is awaiting user playtest: wing pacing, store placement, boss
difficulty, and whether the checkpoint cadence feels right.

After M6 authorization, the next milestone per ROADMAP.md is M6 depth work.
Preserve `src/sim` as the authority and keep branches out of the central tick.

Last full gate from checkpoint `c3a263b`:

    npm run typecheck
    npm test
    npm run test:browser
    npm run build

Result: typecheck and build passed; 24 unit/integration files and 431 tests
passed; 42 Chromium tests passed; the production scan and production inspection
at 1440x900 and 800x600 were clean.

Notes for the next session:

- The Vite dev server can take longer than Playwright's default 60-second
  `webServer` timeout to bind here; start Vite yourself and reuse it.
- Chromium cannot launch inside the sandboxed shell; run browser tests with the
  approved escalation.
- Run vitest serially here (`--no-file-parallelism`); parallel workers can time
  out while starting on this filesystem.
- No code blocker. Push, merge, publish, deploy, and release remain separate
  authorization gates.
