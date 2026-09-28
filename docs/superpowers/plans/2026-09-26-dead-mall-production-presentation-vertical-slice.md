# DEAD MALL Production Presentation Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the graybox opening of Night Shift with one polished, playable 1990s mall concourse that begins bright and populated, preserves the existing M5 game rules, and demonstrates the final presentation direction through the first combat encounter.

**Architecture:** The simulation remains authoritative and unchanged except for the displayed starting-room name. Phaser presentation code consumes the existing run snapshot through small, disposable view components: projection, environment, actors, ambience, effects, and HUD. Runtime assets are local, typed, validated, and optional; missing art falls back to the current vector renderer instead of making gameplay invisible.

**Tech Stack:** TypeScript 7, Phaser 4, Vite 8, Vitest 5, Playwright 1.63, local PNG/Aseprite assets, Python asset-validation tools already proven on the candidate art branch.

**Spec:** `docs/superpowers/specs/2026-09-26-dead-mall-production-presentation-vertical-slice-design.md`

## Global Constraints

- Work only in `codex/presentation-3quarter` at `/Users/markrogers/Documents/Github Code/90s/.worktrees/presentation-3quarter`.
- Preserve the existing M5 simulation, collision, six-room order, checkpoint schema, seeded outcomes, combat timing, and save compatibility. This slice is presentation work, not M6 gameplay work.
- Preserve the approved creative target: Binding of Isaac clarity, a bright and relatively busy early-1990s neon mall, shallow 3/4 storefront façades, and the cheerful-to-wrong progression associated with Chopping Mall and Dead Rising rather than an immediately dark ruin.
- Keep `service_corridor` as the stable room ID. Only its display name and renderer become the public Opening Concourse.
- Keep all aiming and interaction coordinates in world space. DOM/canvas projection is a boundary concern, never a simulation concern.
- Add no telemetry, backend, cloud dependency, remote runtime asset, or external request.
- Reuse existing art only from candidate commit `3a70214` on `codex/pixellab-aseprite-proof`, and copy individual approved files rather than merging that branch wholesale.
- Treat every imported candidate as unapproved until it appears in a contact sheet and the user explicitly accepts it for this slice.
- Do not spend PixelLab credits or request new paid generation. New fountain and civilian art must be created locally in Aseprite unless the user later authorizes paid generation.
- Keep source art outside the runtime bundle under `/Users/markrogers/deadmall-art/work/presentation-vertical-slice/v1/source/`; copy only approved exports and their provenance record into this repository.
- Every new visible runtime element needs a deterministic vector fallback or must be safely omitted without hiding a gameplay-critical entity.
- One writer owns this worktree. Workers may create local commits, but they must not push, merge, publish, deploy, or perform any other external release action.
- Follow red-green-refactor for every behavioral change: add the failing test, record the intended failure, implement the smallest passing change, then run targeted validation and `npm run typecheck`.
- Update `STATUS.md`, `TEST_EVIDENCE.md`, `NEXT_SESSION.md`, and `DECISIONS.md` at each meaningful checkpoint.
- Stop at each explicit user visual-approval gate. Passing automated tests is not approval of the art direction.

## Review Focus

The final reviewer must look specifically for these five failures:

1. Aim or interaction drift after camera movement, zoom, CSS scaling, or FIT resizing. Task 1 owns the round-trip and real-input tests.
2. A missing or invalid texture causing the player, enemy, pickup, door, prompt, or telegraph to disappear. Tasks 3 and 5 own fallback coverage.
3. Depth sorting or a translucent occluder hiding the player or a combat telegraph. Tasks 4 and 5 own stable depth bands and overlap tests.
4. Restarting or changing rooms duplicating civilians, timers, listeners, particles, or display objects. Task 6 owns lifecycle and repeated-restart tests.
5. The compact HUD becoming unreadable at 800×600, trapping pointer input, or making actions unreachable. Task 7 owns responsive browser coverage.

---

