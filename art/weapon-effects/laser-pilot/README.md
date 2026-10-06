# Laser-family pixel pilot

Three original, directly authored Pixel Forge Sprite/DSL animations. These are local pixel drawings, not resized model output or palette swaps of a water/foam sheet. The existing laser-pointer, laser-tag-rifle and lightsaber-toy inventory art was inspected before drawing; each runtime JSON pins the inspected icon hash.

## Rebuild

From the repository root, with Python, Pillow and NumPy available:

```sh
python3 art/weapon-effects/laser-pilot/build_laser_effects.py
```

The builder uses the checked-in `tools/pixel-forge/forge/dsl.py` interpreter. It writes exact per-frame `.dsl.json` and indexed `.sprite.json` files, a whole-strip `sheet.sprite.json`, and local runtime PNG/metadata files under `public/assets/neon/weapon-effects/`. Edit the builder's drawing operations and palettes, then rebuild. No network, credentials or runtime generator is involved. The source format is editable Forge JSON; no Aseprite binary or Aseprite export roundtrip is claimed.

## Animation contracts

| Effect | Cell / frames | Pivot | Drawing |
| --- | --- | --- | --- |
| Laser Pointer | 32 × 12 / 4 | 16, 6 | A finite 25-pixel red segment with a 1-pixel pale-white core; only small rim highlights move |
| Laser Tag Rifle | 32 × 16 / 4 | 16, 8 | Chunkier cyan bolt in three separated segments; transparent gaps remain visible |
| Light-Up Laser Sword | 64 × 48 / 6 | 48, 24 | A cyan-white open slash ribbon that tapers into the current blade tip |

All sources have four colors, binary alpha, normal blending and transparent cell borders. Runtime sampling is nearest-neighbor. Laser projectile loops keep a constant total RGB sum rather than blinking; the sword follows the existing monotonically fading 16-tick visual swing. Laser muzzle releases are a tiny crop of the same material over two ticks, not a radial flash or lighting pulse.

The pointer and rifle stay at the real projectile centre, rotate with actual velocity, and retain the shared gentle geometry scale cap. One rifle sprite is drawn per existing simulation projectile: its existing twin prongs produce two bolts, not four. These are moving segments, never hitscan or muzzle-to-target lines. No simulation, damage, speed, range, cooldown, firing count, fusion rules or hitboxes change. Melee attaches to the resolved held head, so it follows current hand/grip geometry without a separate offset.

The muzzle first painted tail is at x = 4; the shared view places that at the resolved nozzle. The sword's leading filament ends at 48,24 in every frame. Any missing texture retains the existing procedural fallback.

## Verification

`tests/unit/laser-weapon-effects.test.ts` covers runtime mapping, nested fusion precedence, preloading, remaining-roster cleanup, exact indexed-source/PNG pixels, transparent padding, all distinct frames, thin red/white core, thicker segmented cyan body, stable projectile brightness, eight-direction flight, base projectile counts/speed/radius, per-id rendering and cleanup, nozzle attachment/fade, and sword-tip attachment/fade/interruption.

Run it with `npm test -- tests/unit/laser-weapon-effects.test.ts`. Pixel and view tests verify technical registration, not aesthetic approval. Inspect the three runtime PNGs at game scale and in motion before declaring live visual QA complete.
