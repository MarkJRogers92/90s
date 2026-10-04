# Verified integration — 4 October 2026 UTC

## Source and scope

- Immediate source: `pixel-forge-rig` at `e8ec6ee555711375b134d4c2bffad9ecf47ab0e2`; all 261 snapshot files independently checked against their Git blob hashes before execution.
- Game baseline: `main` at `4168761ed1b071f466e20e7cde7e8d028c7d618e`, including PR #59’s charge-frame fix and PR #60’s separately completed Bargain Hunter sheet.
- Publication boundary: this isolated developer tool and its documentation. No game source, runtime assets, balance, package manifests, dependencies, binaries, or credentials are changed.

## Actual checks

- Original upstream Forge suite with existing Aseprite: **221 passed, zero skipped**. This independently covers the author's earlier 218-passed/3-skipped report.
- Fixed native-check runner: **325 passed, zero skipped**, including 104 new validation/wrapper cases. The old wrapper reproduced 93 failures before its initial fix; six additional real-pytest regressions reproduced ambient test filtering before that fix.
- The runner uses existing dependencies and a user-provided licensed Aseprite executable; it installs nothing.
- Original frozen native document and four recipes (`recipe`, `recipe-v2`, `recipe-v3-base`, `recipe-v3`): all native visible frames render pixel-exactly, with six timings **142, 142, 142, 141, 133, 133 ms**.
- Every rig/recipe byte check passes.
- `recipe-v3-base` deliberately returns 2 for exactly one failure: frame 4's lowest contact pixel at world y=110, floor y=111, tolerance 0. No other failure is accepted.
- `recipe-v3` returns 0, technical pass, with only the anatomical bag-owner label and visual anatomy left for human review.
- Independent frozen comparison: `recipe` and `recipe-v3-base` differ by zero pixels in all six frames. V3 differs by `[0, 0, 0, 0, 1467, 774]` pixels.
- V3 native layers: `legs (10)`, `upper (15)`, `shoes (20)`, `head (30)`, `bag (35)`, `hand (40)`. All are editable; shifting the sixth bag cel changes only that cel. The source document was not saved or changed.

## Runner failure contract

Unexpected process exits, missing/malformed reports, skipped or failed tests, unverified native results, pixel/timing mismatches, extra negative-fixture failures, and reused output directories are rejected. The pytest subprocess ignores inherited and configured selection options, without changing the caller environment; the final full run passed with deliberately restrictive inherited options. Evidence is retained for diagnosis. A successful technical `rig-review` exit alone is not treated as native verification.

## Game regression and independent review

- Latest game main, before and after adding this directory: **1,849 tests passed**, and TypeScript plus production build passed. The existing large-bundle warning remains; no new game build change was introduced.
- Independent review checked source scope, secrets/binary exclusions, and all 129 pinned fixture path/hash references. It found the pytest-selection issue described above; after the repair it independently ran all 104 runner cases with no remaining blocker.

## Art limits

The fixtures remain review-only. These checks establish editable, reproducible tooling, not approved anatomy or complete eight-direction animation. The WEST v3 visual improvement is moderate and retains the existing trouser/limb painting. New authored drawing starts from GPT image generation, then passes through cleanup, layer assembly, and visual review.