## Task 1 — Lock the camera, projection, and pointer contract

**Deliverable:** A single tested world/canvas conversion contract supports camera scroll, zoom, CSS-scaled canvases, real pointer input, and debug/browser inspection.

**Files:**

- Modify: `src/game/view/projection.ts`
- Modify: `src/game/scenes/MvpRunScene.ts`
- Modify: `src/debug/DebugBridge.ts`
- Modify: `tests/browser/projection.ts`
- Modify: `tests/browser/night-shift.spec.ts`
- Create: `tests/unit/projection.test.ts`

**Public contract:**

```ts
export interface ProjectionMetrics {
  scrollX: number
  scrollY: number
  zoom: number
  gameWidth: number
  gameHeight: number
  canvasWidth: number
  canvasHeight: number
}

export interface Point2D {
  x: number
  y: number
}

export function projectWorldToCanvas(
  metrics: ProjectionMetrics,
  world: Point2D,
): Point2D

export function projectCanvasToWorld(
  metrics: ProjectionMetrics,
  canvas: Point2D,
): Point2D

export function worldToCanvas(
  scene: Phaser.Scene,
  worldX: number,
  worldY: number,
): Point2D

export function pointerToWorld(
  scene: Phaser.Scene,
  pointer: Phaser.Input.Pointer,
): Point2D
```

**Steps:**

- [ ] Add table-driven unit tests for origin, nonzero scroll, zoom `2`, a 640×360 game scaled into 1280×720 CSS pixels, and a combined scroll/zoom/scale case.
- [ ] For every table row, assert `canvas -> world -> canvas` and `world -> canvas -> world` round trips within `0.001`.
- [ ] Add invalid-metrics tests for zero or non-finite dimensions/zoom. Require a clear thrown error in pure helpers so browser failures are diagnosable rather than silently mis-aimed.
- [ ] Run `npx vitest run tests/unit/projection.test.ts` and confirm the new exports fail before implementation.
- [ ] Implement the pure helpers in `projection.ts`; make the Phaser wrappers derive metrics from the main camera, game scale, and the canvas bounding rectangle.
- [ ] Route `MvpRunScene` pointer-to-world conversion through `pointerToWorld` instead of maintaining a second conversion path.
- [ ] Extend the debug bridge only with read-only projection helpers needed by Playwright. Do not expose simulation mutation hooks.
- [ ] Update `tests/browser/projection.ts` to request projection from the live game, then send real Playwright pointer input at the returned canvas coordinate.
- [ ] Extend `night-shift.spec.ts`: move the player far enough to scroll the camera, resize once, aim at a known world target, attack, and assert the authoritative attack trace points toward that target.
- [ ] Run `npx vitest run tests/unit/projection.test.ts`, `npm run typecheck`, and the targeted Playwright projection/aim test.
- [ ] Commit as `test: lock presentation projection contract`.

**Acceptance:** Projection has one source of truth, its inverse is tested, and the real-input browser test passes after both camera movement and viewport resizing.

---

## Task 2 — Review and import the minimum environment art kit

**Deliverable:** A user-approved, source-preserving art kit for the Opening Concourse, with local validation and provenance. This task has two hard visual-approval pauses.

**Files:**

- Restore/adapt from candidate commit: `docs/art/tools/validate_runtime_asset.py`
- Restore/adapt from candidate commit: `docs/art/tools/validate_runtime_tree.py`
- Restore/adapt from candidate commit: `docs/art/tools/test_validate_runtime_asset.py`
- Create: `docs/art/palettes/deadmall-global.json`
- Create: `docs/art/presentation-vertical-slice/environment-contact-sheet.png`
- Create: `artifacts/provenance/presentation-vertical-slice.json`
- Import approved files under: `public/assets/presentation/environment/`
- Source new fountain at: `/Users/markrogers/deadmall-art/work/presentation-vertical-slice/v1/source/atrium-fountain.aseprite`
- Export approved fountain to: `public/assets/presentation/environment/atrium-fountain-96x64.png`

