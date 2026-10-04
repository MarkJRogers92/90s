# Bargain Hunter shoulder charge: finished candidate (REVIEW ONLY, not approved)

`final/bargain-hunter-charge-768x1024.png` has rows S, SW, W, NW, N, NE, E, SE and columns 0–5
(wind-up 0–3, charge 4–5), in 128 px cells. The 96 px source figure is padded by 16 px and is
**not** enlarged.

- **Timing:** 142/142/142/141/133/133 ms.
- **Layout:** `final/timing-and-layout.json`.
- **Per-facing strips:** `final/facings/` holds a strip, an in-place 2× loop and a
  ground-relative 2× loop for each facing. In the ground-relative loops, frame 5 sits 91 px
  along the facing: 8 charge ticks × 9 px, at the 96/76 sprite scale.
- **Rebuild:** `scripts/build.sh` rebuilds the sheet byte-identically from `inputs/`.

## What changed, by facing

| Facing | Source of the frames | Changes |
|---|---|---|
| S, SW, N, NE, E | the pilot | wind-up shoes planted: frame 0's shoes copied into frames 1–3 |
| W | rig v3 (`recipe-v3.json`, frozen-benchmark lineage) | torso lean, bag swing behind the hand, push-off toe grounded; frames 0–3 equal the frozen benchmark |
| NW | the pilot, plus the approved frame-3 repair | frames 1, 2, 4, 5: the bag and near (anatomical-left) hand are pulled in 11 px left and 3 px up toward the hip, the same method as the approved frame-3 repair; frame 3 **is** that repair; shoes planted |
| SE | the pilot | **the bag no longer switches hands.** Frames 1–3: the bag hangs from the far (anatomical-left) hand *behind* the body, as in frame 0, and the near hand is empty. Frames 4–5: the trailing bag arm is tucked behind the torso with a sealed outline, while the near arm reaches forward across the chest. Shoes planted. |

The pilot had the bag **switching hands mid-animation** in two facings:
- **NW:** near hand in frame 0, far hand in frames 1–5.
- **SE:** far hand in frame 0, near hand in frames 1–5.

Both now keep it in one hand.

## Machine checks (`final/sheet-report.json`)

These pass for all 8 facings:
- **Planted feet:** the shoes change 0 px from frame 0 to frames 1–3.
- **Floor:** the lowest pixel is on row 111 in all 48 frames.
- **Pixels:** binary alpha, and 0 colours outside the source walk palette.
- **Clean edges:** no detached islands under 8 px.
- **Distinct strides:** frames 4 and 5 differ by about 1,900–2,800 px in every facing.

The game's `check_sheet.py` measures the feet height at 0 px from the walk sheet in every row.
The shoe centres land within 1 px of the walk sheet in six rows. In NW and SE, the overlay shows
about 1–2 px; the larger automatic figure there was the detector mixing up the bag and a shoe.

## Needs a person (this is not finished art until reviewed)

1. **Arm anatomy in NW and SE.** The bag is now held consistently, but the arms are the pilot's
   art, moved and reordered in depth, not newly drawn limbs:
   - **SE charge (frames 4–5):** the far arm behind the torso is a subtle reading at game size.
   - **NW:** whether the reaching arm reads as the near-left arm depends on the frame-3
     convention; follow it or overrule it.
2. **Newly drawn limbs, trouser shading and torso/arm variation** in the pilot rows (S, SW, N,
   NE, E) are unchanged pilot art. This session had **no image generation**, and PixelLab was
   excluded, so nothing was redrawn from scratch. Those rows still need a drawing pass, ideally
   from the GPT bases. Register the result as authored art.
3. **Identity drift:** the pilot's faces and proportions vary a little between facings; review
   them against `inputs/shopper-walk.png`.
4. **The bag's colour** is cream in some facings and tan in others, inherited from the pilot and
   the source.
5. **Native document:** `native/build.lua` builds a 48-frame, three-layer document (the finished
   candidate, the pilot as a hidden reference, and a hidden guide of changed pixels), with one
   tag per facing and the timings above. It **was not run here**, because there is no Aseprite.
   Run it, then compare the frames with the PNG sheet.
6. **Game integration** is not done and not authorised. When approved, check:
   - the shopper's attack sheet key `neon:enemy:shopper-attack`;
   - that the row order matches `ACTOR_DIRECTION_ORDER`;
   - that the active charge alternates frames 4/5 every 4 ticks (already merged in PR #59);
   - a live game-scale capture.

Only W has a rig and recipe (rig v3). The other rows are pinned PNG edits with scripts, not rigs
yet.
