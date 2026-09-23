# Next session

**2026-09-22 playtest response:** The user found Night Shift's store and fusion
choices confusing. The local art worktree now shows the goal and a concrete
next step, puts store choices above the portrait and inventory, explains the
buy/steal trade, and gives the kiosk's RC-car-plus-ranged-weapon requirement
and fusion trade in plain language. These edits are local until separately
published; inspect branch and `git status` before continuing. The remaining
human gate is a hands-on read of the store/fusion flow and whether the overall
game loop feels coherent. The floor/walls are still graybox art.

**Art branch update (2026-09-22):** The store clerk portrait is implemented on
`codex/pixellab-aseprite-proof`. Start this worktree with `npm run dev`, choose
Night Shift, and use `/?fixture=mvp-storefront&seed=4242` to see the Cinema
Snacks vendor immediately. The portrait hides on leaving or restarting the
store. `main` does not yet include this art branch. The stranger, survivor, and
corrupted-human portraits still need real gameplay roles before they should
appear; do not invent NPC or dialogue state merely to display them.

M5 is implemented on codex/m5-mvp in the linked worktree `.worktrees/m5-mvp`,
started from the M4 tip `ff2dcf5`, with the in-run Bench Warrant fusion repaired
on 2026-09-19. Verify the actual branch and working tree before trusting this
note.

Run it locally:

    npm install
    npm run dev

Open http://127.0.0.1:5173 and choose **Night Shift**. Move with WASD, aim with
the pointer, attack with the primary mouse button, press E to buy, use a door,
or open the Bench Warrant kiosk, press F to steal, press R to recall a fused
carrier, and press Escape to pause. **Continue run** on the title screen resumes
the last room boundary, and `?seed=12345` replays a specific wing.

To reach the repaired fusion loop quickly, buy the Remote-Control Car at the
first storefront (Mall Mart sells it for $20), then walk back to the Bench
Warrant kiosk in the service corridor and press E. Alternatively,
`http://127.0.0.1:5173/?fixture=mvp-bench` starts a shift at the kiosk already
owning the car and a projectile primary; that fixture exists only in Vite
development mode.

The M5 fun gate is awaiting user playtest: wing pacing, store placement, boss
difficulty, whether the checkpoint cadence feels right, and whether the car
feels good to steer — its leash, its recall trip, and whether the fusion fee
reads as a real trade rather than a free upgrade.

After M6 authorization, the next milestone per ROADMAP.md is M6 depth work.
Preserve `src/sim` as the authority and keep branches out of the central tick.

Last full gate from this working tree on 2026-09-19:

    npm run typecheck
    npm test
    npm run test:browser
    npm run build

Result: typecheck and build passed; 27 unit/integration files and 469 tests
passed; 45 Chromium tests passed; the production scan was clean and the
production preview at 1440x900 was smoke-inspected. No 800x600 production
screenshot was retaken for this change.

Notes for the next session:

- Night Shift has sound, wired into the M5 run only. **Start shift** (M1),
  **Interaction Lab** (M2), **Shoplifting Loop** (M3), and **Void the Warranty**
  (M4) are still silent. `deriveAudioCues` reads run state and is mode-agnostic,
  so wiring them is follow-up work. Mute with the HUD button or the M key.

- The Vite dev server can take longer than Playwright's default 60-second
  `webServer` timeout to bind here; start Vite yourself and reuse it.
- Chromium cannot launch inside the sandboxed shell; run browser tests with the
  approved escalation.
- Run vitest serially here (`--no-file-parallelism`); parallel workers can time
  out while starting on this filesystem.
- No code blocker. On 2026-09-19 the user authorized one push, so `main` and
  `codex/m5-mvp` are now current on `origin`. Deploy, release, tagging, and
  publishing remain separate authorization gates, as does beginning M6.
