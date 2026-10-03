DEAD MALL — Mannequin reactions and plastic breakup

94 native animation frames: 32 hurt, 56 death, 6 material-impact.
Eight genuine facing rows: S, SW, W, NW, N, NE, E, SE.

Actor art: 96x96 untrimmed cells; hurt384x768, death672x768.
Display: existing72px. Runtime anchor: (48,80.64), unchanged.
Hurt timing:3,3,4,4 simulation ticks,14total. Death:4ticks/frame,28total.
Existing corpse hold70ticks and final24tick fade remain renderer-owned.
Aseprite durations are rounded milliseconds:50,50,67,67; death67each.
The editor pivot slice is rounded to(48,81); runtime uses exact(48,80.64).

Original idle facings supply every body pixel. Head, jacket/arms, thighs,
and shins are articulated independently in actual Aseprite1.3.18.6.
No whole-body rescale; no model-generated anatomy in these final assets.
Each hurt pose retains original foot pixels, and its final frame exactly
matches its source idle. Death pieces remain inside transparent margins.
Source body proportions/palette are retained, with small hand-pixel plastic
chips and fracture detailing. Side and diagonal views use their actual source
facings. Right-facing rig calculations reflect coordinates temporarily and
restore them; they do not substitute mirrored left-facing source artwork.

Impact strip:48x48 cells,6frames,2ticks/frame, center(24,24), no loop.
Angular beige plastic pieces with dark edges, no white flash or universal ring.
Authored by actual local Forge DSL; editable Aseprite source included.

Validation:
- All88 actor frames checked for margin-safe bounds.
- Eight unique direction rows in both actor sheets.
- Hurt feet and recovered idle compared byte-for-byte to original source.
- Actual Aseprite export/import pixel equality for all three animations.
- Forge Sprite engine RGBA roundtrip for both actor atlases.
- All six impact DSL programs replayed and compared against exported pixels.
- Binary alpha for all runtime PNGs.

The included motion video is an offline art review, not a gameplay capture.
It renders the exact60Hz tick sequence, existing corpse hold/fade, original
72px display scale plus2x inspection, light and dark backgrounds.
Runtime integration and tests are documented with the separate source patch.

Sources: mannequin-idle.png is the unchanged existing DEAD MALL sprite.
Two earlier image-generation concept studies were rejected for identity drift.
Their pixels are not used. This pack contains only source-locked final art.
Actual source-script, frame contracts, validation and hashes are included.
No Mac access, paid-provider checkout, source push, merge, or deployment.
