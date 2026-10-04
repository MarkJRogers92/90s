# Bargain Hunter hurt strip (GPT image, converted)

`shopper-hurt.png` is what ships as `public/assets/neon/enemies/shopper-hurt.png`: 4 frames
(impact, peak recoil, rebound, settle) × 8 facings at 96 px, rows in `ACTOR_DIRECTION_ORDER`.
It replaced the derived strip (the walk frame squashed and stretched). Roadmap V1.

**Status: review-only art.** Pixel Forge's checks and `check_sheet.py` cover format and
registration, not drawing quality. A person has looked at it at preview size only.

## How it was made (2026-10-04)

1. **Job.** `job-spec.json` is the Pixel Forge `image-pair` spec (`tools/pixel-forge`,
   `docs/GPT_IMAGE_PAIR.md`). The references were `shopper-walk.png` and `shopper-attack.png`.
   The prompt spells out the character (an *undead* shopper: grey slack-jawed face, hollow eyes,
   red-and-white head wrap, green knee stains, tan paper bag in the left hand). A first job with
   a shorter prompt came back as a healthy man with a mustache: Codex rewrites the prompt in its
   own words and dropped those traits.
2. **Generator.** The native Codex bridge (`tools/pixel-forge/docs/CODEX_NATIVE_BRIDGE.md`),
   signed in with a ChatGPT plan, orchestrator model `gpt-6.1-sol`. Two stages, one image each:
   a mockup of the south-facing peak recoil, then the full sheet.
3. **Raw output.** `gpt-sheet-raw.png`: 887 × 1774 px, a 4 × 8 grid drawn at 2.31 × the game's
   scale with soft edges. Pixel Forge rejected it (`dimensions_not_exact_or_uniform_integer_
   enlargement`), and its `normalize` step needs a whole-number grid, so the conversion is local.
4. **Conversion.** `convert_gpt_hurt.py` (re-runnable, no spend): area-average to 384 × 768,
   hard alpha, register each facing row like `art/pixellab/check_sheet.py` (frame 0's box centre
   and floor row match the walk sheet), nudge a frame only if it would leave its cell, and
   recolour southeast frame 0's cream bag (copied from the old walk art) to the row's tan.

`art/enemy-reactions/materials/build_material_reactions.py` copies `shopper-hurt.png` into
`public/`, so a rebuild keeps this art. `tests/unit/shopper-hurt-art.test.ts` pins the copy, the
format, the registration and a flung-arm peak recoil.

## Checks

- `python3 art/pixellab/check_sheet.py art/enemy-reactions/shopper-hurt/shopper-hurt.png
  public/assets/neon/enemies/shopper-hurt.png --frames 4`: feet and centre off by 0 px in all
  eight facings. It warns on the west and east rows ("mean colour off by 31 and 33"). That is
  the bag: the walk frames there carry none. Without the bag pixels the difference is 14 and 19.
- Hard alpha only (0 or 255). Lowest opaque row is 94 or 95 in every frame.

## Known review items

- The figures read a little stockier and more shaded than the lean walk figure. The shipped
  attack sheet is the same.
- The walk sheet draws a cream bag in the south-west and south-east rows and none in the west
  and east rows. The hurt strip uses the tan bag of the attack sheet in all of them.
- The east row's bag side (the far hand when facing east) was not checked against the attack sheet.
- The chest mark is a brown stain; the walk art has a dark checkered patch.

## To redo it

Change `job-spec.json` (or its prompt) and run a new Pixel Forge job under a new `revision`; a
job allows at most 3 follow-ups, and a continuation job can start from the best accepted image.
Replace `gpt-sheet-raw.png`, run the converter, then `build_material_reactions.py`, then the
tests. Look at every facing next to the walk sheet before keeping it.