**Candidate files pinned to `3a70214`:**

- Floors: `public/assets/tiles/floor-terrazzo-32.png`, `public/assets/tiles/floor-tile-accent-32.png`
- Structure: `public/assets/walls/wall-face-32x64.png`, `public/assets/walls/wall-top-32.png`, `public/assets/walls/wall-corner-32x64.png`, `public/assets/walls/column-32.png`, `public/assets/walls/railing-glass-32.png`, `public/assets/walls/security-gate-32.png`
- Storefronts: `public/assets/storefront/storefront-fascia-64x32.png`, `public/assets/storefront/sign-cool-96x24.png`, `public/assets/storefront/sign-warm-96x24.png`
- Props: `public/assets/props/mall-bench.png`, `public/assets/props/mall-directory.png`, `public/assets/props/planter.png`, `public/assets/props/potted-palm.png`, `public/assets/props/rubbish-bin.png`, `public/assets/props/poster-stand.png`, `public/assets/props/info-kiosk.png`, and `public/assets/props/bench-warrant-kiosk.png`

**Steps:**

- [ ] Restore the validator test first and run it against the current branch. Record the expected failure because the validator/palette are absent.
- [ ] Restore only the validator implementation and global palette needed by this slice. Remove the old default dependency on `~/deadmall-art/...`; all validation inputs must be explicit repository or task paths.
- [ ] Run `python3 docs/art/tools/test_validate_runtime_asset.py` and confirm it passes.
- [ ] Extract the exact candidate PNGs from commit `3a70214` into a temporary review directory without merging or cherry-picking the candidate branch.
- [ ] Generate `environment-contact-sheet.png` at integer scale with filename labels, transparent backgrounds visible against a checkerboard, and no smoothing.
- [ ] Present the contact sheet to the user and **stop until the user approves or rejects individual assets**.
- [ ] For each approved candidate, copy its existing `.aseprite` source into `/Users/markrogers/deadmall-art/work/presentation-vertical-slice/v1/source/environment/`. If the candidate has no editable source, create one, inspect every pixel at native scale, and clean/redraw outline, palette, alignment, and seams before export. Never promote a raw generated PNG merely because its contact sheet was accepted.
- [ ] Export only the approved, source-preserved versions into `public/assets/presentation/environment/`.
- [ ] Create the fountain locally in Aseprite using the approved clean console-pixel direction: 96×64 export, crisp stepped contours, one-pixel dark outline, restrained wear, and the shared palette.
- [ ] Export and validate the fountain; add it to a second contact sheet beside the approved floor, wall, and prop kit.
- [ ] Present that sheet to the user and **stop until the fountain and combined kit are approved**.
- [ ] Write `presentation-vertical-slice.json` with source branch/commit, original path, export path, dimensions, SHA-256, palette, approval date, and whether the asset is reused or newly authored. Store no credentials or API responses.
- [ ] Run the asset validator across the imported runtime subset and verify all files are local PNGs with expected dimensions and binary alpha where required.
- [ ] Run `git diff --check` and commit as `art: add approved opening concourse kit`.

**Acceptance:** The repository contains only explicitly approved environment assets, every asset is traceable to source, and no PixelLab credits or remote calls were used.

---

## Task 3 — Add a typed runtime asset manifest and safe fallback loading

**Deliverable:** Presentation assets preload through a minimal typed manifest; absent or failed textures automatically use the current vector rendering.

**Files:**

- Create: `src/game/presentation/assets.ts`
- Create: `src/game/presentation/assetFallback.ts`
- Modify: `src/game/scenes/MvpRunScene.ts`
- Create: `tests/unit/presentation-assets.test.ts`

**Public contract:**

```ts
export interface PresentationAsset {
  key: string
  url: string
  frameWidth?: number
  frameHeight?: number
  requiredFor: 'environment' | 'actor' | 'ambience' | 'effect'
}

export const PRESENTATION_ASSETS: readonly PresentationAsset[]

export function usableTextureKey(
  textures: Phaser.Textures.TextureManager,
  key: string,
): string | null
```

