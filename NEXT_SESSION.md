# Next session

M0-M3 is implemented in the local linked worktree `/Users/markrogers/Documents/Github Code/90s/.worktrees/m3-shoplifting-loop` on branch `codex/m3-shoplifting-loop`. The reviewed gameplay implementation checkpoint is `32873ec58355f8e4ad512d29a7dfcdef098980f3`. Verify the actual branch, HEAD, and working tree before trusting this note.

Run it locally:

    npm install
    npm run dev

Open `http://127.0.0.1:5173`. Choose **Shoplifting Loop** for M3; **Start shift** and **Interaction Lab** preserve M1 and M2. In M3, use WASD to enter either store, approach an offer, press E to buy or F to steal, cross the source-store doorway to secure a theft, and deliberately use E at the Orchard Gate exit to finish the run.

M3 keeps shopping rules under `src/sim/shop`: validated fixed content, pure buying/theft/secure/confiscate/leave commands, deterministic movement and sweeping sight, stable ordinal offer selection, suspicion, Heat, factual provenance, terminal freeze, and replay coverage. Phaser owns only input cadence and presentation.

Last full gate:

    npm run typecheck
    npm test
    npx playwright test tests/browser/shoplifting-loop.spec.ts
    npm run test:browser
    npm run build

Result: typecheck and build passed; 196 unit/integration tests, 11 targeted M3 Chromium tests, and 23 full Chromium tests passed. The production bundle excludes the debug bridge and all M3 fixture names. Direct production inspection at 1440×900 and 800×600 found one canvas, one HUD, eight offers, no horizontal overflow, no page/console errors, and only local-origin requests. At 800×600, scroll the HUD to reach the remaining offers and action buttons.

Screenshots: `artifacts/m3-shoplifting-loop.png`, `artifacts/m3-shoplifting-loop-800x600.png`, and `artifacts/m3-shoplifting-loop-800x600-scrolled.png`.

Nothing from M3 has been pushed, merged, published, deployed, or released. The continuation point is a hands-on M3 feel/readability playtest. Stop at M3 and do not begin M4 without explicit authorization.
