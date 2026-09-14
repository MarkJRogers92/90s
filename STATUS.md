# Status

**Current milestone:** M3 Shoplifting Loop started. M3A transaction kernel is implemented and isolated-tested; M3 is not yet playable.

**Branch:** `codex/m3-shoplifting-art-reference`

**Baseline:** `948af6a4b49705e2f5b52531df424635fad53dfc` from `main`. The M2 implementation checkpoint remains `848bd693876c23ecf5f10a320140d2b9c68be75c`.

## This checkpoint

- Added a pure immutable buy/steal/leave transaction kernel: cash in integer cents, one-stock offers, per-instance acquisition receipts, bounded Security Heat, duplicate-acquisition protection, and authored-data validation.
- Added 24 Node contract tests and `npm run test:m3`; no new dependency or runtime service.
- Preserved existing M1 and M2 gameplay entry points. No RunState, RunScene, renderer, item compiler, or Interaction Lab implementation is changed by this increment.
- Indexed ten retrievable full-size approved Sheet 01 reference variants and nine earlier supporting images in the art manifest. Original image bytes are in the supplied `DEAD_MALL_APPROVED_ART_REFERENCE_PACK.zip`; **the PNG/JPG files have not yet been uploaded to GitHub**. Repository metadata alone is not completion of the requested image archive.
- Recorded the M3 continuation scope and art-production constraints. Generated boards are approved visual references, not finished runtime sprites.

## Verification

A purchase contract first failed with `false !== true`. After implementation, strict standalone compilation and all 24 contracts passed with Node v22.16.0 and TypeScript 5.8.3. The check includes the repo's `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `isolatedModules` safety flags. The initial indexed-access compile error was corrected with an explicit missing-offer guard and the gate rerun successfully.

This environment could not clone GitHub or install the repository dependencies. The pinned TypeScript 7.0.2/full-project typecheck, existing Vitest suite, Chromium suite, production build, Safari/device checks, and hands-on playtest were **not rerun**. Historical M2 evidence is retained separately, not reported as a fresh pass.

## Next

First complete the binary art import on the local authenticated checkout, verify manifest hashes, and push that scoped reference-folder commit. Then connect the transaction kernel to a separate M3 run mode, fixed mini-wing, shop UI, persisted room-state economy/provenance, and a deterministic security consequence. See NEXT_SESSION.md and docs/milestones/M3_SHOPLIFTING_LOOP.md.

No merge to main, deployment, publication of a playable build, or release has been performed. M4 and later milestones remain outside this authorization.
