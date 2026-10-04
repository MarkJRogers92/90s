# Pixel Forge: rig + pose recipe authoring (4 October 2026)

This is the follow-up to the Pixel Forge improvement handoff. The frozen package is unchanged
(`sha256sum -c SHA256SUMS.txt`: 0 failures), and all work was done in a copy.

> **Slim package.** This zip holds only the new work and what it needs to run: the patched Forge
> source, `workflow/examples` (including the frozen manifest inputs), `frozen-asset/`,
> `evidence-rig/`, the patch and these notes. The historical `authoring/` and `evidence/` folders,
> `SHA256SUMS.txt` and `SNAPSHOT_PROVENANCE.json` are unchanged, so use them from the original
> handoff zip. Render and export folders are recreated by the commands below.

## Diagnosis (short)

Forge's `animation-export` checked finished frames and published them safely, but nothing in
Forge authored a pose. Identity, limbs, poses, contact, occlusion and who holds the bag all
came from outside Forge:

- 14 one-off scripts, about 730 lines, with about 540 hard-coded coordinates;
- 34 hand-typed anchor points and 27 hand-made reference images in the manifest.

Every fix was a new script, and the checker could only confirm what had been declared.

## What changed in the tool

All changes are in `workflow/forge-source`; `PATCH-forge-source.diff` is the full diff against
the frozen source.

1. **`forge/rig.py`**, new, with two schemas:
   - **forge-rig/1**: a character facing taken apart once into slots (head, body, hand, bag,
     shoes, and so on). Each slot has variants, joints, a parent joint, draw order, labels,
     prop ownership, contact flags and limb chains.
   - **forge-pose/1**: per frame, which variant each slot shows, integer nudges, the root's
     ground offset, which feet are planted, and bounded repair layers (mask, pixels, reason).
2. **Deterministic renderer.** Integer placement only: no resampling, no blending, binary alpha.
   It refuses mirrored variants on asymmetric rigs, and pinned inputs fail closed.
3. **Provenance is a type, and it is verified.**
   - A `source` variant is compared with the walk sheet pixel by pixel.
   - An `authored_variant` (a rotation) is recomputed and must match exactly.
   - `authored` art must carry a note.

   Locks are named `source:` / `authored-variant:` / `authored:` according to that type, never
   by convention.
