# Pixel Forge authoring tools

Developer-side pixel-art authoring, rig animation, checked exports, and native Aseprite verification. This directory is isolated from the DEAD MALL runtime; importing the tool does not register or replace any game asset.

Source: the `pixel-forge-rig` snapshot at [e8ec6ee555711375b134d4c2bffad9ecf47ab0e2](https://github.com/MarkJRogers92/90s/commit/e8ec6ee555711375b134d4c2bffad9ecf47ab0e2), integrated as a scoped directory instead of merging the standalone snapshot over the game. See `PROVENANCE.json`, `NOTICE.md`, and `VERIFICATION.md`.

## Community model-quality review (open to contributors)

We're inviting targeted improvements to the **existing Pixel Forge pipeline**, not a ground-up model rewrite. See [Pixel Forge improvement discussion and submissions, issue #80](https://github.com/MarkJRogers92/90s/issues/80). Useful work includes model/adapter refinement, consistent 3/4 sprite viewpoint and scale, pixel-grid/palette/alpha fidelity, animation alignment, and reproducible QA. Provide a small working change with synthetic before/after tests. Review [NOTICE.md](NOTICE.md) before reusing or distributing code or art; public readability is not a general redistribution license.

**Funding status:** The proposed five-by-$1 cash pilot has **not** been funded or opened. Contributions here are currently voluntary; no cash award is promised.

## Start

Use Python with the dependencies recorded in `requirements-tested.txt`. This integration includes no environment or dependencies and installs nothing automatically. Aseprite must be an existing executable you are licensed to use.

```bash
cd tools/pixel-forge
FORGE_PYTHON=/path/to/python bash ./forge.sh rig-review examples/west-rig/recipe-v3.json --out ./review-001
```

Review `review-001/SUMMARY.md`, the 1× strip, in-place and ground-relative previews, and the editable native document when Aseprite is available. Use a fresh output directory for every run.

```bash
ASEPRITE_PATH=/path/to/aseprite FORGE_PYTHON=/path/to/python bash ./run_native_check.sh
```

The native-check runner requires successful tests and native round trips. The v3-base fixture has one deliberately preserved floor-contact failure; any additional or unexpected failure blocks the check. See `examples/README.md`.

## Workflow and scope

- Start new art from GPT image generation, keeping the original character reference authoritative. Use Forge for cleanup, pose/layer assembly, verification, and export. Drawing quality still needs visual review.
- Read `RIG_GUIDE.md` for pinned source/authored variants, rig joints, floor constraints, and pose recipes.
- Rig/render/check/export operations are local. Inherited optional generation/provider commands are not needed for this workflow and require their own credentials and authorization; nothing here enables them or calls them automatically.
- The WEST examples are regression fixtures marked review-only. They are not approved eight-facing Bargain Hunter art and are not copied into `public/`.
- This merge makes no changes to gameplay, asset registration, animation timing, or the existing charge-frame fix.

## Tests

```bash
FORGE_PYTHON=/path/to/python
ASEPRITE_PATH=/path/to/aseprite "$FORGE_PYTHON" -m pytest -q tests
```

Without Aseprite, native tests skip. A source-only test run is not native verification.

## Opt-in quality and speed upgrade

`make --cache-dir DIR --generation-revision CONFIG_VERSION` reuses the real generator without changing provider defaults. `forge.sh quality` exposes local preserve-first finishing, exact recolor/layer reuse, bounded repair publication, independent states, deterministic atlases and one-frame replacement. See [commands and contracts](docs/QUALITY_SPEED.md), including the reproducible local benchmark. Review bundles do not bypass the existing animation gates.

## Real GPT image pair workflow

`forge image-pair` / MCP `forge_image_pair` now coordinate a real initial mockup and its associated sprite sheet, with request-owned native-tool fulfillment or an explicitly configured Images API adapter. Original references persist across bounded corrections. Exact checks, optional generated-only normalization, immutable raw outputs and review-only acceptance are described in [GPT_IMAGE_PAIR.md](docs/GPT_IMAGE_PAIR.md). This is an authoring workflow; it does not enable provider access or alter shipped game assets.

## Optional generated-grid recovery

The pinned MIT Retro Diffusion detector is available through `python -m forge.grid_detector`. Native assets bypass it by default; generated-image analysis is opt-in and non-mutating. Optional reconstruction is explicitly lossy and blocked by protected requirements. It is not auto-inserted into the image-pair workflow. See [GRID_RECOVERY.md](docs/GRID_RECOVERY.md); optional dependencies remain separate in `requirements-grid.txt`.

## Private native image worker (experimental)

See [the Codex native-image bridge](docs/CODEX_NATIVE_BRIDGE.md) for an opt-in,
same-host Claude/MCP route into paired image jobs. The stdio transport is tested
with fixtures; a live signed-in image run is not yet verified or enabled.
