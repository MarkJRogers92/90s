# DEAD MALL art production workspace

Scratch + tooling for producing DEAD MALL pixel art.

**CORRECTED 2026-09-22 — this file used to say the game "has no asset pipeline at
all". That is false and has been for a while.** Verified in the code: the game
loads 84 real PNGs from `public/assets/` via registries in
`src/game/assets.ts`, consumed by `MvpRunScene.preload()`. It is data-driven and
deliberately incremental — a registry entry with no art yet falls back to the
vector marker, so art can land one asset at a time. (The count, and the state of
every one of those files, is reported by `npm run art:gallery` — treat that as the
authority rather than this line.)

Two asset classes, and they load differently, which is the thing to know:

| Class | Example | Path | How it loads |
|---|---|---|---|
| World sprites | props, items, fx, enemies, Alex | `public/assets/{props,items,fx,enemies,characters}/` | Phaser textures, from `src/game/assets.ts`, loaded in `MvpRunScene.preload()` |
| UI art | character portraits | `public/assets/portraits/` | **DOM `<img>`** — the HUD is plain HTML, so these never touch Phaser |

So "produce art" is only half the job. An asset is *usable* when it is copied into
`public/assets/`, declared in the game, and covered by
`tests/unit/portraits.test.ts` (presence + declared size) and
`tools/validate_runtime_tree.py` (binary alpha + palette).

## `tools/make_art_gallery.py`

Renders the whole shipped art tree — every file under `public/assets/**` — into
one self-contained html page:

```
npm run art:gallery        # -> public/gallery.html, served at /gallery.html
```

The dev server then serves it at `http://127.0.0.1:5173/gallery.html`, and
`vite build` carries it into `dist/` with the game. It is **gitignored**: it is one
file with every PNG inlined as a data URI, so committing it would put a ~630 KB
blob diff on every art change for something nothing needs to read. A fresh clone
has the generator and not the page — one command, about a second. Because every
image is inlined it also opens straight off disk with no server at all.

It derives three things from the source rather than asserting them by hand, which
is why it sits alongside the other validators:

| Check | How |
|---|---|
| declared vs present | a file counts as declared when its `/assets/...` url appears in `src/`, or when its filename stem appears as a quoted string. The second rule is what catches the registries built from a helper — `decalArt('blood-drops')` and portraits' `` `${DIR}/${kind}.png` `` never write the filename out in full. **`.css` counts too**: the four HUD icons are named only in `src/styles.css`, because the run HUD is DOM rather than Phaser, and a `.ts`-only scan reports all four as undeclared art. |
| declared size vs the PNG | the tables that write `width`/`height` as literals are compared against the decoded PNG header |
| selected vs declared | every floor kind and wall piece that `FLOOR_ART` / `WALL_ART` / `STOREFRONT_ART` declares, against the kinds `FLOOR_FOR_ROOM_ROLE`, `FLOOR_FOR_STORE_TEMPLATE` and `SIGN_FOR_STORE_TEMPLATE` can return. A kind that is declared and drawn but reachable by no room is the case worth seeing. |

Tiles are shown genuinely tiled, because repeat-safety is a judgement made by eye
and a single 32×32 swatch hides it. Whether a wall piece may be shown tiled at all
is read from the `PIECES` table in `make_walls.py`, where `axes=None` means the
piece is *placed*: repeating a corner in a grid would claim a repeat-safety it was
never built for.

## Settled decisions (2026-09-19)

| Question | Ruling |
|---|---|
| Internal viewport | **640×360, and it is not in conflict with the code.** `src/game/view/viewport.ts` exports `VIEWPORT_WIDTH/HEIGHT = 640/360` and `src/main.ts` renders that. The 960×480 that appears throughout `src/sim` is the **world/room** size (`PLAYFIELD_WIDTH`, `ROOM_WIDTH`, `WING_WIDTH`), not a rival viewport — the camera shows a 640×360 window onto a 960×480 room. Do not "fix" the 960×480 world constants. |
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