**Steps:**

- [ ] Add tests that every key and URL is unique, every URL is local, expected PNG dimensions match the manifest, frame dimensions divide the sheet dimensions, and no `http:`, `https:`, `data:`, or home-directory path appears.
- [ ] Add a fallback test with a fake texture manager: a loaded non-missing texture returns its key; an absent key or Phaser's missing texture returns `null`.
- [ ] Run `npx vitest run tests/unit/presentation-assets.test.ts` and confirm failure before implementation.
- [ ] Implement the smallest typed manifest for the assets approved in Task 2. Do not register the candidate branch's full 70-asset catalog.
- [ ] Add `MvpRunScene.preload()` to load the manifest. Attach loader-error accounting, but do not abort the run on a presentation asset failure.
- [ ] Implement `usableTextureKey` and require every new sprite/tile consumer to branch to its vector fallback when it returns `null`.
- [ ] Add a debug-only read-only count of presentation load failures for browser assertions; do not surface file paths to ordinary players.
- [ ] Run the unit test, `npm run typecheck`, and `npm run build`.
- [ ] Commit as `feat: add safe presentation asset loading`.

**Acceptance:** Production builds contain no remote asset references, loading failure cannot hide gameplay, and the existing graybox still runs when the entire presentation asset set is unavailable.

---

## Task 4 — Render the Opening Concourse with stable depth and occlusion

**Deliverable:** `service_corridor` is presented as a bright neon public concourse with shallow 3/4 storefront façades, a fountain, props, transparent foreground occluders, and unchanged collision/gameplay.

**Files:**

- Create: `src/game/presentation/depth.ts`
- Create: `src/game/presentation/occlusion.ts`
- Create: `src/game/view/OpeningConcourseView.ts`
- Modify: `src/game/view/MvpRunView.ts`
- Modify: `src/game/scenes/MvpRunScene.ts`
- Modify: `src/sim/wing/templates.ts`
- Modify: `src/debug/DebugBridge.ts`
- Create: `tests/unit/presentation-depth.test.ts`
- Create: `tests/unit/presentation-occlusion.test.ts`
- Modify: `tests/unit/wing-generation.test.ts`
- Modify: `tests/browser/night-shift.spec.ts`

**Depth contract:**

```ts
export type PresentationDepthBand =
  | 'floor'
  | 'decal'
  | 'structure'
  | 'lowProp'
  | 'actor'
  | 'tallForeground'
  | 'effect'
  | 'prompt'

export function presentationDepth(
  band: PresentationDepthBand,
  baseY: number,
): number
```

**Steps:**

