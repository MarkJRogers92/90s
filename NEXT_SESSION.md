# Next session

M0-M2 is implemented on `codex/m2-interaction-lab` through implementation checkpoint `848bd693876c23ecf5f10a320140d2b9c68be75c`. The milestone is published at <https://github.com/MarkJRogers92/90s>, with the exact continuation HEAD mirrored on `main`. Verify the actual branch and working tree before trusting this note.

Run it locally:

    npm install
    npm run dev

Open `http://127.0.0.1:5173`. Choose **Start shift** for the preserved M1 room or **Interaction Lab** for M2. In the lab, try the curated builds, toggle owned items, select Mop or Soaker as primary, then use WASD, pointer aim, primary click, and Escape.

M2 includes immutable definitions, item instances, validated/stage-sorted compilation, Wet/Sticky, player projectiles, bubbles, surfaces, already-Wet conductive chains, one sampled-path return pass, ancestry, and bounded generation. `src/sim` remains authoritative and central behavior has no item-name branches.

Do not begin M3 Shoplifting Loop without new user authorization. The next useful action is hands-on playtesting of combat feel, item readability, and whether the two curated combinations are fun and understandable.

Last full gate:

    npm run typecheck
    npm test
    npm run test:browser
    npm run build

Result: typecheck and build passed; 123 unit/integration tests and 12 Chromium browser tests passed. Production preview inspection found one canvas, one HUD, one lab panel, eight item cards, no overlay, no page/console errors, and no external requests.

Screenshot: `artifacts/m2-interaction-lab.png`.

No code blocker. DeepSeek access for this repository is now allowlisted and verified through the isolated `agent_bridge.deepseek_worker` route. The linked milestone worktree is intentionally separate from the M1 checkout. The milestone has been pushed to its continuation branch and mirrored to `main`; it has not been merged, deployed, or released.
