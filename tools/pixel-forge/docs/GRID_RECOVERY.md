# Optional grid analysis and recovery

The default Forge finishing pipeline is unchanged. This adapter inspects the
apparent pixel grid of an explicitly generated/upscaled static PNG. It is not a
new art generator and does not fix identity, missing feet, held props or motion.

## Safe defaults

- `python -m forge.grid_detector input.png` prints review-only JSON and writes
  nothing. Native lineage is authoritative and bypasses inference. This path
  needs no SciPy or OpenCV and preserves every source pixel.
- Add `--generated` only for an input whose native lattice is genuinely unknown.
  The source file is still untouched. The report gives separate X/Y spacing,
  proposed native dimensions, source-pixel hash and detector consensus.
- Do not infer "native" from low color count. The real WEST regression fixture
  has 356 visible RGB colors, and its transparent padding is intentional.
- Lossy reconstruction requires both `--extract NEW.png` and `--allow-lossy`.
  Existing output files and symlinks are refused. The result is a review
  candidate, not a replacement asset or an approved animation frame.
  Its receipt includes the actual output pixel hash and dimensions.
- Any `--protect alpha`, `--protect colors`, `--protect dimensions`, or other
  protected requirement blocks lossy reconstruction. Low-confidence estimates
  also block reconstruction. Native bypass is exact and can be copied safely.

Example from `tools/pixel-forge`:

```bash
python -m forge.grid_detector generated-sheet.png --generated
python -m forge.grid_detector generated-sheet.png --generated \
  --extract review-candidate.png --allow-lossy
```

No existing bridge, generator, paid service, game-runtime asset registration,
frame timing or default palette is changed. `forge_accel.pixels.finish` remains
the preferred existing path when the exact integer grid is already known.

## Optional local dependencies

Install `requirements-grid.txt` only into an authorized isolated environment
that already has Forge's base requirements. Nothing is installed or downloaded
by this adapter. The extra stack is SciPy and headless OpenCV; no GUI, model,
network call, API token, Rust compiler or Rust binary is needed at runtime.

The vendor source is the official Retro Diffusion Python implementation at
commit `ef376e57e1c272633ca2dbf5f29ec3fcf6596465` (2026-07-15). It is MIT-licensed,
copyright Astropulse, LLC. The 12 source modules are byte-identical to the pinned
Git blobs, in `forge/_vendor/rd_pixelfixer`, with LICENSE and a SHA-256/Git-blob
manifest. Upstream's API/CLI modules are excluded. Its CLI still imports the old
`detector` name; our small adapter calls the working relative-import package.

Sources: [repository](https://github.com/Retro-Diffusion/pixel-art-fixer),
[pinned license](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/LICENSE),
[reconstruction](https://github.com/Retro-Diffusion/pixel-art-fixer/blob/ef376e57e1c272633ca2dbf5f29ec3fcf6596465/python/pixelfixer/reconstruct.py).

## Preservation limits

Detection does not guarantee the correct lattice. Already-native art can be
mistaken for larger cells, and ambiguous/rotated grids need manual review. This
adapter does not deskew, split sprites, crop, remove backgrounds, remove small
islands, symmetry-center or change the whole image to a fixed palette.

Optional upstream reconstruction uses a small palette internally to vote on
structure, then averages original source colors. It does not impose that
palette on output, but still may alter subtle colors, outlines and details.
Alpha is thresholded to 0/255. It changes the canvas scale. Exact alpha, colors,
dimensions, padding, foot anchors, protected props and frame-origin contracts
cannot be promised through this operation and must block it. No automatic
per-frame cleanup is enabled: independent estimates could introduce animation
jitter. Preserve the original frames and their timing/layout metadata.

Pinned source is not a promise of bit-identical reconstructed output. Upstream
OpenCV clustering can vary between runs, and full arbitration can alter OpenCV
RNG state. Save the actual reviewed candidate and its output hash rather than
regenerating it for release. Native bypass has no such variability.

## Python interface

```python
from forge.grid_detector import analyze_grid, reconstruct_grid

native_report = analyze_grid(native_image)  # bypass, exact authoritative source
report = analyze_grid(generated_image, source_is_native=False)
# Inspect dimensions and warnings before explicitly creating a derived result.
candidate = reconstruct_grid(generated_image, report, allow_lossy=True)
```

The report is bound to the source's RGBA hash and dimensions. Passing a different
source, an oversized/upscaling target, or another engine version is rejected.
Programmatic protected contracts can be passed as `protected_requirements`, e.g.
`("held_props", "feet", "frame_origins")`; any such contract blocks lossy recovery.

Input is bounded to the existing Forge static-PNG byte/pixel limits, with a
4-million-pixel inference cap and minimum 16-pixel sides. Animated input is
refused rather than silently dropping frames. The upstream detector may be
expensive on hard inputs; `--mode fast` avoids full arbitration but can return
an uncertain result. Confidence labels are consensus heuristics, not calibrated
probabilities.
Empty/fully transparent and single-visible-color generated inputs are rejected
as insufficient structure, rather than trusting a spurious medium-confidence grid.
This conservatively includes a single-color silhouette even when its alpha edges
contain useful structure; use an explicit known grid or manual review for it.

## Verification contract

- Real native WEST (`examples/west-refined-review/west-0.png`): unchanged 128×128
  canvas, all RGBA bytes and exactly 356 visible RGB colors.
- Native partial alpha and invisible RGB: unchanged.
- Generated synthetic square/native grid enlarged at 4×6 and fractional factors:
  infer original dimensions using the actual pinned detector.
- Generated reconstruction: no source mutation and no 256/62/32-color cap.
- Fail closed for protected requirements, missing lossy acknowledgement,
  uncertain reports, changed source, oversized output, animated input and
  attempted output overwrite.
- Verify the pinned vendor bytes, run the whole Forge test suite, and separately
  exercise native bypass in the base environment without optional dependencies.

The test evidence and a same-input neural/classical comparison are recorded
separately. Neither engine is selected as universally best from these fixtures.
