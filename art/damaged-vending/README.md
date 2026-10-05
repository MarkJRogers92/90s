# Damaged vending machine

A severely damaged 1990s mall vending prop: crushed red shell, cracked glass, torn lower service panel, exposed machinery and fixed fallen cans.

## Native asset

- PNG: `../../public/assets/neon/props/damaged-vending-flicker.png`
- Four 96×96 cells in one 384×96 strip; 44×81 visible footprint
- Shared 48-color palette, 46 colors used; binary alpha
- Common pivot `(48,89)`; front and right side visible
- Frames: weak sign 280 ms, dark sign 90 ms, sign plus spark 90 ms, restored sign 340 ms
- Loop: 800 ms; nearest-neighbor display
- TexturePacker and Aseprite manifests: `atlas.json`, `aseprite.json`
- Individual PNGs: `frames/`
- Review: `review/native-1x-2x.png`, `review/animation.gif`, self-contained `review/preview.html`

The original asset-only addition is now wired into the normal Floor 1 Back Hall at (84,132).
It is inert furniture with a 36×14 floor collision footprint, native 1× scale and pivot (48,89).
The game tick samples the authored light cycle; Reduced Flashes holds frame 0.
First wings, districts, upstairs rooms, stores and test fixtures retain their existing content.
No interaction or loot behavior is added.

## Conversion and verification

`source/generated-sheet.png` is the unmodified high-resolution generated source. The recipe slices its four actual 543×724 slots, takes the same measured 360×656 crop, maps one shared palette with no dithering, thresholds alpha at 128, then uniformly reduces each crop 8× through Pixel Forge block-mode reduction. No whole-image stretch is used.

The native body and alpha silhouette come from frame 0 and stay exact. Only sign colors and the original spark footprint change. Eight small spark pixels are preserved by explicit brightness votes from their original 8×8 source blocks. Frame 3 intentionally repeats frame 0.

Palette mapping, alpha thresholding and reduction are lossy. Fine high-resolution texture is removed. The source, coordinates and losses are recorded in `conversion-manifest.json`; generation and dependency provenance are in `provenance.json`.

All four frames have bounds `[27,9,71,90]`, no partial alpha and no isolated pixels. The exact identity/palette/baseline/height checks in `native-checks.json` pass. Changed pixels versus frame 0 are `[0,57,10,0]`, all within the 65-pixel editable-light mask. Native ordered-frame visual review found no blockers. GIF frames and timing were decoded and verified. Production renderer tests verify frame selection, scale, pivot, depth and Reduced Flashes. Live browser/game-engine playback remains untested because of the cloud browser/socket restriction.

## Rebuild and test

Uses the repository's existing Pixel Forge modules and its Python dependencies (Pillow and NumPy; exact validated versions are in `provenance.json`). It does not use a model or network.

```sh
python art/damaged-vending/build.py /tmp/damaged-vending-rebuilt
python -m unittest discover -s tests/art -v
```

Use a new output directory; the recipe refuses to overwrite an existing one. It works from any current working directory when the script path is explicit. The rebuilt sheet and four frame PNGs must match the committed bytes exactly. Existing Pixel Forge license and notice files are unchanged.
