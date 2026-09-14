# Next session

Continue DEAD MALL on `codex/m3-shoplifting-art-reference`, based on `main` at `948af6a4b49705e2f5b52531df424635fad53dfc`. Verify the actual branch and working tree before editing. The user explicitly authorized moving forward from M2 to the next milestone, M3. Do not restart from an older M1 checkout or overwrite local work.

## 1. Finish the original image archive

The attached `DEAD_MALL_APPROVED_ART_REFERENCE_PACK.zip` is required. It contains ten original full-size PNG boards, nine earlier supporting images, the original source brief, README, and a SHA-256 manifest, all under `docs/art/reference-sheets/approved-2026-09-13/`.

The metadata is committed, but the image binaries are not. Locate the ZIP from this conversation in the user's local files or attach it to the local Codex session. Extract only safe repository-relative paths under that reference folder. Refuse traversal/symlink destinations or differing existing originals. Verify byte sizes and SHA-256 for every image and the source brief using manifest.json. Stage only the reference folder, review the exact staged paths, commit, push this continuation branch, and confirm image blob paths exist remotely. Do not use git add . with unrelated local work. Do not report images as saved before this is complete.

One earlier generated cream-background ponytail-player variant reused a later filename and is not separately retrievable in this chat's mounted files. This is documented in the manifest. Do not invent it or claim all requested Sheets 02–35 exist.

## 2. Verify the M3A starter on the pinned project toolchain

    npm ci
    npm run test:m3
    npm run typecheck
    npm test
    npm run test:browser
    npm run build

The new module is `src/sim/shops/transactions.ts`; tests are `tests/contracts/shop-transactions.contract.cjs`; the targeted runner is `tools/test-m3-transactions.mjs`. All 24 isolated contracts and a strict compile passed in the chat workspace with Node v22.16.0 and TypeScript 5.8.3. This is not the full pinned project gate. The last historical M2 gate had 123 tests and 12 Chromium browser checks.

## 3. Continue M3, not M4

Read `docs/milestones/M3_SHOPLIFTING_LOOP.md`. The transaction kernel is not wired into live gameplay yet. Preserve Start shift and Interaction Lab. Next add a separate M3 mode and a fixed mini-wing; connect the kernel to run inventory and compiled loadouts atomically; preserve purchased/stolen receipts, consumed stock, cash, and Heat through room revisits; reject interactions while paused, dead, out of range, or outside the shop. Add Buy/Steal/Leave UI with clear prices and Heat consequences, one deterministic security escalation, and real browser journeys for buy/steal/leave/revisit/restart/exit.

Keep gameplay authority in src/sim. Do not turn generated reference boards into full-screen game textures, replace the Janitor based on incidental portrait labels, add cloud runtime calls, start fusion, or deploy/release without a separate instruction. Use the art source brief for the eventual Aseprite production pass. Finish with true test evidence and an actual playable screenshot, not an image-generation mockup.
