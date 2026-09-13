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
- Isolate M2 in linked worktree `.worktrees/m2-interaction-lab` on branch `codex/m2-interaction-lab`.
- Compile owned item instances into one immutable, stage-sorted loadout; central simulation code branches on effect kinds and capabilities, never item definition IDs.
- Cap effect ancestry at generation depth 4 and 64 child gameplay events per root action, with bounded visible diagnostics.
- Use Wet for 180 ticks and Sticky for 90 ticks at a 0.65 movement multiplier with a 0.5 floor.
- Limit conductive chains to one start per root and three additional already-Wet targets, ordered by distance then stable entity ID; Extension Cord changes range from 150 to 220 and upgrades rather than duplicates the reaction.
- Give eligible surviving projectiles one sampled-path return pass. Outbound expiry starts return before burst; destructive impact or return completion produces at most one terminal burst.
- Keep the Interaction Lab separate from Start shift, rebuild a fresh seeded run for every loadout change, and preserve one Phaser canvas and one HUD.
- M2 uses original local graybox/vector presentation. Production pixel art, audio, shops, theft, Heat, fusion, saves, and M3 content remain out of scope.
