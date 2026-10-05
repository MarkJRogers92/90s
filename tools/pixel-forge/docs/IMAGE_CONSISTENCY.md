# Source-pinned image-pair consistency

This is an opt-in extension of `mockup → associated sheet → targeted revision`.
Legacy specifications keep their existing behavior. It does not select a provider,
spend a call automatically, approve art, or install game assets.

## Contract

Add `consistency` to an image-pair specification. Reference indices are zero-based
indices in its original `references` array, excluding `start_png`. The same frozen
bytes and contract accompany every generation, including follow-ups.

```json
{
  "version": 1,
  "appearance_references": {"west": 0},
  "palette_references": [2],
  "pose_guide_reference": 3,
  "identity": "Keep the original head, hair, clothing and anatomical-left bag.",
  "proportions": "Keep the measured source proportions; change the pose only.",
  "poses": ["Impact onset", "Peak recoil", "Rebound", "Settle"],
  "frame_checks": {
    "west": [
      {"height_range": [78,84], "baseline_y": 95},
      {"height_range": [78,84], "baseline_y": 95},
      {"height_range": [78,84], "baseline_y": 95},
      {"height_range": [78,84], "baseline_y": 95}
    ]
  }
}
```

For this example, reference 0 is a 96×96 same-facing character cell, reference 1
may be another appearance reference, reference 2 is the explicitly chosen source
palette PNG, and reference 3 is a pose-only guide. A pose guide never supplies
appearance, palette or locked identity pixels. Labeling a source WEST is a caller
annotation, not machine recognition of facing. Inspect the reference first.

Every requested facing must have an appearance-reference entry. Each appearance
image must exactly match the native square frame size. The existing limit of five
original reference files remains: this is suited to one-facing strips or small
explicit sets, not eight distinct facing anchors plus guides. There is no new
per-facing job scheduler. A full sheet still works through the legacy workflow.

The caller may advertise its actual tool limit at dispatch with
`--max-reference-images N` (MCP: `max_reference_images=N`). Requests exceeding that
limit remain `pending`, before a ticket is claimed. No limit is inferred from a
provider name. One observed built-in caller tool allows five input images: for
that route, use three original references without a redundant `start_png` so an
initial sheet has seed + three references + mockup. A masked mockup follow-up has
prior result + three references + mask. A masked **sheet** follow-up also retains
the mockup, so it requires at most two originals to fit five inputs; three fit
an unmasked sheet follow-up. Never drop a source silently. Select the palette explicitly from those
appearance references; changing palette authority requires a new spec/revision.

The initial sheet edit uses a deterministic native canvas filled with the exact
same-facing seed in each slot. The accepted mockup controls the peak pose;
original appearance references remain authoritative. Pose descriptions and guide
pixels govern motion only. The seed is not a claim of an undocumented model
random-seed parameter, and generated pixels are never assumed to remain exact.

## Inspect and record the mockup

After accepting a consistency mockup, inspect its original image and the automatic
native/2× source comparison. The display thumbnail preserves the entire canvas,
with nearest-neighbor resampling and transparent letterboxing; it does not detect
or register a character. Check its display metadata. Raw mockup bytes are retained.

Before sheet dispatch, submit a review of that exact accepted mockup:

```json
{
  "mockup_sha256": "COPY_THE_ACCEPTED_MOCKUP_SHA256",
  "reviewer": "actual reviewer label",
  "native_size_viewed": true,
  "findings": {
    "identity": "pass",
    "facing": "pass",
    "proportions": "pass",
    "pose": "pass"
  },
  "notes": "Actual observations from the source/candidate comparison."
}
```

```sh
python -m forge image-pair review-mockup --root ./image-jobs --key KEY --review-record ./review.json
```

Each finding accepts `pass`, `fail` or `uncertain`. Do not copy `pass` without
inspection. Missing, stale, failed or uncertain review blocks sheet dispatch
before any provider call. A mockup revision invalidates the old review and active
sheet. Records remain immutable in history. Reviews are caller-reported visual
judgments, not provider attestations, owner approval or an anatomy classifier.
Both regular MCP and the private native stdio bridge accept the same
`action="review-mockup"`, `review_record={...}` fields.

## Native checks and exact locks

Checks run on the final native grid after both acceptance and explicit
normalization. A failure retains raw bytes and moves the job to `needs_revision`.
Normalization cannot bypass palette or identity checks. No automatic palette
mapping, clipping repair, frame rescaling or provider retry takes place.

- Palette: each visible RGB value must belong to the selected source palette.
  Membership does not prove correct color placement or identity.
- Baseline: the lowest opaque pixel must equal annotated `baseline_y`.
  This is not recognized footwear or proof that both feet are planted.
- Height: visible silhouette height must lie within the annotated range.
  This is not a head/body or anatomical proportion measurement.
- Exact identity: optional selected RGBA pixels must match their pinned source
  after the declared integer translation, including transparent pixels.

An optional per-frame lock has this form:

```json
{"identity_locks": [{"source_reference":0, "mask_reference":4, "offset":[0,0]}]}
```

Its source is native-frame-sized. Its mask is a same-sized, nonempty static binary
L/1 PNG: white selects immutable pixels. This is the opposite polarity to a
revision edit mask, where white means editable. A mask may not also serve as an
appearance/palette/pose/identity source. Offsets that move protected pixels outside
the native cell fail preflight. Masks and offsets are human annotations; do not
invent reliable semantic segmentation when overlapping parts are ambiguous.
Selected lock pixels must also have binary alpha, and selected opaque colors
must belong to the declared palette. Contradictory exact-lock requirements fail
before generation; invisible RGB values are not treated as palette members.
Overlapping locks may agree on a pixel; conflicting RGBA requirements at one
native target pixel are rejected before generation.

Missing baseline, height or identity annotations are explicitly `unverified`.
Unknown annotation keys fail preflight. A mechanically passing sheet remains
`REVIEW_ONLY`; its identity, facing, proportions and motion still need ordered-frame
visual review. Final animation export retains its existing manifest/review gate.

For a bounded generated-sheet correction, use existing `revise --edit-mask ...
--max-changed-pixels ...`. Forge checks the exact locked-pixel contract after
generation; a prompt mask alone cannot guarantee preservation. Always include
both old and new footprints when a part moves. A rejected correction never
overwrites the previous accepted image.

## Review artifacts and limits

The returned `previews` map links hash-checked immutable artifacts:

- `comparison`: source seed above candidate, native 1× and nearest 2× on light/dark
- `atlas` and `atlas_metadata`: exact native cells, frame order, durations and pivots
- `playback`: self-contained offline HTML with 1×/2×/4×, pause, forward/back and backgrounds
- `motion_report`: measured bounds and duplicates, with semantic limits explicit

Previews may also be supplied for a mechanically rejected native candidate; inspect
its validation status rather than treating a preview as acceptance. Invalid-grid
raw results are retained without guessing a layout. Uniform integer block-mode
reduction and alpha thresholding are recorded as derivations; either can discard
detail. Explicit nearest-neighbor normalization remains labeled lossy.

Consistency jobs preflight a 1,048,576-pixel native-sheet preview budget, at most
64 identity locks overall, at most 65,536 combined source palette colors, and a
16,000-character serialized consistency contract. Existing source/file/grid limits
still apply. These limits are checked before provider dispatch. Native-size
inspection does not imply a game-engine playback test has run.
