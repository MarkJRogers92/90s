# Independent review of the October 9 handoff

## Result and source

The five principal findings (H1, H2, M1, M2 and M3) were reproduced and fixed. Testing also established a related revival freeze that the handoff missed. The defensive L3 transaction issue was fixed; L4/L5 comments were corrected. T1 could not be reproduced. L1/L2 behavior was left unchanged.

- Repository: `MarkJRogers92/90s`.
- Handoff commit: `77cba1e04ee7c3f072bdaa35ce312e469f46441f`.
- Implementation base: `7cb142ad2992574d0d9fb086a18fe712f80d4433`. Its only difference from the handoff commit is `tools/pixel-forge/README.md`; the reviewed game source is identical.
- Review branch: `review/2026-10-09-verified-fixes`.
- The owner subsequently authorized push and merge. GitHub records publication state. The downloadable review packet preserves the prepublication patch; the owner's Mac still needs to pull the merged changes for playtesting.
- Findings were checked against the actual source, installed Phaser 4.2.1 code and failing regression tests. The handoff's labels and suggested fixes were treated as claims to test.

## Findings and decisions

| Item | Independent verdict | Decision |
|---|---|---|
| H1: cutscene texture corruption | Confirmed with real Phaser Texture/Frame code; existing and new gameplay sprites can end with zero-size crops. | Fixed both cutscenes using explicit `__BASE` plus crop origins. |
| H2: unreachable dash-start rendering check | Confirmed after real sim steps: first observable remaining duration is 11, never 12. | Observe each fixed step, deduplicate accepted starts and queue scoped puffs. |
| M1: recollected stolen goods below Heat floor | Confirmed through theft, actual exit, drop input, authored room clear and pickup. | Reapply the existing Heat floor after inventory/receipt restoration. |
| M2: final return segment misses targets | Confirmed through actual Rewinder projectile paths. | Process the final segment through the existing collision and penetration handler before termination. |
| M3: fatal clear corrupts Continue | Confirmed for same-tick death and for two sim ticks batched before a frame save. | Preserve valid checkpoint markers/bytes and reject invalid health before serialization. |
| Additional: revival freezes combat | Confirmed after both Second Wind and ordinary clear recovery. | Resume wrapped combat after positive-health recovery succeeds. |
| L3: hybrid confirmation skips validation | Confirmed through unavailable service and changed-ingredient cases. | Reuse `resolveFusion`, including a hybrid recipe check before commit. |
| L1: packed RGB is not brightness | Arithmetic concern is valid; the proposed channel sum also is not luminance, and no desired tint policy was established. | No visual policy change. |
| L2: square swept-wall corners | Confirmed approximation; the handoff itself does not establish unintended behavior. | No collision geometry change. |
| L4: floor helper wording | All current callers use a won boss wing; broader comments were misleading. | Document the actual input requirement and first-wing behavior. |
| L5: RNG ordering comments | Omitted floor/district substitutions and outdated template count. | Comments corrected; RNG behavior unchanged. |
| T1: two load-induced timeouts | Not reproduced on this machine. Original full suite passed. | Timeout limits and test assertions unchanged. |

## What the important fixes do

### H1: keep Alex's sheets intact during and after cutscenes

`EscalatorRide` and `DawnEnding` added named frames to textures loaded as whole images. Phaser's first added frame becomes the default, while gameplay's sheet-space crop code assumes the full `__BASE` frame. Tests using Phaser's actual `Texture` and `Frame` implementations produced both changed defaults and zero-width/zero-height gameplay crops before the fix.

The two cutscenes now request `__BASE` explicitly and use `croppedFrameOrigin` to select a cell without mutating the shared frame list. Their original scale and 0.9-cell feet anchor are retained, including all six ending walk cells. Restoring a default only on destruction was rejected because that would leave shared consumers exposed during the cutscene and make correctness depend on cleanup order.

Evidence: [cutscene-textures.test.ts](../../../tests/unit/cutscene-textures.test.ts). Four expected failures were observed before the fix; seven lifecycle/geometry tests now pass. The adjacent cutscene/boss/aim selection was 27/27.

### H2: observe dash starts on the simulation clock

Both dead checks expected 12 remaining ticks, but the same sim step starts the dash and immediately reduces it to 11. Simply changing the rendered-state comparison to 11 is insufficient: one frame can contain several sim steps, and pause/hit stop can render an unchanged state repeatedly.

The existing per-step presentation hook is now `observeStep`. It retains loot observation, counts an accepted dash once using combat identity and tick, and records the position/direction for one later puff. Rendering consumes that event once. Room and shop-interior scope prevent old dust from appearing after a doorway; restart resets pending events. The counter drives the existing hint retirement at three dashes.

Qualification: the pre-existing `resetForRun` call on ascent still resets learning for each new wing/floor. This patch does not make hint retirement permanent across the entire night.

Evidence: [dash-feedback-lifecycle.test.ts](../../../tests/unit/dash-feedback-lifecycle.test.ts). Six original failures plus a separately reproduced shop-scope edge were fixed. Seven tests now cover repeated frames, 4/8/12 steps before rendering, cooldown refusals, three-dash retirement, restart and store exit. Adjacent selection: 32/32.

### M1/M2: restore existing inventory and projectile rules

The M1 repro never assigns Heat directly. Securing a real theft produces 20 Heat; dropping the weapon and clearing an authored fight cools it to 10; recollection previously retained 10 even though the held stolen item requires a floor of 20. One fight does not immediately reach zero as the handoff's example implied. The invariant violation is nevertheless real. Clean purchases remain at zero on pickup.