4. **The renderer writes the checked-export manifest itself.** Anchors, part masks, identity
   locks (only the pixels actually visible, plus a variant's declared clear border), attachments,
   limb ranges (measured from the rig's rest pose), planted-contact intervals and root offsets
   are all derived. That is zero per-frame hand annotation. The output then goes through the
   **unchanged** `animation-export`.
5. **`rig-variant`.** Derives a rotated variant with nearest-neighbour or **RotSprite** (Scale2x
   three times, then rotate, then sample; the public algorithm, about 20 lines, no new
   dependency). Joints follow their own pixel, using an index image run through the same
   rotation.
6. **`rig-preview`.** Stills at 1× and 2×, plus in-place and ground-relative motion, as GIF and
   as exact-timing APNG.
7. **Generic native document builder.** `native/build.lua` is written with every render (one
   layer per slot plus a repair layer, with frame durations); `rig.build_native()` runs it.
   **This was not run here, because there is no Aseprite in this environment.**
8. **Checker extensions**, backwards compatible (the frozen export reproduces with identical
   checks and findings):
   - a stance interval may declare its phases, so a planted foot can be checked in a charge
     frame (airborne is never allowed);
   - `ATTACHMENT_TOUCH`: the hand and prop pixels must actually meet;
   - `owner_source: rig` replaces six per-frame owner findings with one rig-label finding. That
     finding is still unverified, and it requires pinned `rig_provenance`.

**Tests:** 174 passed / 2 skipped before, **202 passed / 3 skipped** now. The new skip is the
Aseprite round trip, which runs only where Aseprite exists. Each new behaviour had its test
written first and watched fail, with one exception: the very first rig tests failed only because
the module did not exist yet, not behaviour by behaviour.

## What changed in the benchmark

All in `workflow/examples/west-rig`.

**Import (`recipe.json`).** The frozen WEST animation as a rig re-renders **all six frames
pixel-identically**, and the unchanged checked export gives a technical pass.

| | Frozen manifest | Rig import |
|---|---|---|
| Manual-review findings | 10 | **4** |
| Bag-owner findings | 6 (one per frame) | 1 rig label |
| Root motion | unverified | world contact checked, pass |
| Charge frames 4–5 stance | not checked | not checked (feet are inside the body art) |
| Identity-lock checks | 10 | 28 (every part pinned) |
| Hand-touches-bag check | none | 6 (all pass) |
| Head tilts 8/10/14° | named "authored variant" | recomputed from the source head: 0 differing pixels |
| Per-frame hand annotations | 34 anchors | 0 (one bag-grip joint moved 1 px at import, recorded) |

**Improvement (`recipe-v2.json`, `improve.py`, 31 lines, 0 coordinates).**
- Two RotSprite bag variants: the bag swings 6° on the push-off and trails 16° on the reach.
- The reach frame reuses the existing 14° head tilt.
- 0 repair pixels, 0 new painting, 1 manual coordinate (frame 5's root offset).
- Technical pass, with the same 4 findings.

The visible change is **modest**: secondary motion on the bag and a stronger lean on the reach.
Torso/arm variation and trouser shading are unchanged, because they need painting, which the rig
records as authored art. It does not create that art.

**Evidence** (`evidence-rig/`):
- `frozen-vs-v2.png`: same scale, 2× and 1×;
- `v2-in-place-2x.gif` / `.apng.png`;
- `v2-ground-relative-2x.gif` / `.apng.png`;
- 1× strips;
- export reports for the reproduced freeze, the rig import and v2.

## Commands

From `workflow/forge-source`, with `.venv` built from `requirements-tested.txt`:

```bash
.venv/bin/python -m pytest -q tests                                        # 202 passed, 3 skipped
bash ./forge.sh rig-render ../examples/west-rig/recipe.json --out ../../west-rig-render
bash ./forge.sh animation-export ../../west-rig-render/manifest.json --out ../../west-rig-export --review
.venv/bin/python ../examples/west-rig/improve.py
bash ./forge.sh rig-render ../examples/west-rig/recipe-v2.json --out ../../west-rig-v2
bash ./forge.sh animation-export ../../west-rig-v2/manifest.json --out ../../west-rig-v2-export --review
bash ./forge.sh rig-preview ../../west-rig-v2 --out ../../previews-v2
# With Aseprite installed:
.venv/bin/python -c "from forge import rig; rig.build_native('../../west-rig-v2', '../../west-v2.aseprite')"
bash ./forge.sh animation-export ../../west-rig-v2/manifest.json --out ../../west-v2-native --review --document ../../west-v2.aseprite
```

## Native check

`FOR_GPT_NATIVE_CHECK.md` and `run_native_check.sh` (package root) run the three Aseprite checks in one command where Aseprite is installed.

## Limits (honest)

- **Not run here:** the native Aseprite build and round trip. Run the last two commands on a
  machine with Aseprite before trusting the generated `build.lua`.
- **Rig labels are human judgements.** Which slot is the anatomical-left hand, and who owns the
  bag, are labelled once on the rig. The labels are not anatomical proof, and anatomy and
  quality still need review.
- **Root offsets** come from pinned game constants, not a live capture.
- **Seams:** there is no joint seam-fill rule yet. The bag and head rotate freely, so nothing
  showed a seam; posing limbs will need one.
- **Other facings:** none attempted. The brief says to seek review first.
- **Environment:**
  - Python 3.11 here, not 3.12.
  - The tested requirements were installed into a local `.venv`, as approved.
  - SciPy was installed but isn't used.
  - No dependency was added to Forge, and PixelLab was not called.

## Suggested next steps

1. **Run the native round trip** with Aseprite (the two commands above).
2. **Split the charge legs and shoes into slots** in frames 4–5. That would let planted-foot
   checks cover the charge, and let the stride be re-posed from the recipe.
3. **Add a joint seam rule** (connector pixels from the source palette) before posing limbs by
   rotation.
4. **Add a shading operation** (source-colour planes inside a mask) to address the trouser and
   torso critique without hand painting.
5. **Get a review of the WEST rig, then build NW and SE from the same rig**, where the bag hand
   failed before; the rig makes bag ownership structural.

The game side is separate. In DEAD MALL, `attackFrameFor` now keeps the release frames during an
active charge. It is on the branch `fix/charge-attack-frames` and is not merged.
