# ChatGPT image-generation test — DEAD MALL

Purpose: decide whether ChatGPT's image generation can feed this project, **before**
anyone builds an automation bridge. One question, answered with numbers:

> Is the output true pixel art (recoverable grid, tiny palette) — or a smooth render
> that only looks pixelated?

If it is a smooth render it can still be a **reference**, but it can never be a **pixel
source**, and a bridge would be wasted effort. This was settled the same way for the
approved boards.

## Calibration — why the test is decisive

The analyzer was run against known material first, so the pass/fail line is measured:

| Source | Colours | Verdict |
|---|---|---|
| `floor-tile-accent-32.png` (ours) | 4 | TRUE pixel art, native 1:1 |
| `floor-carpet-32.png` (ours) | 6 | TRUE pixel art, native 1:1 |
| `vending-machine.png` (ours) | 29 | TRUE pixel art, native 1:1 |
| `01A_player_palette_portraits.png` (approved board) | **282,664** | SMOOTH RENDER |

The gap is four orders of magnitude — 29 versus 282,664. There is no ambiguity to
argue about.

## What to do (~5 minutes)

1. **Use your PERSONAL ChatGPT account**, not work. New chat.
2. Generate three images, one at a time. Prompt to copy:

   > Pixel art sprite for a 1990s shopping mall roguelike, viewed from a 3/4 top-down
   > angle. TRUE pixel art: 32x32 pixels, hard edges, no anti-aliasing, no gradients,
   > no glow, limited palette of about 8 colours, flat shading, transparent background,
   > at least 8x zoom so individual pixels are square and visible.
   >
   > Subject: **a mall bench**

   Repeat with: **a vending machine**, and **a potted plant**.

   (Vary the subject; keep everything else identical so the three are comparable.)

3. **Download the original file** — use the download button. **Do not screenshot.**
   A screenshot is rescaled and re-compressed, which destroys exactly the property
   being measured.

4. Save the downloads into this folder (`~/deadmall-art/work/chatgpt-test/`).

## Then run

```sh
python3 ~/deadmall-art/tools/audit_pixelart_source.py ~/deadmall-art/work/chatgpt-test
```

## Decision rule

- **Small colour count + a recoverable grid** → compatible. Building a bridge is
  justified.
- **Hundreds/thousands of colours** → reference-only, same as the approved boards.
  Do not build a bridge for shippable assets.
- **Ambiguous middle** → look at it by eye at 1x before deciding.

## What is measured

- **Colours** — unique opaque RGB values. Primary discriminator; needs no calibration.
- **Grid / rmse** — for each block size k, NEAREST downscale-by-k then upscale-by-k;
  RMSE near 0 means k is the true pixel grid. Useful when output is upscaled pixel art
  (e.g. a 1024px image on a 32px grid shows `grid=32, rmse~0`).
- **palΔ** — mean distance from each pixel to the nearest of our 95 palette colours.
  Ours measure 0.0; the approved board measures 8.0.
