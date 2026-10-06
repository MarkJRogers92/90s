# Editable weapon effects

The original v1/v2 set contains 13 native Aseprite animations, 60 frames, authored with Pixel Forge Sprite/DSL.
Each original animation has an editable `.aseprite` file and exact per-frame Forge DSL and indexed Sprite JSON in `forge/`.
Runtime PNG strips and timing/pivot/palette metadata are in `public/assets/neon/weapon-effects/`.

Version 1: mop, golden mop, soaker water, foam ball, nail, VHS, vinyl, CD.
Version 2: broom bristles, cutter glint, party confetti, bottle rocket, extinguisher foam.
No generated code is required at runtime. Export horizontal strips without trimming or resizing, preserving frame order and transparent padding.

The `derived/` builders add water and spray palette variants. The `laser-pilot/` builder adds three directly authored laser-family animations (14 frames), with editable Forge DSL and indexed Sprite JSON. See its README for rebuild instructions, palette/attachment contracts and verification limits. No Aseprite export is claimed for this pilot.

Grip metadata covers all 80 roots. The current uncovered roots are listed in `diagnostics/weapon-visuals/remaining-effect-roster.json`. Fusion visuals preserve root melee and first-shooter projectile inheritance.
The original native exports passed roundtrips and offline 8-direction/light/dark/dense-floor reviews. Those original reviews do not certify later variants or the laser pilot.