- [ ] Add tests proving bands never cross at the room's minimum/maximum Y, actors within a band sort by stable base Y, and identical inputs always return identical depths.
- [ ] Add pure occlusion tests: an actor-foot point inside a foreground rectangle requests reduced alpha; outside restores full alpha; telegraph/effect/prompt bands never inherit occluder alpha.
- [ ] Run the new tests and confirm failure before implementation.
- [ ] Implement depth bands with enough numeric separation that any legal Y value cannot move an object into the next band.
- [ ] Implement occlusion as presentation-only alpha interpolation. It must not add bodies, change colliders, move entities, or modify snapshot data.
- [ ] Implement `OpeningConcourseView` with explicit owned containers: floor/decal, rear structure/storefront, low prop, actor attachment layer, tall foreground, and lights/effects. Give it `render(snapshot)`, `resetForRun()`, and `destroy()` methods.
- [ ] Compose the room from the approved kit at integer-aligned coordinates. Use two readable storefronts, the fountain as the central landmark, 1990s neon accent bands, benches/planters/directory as navigation landmarks, and bright ambient lighting.
- [ ] Build static floor, façade, prop, reflection, and shadow layers once per room entry. Add a stability test proving 300 consecutive `sync()` calls do not create more static textures or display objects.
- [ ] Keep lighting pixel-sharp and bounded: broad fluorescent/skylight fill, small neon accents, hard-edged grounded shadows, and restrained glass/floor reflections. Do not add blur filters or screen shake in this slice.
- [ ] Preserve the existing authoritative obstacle rectangles. Decorative art may cover them visually, but must not invent a second collision map.
- [ ] Keep the existing `MvpRunView` vector renderer for the other five rooms. In the opening room, use vectors as per-element fallback whenever an environment texture is unavailable.
- [ ] Change only `ROOM_NAMES.service_corridor` from `Service Corridor` to `Opening Concourse`; update the exact existing test expectation without changing the room ID, generator draw order, geometry, safe-room rules, or checkpoint data.
- [ ] Add an optional read-only presentation snapshot to the debug bridge: theme ID, fallback count, and current occluder count. The bridge must not own state.
- [ ] Add a browser assertion that the opening room reports the concourse theme, has no enemies, and still transitions to the same next room through real movement.
- [ ] Run the new unit tests, affected wing/run tests, `npm run typecheck`, and the targeted browser test.
- [ ] Commit as `feat: render the opening concourse`.

**Acceptance:** The first room reads as a public mall rather than a service corridor, the player never vanishes behind scenery, and the underlying run remains byte-for-byte compatible except for the human-readable room name.

---

## Task 5 — Replace graybox actors while preserving combat readability

**Deliverable:** Alex and the first Hanger enemy use approved clean pixel sprites, with economical state-driven motion and visible vector/effect fallbacks.

**Files:**

- Create: `docs/art/presentation-vertical-slice/actor-contact-sheet.png`
- Import approved files under: `public/assets/presentation/actors/`
- Modify: `src/game/presentation/assets.ts`
- Create: `src/game/view/ActorSpriteView.ts`
- Modify: `src/game/view/MvpRunView.ts`
- Modify: `src/game/view/visualState.ts`
- Create: `tests/unit/presentation-actors.test.ts`
- Modify: `tests/browser/night-shift.spec.ts`
- Modify: `artifacts/provenance/presentation-vertical-slice.json`

**Candidate actors pinned to `3a70214`:**

- `alex-idle.png`: 256×48, eight 32×48 direction frames
- `alex-walk.png`: 192×384, six columns by eight 32×48 direction rows
- `hanger-idle.png`: 384×48, eight 48×48 direction frames

Direction order must remain: south, southwest, west, northwest, north, northeast, east, southeast.

**Steps:**

- [ ] Extract the three candidate sheets, generate an integer-scaled actor contact sheet showing every direction and representative walk frames, present it to the user, and **stop until the actor art is approved**.
- [ ] After approval, create or copy editable Aseprite sources under `/Users/markrogers/deadmall-art/work/presentation-vertical-slice/v1/source/actors/`, inspect and clean every direction/frame at native scale, then export the approved sheets into `public/assets/presentation/actors/`. Add manifest records, provenance, hashes, and dimension validation; do not promote a raw generated PNG unchanged.
- [ ] Add failing unit tests for vector-to-direction mapping at cardinal/diagonal boundaries, idle frame selection, walk-frame cadence, and stable last-facing direction for a zero movement vector.
- [ ] Add state-to-presentation tests for walking, attack lean/mop arc, damage flicker, Hanger bob/lunge, and a bounded death effect that occurs once when an enemy ID disappears.
- [ ] Add fallback tests proving a missing Alex texture leaves the existing player vector visible and a missing Hanger texture leaves the enemy body/telegraph visible.
- [ ] Run `npx vitest run tests/unit/presentation-actors.test.ts` and confirm failure before implementation.
- [ ] Implement pure direction/frame helpers, reusing the proven candidate-branch layout without importing its unrelated asset catalog.
- [ ] Implement `ActorSpriteView` as a disposable adapter over authoritative snapshots. Animation clocks may interpolate locally, but damage, attack, movement, death, and enemy state must come from the snapshot/trace.
- [ ] Preserve gameplay readability above the art: hit flash, mop arc, projectile, enemy lunge/telegraph, status icon, interaction prompt, and damage feedback render in the `effect` or `prompt` bands.
- [ ] Do not invent missing AI states or new attacks to make animation more dramatic.
- [ ] Add a browser test that uses real movement and attack input, observes a facing/walk transition, reaches the existing first Hanger encounter, and confirms the enemy telegraph remains visible while sprites are active.
- [ ] Run unit tests, affected integration tests, `npm run typecheck`, and the targeted browser test.
- [ ] Commit as `feat: add readable presentation actors`.

