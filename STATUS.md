# Status

**Current milestone:** M1 combat room implemented and verified locally; ready for user playtest.

**Playable result:** Start a Janitor shift, move with WASD, aim with the pointer, hold primary click to swing the mop, avoid a pursuing Hanger and a telegraphing Spitter, take cooldown-limited damage, pause/resume with Escape, clear or lose the room, and restart from the terminal panel.

**Latest verification (2026-09-13):**

- npm run typecheck — exit 0.
- npm test — 3 files, 19 tests passed.
- npm run test:browser — 6 Chromium tests passed, including real keyboard/pointer input and ten UI restarts.
- npm run build — exit 0; Vite production output created in dist/.
- Direct Playwright visual inspection — one canvas and one HUD, no page/console errors, no Vite overlay, and no external requests observed.
- Production JavaScript scan — no __DEAD_MALL_DEBUG__ global in built JavaScript.

**Workspace:** /Users/markrogers/Documents/Github Code/90s

**Branch:** codex/m0-m1-combat-room

**Local source checkpoint:** a0f49f0

**Known uncertainty:** The art is deliberately authored graybox/vector work, there is no sound, WebKit/Safari/device coverage was not run, and the combat feel/fun gate still needs the user's hands-on playtest.

**Next:** Stop at M1. When authorized, begin M2 with the eight-item interaction lab and renderer-independent behavior resolver.
