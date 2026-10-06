# Weapon grip pilot: browser acceptance pending

2026-10-06 UTC. No browser screenshots, contact sheets, motion videos, or
per-frame browser measurements were produced in this environment. The new
browser tests were authored before the dev-only pilot fixture, but their
RED run stopped at Chromium startup. A gameplay-level RED/GREEN cycle has
not been observed. Do not present these tests or the capture script as live
visual acceptance.

## Verified blocker

Command attempted from the repository:

```
PW_PORT=4194 PW_CHROMIUM_PATH=/usr/bin/chromium \
  npx playwright test tests/browser/weapon-grip-pilot.spec.ts --grep 'janitor_mop:'
```

Chromium aborted before opening a page. Both the normal invocation and the
reviewer-approved escalated invocation returned this failure:

```
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

The retained Playwright trace and browser startup context are at:

- `test-results/weapon-grip-pilot-janitor--3cc33-n-the-hand-in-eight-facings-chromium/trace.zip`
- `test-results/weapon-grip-pilot-janitor--3cc33-n-the-hand-in-eight-facings-chromium/error-context.md`

The supported cloud browser was checked once against the running debug Vite
server at `http://127.0.0.1:4194/` and returned `net::ERR_BLOCKED_BY_CLIENT`.
No alternate hostname, network policy change, security bypass, or external
hosting was attempted. Browser verification remains pending on a permitted
executor with working Chromium/local-server access.

## Ready to run

The six existing roots are `janitor_mop`, `box_cutter`, `super_soaker_50`,
`laser_pointer`, `laser_tag_rifle`, and `lightsaber_toy` (display name:
Light-Up Laser Sword).

```
PW_PORT=4180 PW_CHROMIUM_PATH=/usr/bin/chromium \
  npx playwright test tests/browser/weapon-grip-pilot.spec.ts
```

The fixture is dev-only: `?seed=1&fixture=mvp-grip-pilot&gripWeapon=laser_pointer`.
`&gripHurt=1` activates one ordinary Spitter, letting its normal projectile
produce the player hurt animation. Neither script nor test forces damage,
body poses, simulation ticks, or player position after fixture initialization.

Run the capture script against a separately started debug Vite server:

```
VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort
PW_CHROMIUM_PATH=/usr/bin/chromium node scripts/weapon-grip-capture.mjs \
  --base http://127.0.0.1:4180 --out artifacts/weapon-grip-pilot --mode all
```

- Seven motion videos: six roots with real walking, continuous attack and
  backpedalling across eight facings, plus a real-hit hurt clip
- Native 960×600 stage captures and JSON per-RAF hand/grip/depth evidence
- Ten separate native contact sheets: all 80 roots × eight facings, idle and
  active poses, rendered with the production ActorSpriteView and WeaponView
- `evidence-summary.json` records coverage and fails on missing attachment,
  wrong depth, grip drift, missing motion, missing source poses, or page errors

Contact-sheet poses are deliberately selected in an isolated production-view
scene; they are not represented as live-combat evidence. The real-input
motion runs are separate. The harness has passed syntax/type checking but
cannot be called runtime-validated until its pending browser run succeeds.

## Local validation of the harness changes

- `npm run typecheck`: passed (`typecheck.log`)
- `node --check scripts/weapon-grip-capture.mjs`: passed
- Full `npm test` gate: 2,078 passed, one timeout in
  `tests/unit/balance-expert.test.ts`, test "takes at most 2 health from the
  Owner, and fewer than the pro bot" at its 5,000 ms limit (`unit-gate.log`)
- Isolated recheck `npx vitest run tests/unit/balance-expert.test.ts`: all
  four tests passed in 4.95 seconds total (`balance-expert-recheck.log`)

The timeout happened while another full suite was running. This is consistent
with worker contention, but the failed run remains recorded above. The parent
reports a later clean full gate; its separate log is authoritative for that run.

## What numeric attachment tests establish

Per-RAF grip equality compares logical world transforms. It does not measure framebuffer registration: Phaser roundPixels/safeAuto may snap the unscaled body or palm differently from the scaled or rotated weapon. Review the remaining subpixel raster alignment in native-scale motion; do not label coordinate equality as zero rendered pixel drift.