**Acceptance:** The run looks authored, but player control, enemy behavior, timing, hit detection, and combat feedback match M5.

---

## Task 6 — Add four nonblocking civilian appearances and a one-way evacuation

**Deliverable:** The opening concourse starts with four to six decorative people, then empties as Alex approaches the exit. Civilians never participate in simulation, collision, saves, or seeded outcomes.

**Files:**

- Create Aseprite sources under: `/Users/markrogers/deadmall-art/work/presentation-vertical-slice/v1/source/civilians/`
- Export approved sheets under: `public/assets/presentation/civilians/`
- Create: `docs/art/presentation-vertical-slice/civilian-contact-sheet.png`
- Modify: `src/game/presentation/assets.ts`
- Create: `src/game/view/ConcourseAmbience.ts`
- Modify: `src/game/view/OpeningConcourseView.ts`
- Modify: `src/game/view/MvpRunView.ts`
- Create: `tests/unit/concourse-ambience.test.ts`
- Modify: `tests/browser/night-shift.spec.ts`
- Modify: `artifacts/provenance/presentation-vertical-slice.json`

**Required appearances:** shopper A, shopper B, store clerk, and mall security. Each appearance uses the Alex-compatible layout: idle 256×48 and walk 192×384, with eight directions and six walk frames per direction.

**Presentation contract:**

```ts
export type ConcourseAmbiencePhase =
  | 'busy'
  | 'warning'
  | 'evacuating'
  | 'empty'

export interface ConcourseAmbienceSnapshot {
  phase: ConcourseAmbiencePhase
  visibleCount: number
}
```

**Steps:**

- [ ] Author the four appearances locally in Aseprite using the approved character proportions, shared palette, one-pixel outline language, varied silhouettes, and no trademarked logos.
- [ ] Generate an integer-scaled contact sheet with all idle directions and representative walk cycles. Present it to the user and **stop until each civilian appearance is approved**.
- [ ] Export only approved sheets, validate dimensions/palette/alpha, add typed manifest records, and update provenance/hashes.
- [ ] Add failing tests for deterministic spawn selection of four to six instances, nonoverlapping authored lanes, and the monotonic phase sequence `busy -> warning -> evacuating -> empty`.
- [ ] Define the local visual triggers without new game state: `busy` before Alex reaches 55% of room width, `warning` at or beyond 55%, `evacuating` at or beyond 72%, and `empty` once Alex leaves the opening room. Once advanced, a phase cannot rewind during that run.
- [ ] Add lifecycle tests: paused/blurred updates do not advance animation time; leaving the room hides/disposes ambience; `resetForRun()` restores `busy`; ten restarts do not increase display-object/listener/timer counts.
- [ ] Add explicit tests that ambience exposes no collider/body, writes nothing to the simulation snapshot, and never appears in checkpoint serialization.
- [ ] Run `npx vitest run tests/unit/concourse-ambience.test.ts` and confirm failure before implementation.
- [ ] Implement `ConcourseAmbience` with authored presentation lanes and deterministic cosmetic selection from the run seed. Use scene update time only while the run is active; own and destroy every sprite/tween/listener.
- [ ] In `busy`, show four to six short looped routes and idle poses. In `warning`, turn heads/shorten loops. In `evacuating`, route every civilian toward a visible edge or storefront exit. In `empty`, render none.
- [ ] Use a brief sign flicker and security-gate twitch as the restrained warning. When the existing room transition and combat-lock states occur, let their existing synthesized `pa_chime`/combat cues carry the sound change; add no recorded audio, ambience download, or new runtime request.
- [ ] Preserve the existing first combat location and lock behavior. The visual sequence spans the opening concourse, the existing West Storefront, and the existing Food Court encounter; do not move the Hanger or create a new combat lock in the safe opening room.
- [ ] If a civilian texture is absent, omit that decorative person rather than drawing a gameplay-looking capsule. Never omit Alex, enemies, or prompts.
- [ ] Expose only `phase` and `visibleCount` through the read-only presentation debug snapshot.
- [ ] Add a real-input browser test that begins with 4–6 civilians, walks Alex across both thresholds, observes monotonic evacuation, restarts, and sees one fresh busy group without duplicates.
- [ ] Run unit tests, affected integration tests, `npm run typecheck`, and the targeted browser test.
- [ ] Commit as `feat: stage concourse civilian evacuation`.

