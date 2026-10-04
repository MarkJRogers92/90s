# Opt-in quality and speed tools

This upgrade wraps the existing `make -> artist.generate -> DSL/QA -> keep-best -> library` pipeline. It does not select a new default provider, install game art, alter the rig renderer, or bypass `animation-export`.

Use `FORGE_PYTHON` to point at an environment with `requirements-tested.txt`. Commands below run from `tools/pixel-forge`. Results and offline atlases are review candidates, never automatic approval. No new mandatory dependency was added.

## Recommended routine static asset

One candidate, one review, existing keep-best judging; inspect at 1x/2x before accepting. `--no-polish` preserves authored details from mandatory automatic polishing. Explicit model choice avoids account-dependent default backend selection. Set the revision to your actual model/config version and change it whenever external CLI/model settings change.

```bash
FORGE_PYTHON=/path/to/python bash forge.sh make '1990s mall claw machine, three-quarter top-down, clear glass cabinet' \
  -W 64 -H 96 --artist codex --model gpt-6.1-sol -n 1 --rounds 1 --no-combine --no-polish \
  --cache-dir ./quality-cache --generation-revision codex-sol-current-config-v1 \
  --ref ../../public/assets/neon/legacy-props/claw-machine.png --brief ./examples/quality/brief.json
```

An exact hit skips backend construction, drafts, routes, reviews and judges. It returns the original immutable library item. Explicitly requested editor opening or a new export still occurs locally. `--rounds 0` is the fastest first draft, with less quality assurance; it is not the routine quality recommendation.

## Highest-quality static workflow

```bash
FORGE_PYTHON=/path/to/python bash forge.sh make '1990s mall claw machine, three-quarter top-down, clear glass cabinet' \
  -W 64 -H 96 --artist codex --model gpt-6.1-sol -n 4 --rounds 3 --no-polish \
  --cache-dir ./quality-cache --generation-revision codex-sol-current-config-v1 \
  --ref ../../public/assets/neon/legacy-props/claw-machine.png --brief ./examples/quality/brief.json
```

This spends more model work and retains the existing combine/keep-best logic. More candidates do not guarantee better drawing. No PixelLab/RD route runs unless explicitly requested with `--route`. The inherited `gpt-image` route now receives actual reference attachments but still performs its existing conversion/refinement; this upgrade does not make that route a lossless image importer.

## Independent states and animations

```bash
# Inspect the complete batch without generating.
FORGE_PYTHON=/path/to/python bash forge.sh quality states examples/quality/states.json \
  --cache-dir ./quality-cache --generation-revision codex-sol-current-config-v1
# Generate serially; re-running after editing one state reuses the others.
FORGE_PYTHON=/path/to/python bash forge.sh quality states examples/quality/states.json \
  --cache-dir ./quality-cache --generation-revision codex-sol-current-config-v1 --execute
# Curate the returned PNGs and list them explicitly in an ordered frame spec.
FORGE_PYTHON=/path/to/python bash forge.sh quality pack examples/quality/frames.json --columns 3 --out ./review-atlas-001
# Replace one frame in a new bundle; preserve timings, pivots, tags, events and loop metadata.
FORGE_PYTHON=/path/to/python bash forge.sh quality replace-frame ./review-atlas-001/atlas.png \
  ./review-atlas-001/atlas.json ./replacement.png --index 1 --out ./review-atlas-002
```

Open `preview.html` to inspect playback at 1x, 2x and 4x. Holds and blanks remain intentional frames. Atlases are review interchange, not the rich checked game-animation manifest. Keep root-motion/anatomy/source pins in that original manifest; final export still uses `forge.sh animation-export MANIFEST --out NEW_DIR` with its existing explicit review record. Aseprite remains the editable native route (`open`, `from-aseprite`, rig-review), and no GUI is required for these local helpers.

## Revise only a requested region

Create a candidate using existing direct drawing or an editor on a copy. Masks are opaque binary PNGs: white editable, black locked. A protected mask uses white for explicitly protected details. Alpha and canvas are preserved by default; alpha editing requires `--allow-alpha-change`.

```bash
FORGE_PYTHON=/path/to/python bash forge.sh quality inspect ./source.png
FORGE_PYTHON=/path/to/python bash forge.sh quality repair ./source.png ./candidate.png ./edit-mask.png \
  --budget 80 --protected-mask ./protected-mask.png --expected-sha SOURCE_PIXEL_SHA256 --out ./review-repair-001
FORGE_PYTHON=/path/to/python bash forge.sh quality recolor ./source.png \
  --mapping ./examples/quality/recolor.json --out ./review-recolor-001
FORGE_PYTHON=/path/to/python bash forge.sh quality compose ./examples/quality/layers.json --out ./review-layers-001
FORGE_PYTHON=/path/to/python bash forge.sh quality finish ./source.png --out ./review-preserved-001
```

`inspect` returns `pixel_sha256`; use that exact source-pixel hash, not a PNG file hash. Repair rejection publishes no accepted bundle. Exact recolor leaves invisible pixels, alpha and size untouched and uses simultaneous replacements (no color-chain accidents). Use only target colors from your selected profile/source palette. Composition uses named layers, integer offsets and normal source-over alpha composition, rejecting clipped visible pixels. `finish` performs no resize, quantization or alpha threshold unless explicitly requested; rich inputs need not fit the legacy indexed Sprite's 62-color format. Cached `--start` rejects sources that the indexed generator cannot preserve exactly; use these lossless local utilities for partial alpha or richer art.

## Cache contract and recovery

The identity includes compiled prompt/brief, state, dimensions, checks, profile content/palette, frozen reference PNG bytes, base sprite content, candidates, review/combine/polish choices, routes/backend/model, producer source/dependency versions and explicit external configuration revision. References are frozen before a backend sees them. Caller output paths/editor choices are excluded, so a new export does not trigger generation. `keep_steps` is deliberately rejected with caching; all steps remain in the original library work directory.

POSIX advisory locks suppress identical jobs across threads/processes. Waiting workers time out without starting another generation. Successful PNGs, QA, previews, references and native result metadata are integrity checked. Failed/interrupted jobs are retained and never automatically retried. Inspect/reconcile uncertain provider work, then deliberately change `--generation-revision` for a new take; do not delete a job to force blind paid retries. Cache hits also refuse altered/missing native library images.

Independent-state batches validate all requests before execution and run serially. Each state includes only its own request and shared config in its identity. Changing one prompt/reference changes that state; changing shared model/style/producer versions correctly invalidates all affected states.

## Local checks

```bash
FORGE_PYTHON=/path/to/python
"$FORGE_PYTHON" -m pytest -q
"$FORGE_PYTHON" scripts/benchmark_quality_speed.py --out ./review-benchmark-001
```

Always use a fresh output directory. The benchmark writes local timings, exact-preservation comparisons and an offline callback cache measurement. These do not establish PixelLab parity, provider latency or billing, artistic quality, or performance on another computer.

Optional browser check (requires an existing Playwright development installation, not a Forge dependency):

```bash
FORGE_PLAYWRIGHT_MODULE=/path/to/playwright \
FORGE_BROWSER_EXECUTABLE=/path/to/chromium \
node scripts/verify_quality_preview.cjs ./review-atlas-001/preview.html ./review-browser-001
```

This checks all state tags/frame coverage, pause/step/back, background repaint and 1×/2×/4× canvas sizes. It records screenshots and JSON evidence; choose a short review fixture with <=10 seconds per state.
