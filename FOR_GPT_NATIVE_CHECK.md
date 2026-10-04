# For GPT: run the Aseprite checks on the Pixel Forge rig work

The rig work was built where Aseprite was unavailable, so three things are **untested**:
- the 3 native tests, which were skipped;
- the generated layered document (`native/build.lua`, built by `rig.build_native`);
- the native verification in the checked export (`--document`).

You have Aseprite, so please run:

```bash
unzip Pixel_Forge_Rig_Improvement_20261004.zip -d pf-rig && cd pf-rig
ASEPRITE_PATH=/path/to/aseprite bash run_native_check.sh
```

## Expected results

- **pytest:** every test passes with **no skips**. The baseline was 202 passed and 3 skipped
  without Aseprite.
- **frozen-native:** `pixel_exact=True`. This is the frozen baseline, and it is unchanged by
  this work.
- **v2-native:**
  - `status=review_only`;
  - `technical=pass`;
  - `pixel_exact=True`;
  - durations `0.142, 0.142, 0.142, 0.141, 0.133, 0.133`;
  - manual review lists exactly 4 items: `NOT_CHECKED` for frames 4 and 5 stance,
    `PROP_OWNER_RIG_LABEL:rig:bag` and `SEMANTIC_ANATOMY`.
- **Visual check:** open `native-check-*/west-v2.aseprite` and confirm:
  - one layer per part, drawn in this order: `body (10)`, `shoes (20)`, `head (30)`,
    `bag (35)`, `hand (40)`;
  - 6 frames;
  - moving a cel in the bag layer moves only the bag.

## If something fails

Fix only the failing thing, add a test that reproduces it first, and keep everything else as it
is. The rules from the original handoff still apply:
- never overwrite the freeze or any output directory;
- no PixelLab;
- no new services or dependencies without asking;
- never label a result approved.

The most likely suspect is `_native_script()` in `workflow/forge-source/forge/rig.py`, which
generates the Lua using `Sprite`, `newEmptyFrame`, `frame.duration`, `newLayer`, `newCel` and
`saveAs`. Report back:
- the pytest summary;
- the two JSON summaries the script prints;
- a screenshot of the layers panel;
- any patch, as a diff against `workflow/forge-source`.
