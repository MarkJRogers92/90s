# Alex hand anchors

The held-item attachment table is `src/game/view/alexHandAnchors.ts`. These are manually selected palm points inspected against the shipped PNG pixels, followed by a crosshair contact-sheet audit of every listed frame. They are not aim-angle/radial offsets.

## Coverage and frame coordinates

- Neon idle: 64 × 64, one row of eight facings.
- Neon walk: 64 × 64, eight rows of six frames.
- Neon swing: 92 × 92, eight rows of seven frames.
- Neon aim and dash: 92 × 92, eight rows of four frames each.
- Neon hurt: 92 × 92, eight rows of six frames.
- Legacy idle and walk: 32 × 48, respectively one row of eight facings and eight rows of six frames.
- Total: 280 frame entries. Death and unknown textures deliberately return no held-item anchor.

The table uses the actual frame layout: idle `[0][facing]`; animation `[facing][column]`. Rows/facings follow `S, SW, W, NW, N, NE, E, SE`. Coordinates are local source-frame pixels; callers must apply the exact displayed actor origin, scale, rotation, pose/bob/lunge and world transform. The table does not apply actor transforms itself.

The source drawings mirror/reuse arms, so the selected gripping hand follows the camera-visible arm rather than claiming consistent anatomical handedness. Animation frames follow that same arm through its motion.

## Body layering and source limitations

`behind` describes the displayed body pose, not aim angle. This matters because the source action sheets reuse facings:

- Swing SW duplicates W; NW/N/NE duplicate N; SE duplicates S.
- Hurt SW/W/NW/N duplicate the west-facing reaction; NE/SE duplicate S. Consequently all hurt anchors are foreground, including the nominal north row.
- Swing SW/W/E frames 2, 5 and 6 have baked-in white motion marks. These are in the original actor PNG, not hand patches or newly generated effects.

Five source frames completely hide the chosen palm. Their attachment is explicitly marked `occluded: true` and inferred within the covering body/forearm region; an exact visible-palm measurement is impossible without changing the source art:

1. Swing rows 3, 4 and 5, column 3: `(37, 42)`.
2. Aim row 4, column 1: `(35, 34)`.
3. Dash row 5, column 3: `(59, 36)`.

The preceding northeast dash frame has only a few exposed finger pixels at `(62, 36)`. It is visibly measured, but its hand crop is intentionally omitted if nearby sleeve pixels would be copied. Source artwork was not modified.

## Original-pixel hand patches

`handPatch`, when present, is an optional 3 × 3 source-frame rectangle centered on the selected palm. The patch is permitted only when the crop contains hand skin, dark outline/shadow or transparency, and no neighboring jacket/torso colors. This conservative audit allows 221 of the 280 entries (205 neon, 16 legacy). A missing patch does not invalidate the anchor. No patch is given for a fully hidden palm.

The renderer suppresses the overlay while Alex is translucent (invulnerability flicker), preventing the same palm pixels from compositing twice into a brighter 3×3 block.

If used, redraw only that exact crop at the displayed actor transform above the weapon. Do not scale it independently, replace it with a generated dot, or redraw a broad sleeve/body rectangle that could erase the weapon. These are source rectangles; a renderer may sample the original PNG and does not need a separate patch image asset.

## Contact-sheet evidence

Each attached contact sheet shows every frame with a small cyan crosshair at the anchor; orange marks the five inferred hidden palms. Labels contain actual table row/column, coordinates and body-layer decision. Pixels are enlarged exactly 4× using nearest-neighbor sampling.

- [idle contact sheet](alex-idle-anchors.png): `public/assets/neon/player/alex-idle.png`; SHA-256 `020b828cca5c05d79d7b204e35e689240658c544fb0bb10f69d0806935dbdca3`.
- [walk contact sheet](alex-walk-anchors.png): `public/assets/neon/player/alex-walk.png`; SHA-256 `52b0ee210c0c1a3509fe1d6dcdff041374d38793f5088f8bd14c368c0106e1ab`.
- [swing contact sheet](alex-swing-anchors.png): `public/assets/neon/player/alex-swing.png`; SHA-256 `c159d1b1909a4ef4513eada3e18d45c79217bb8978f202b8ad69ce4ef905852d`.
- [aim contact sheet](alex-aim-anchors.png): `public/assets/neon/player/alex-aim.png`; SHA-256 `9ec56c4e28adf5e75a5cdcf31c4e17141f9698df6c6f73f0bb08425304818e98`.
- [dash contact sheet](alex-dash-anchors.png): `public/assets/neon/player/alex-dash.png`; SHA-256 `3d9abe9936da6d0977350ae0c2185941ea3a0195ed10858d9322af5bb14d13ef`.
- [hurt contact sheet](alex-hurt-anchors.png): `public/assets/neon/player/alex-hurt.png`; SHA-256 `6e319e421adeef6fa932cf8ada4b2b12dadb1a3b85a0726f8caed81a627f09e7`.
- [legacy-idle contact sheet](alex-legacy-idle-anchors.png): `public/assets/presentation/actors/alex-idle.png`; SHA-256 `2f6d7f11748ec655eb9f940b91ab7a1b463a489cdd86bd1bb086eff1acb26130`.
- [legacy-walk contact sheet](alex-legacy-walk-anchors.png): `public/assets/presentation/actors/alex-walk.png`; SHA-256 `dc4097bbf62891dd929173abcf15903444e6d015a5514086cece9202bccac789`.

Reinspect the affected coordinates and regenerate the evidence if any source PNG changes.

## Raster-alignment review still pending

The attachment tests compare logical world transforms, not final framebuffer pixels. Night Shift enables Phaser `roundPixels`; an unscaled body or palm crop may snap differently from the scaled/rotated held image. A subpixel discrepancy can therefore remain at native scale. No zero-rendered-pixel-error claim is made. Inspect grip edges in motion on a working browser before accepting the visual result; a shared snapping policy is deferred until that evidence is available.