**Acceptance:** The opening initially feels relatively busy and bright, naturally clears before the danger escalates, and cannot affect a run outcome or saved state.

---

## Task 7 — Replace the inspector wall with a compact playable HUD

**Deliverable:** Health, cash, heat, room, objective, and context remain immediately legible; detailed inventory/provenance/trace data is available on demand without covering the mall.

**Files:**

- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `src/game/ui/MvpRunHud.ts`
- Create: `tests/unit/mvp-run-hud.test.ts`
- Modify: `tests/browser/night-shift.spec.ts`

**Steps:**

- [ ] Add DOM-binding tests for a compact status bar: health, cash, heat, current room, short objective, and context prompt update from the same authoritative HUD model.
- [ ] Add tests that inventory, item provenance, shop detail, checkpoint detail, and debug trace are collapsed by default and remain updateable while collapsed.
- [ ] Add tests that interaction/fusion/shop choices expand when active, keyboard focus reaches every action, and closing details returns focus to the invoking control.
- [ ] Run `npx vitest run tests/unit/mvp-run-hud.test.ts` and confirm the new compact structure fails before implementation.
- [ ] Refactor the existing markup without duplicating IDs or introducing a second HUD state model. Preserve current action handlers and accessible names where practical.
- [ ] Style the always-visible HUD as a compact edge treatment with 1990s mall signage color accents, restrained chrome, and high contrast. Keep the center of the game canvas visually clear.
- [ ] Move diagnostic and provenance information into a native `<details>` inspection drawer or equivalent accessible disclosure, collapsed by default.
- [ ] Ensure HUD chrome uses `pointer-events: none` except interactive controls; controls must not overlap the player aim surface when closed.
- [ ] At 1440×900, assert the mall remains dominant and the compact HUD does not cover the central landmark.
- [ ] At 800×600, assert no horizontal page overflow, every critical value remains visible, drawers scroll internally, and all action buttons can be clicked with Playwright.
- [ ] Exercise one complete existing flow with real input: movement, pickup/interaction, shop or bench choice, combat, pause/resume, and checkpoint restart.
- [ ] Run the HUD unit test, `npm run typecheck`, and targeted browser cases at both viewport sizes.
- [ ] Commit as `feat: add compact mall-first HUD`.

**Acceptance:** The game reads first and the inspector second, while every existing M5 action remains reachable and testable on the smaller supported viewport.

---

## Task 8 — Prove the vertical slice, document it, and stop before rollout

**Deliverable:** A clean, reproducible evidence packet demonstrates the approved opening slice and identifies any uncertainty before the art system expands to other rooms.

**Files:**