M2 tests isolate targets reachable only on sampled path segment 1 to 0. Before the fix they remained at 40 HP rather than 38. The final segment now goes through the same hit handler as earlier segments. Tests cover penetrating and nonpenetrating payloads, stable target ordering, per-pass hit deduplication and a single terminal burst.

Evidence: [dropped-hot-goods.test.ts](../../../tests/unit/dropped-hot-goods.test.ts), [projectile-return-end.test.ts](../../../tests/unit/projectile-return-end.test.ts). Four failures and one clean-goods control were observed first. All five new cases and 104 tests in the adjacent selection pass.

### M3 and revival: preserve Continue and resume live combat

A mop kills the last Spitter and its already-fired shot kills the one-health player in the same tick. With No Breaks, the original code marks the room cleared and overwrites Continue with zero health; the parser rejects that save. Tests restore the prior checkpoint and verify it has the uncleared room, living enemies and positive player health.

Cross-review established a second path: tick 1 clears while alive; tick 2 dies before the rendered frame persists. A simulation-only marker rollback is insufficient because tick 1's new marker has not been saved. The scene now refuses invalid-health writes before changing `lastCheckpointKey` or its status message. The serializer also rejects nonpositive/noninteger health, and both existing store implementations retain their previous bytes on rejection. Completed-run clearing still works.

The required revival controls uncovered another actual bug: healing restored the outer run, but the inner combat state stayed `dead`, so the next movement tick did nothing. Terminal evaluation now resumes inner combat after successful recovery. Recovery values, invulnerability duration, perk consumption and event order are preserved.

Evidence: [checkpoint-fatal-clear.test.ts](../../../tests/unit/checkpoint-fatal-clear.test.ts). The first same-tick case failed before correction; five later batched-save/revival/serializer checks failed when introduced. Final adjacent selection: 60/60.

### L3: refuse invalid confirmations without consuming anything

Hybrid confirmation now recomputes through the existing public resolver rather than its narrower private hybrid routine. It rejects unavailable service, duplicate definitions, unknown definitions and changed recipes without throwing or consuming money/items. A valid hybrid still commits exactly once.

This is defensive hardening, not a demonstrated ordinary-play exploit: service is currently enabled in normal runs, and normal inventory mutations should advance revision.

Evidence: [hybrid-commit-validation.test.ts](../../../tests/unit/hybrid-commit-validation.test.ts). Four failures plus one valid control were observed first; 57/57 adjacent tests pass.

## Verification

| Check | Result |
|---|---|
| Unmodified baseline `npm test` | 194 files, 2,021 tests passed; about 25.1 s. |
| Fixed `npm test` | 200 files, 2,052 tests passed; about 24.3 s. |
| New regressions | 31 cases in six new files; relevant failure states observed before fixes. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed; 202 modules transformed. |
| `git diff --check` | Passed. |
| `npm run balance`, before and after | 40 fixed seeds for each of six bot configurations per version: 480 total simulated nights. |
| Real browser playtest | Not run: pinned Chromium download exhausted its retries with empty/invalid ZIP archives. |

Original T1 measurements: `balance-bot` took 5.829 s per file, but its slowest individual test took 2.278 s; `balance-expert` took 6.042 s per file, with its slowest test at 3.629 s. The default timeout is per test, so those file durations do not prove a timeout defect. The reported flake may occur on different hardware/load; it was not disproved, but no timeout adjustment was justified by this run.

## Balance comparison

The complete before/after balance reports are byte-for-byte identical, including per-wing health-loss and cash summaries.

Each table entry is an exact count out of 40 seeded nights; no percentage rounding is used.

| Bot / purchases / route | Before: wins / deaths / stalls | After: wins / deaths / stalls |
|---|---:|---:|
| naive bot, shopping: none, route: long | 0 / 40 / 0 | 0 / 40 / 0 |
| dodger bot, shopping: none, route: long | 2 / 38 / 0 | 2 / 38 / 0 |
| pro bot, shopping: none, route: long | 27 / 13 / 0 | 27 / 13 / 0 |
| pro bot, shopping: buy, route: long | 26 / 14 / 0 | 26 / 14 / 0 |
| pro bot, shopping: buy, route: shortcut | 26 / 14 / 0 | 26 / 14 / 0 |
| expert bot, shopping: buy, route: long | 39 / 1 / 0 | 39 / 1 / 0 |

Full reports: [before](balance-before.md), [after](balance-after.md). A deterministic sample cannot establish every possible human-play outcome. The exploit, final-return and revival cases are established by targeted regression tests even if a default bot sample does not encounter them.

## Publication and remaining verification

The packet's `deadmall-review-fixes.patch` contains production changes, all new tests and the prepublication repository notes. It was prepared against `7cb142ad2992574d0d9fb086a18fe712f80d4433` and checked against an unchanged local snapshot. After the review PR is merged, update from `main` instead of reapplying the packet. Preserve any unrelated local work. If using the packet independently on its original base, run `git apply --check` first and then the unit, typecheck and build commands above.

Human/browser checks still useful: ride the escalator and inspect every Alex facing; complete the dawn ending then begin another run; dash three times within one wing and inspect the hint/puff; Continue after a fatal clear; move and attack after Second Wind; use a returning shot against a nearby target. Safari/WebKit and the owner's Mac were not tested. Existing invalid save files were not migrated or repaired. No new game mode, visual redesign or collision approximation was introduced.
