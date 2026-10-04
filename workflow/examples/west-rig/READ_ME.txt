WEST RIG: THE FROZEN BENCHMARK AS A FORGE RIG + POSE RECIPE

FILES
import_freeze.py   one-time import of the frozen refined-WEST frames into rig.json + recipe.json + parts/
rig.json           forge-rig/1: slots body, shoes, head, hand, bag; joints; labels; limb chain
recipe.json        forge-pose/1: the six frozen frames (re-renders them pixel-identically)
improve.py         recipe-only improvement: two derived bag variants, frame 5 head tilt 14
rig-v2.json        rig.json plus the two derived bag variants
recipe-v2.json     the improved charge (frames 0-3 unchanged)
import-report.json what the import measured, and the one bag-grip joint it had to move

RUN (from workflow/forge-source, with the tested environment)
  ../../forge-source/.venv/bin/python ../examples/west-rig/import_freeze.py   # optional: rebuild the import
  bash ./forge.sh rig-render ../examples/west-rig/recipe.json --out ../../west-rig-render
  bash ./forge.sh animation-export ../../west-rig-render/manifest.json --out ../../west-rig-export --review
  .venv/bin/python ../examples/west-rig/improve.py
  bash ./forge.sh rig-render ../examples/west-rig/recipe-v2.json --out ../../west-rig-v2
  bash ./forge.sh animation-export ../../west-rig-v2/manifest.json --out ../../west-rig-v2-export --review
  bash ./forge.sh rig-preview ../../west-rig-v2 --out ../../previews-v2
Output directories must not exist (nothing is overwritten).

WHAT THE IMPORT IS
Every pixel comes from the frozen inputs. Head: the exact source head (the renderer checks it
against the walk sheet) and the 8/10/14 degree tilts, recorded as derived variants that the
renderer recomputes and compares (all three match the frozen tilts with 0 differing pixels).
Shoes 0-3: one planted variant. Hand and bag: own slots, cut by the frozen hand and grip patches
(bag = tan pixels within 6 px of the grip, plus their outline). Body: the remaining pixels per
frame, recorded as authored art. Joints from the frozen manual annotation are imported once.
In frame 1 the annotated bag grip sat on a pixel the hand also claimed; it moved 1 px to the
nearest bag pixel (import-report.json).

ROOT OFFSETS
Frames 0-3 stand still (the game does not move the Bargain Hunter during its warning). Frame 5's
root is -91 px: 9 px/tick charge speed x 8 ticks per frame, at the renderer's 96/76 sprite scale.
These come from pinned game constants, not a live capture.

LIMITS
Rig labels (which slot is the anatomical-left hand, who owns the bag) are human judgements made
once. The charge frames' feet are inside the body art, so their stance stays NOT_CHECKED.
Anatomy and visual quality need a person.