- Modify: `STATUS.md`
- Modify: `TEST_EVIDENCE.md`
- Modify: `NEXT_SESSION.md`
- Modify: `DECISIONS.md`
- Create: `artifacts/presentation-vertical-slice/opening-busy.png`
- Create: `artifacts/presentation-vertical-slice/opening-evacuation.png`
- Create: `artifacts/presentation-vertical-slice/first-combat.png`
- Create: `artifacts/presentation-vertical-slice/compact-800x600.png`

**Steps:**

- [ ] Run the local asset validator against every presentation PNG and record the exact command/result in `TEST_EVIDENCE.md`.
- [ ] Run `npm run typecheck`.
- [ ] Run the targeted new unit suites: projection, presentation assets, depth, occlusion, actors, ambience, and HUD.
- [ ] Run the affected simulation/integration suites and confirm no seeded outcome, checkpoint, collision, combat, or room-order expectation changed beyond the approved display name.
- [ ] Run `npm test` once after the implementation is stable.
- [ ] Run the complete browser suite once after targeted browser tests are green.
- [ ] Run `npm run build` and inspect the production bundle for `http://`, `https://`, home-directory paths, debug-only mutation hooks, fixture shortcuts, and unexpected source-art files.
- [ ] During browser verification, inspect requests and assert the playable run makes no external network request.
- [ ] Capture the four named screenshots from the actual browser at integer canvas scaling: bright/busy opening, civilians evacuating, first combat with readable telegraph, and compact 800×600 layout.
- [ ] Compare those screenshots against the spec acceptance criteria, not merely against the previous graybox.
- [ ] Run ten restart cycles and traverse out of/back to the opening flow where the game permits; record stable listener/display-object counts and absence of duplicate ambience.
- [ ] Update `STATUS.md` with what is implemented and the precise visual/user approval status.
- [ ] Update `TEST_EVIDENCE.md` with commands, pass/fail totals, screenshot paths, asset validation, production scan, and any skipped proof.
- [ ] Update `NEXT_SESSION.md` with the next bounded action. Do not call broader room rollout authorized unless the user explicitly approves the slice.
- [ ] Add a decision entry for presentation-only civilians, stable `service_corridor` ID/display-name split, local-only assets, and vector fallback policy.
- [ ] Run `git diff --check` and inspect the complete diff for unrelated changes.
- [ ] Request an independent actual-diff review focused on the five Review Focus failures. Apply one consolidated correction pass if warranted, then rerun only affected targeted tests plus the final gate needed by the correction.
- [ ] Commit as `docs: verify presentation vertical slice`.
- [ ] Open the playable local build and the four screenshots for user review, then **stop for explicit visual approval before converting any other room**.

**Final verification commands:**

```bash
python3 docs/art/tools/validate_runtime_tree.py \
  public/assets/presentation \
  --palette docs/art/palettes/deadmall-global.json
npm run typecheck
npx vitest run \
  tests/unit/projection.test.ts \
  tests/unit/presentation-assets.test.ts \
  tests/unit/presentation-depth.test.ts \
  tests/unit/presentation-occlusion.test.ts \
  tests/unit/presentation-actors.test.ts \
  tests/unit/concourse-ambience.test.ts \
  tests/unit/mvp-run-hud.test.ts
npm test
npm run test:browser
npm run build
git diff --check
```

**Acceptance:** The user can play and judge one polished opening slice; automated evidence proves the old M5 rules still work; local art and fallbacks are safe; broader production rollout remains unstarted and requires a new explicit approval.

---

## Execution Handoff

Implement tasks in order because each task establishes contracts consumed by the next. The art-approval pauses in Tasks 2, 5, and 6 are mandatory and are not satisfied by test results or worker judgment.

For this repository, the preferred execution shape is one coherent worker package in this worktree with one writer, task commits, an event-driven wait, one independent actual-diff review, and normally one consolidated correction. Native execution is also valid if conserving coordination overhead is more important. In both cases, the parent agent owns acceptance and any later push; no plan step authorizes push, merge, publication, deployment, or paid generation.
