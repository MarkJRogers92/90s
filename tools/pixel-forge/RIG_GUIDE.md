# Rig authoring guide (forge-rig/1 + forge-pose/1)

This guide is for agents and artists. A **rig** takes a character facing apart once. A **pose
recipe** says what each frame shows. `forge rig-review` turns a recipe into checked, previewable,
layered output. Nothing in this workflow approves art: a person still judges anatomy, labels and
motion.

## The loop

```bash
cd tools/pixel-forge          # FORGE_PYTHON=... or ./.venv or python3 is used by forge.sh
bash ./forge.sh rig-review path/to/recipe.json --out ./review-001 [--baseline ./review-000/render]
```

Read `review-001/SUMMARY.md`, then look at:
- `previews/in-place-2x.gif` and `previews/ground-2x.gif`;
- `previews/strip-1x.png` (game size);
- `compare-2x.png`, when you passed a baseline.

The exit code is 0 for a technical pass, 2 when checks failed (the review is still written) and
1 when the run was blocked. Use a new `--out` every time, because nothing is ever overwritten.

Exit 0 reports the technical art checks, not an unconditional native pass. Inspect the
summary's `native` status and pixel-exact result; use `run_native_check.sh` for a fail-closed
check of the bundled native regression fixtures.

## Rig (rig.json)

```json
{"schema": "forge-rig/1", "character": "bargain-hunter", "facing": "WEST", "canvas": [128, 128],
 "asymmetric": true,
 "sheets": {"walk": {"path": "parts/source-sheet.png", "sha256": "..."}},
 "root_slot": "body", "origin": [0, 0],
 "slots": {
   "body":  {"z": 10, "rest": "pose0", "variants": {"pose0": {...}}},
   "head":  {"z": 30, "attach": {"parent": "body", "parent_joint": "neck", "joint": "neck"}, "variants": {...}},
   "hand":  {"z": 40, "labels": {"side": "anatomical_left"}, "attach": {...}, "variants": {...}},
   "bag":   {"z": 35, "prop_of": "hand", "labels": {"owner": "near-side anatomical left hand"},
             "attach": {"parent": "hand", "parent_joint": "hang", "joint": "hang"}, "variants": {...}},
   "shoes": {"z": 20, "contact": true, "attach": {...}, "variants": {...}}},
 "limbs": [{"name": "near-arm", "chain": ["body.shoulder", "body.elbow", "hand.wrist"], "tolerance_px": 4}],
 "attachment_max_gap_px": 6, "contact_tolerance_px": 0, "edge_margin": [1, 1, 1, 1]}
```

**Names.** Slot, variant, joint and frame names use letters, digits, `-` and `_`. Slot names may
not start with `_`, which is reserved for repair layers.

**A variant** is `{"image": pin, "joints": {...}, "provenance": {...}, "domain": pin?}`:
- `image` is a pinned PNG with binary alpha.
- `joints` are pixel coordinates in that image. An attach joint may sit just outside the part;
  the `grip` joints must sit on opaque pixels.
- `domain` is an optional binary mask the size of the image. Its clear pixels stay protected too,
  which keeps a clean silhouette edge around a head.

**Provenance** is checked, never trusted:

| kind | what you claim | what rig-render verifies |
|---|---|---|
| `source` | `{"sheet": "walk", "at": [x, y]}`: these pixels are the sheet's | every opaque pixel equals the sheet at that offset |
| `authored_variant` | `{"of": "slot.variant", "method": {"op": "rotate", "degrees": d, "pivot": [x, y], "algorithm": "nearest" or "rotsprite"}}` | the image **and its joints** are recomputed from the base and must match exactly; no self-reference or cycles |
| `authored` | `{"note": "what this is"}` | only that a note exists, so it is new art for a person to judge |

Mirrored variants (`"mirrored": true`) are refused on asymmetric rigs.

**Make a rotated variant** (it prints the variant block to paste into the rig):

```bash
bash ./forge.sh rig-variant parts/bag-pose5.png --of bag.pose5 --joints '{"hang":[76,72],"grip":[80,71]}' \
  --rotate 16 --pivot 76,72 --algorithm rotsprite --out parts/bag-pose5-lag16.png
```

Rotate about the joint the part hangs from (here `hang`). A joint on the pivot never moves.
RotSprite keeps outlines continuous, while nearest-neighbour leaves gaps at small angles.

## Pose recipe (recipe.json)

```json
{"schema": "forge-pose/1", "rig": {"path": "rig.json", "sha256": "..."},
 "frames": [
  {"id": "0", "phase": "windup", "duration_ms": 142, "root": [0, 0],
   "pose": {"body": "pose0", "head": "source", "hand": "pose0", "bag": "pose0", "shoes": "planted"},
   "planted": ["shoes"]},
  {"id": "5", "phase": "charge", "duration_ms": 133, "root": [-91, 0],
   "pose": {"body": "pose5", "head": "tilt14", "hand": "pose5", "bag": {"variant": "pose5-lag16", "nudge": [0, 0]}},
   "hidden": ["shoes"], "planted": [],
   "repairs": [{"image": "<pin>", "mask": "<pin>", "reason": "neck seam"}]}]}
```

- Every slot is either posed or listed in `hidden`.
- `root` is the character's ground offset in sprite pixels. It drives the ground-relative
  preview and the world contact check.
- `planted` lists contact slots that stand still on the ground. The renderer turns runs of two
  or more planted frames into checked contact intervals.
- `grounded` lists contact slots that must touch the rig's `ground_y` in that individual
  frame, even when the foot moves between frames. Do not mark an airborne frame grounded.
- `repairs` replace pixels through a mask; transparent replacement pixels delete. Each repair is
  counted in `provenance.json` (`repair_pixels`), so keep it small and say why.

## What the generated checks mean

| check | meaning |
|---|---|
| `IDENTITY_CHANGED` per part | the visible pixels of every part equal its pinned variant: source parts are original, derived parts are their verified derivation |
| `ATTACHMENT_TOUCH` + `GRIP_DISTANCE` | the prop's pixels touch its owner's pixels, and the grip joints are close |
| `LIMB_REACH` | segment lengths stay within tolerance of the rig's rest pose |
| `CONTACT_DRIFT` | a planted contact keeps the same world position (local position plus root) |
| `GROUND_CONTACT` | the lowest contact pixel reaches the declared world floor within tolerance |
| `PROP_OWNER_RIG_LABEL` | **needs a person once**: is the rig's owner label right? |
| `SEMANTIC_ANATOMY` | **always needs a person** |

## Common errors

| error | fix |
|---|---|
| `SHA-256 mismatch` | an input changed; re-pin it, and re-pin the rig in the recipe when the rig changes |
| `does not match its recorded derivation` / `declared joints ... differ` | regenerate with `rig-variant`; don't hand-edit derived PNGs or joints |
| `visible pixels leave the canvas` | nudge the part, or give the rig a bigger canvas |
| `every slot must be posed or listed as hidden exactly once` | add the slot to `pose` or `hidden` |
| `ANCHOR_PART_MISMATCH` on a grip | the grip joint must sit on an opaque pixel of its own part |

The worked examples are the pinned rigs and recipes under `examples/west-rig/`. See
`examples/README.md` for the expected positive and negative fixture results.
