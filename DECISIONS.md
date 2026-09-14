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
- Isolate M3 in linked worktree `.worktrees/m3-shoplifting-loop` on branch `codex/m3-shoplifting-loop`; keep shopping, economy, provenance, security, and transition rules renderer-independent under `src/sim/shop`.
- Isolate M4 in linked worktree `.worktrees/m4-void-the-warranty` on branch `codex/m4-void-the-warranty`; keep bench fusion rules, including the shared Emitter Mount rule, renderer-independent under `src/sim/bench` and `src/sim/fusion`.
- Keep the development-only `bench-doorway` fixture out of production; it temporarily teleports the player without the carrier and the authoritative leash correction closes the transient gap.
- Treat the first-tick projectile hold as intentional so a fresh projectile can be observed before movement; a doorway transition tick can consume held fire once in the destination while the scene immediately clears input and prevents multi-step leakage.
- Protect the M2/M3 catalog subset as the first eight definitions with exact-order regression coverage; browser origin proof uses a 48-unit deterministic allowance plus a closer-to-car-than-player assertion.
- Accept contributor Muse actual-diff review of `10765d10fb4703ae8fe7bae34da24b8f173dfffa..cd5f4c1d00bd72fe7b4c800455e5c922313e7c8f` read-only at `xhigh` with no Critical or Important findings as the M4 review gate.
- Correct the local Muse bridge to advertise and accept Muse reasoning levels through `xhigh` only, rejecting `max` with a clear contract error while leaving DeepSeek `max` support unchanged; the fix remains unstaged and uncommitted in the bridge repository and requires a fresh Work session to load the updated MCP schema.
- M4 uses original local graybox/vector presentation. Disk durability, production art, audio, M5 content, WebKit/Safari/Windows/device coverage, and physical-device performance remain out of scope.
- M4 may be committed and the branch may be pushed to `origin` for GitHub backup and continuation. Do not merge, publish, deploy, release, or begin M5.
