# Source-pixel posing for an existing character

Use this companion to image-pair when an existing shipped character must retain
its exact identity-defining pixels. It uses the existing rig, derived-variant,
patch, animation-check and review-export tools. It is not a new provider or an
automatic anatomy recognizer.

## Bounded workflow

1. Pin an exact same-facing native source frame and record its crop/origin. Remove
   known transparent padding without rescaling. Inspect the source at 1× and
   nearest enlargement; do not assume historical authored rig parts are original.
2. Extract source layers and explicit protected domains. Include the silhouette's
   transparent boundary where preservation matters. Keep original head, accessory
   and footwear unchanged; record any permitted integer translations. Mask names
   and anatomical ownership are annotations requiring visual review.
3. Re-pose only the necessary torso/arm layers with verified rig derivations.
   Render a source-rest recipe first and prove its complete RGBA output equals
   the supplied source. Keep shoe/world-root registration explicit.
4. Repair exposed seams with small masks and source-palette pixels. Record every
   source-to-destination pixel copy. Exclude protected domains, including their
   transparent pixels. Pixel preservation alone cannot establish a plausible join.
5. Inspect one peak pose before expanding the sequence. Require exact source/mask,
   palette, alpha and baseline checks plus an independent source/candidate review
   of head, neck, grip, limbs and silhouette.
6. Assemble only the requested frames after that review. Reusing a pose with a
   different hold duration is legitimate; disclose it rather than calling every
   timed frame a distinct drawing. Avoid unrequested overshoot or anticipation.
7. Export review artifacts and verify decoded pixels/timing. Keep the native PNG
   frames/strip authoritative. APNG can preserve exact millisecond durations and
   RGBA pixels. GIF requires 10ms timing steps and palette reduction: label both
   approximations and use a single non-dithered palette across frames to avoid
   introducing preview-only color flicker in protected regions.

Run the existing `rig-review` and `animation-export --review` paths against the
source-pinned recipe/manifest. Final production export retains its separate
review-record gate. Aseprite-native round-trip claims require the actual binary.

## Controlled WEST hurt trial, 4 October 2026

The current trial source is the shipped WEST attack frame, unpadded from 128×128
to 96×96 with the exact crop `(16,16,112,112)`. Source SHA-256:
`4ecc5c275ecd29210dc4b68f3d7850dd33740bd51dca76dfca937cbe181a29b3`.

The independently reviewed peak has hash
`c14567847026eb93b536e13ec2acb04647f97b404b23c8362cfbaae7c149fcfb`.
It retains protected head, bag and shoe domains exactly after translations
[5,0], [3,1] and [0,0]. Its torso/forearm derivations use -10°/+4° rotations.
Ninety-five source-pixel seam repairs avoid all protected domains. Small horizontal
bands in the exposed trouser shading remain a non-blocking enlarged-view caveat.

The review-only four-frame strip is 384×96, SHA-256:
`4ae36b0b2f2517b922d2aee64d187ae15b66b1b54441ff04d48d10235ad55487`.
Its progression is impact onset, backward peak, partial recovery and exact-source
settle. Recovery reuses the onset pose: three drawings across four timed frames.
Head x offsets are [2,5,2,0]; torso angles are [-4,-10,-4,0]. All shoes remain
identical on y=95. Declared durations are [50,50,67,67]ms, 234ms total.

Ordered native-frame review passes identity, facing, joins, grip and foot
registration. This does not establish normal-speed feel, perceived smoothness,
or in-game playback. All outputs remain REVIEW_ONLY and no runtime installation
is implied. The compact [source/build/test fixture](../examples/source-preserving-west-hurt/README.md)
is separate from the game assets; this workflow requires no new image generation
or API calls. Its explicit manifest pins the retained public review files.
