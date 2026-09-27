# Neon overhaul — how the mall is drawn, and how to extend it

Branch `claude/neon-overhaul`, forked from `codex/presentation-3quarter` (left
untouched as the comparison baseline). Target look: the user's DEAD MALL key
art — a dark 90s mall lit by neon and warm light pools, 3/4 storefronts with
lit interiors, blood on the floor, and an Isaac-style HUD.

## What changed and why

| Problem in the baseline | Change |
|---|---|
| Flat, evenly lit rooms; beige terrazzo everywhere | Multiply **lightmap** per room (ambient mood + light pools) with an additive **glow** layer and adaptive **bloom** |
| Only the opening had art; every other room was gray vector boxes | A data-driven **room dressing planner** themes all six room roles |
| Storefronts were shallow strips with Courier labels | 160 px **PixelLab storefront panels** on a 3/4 back wall, **procedural neon signs** in an original pixel font, with floor reflections |
| A scrolling 640x360 window onto a 960x480 room | A fixed **960x600 stage**: the whole room plus a 120 px storefront band, always on screen (Isaac framing) |
| Purple squares for enemies | PixelLab **8-facing sheets** for Hanger (skitter walk), Spitter, and the Loss Prevention Manager (stalk walk) |
| No hit feedback | **Damage numbers, blood decals, sparks, screen shake, hurt flash** |
| A debug-style DOM text strip | An in-canvas **game HUD**: portrait, hearts, hotbar with item icons, wing minimap, objectives, pickup log, boss bar, neon area title cards |
| Starting $30 was the only money in a run | **Mall Tokens** (gameplay): monsters drop change, the janitor sweeps it up, so fights fund shopping |

## Architecture

```
src/game/presentation/
  neon/pixelFont.ts            original 5x7 font: signs + HUD text
  neon/proceduralTextures.ts   lights, shadows, token, hearts, floors, neon signs, labels
  lighting/LightingLayer.ts    lightmap (MULTIPLY), flicker, adaptive bloom
  rooms/roomDressing.ts        PURE planner: WingRoomDefinition -> DressingPlan
src/game/view/
  MallRoomView.ts              draws a DressingPlan; owns lights, props, civilians
  CombatFeedback.ts            numbers, blood, sparks, shake (renderer memory only)
  MvpRunView.ts                actors, stores, tokens, dynamic lights
src/game/ui/
  gameHudModel.ts              PURE: run state -> hearts/objectives/minimap/hotbar
  GameHud.ts                   draws the model, screen-fixed
src/sim/run/tokens.ts          Mall Tokens (the one simulation feature)
```

Layer order (see `presentation/depth.ts`): floor → decals → back wall →
low props → **y-sorted props + actors** → railing → **lightmap** → **glow** →
effects/telegraphs (unlit, always readable) → prompts → HUD.

The simulation stays authoritative. The only sim changes are the Mall Tokens
and the Opening Concourse fountain, which is now authored collision
(`OPENING_FOUNTAIN`), placed south of the door lane.

## Extending it to the rest of the game

**A new variant of an existing room role** needs nothing: the planner covers
every authored collision rectangle with a prop chosen by the rectangle's shape
and the room's theme (`coverWall`). `tests/unit/room-dressing.test.ts` fails if
any wall is left uncovered, any decor blocks a doorway lane, or a texture is
unregistered.

**A new room role** (e.g. a parking garage, a cinema auditorium):

1. Add a theme function in `roomDressing.ts` returning a `DressingPlan`:
   storefront panels for the back wall, floor style, ambient colour, props,
   lights, neon. Keep ambient darker the deeper the room is in the shift (a
   test asserts the mood progression).
2. Add it to `planRoomDressing`.
3. If it needs new art, generate it (below) and register it in
   `FACADE_TEXTURES` / `PROP_TEXTURES`.

**A new store template**: add an entry to `STORE_LOOKS` (panel, neon colour,
subtitle, interior floor, shelf fixture). The sign text is always the store's
simulation name, so HUD, sign and shop logic can never disagree.

**A new enemy kind**: generate an 8-direction PixelLab character, animate it,
pack it with `pack_character.py`, add it to `ENEMY_TEXTURE_KEYS` and
`enemySpriteSheet`.

## Art pipeline

All runtime art is local under `public/assets/neon/`, listed with source and
sha256 in `public/assets/neon/manifest.json`.

```bash
# promote sources in docs/art/neon-overhaul/pixellab/ (+ the earlier art pass)
python3 docs/art/neon-overhaul/import_assets.py --legacy <extracted public/assets>
# pack a PixelLab character export into a walk sheet (8 rows, game facing order)
python3 docs/art/neon-overhaul/pack_character.py <export dir> <animation> <out.png>
```

The `--legacy` tree is `public/assets` from `codex/pixellab-aseprite-proof`
(`git archive codex/pixellab-aseprite-proof public/assets | tar -x -C /tmp/pl`).

PixelLab recipe that produced consistent storefronts (`create_map_object`,
`low top-down`, 288x160 or 256x160, high detail, detailed shading, selective
outline):

> 1990s shopping mall **\<kind of store\>** front seen from slightly above,
> **\<what is in the windows\>**, **\<interior light colour\>**, dark pillars on
> both sides, open doorway in the middle, **blank dark sign band across the top**

The blank sign band matters: text is never generated. Signs are set in the
pixel font by `ensureNeonSign`, so they are always legible and always match
the simulation's names. Props use `high top-down` at roughly the size they
will be displayed.

Generation spend for this pass: 62 PixelLab generations (1,215 → 1,153 remaining in the cycle).

## Checking the look

```bash
VITE_ENABLE_DEBUG_BRIDGE=true npx vite --host 127.0.0.1 --port 4180 --strictPort
node scripts/capture.mjs http://127.0.0.1:4180 artifacts/neon-overhaul opening storefront foodcourt boss
node scripts/playtest-fight.mjs http://127.0.0.1:4180 artifacts/neon-overhaul
```

Both scripts launch Chromium on the Metal GPU so captures include bloom.
Bloom is skipped automatically on software renderers (headless CI), and
dropped at runtime if a real device cannot hold 45 fps.

## Known gaps / next steps

- Alex's portrait is the earlier pass's grunge "teenager" bust; a portrait
  generated from Alex's sprite came back wearing a modern face mask and was
  rejected. A purpose-made portrait is a good next PixelLab job.
- The DOM status bar above the canvas is still required by the browser tests
  (HP/cash/room/objective must stay visible there); it now duplicates the
  in-canvas HUD. Folding it into an accessible off-canvas panel is the next
  UI cleanup.
- Earlier modes (Start shift, Lab, Shoplifting Loop, Void the Warranty) keep
  their original presentation; Night Shift is the game.
- Physical-device, Safari and Windows performance are untested.
