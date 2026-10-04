# Pixel Forge authoring tools

Developer-side pixel-art authoring, rig animation, checked exports, and native Aseprite verification. This directory is isolated from the DEAD MALL runtime; importing the tool does not register or replace any game asset.

Source: the `pixel-forge-rig` snapshot at [e8ec6ee555711375b134d4c2bffad9ecf47ab0e2](https://github.com/MarkJRogers92/90s/commit/e8ec6ee555711375b134d4c2bffad9ecf47ab0e2), integrated as a scoped directory instead of merging the standalone snapshot over the game. See `PROVENANCE.json`, `NOTICE.md`, and `VERIFICATION.md`.

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
