# REA findings — Watabou's One Page Dungeon (reference for the layout lab)

> **Where the code lives.** This document and the generated previews
> (`artifacts/layout-lab/`) are on `main`. The prototype itself —
> `src/sim/layout/mallFloorPlan.ts`, its tests and `scripts/layout-preview.ts` —
> lives on branch **`rea/watabou-layout-lab`** (not yet wired into the run).
> The integration step is a `floorPlanToWing` adapter described at the end.

Investigated 2026-10-12 for the REA project investigation. Target:
<https://watabou.github.io/one-page-dungeon/> (delivered build `Dungeon.js`,
sha256 `c2dc0f17cfd184fe87ffae395ceb9127a15749ba16a010122c044fe589619161`,
1,243,079 bytes, served 2026-10-12). The page loads exactly one application
script plus Google Analytics.

Evidence labels: **Documented** (author/docs), **Confirmed implementation**
(inspected code), **Observed behavior** (recorded interaction), **Inference**,
**Proposed implementation** (our design choice).

## What the reference actually does

- **Confirmed implementation — generator identity.** The bundle retains Haxe
  trace metadata, so `className`/`methodName`/`lineNumber` survive minification.
  The generator is `com.watabou.dungeon.model.Dungeon` (`Dungeon.hx`);
  `build()` is at line 158, the constructor at line 71. The app is Haxe/OpenFL
  (a Flash-like runtime), with `coogee` UI and `tracery` for the prose.
- **Confirmed implementation — RNG.** A multiplicative Lehmer LCG,
  `seed = 48271 * seed % 2147483647`, exposed as `w`; `w.reset(seed)` at build
  start and `w.reset(room.seed + 1)` per room. Randomness is therefore fully
  seed-reproducible.
- **Confirmed implementation — size options.** Defaults `minSize=6, maxSize=15`.
  The `small` tag sets 3..6, `large` 12..25, `medium` 6..12. `getSize()` counts
  only rooms with `w>3 && h>3`.
- **Confirmed implementation — retry-until-big-enough.** `build()` runs
  `for(;;)`: it clears rooms/doors/blocks, seeds a queue with one root room at a
  random axis and a random size, grows while the queue is non-empty and
  `getSize() < maxSize`, and accepts the whole attempt only when
  `getSize() >= minSize`; otherwise it retries from scratch.
- **Confirmed implementation — room-size variation.** `getRoomSize()` draws from
  a `style` weighted table (default `[0,0,0,1,2,3,3]`): narrow 3-wide rooms,
  rectangular rooms, tall rooms, and 3x3 cubes. `cramped`, `spacious`, `winding`,
  `compact` replace the table (e.g. `winding = [0,0,1,2,2,3,3,3,3]`).
- **Confirmed implementation — partial symmetry.** Room 0 seeds the tree; every
  placed room gets `symm = w.preserve(symmetry.pick())` and, when `symm` is set,
  queues a mirrored twin through `Room.xy(...)` with the axis rotated by
  `(-q*cy, q*cx)`. `order` (default `[true,true,true,true,false]`) is the
  symmetry-level switch; `ordered` sets `[true x6, false]`, `chaotic` sets
  `[false]`.
- **Confirmed implementation — overlap prevention.** `validateRoom()` rejects a
  candidate if it intersects any existing room with overlap `> 1x1`, or if it
  intersects any reserved `block`. Adjacency by a 1-cell sliver is allowed
  (that is how later connections find seams).
- **Confirmed implementation — doors and loops.** `placeRoom()` adds a `Door`
  from parent to child. After planning, `build()` runs
  `for(; 0 < this.createLoop(); );` — `createLoop()` scans every room pair, and
  where two rooms touch along a `1xN`/`Nx1` seam *and* are not already linked
  (and are in the same "wing" or both non-secret), it prices the A* detour and
  inserts the door with the largest detour above a threshold. This is the
  literal "added connections that form loops" the creator describes
  (**Documented**: <https://watabou.itch.io/one-page-dungeon>).
- **Confirmed implementation — URL contract.** `updateURL()` writes `seed`,
  `tags` (comma separated) and `name`. Passing `?seed=` and `?tags=` on load
  reproduces a build.
- **Observed behavior — determinism.** `?seed=12345` renders "Swamp Citadel of
  Uadjed" on every load; the plan is stable (two loads differ only by a UI
  overlay, not the map).
- **Observed behavior — options diverge the whole stream.** `?seed=12345&tags=chaotic`
  gave an asymmetric, few-mirrored-room plan ("Ebonring Hall"); `tags=ordered`
  gave a round-room, strongly mirrored plan ("Ancient Temple of Sorthos"). One
  tag changes the shared RNG draw sequence, so the whole layout differs — a
  single setting is not isolated by holding the seed.

## Limits of this inspection

Minified: most internal class names (`dj`, `ej`, `Wc`, `gj`, ...) are mangled, so
the exact distributions inside `symmetry.pick()` (`dj`) and the planner (`ej`)
were not decoded. We did **not** attempt to reproduce One Page Dungeon's output
byte-for-byte, and do not claim to. Generated map images are covered by a
different permission than the program code, so no code was reused.

## What we took from it (Proposed implementation)

The `src/sim/layout/mallFloorPlan.ts` prototype is an original implementation of
the *ideas*, sized for Dead Mall:

1. **A seeded, retry-free deterministic plan** (mulberry32) — same seed, same
   floor.
2. **Meaningful room-size variation** — kiosks (4 cells) through department
   stores, with exactly one dominant anchor per side; widths span 192..816 units
   in the sample seeds (broadest/narrowest up to 4.25x).
3. **Architectural roles** — anchor store, department store, shop, kiosk,
   atrium (opened to the spine, i.e. the mall's central void), food court,
   service passage, restrooms, cinema, security office.
4. **Alternate routes** — every room's storefront is the tree edge; seeded
   staff doors between adjacent rooms add cycles (loop rank 2–3 in the sample
   seeds). Disabling `extraLinks` proves the tree case (loop rank 0).
5. **Scale honesty** — all sizes are multiples of a 48-unit plan cell at the
   game's collision scale (player radius 10, 96-unit doorways, 144-unit aisle),
   so a preview shows a to-scale player marker.

Deliberately **not** modelled: combat pacing, enemy navigation, multi-floor
transitions, and the branching route map *between* mini-runs (a separate system).
