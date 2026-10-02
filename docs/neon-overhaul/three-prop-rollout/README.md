# Three approved props in normal rooms

Cloud continuation of the supplied `codex/three-prop-test-room` source snapshot
(base `c9b84f6d915bfe8eef4a42f60ff66446c20a30da`). This change has not been
applied to the original worktree, committed, pushed, merged, published or deployed.

## Placement

Exactly one native-sized prop is added in each eligible location:

- Bakery case: Slice Station, Pretzel Pit and Cocoa Hut interiors, at (280, 335)
- Twin-bowl slush machine: Cinema Snacks, Candy Cauldron and Frosty Freeze
  interiors, at (680, 335)
- Monitor bank: the actual Floor 1 boss-wing Security Office, at (550, 60)

Storefront concourses, other stores, other floors' office-role rooms, district
arenas and first-wing Lockdowns retain their existing layouts. The old seeded
cart/soda/rack generation is unchanged. Explicitly authored fixture props take
precedence. No new backgrounds, art, loot, splash damage, puddles, enemy tuning,
prices or rewards were introduced.

The six food-shop interiors use the existing store entry/exit hooks. Props are
created on entry and discarded on exit. Reentry rebuilds them intact, matching
the existing room-local behavior. A checkpoint restores to the concourse;
entering the shop builds its prop again. Props keep their solid shallow base
after damage. Their original intact/damaged PNGs, native scale, bottom-center
anchor and glass/chip/soda one-shots are unchanged. Shared run preloading now
includes the nine approved PNGs. A reused image's old cart/rack horizontal flip
is explicitly reset so it cannot mirror a new prop on a room transition.

## Verification scope

The initial aisle placement caused an avoidable route/timing regression and
was rejected. The final positions use front-corner gaps and the back wall.
See `balance-followup.md` for the diagnostic evidence and the final comparison.

The final measured results and before/after balance tables are in
`TEST_EVIDENCE.md` and `artifacts/normal-props/`. Unit checks cover the six actual
seeded shops, spawn/shelf/door clearance, player-sized reachability, mustard
traversability, destruction, reentry, checkpoint recovery and preserving the
original combat-prop tutorial. Renderer regression tests use the real renderer
with a test graphics backend to cover reused IDs, flip reset and intact/damaged
pose; they are not visual browser evidence.

Independent review additionally checked 1,600 generated wings and 1,524 new
prop instances for overlap with existing static dressing, including all six
food shops and the Security Office. The nine asset files still match the
original snapshot and asset manifest SHA256 hashes.

### Browser verification is still required

No fresh in-game screenshots were produced in the cloud. The pre-existing
`artifacts/prop-test-room/` images show the earlier isolated fixture, not this
normal-room integration. Do not use them as proof of the new placements.

The existing fixture navigation helper now sends each timed key pulse in one
`keyboard.press({ delay })` call. Its original split down/wait/up calls could
keep the key held during Playwright's trace snapshot before keyup. Four offline
regressions model input latency over the real simulation; two failed before
this change and all four pass afterward. This does not establish that the
original browser timeout has been resolved. The 90-second limit, coverage,
standard Vite watching, movement tolerance and attempt budget were not raised.

The cloud browser limitations were:

1. Standard Playwright config could not find its pinned Chromium headless-shell
   executable (revision 1243)
2. Official Chromium installation downloaded invalid/empty ZIP content for
   Chrome for Testing 153.0.8010.12, reporting `End of central directory record
   signature not found`
3. The installed Chromium fallback failed with `socket() failed: Operation not
   permitted (1)`, including an approved escalated retry
4. The available cloud browser blocked the local development URL with
   `net::ERR_BLOCKED_BY_CLIENT`

No access restriction was bypassed. A permitted browser on a suitable machine
must run the standard gate before this is described as visually verified.

## Reproduce

Use the pinned lockfile and a writable npm cache in an appropriate environment:

```sh
npm ci
npm test -- --maxWorkers=1
npm run typecheck
npm run build
npm run balance
npx playwright install chromium
PW_PORT=4193 npm run test:browser -- \
  tests/browser/prop-test-room.spec.ts \
  tests/browser/normal-room-props.spec.ts \
  tests/browser/hero-props.spec.ts \
  tests/browser/restart.spec.ts --workers=1
```

The browser gate retains the original isolated fixture and adds ordinary
Continue/checkpoint flows that walk through actual store doors, break bakery
and slush props, exit and reenter. The monitor test resumes a genuine Security
Office boundary checkpoint. These checks never mutate running game state.
They save actual gameplay captures only when executed successfully. Afterwards
run the full `npm run test:browser` suite in the same suitable environment.

For manual isolated-prop comparison:

```sh
node scripts/serve-prop-test.mjs
```

Open `http://127.0.0.1:4194/?fixture=mvp-prop-test&seed=1`, choose Night Shift,
move with WASD, aim/click to swing, use R to reset or the east door to leave and
return. For normal play use `npm run dev` and Night Shift. Existing dev routes
`?fixture=mvp-store&store=slice-station&seed=7` (when that seed has the shop)
are optional viewing aids; the new browser gate chooses a real seeded save so
it does not depend on a fixture query.

## Portable patch

The accompanying `three-props-normal-rooms.patch` is against the exact supplied
source snapshot, which already contains the isolated three-prop fixture.
It is not a patch against clean commit `c9b84f6`, and the earlier transfer's
`tracked.diff` must not be applied again. Check the changed-file before hashes
in `snapshot-change-manifest.json`, preserve any newer work, and review conflicts.

From the matching original `dead-mall` directory, first run:

```sh
git apply --check /path/to/three-props-normal-rooms.patch
```

Only after the appropriate approval and a clean check, apply that same patch.
The companion full source ZIP is a portable alternative for an isolated review
copy; it contains no dependency directory, Git metadata, build outputs or secrets.
