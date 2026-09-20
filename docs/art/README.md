# DEAD MALL art production workspace

Scratch + tooling for producing DEAD MALL pixel art. Nothing here is wired into
the game repo (`~/Documents/Github Code/90s`) — the game currently draws
everything with Phaser `Graphics` primitives and has no asset pipeline at all.

## Settled decisions (2026-09-19)

| Question | Ruling |
|---|---|
| Internal viewport | **960×480 — the shipped code governs.** The art bible says 640×360 in three files and they have NOT been corrected. |
| Palette source | **`DEAD_MALL_APPROVED_ART_REFERENCE_PACK.zip`**, supplied by the user. Not yet received. |

Why the viewport mattered: 960×480 is 2:1 and 640×360 is 16:9, so 640×360 art at
1.5× would be 960×540 — 60px taller than the canvas. It is a crop, not a fit.

Why the palette mattered: the repo's "approved" palette board is a lossy
160×107 VP8 webp that decodes to 7,907 unique colours across 17,120 pixels.
Reading hexes off it would produce plausible, subtly wrong values.

## `tools/palette_report.py`

Gate any candidate palette source through this **before** trusting its colours.

```
python3 tools/palette_report.py IMAGE [--top N] [--gpl OUT.gpl] [--strip OUT.png]
```

| Verdict | Meaning | Remedy |
|---|---|---|
| `EXACT` | A few well-separated flat colours — the unique colours *are* the palette. | Use them. `--gpl` writes an Aseprite-readable GIMP palette. |
| `CONTINUUM` | Dominant colours near-duplicate but span a wide range — a gradient, photo or collage. | Not a swatch board. Quantise, or select swatch regions. |
| `NOISE` | Near-duplicates clustered in a *tight* band — one flat colour smeared by lossy encoding. | Get the lossless source. Do not quantise. |
| `QUANTISE` | More than 256 well-separated colours. | Needs reduction, not a direct read. |

`CONTINUUM` vs `NOISE` cannot be told apart by colour count or by clustering
alone — both have near-identical neighbours. **Spread** separates them, and the
remedies differ, so the distinction is load-bearing. See the gradient case in
the test suite, which caught this tool getting it wrong.

### Verified

```
python3 tools/test_palette_report.py     # 4/4 PASS
```

Cases are built from a *known* colour set, so expected answers are not guesses:
flat 8-swatch (EXACT, all 8 hexes recovered), `.gpl` round-trip (byte-exact),
single dithered colour (NOISE), 256-step gradient (CONTINUUM).

Real-input check — this is the board that nearly fooled a direct read:

```
$ python3 tools/palette_report.py 01B.webp
unique rgb  : 7907 (46.19% of 17120 px)
VERDICT     : CONTINUUM
```

## Next

1. ~~Receive the lossless pack.~~ **Done** — found at
   `~/Downloads/docs/art/reference-sheets/approved-2026-09-13/originals/`.
2. ~~Extract the palette.~~ **Done** — see "Palette extraction" below.
3. Author the Sheet 04 repeat-safe tile at **960×480** using
   `work/deadmall-global.gpl`. Unstarted.

## Palette extraction (2026-09-19)

The lossless masters were found at
`~/Downloads/docs/art/reference-sheets/approved-2026-09-13/originals/` — ten
1536×1024 PNGs. The zip that was supplied separately is byte-identical to the
repo's preview branch (same `01B.webp` SHA-256, `cmp`-identical docs) and adds
nothing.

`tools/extract_swatches.py` samples the `MAIN PALETTE (GLOBAL)` panel of
`01A_player_palette_portraits.png`: **19 ramps × 5 swatches = 95 values**.

```
python3 tools/extract_swatches.py ORIGINALS/01A_player_palette_portraits.png \
    --gpl work/deadmall-global.gpl --strip work/extracted-strip.png \
    --json work/deadmall-global.json
```

| Ramp | Step 1 | Step 5 |
|---|---|---|
| SKIN TONES | `#e8b696` | `#332128` |
| DENIM | `#788eb4` | `#111624` |
| MALL BEIGE/CREAM | `#ecd1ba` | `#1e1a16` |
| TILE GRAY | `#9198a5` | `#060a0e` |
| BLOOD/GORE | `#d54c3b` | `#210e12` |
| CORRUPTION (PURPLE) | `#7a6ea9` | `#1a1039` |
| CORRUPTION (GREEN) | `#85b170` | `#0c1812` |
| FLUORESCENT LIGHT | `#daeec7` | `#0f322c` |
| EMERGENCY RED | `#e7634b` | `#340d0f` |

(9 of 19 shown; the full set is in the `.gpl`.)

**Quality:** within-swatch spread mean **2.1**, worst **5** — the render's
swatches are near-flat, so these are accurate to ±1–5 per channel and match the
board visually.

Two structural traps, both guarded in the tool:
1. **The darkest step of every ramp is invisible to any brightness threshold.**
   Column 5 is recovered by extrapolating the regular pitch. It self-verifies:
   a mis-centred patch straddles two swatches, so its spread jumps — the
   extrapolated column returned the *lowest* spread (1.1 vs 2.2/3.0/2.3/1.7).
2. **The panel has a title line and a bottom rule,** so band count ≠ ramp count.
   Rows are chosen by arithmetic progression + band height, never by position.
   Both guards refuse and exit 2 rather than sampling a shifted grid.

**Not authoritative:** these are sampled from a rendered board, not
designer-authored hex. The canon explicitly does not treat dimensions, labels or
values baked into generated boards as validated metadata.
