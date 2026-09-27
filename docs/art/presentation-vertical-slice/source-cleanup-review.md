# Opening Concourse imported-master cleanup review

Reviewed 2026-09-26 after the second approval gate. This review covers only
active Aseprite masters that were made by importing an approved PNG: the seven
assets that had no matching editable master, plus the railing and bench masters
replaced because the archived masters did not reproduce the approved pixels.

## Method

Each `.aseprite` file was re-opened in Aseprite 1.3.18.5 at its stored native
dimensions and exported without scale conversion. The native export was checked
pixel-for-pixel against its committed runtime PNG, then inspected for binary
transparency, shared-palette membership, opaque bounding box, bottom contact
where applicable, outline continuity, and alignment. Tile seams were assessed
only for the one repeatable segment in this set; the remaining assets are
single-use props, signs, or façade modules rather than repeating tiles.

All nine masters require **no edit**. Their native-pixel output remains the
approved output; no runtime hash changed after approval.

| Runtime asset | Active editable source | Native size | Native inspection | Result and concrete rationale |
| --- | --- | --- | --- | --- |
| `railing-glass-32.png` | `docs/art/presentation-vertical-slice/sources/environment/railing-glass-32.aseprite` | 32×32 | Binary alpha; 4 shared-palette colours; opaque span is y=4–17; no bottom anchor by design; left/right edges both remain opaque across that span. | No edit. This is a suspended structural segment, so the transparent lower canvas and no bottom contact are intentional. The horizontal rail has no transparent break at the repeat join; the edge colour shift is the intended steel-to-highlight transition, not an outline gap. |
| `mall-bench.png` | `docs/art/presentation-vertical-slice/sources/environment/mall-bench.aseprite` | 56×30 | Binary alpha; 20 shared-palette colours; opaque bounds fill 0–55 × 0–29; bottom contact present. | No edit. The one-pixel dark slat/leg contours are continuous, the 56×30 crop is bottom-aligned, and it is a standalone prop, so no tiling seam applies. |
| `storefront-fascia-64x32.png` | `docs/art/presentation-vertical-slice/sources/environment/storefront-fascia-64x32.aseprite` | 64×32 | Binary alpha; 31 shared-palette colours; opaque bounds fill the intended façade frame; bottom contact present. | No edit. Awning, window, and base outlines are continuous at native pixels. This is a complete fascia module with designed end caps, not a repeatable strip; no repeat seam is required. |
| `sign-cool-96x24.png` | `docs/art/presentation-vertical-slice/sources/environment/sign-cool-96x24.aseprite` | 96×24 | Binary alpha; 20 shared-palette colours; opaque bounds x=5–90, y=2–21; no bottom anchor by design. | No edit. The transparent perimeter deliberately isolates the hanging sign, and its cyan border/highlight steps are continuous. It is a unique sign panel, not a tile. |
| `mall-directory.png` | `docs/art/presentation-vertical-slice/sources/environment/mall-directory.aseprite` | 17×54 | Binary alpha; 23 shared-palette colours; opaque bounds fill 0–16 × 0–53; bottom contact present. | No edit. The narrow frame, map face, and base use consistent one-pixel dark edging; the full-height crop provides a stable floor anchor. It is a standalone prop. |
| `planter.png` | `docs/art/presentation-vertical-slice/sources/environment/planter.aseprite` | 25×25 | Binary alpha; 37 shared-palette colours; opaque bounds fill 0–24 × 0–24; bottom contact present. | No edit. The stepped pot rim and leaf silhouette are continuous, with intentional compact framing and no soft alpha. It is a standalone prop. |
| `potted-palm.png` | `docs/art/presentation-vertical-slice/sources/environment/potted-palm.aseprite` | 38×58 | Binary alpha; 33 shared-palette colours; opaque bounds fill 0–37 × 0–57; bottom contact present. | No edit. Fronds retain deliberate stepped silhouettes and the pot reaches the bottom row; no isolated pixels or anti-aliased fringe were found. It is a standalone prop. |
| `rubbish-bin.png` | `docs/art/presentation-vertical-slice/sources/environment/rubbish-bin.aseprite` | 20×25 | Binary alpha; 21 shared-palette colours; opaque bounds x=0–18, y=0–24; bottom contact present. | No edit. The right transparent column is intentional breathing room for the compact three-quarter silhouette; lid, rim, and foot contours remain continuous. It is a standalone prop. |
| `poster-stand.png` | `docs/art/presentation-vertical-slice/sources/environment/poster-stand.aseprite` | 38×53 | Binary alpha; 23 shared-palette colours; opaque bounds fill 0–37 × 0–52; bottom contact present. | No edit. The board, dark frame, pole, and feet have continuous one-pixel language with a bottom-row anchor; it is a standalone prop. |

## Evidence command

The following local check is the source-of-truth regression guard for this
review. It verifies that the nine active editable masters export pixels exactly
matching the currently approved runtime files; a failure means the review and
approval must be revisited before promotion.

```sh
for source in railing-glass-32 mall-bench storefront-fascia-64x32 \
  sign-cool-96x24 mall-directory planter potted-palm rubbish-bin poster-stand; do
  /Applications/Aseprite.app/Contents/MacOS/aseprite -b \
    "docs/art/presentation-vertical-slice/sources/environment/$source.aseprite" \
    --save-as "/tmp/$source.png"
done
```

The corresponding pixel comparison is recorded in the Task 2 report. No new
visual approval is required because the approved runtime pixels were unchanged.
