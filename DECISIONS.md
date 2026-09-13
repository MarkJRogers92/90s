# Decisions

## 2026-09-13

- Use the empty MarkJRogers92/90s remote as the dedicated DEAD MALL repository, with local work on codex/m0-m1-combat-room.
- Build M0 and M1 only from the approved handoff.
- Use a renderer-independent TypeScript simulation with Phaser as a browser adapter.
- Pin Node-compatible exact versions: Phaser 4.2.1, Vite 8.3.0, TypeScript 7.0.2, Vitest 5.0.0, Playwright Test 1.63.0.
- Use original local vector/graybox rendering for the first room; final pixel art cannot block combat proof.
- Keep the debug snapshot opt-in for development/browser tests and absent from ordinary production runtime.
- The fresh clone and feature branch are sufficient isolation for an empty repository; no second linked worktree is needed.
- Local commits are authorized by the build handoff. Push, deployment, and publication are not authorized.
- Reuse one Phaser RunScene for restarts while replacing the authoritative RunState; a development-only generation counter proves ten restarts do not create extra canvases, HUDs, or loops.
- Keep the browser debug bridge read-only. The restart-proof fixture is selected by URL only when both Vite development mode and the explicit debug flag are active.
