# Source-preserving WEST hurt review

**REVIEW_ONLY.** Four 96 × 96 frames, 234 ms total. This example does not
register assets, replace game art, change the runtime, or approve motion quality.
It is a deterministic source-pixel fixture, with no provider calls or network use.

## Inspect

- `strip.png`: authoritative native 384 × 96 RGBA strip.
- `frames/frame-000.png` through `frame-003.png`: onset, peak, restrained return,
  and exact-source settle. Onset and rebound deliberately have identical pixels.
- `preview-exact.png`: animated PNG with exact RGBA frames and stored durations
  of 50 / 50 / 67 / 67 ms. A viewer may quantize display to screen refresh.
- `preview-gif-approx.gif`: 2× preview, 50 / 50 / 70 / 70 ms, 240 ms total.
- `preview-slow-inspection.gif`: 2× inspection preview, 400 ms per frame.

Both GIFs are timing/color approximations. A shared fixed 256-color palette and
disabled dithering keep the protected colors stable across frames, but palette
quantization changes some source colors. Native PNGs and the APNG are authoritative.

## Source and transformation provenance

`source.png` is the exact 96px WEST attack-frame-zero crop: rectangle
`[16, 16, 112, 112]` inside its 128px cell, without resampling or loss of opaque
pixels. `walk-source.png` is a pinned supporting identity reference. "Source"
means the supplied attack-frame pixels; it is not a claim about the original
artist or how earlier attack art was authored.

The builders extract parts from that source. Forge RotSprite derives the torso
and forearm variants, while the head, bag/handles and footwear retain their
source pixels. Torso angles are −4 / −10 / −4 / 0 degrees; forearm angles are
+1 / +4 / +1 / 0 degrees. The head moves (+2,0), (+5,0), (+2,0), (0,0); the
bag moves (+1,0), (+3,+1), (+1,0), (0,0). Shoes remain fixed, on baseline y95.

`masks/` retains both opaque and complete RGBA comparison domains for head,
bag and shoes. The domains include protected clear silhouette pixels.
`patches/*source-pixel-copies.json` records every source coordinate, target
coordinate and RGBA value used to fill exposed garment seams: 33 / 95 / 33 / 0
pixels. No patch overlaps a protected domain. `artifact-provenance.json`
describes the peak; `animation-evidence.json` describes the whole sequence.

## Rebuild and verify

Use an existing Python environment with the versions in
`../../requirements-tested.txt`. No dependencies are installed by these scripts.
The byte-exact reference exports use Pillow 12.3.0; another encoder version may
change PNG/GIF bytes even when decoded pixels match. Such drift is a test failure,
not an automatic update to the pinned hashes.

From the repository root:

```sh
PY=python
FORGE="$PWD/tools/pixel-forge"
EXAMPLE="$FORGE/examples/source-preserving-west-hurt"
OUT=$(mktemp -d)
"$PY" "$EXAMPLE/build_recoil.py" \
  --source "$EXAMPLE/source.png" --walk "$EXAMPLE/walk-source.png" \
  --forge-root "$FORGE" --out "$OUT/peak"
"$PY" "$EXAMPLE/build_animation.py" \
  --bundle "$OUT/peak" --forge-root "$FORGE" --out "$OUT/animation"
cmp "$EXAMPLE/strip.png" "$OUT/animation/strip.png"
cmp "$EXAMPLE/preview-exact.png" "$OUT/animation/preview-exact.png"
cmp "$EXAMPLE/preview-gif-approx.gif" "$OUT/animation/preview-gif-approx.gif"
cmp "$EXAMPLE/preview-slow-inspection.gif" "$OUT/animation/preview-slow-inspection.gif"
for i in 000 001 002 003; do
  cmp "$EXAMPLE/frames/frame-$i.png" "$OUT/animation/render/frame-$i.png"
done
(cd "$FORGE" && "$PY" -m pytest -q tests/test_source_preserving_west_hurt.py)
(cd "$FORGE" && "$PY" -m pytest -q tests)
```

The builders also work from another current directory. Their default source
paths and Forge root resolve from their own location inside this checkout;
explicit flags override those defaults. Every output directory must be fresh.
Changed source, supporting walk, or reviewed peak hashes are rejected. The
animation builder checks inputs before creating output. Detailed layers,
recipes, repair images, renderer/export reports and comparison boards are
regenerated locally rather than duplicated in this compact fixture.

`MANIFEST.json` is the explicit public-file allowlist and SHA-256 map, excluding
only itself. The regression suite verifies this complete list, rebuilds from a
different working directory, compares retained artifacts byte for byte, checks
source-copy provenance and protected domains, decodes all APNG frames/timing,
checks GIF timing and protected-color stability, and exercises input/overwrite
guards. The manifest does not constitute approval for runtime use.

Pinned native strip SHA-256:
`4ae36b0b2f2517b922d2aee64d187ae15b66b1b54441ff04d48d10235ad55487`

Pinned peak SHA-256:
`c14567847026eb93b536e13ec2acb04647f97b404b23c8362cfbaae7c149fcfb`

## Limits

Technical identity and geometry checks do not establish anatomical correctness
or motion quality. Bag-owner labeling and final independent motion review remain
unverified. This four-frame WEST fixture does not cover other directions.
No native Aseprite round trip or live game playback was performed for this
fixture; neither is claimed. Runtime activation requires separate review.
