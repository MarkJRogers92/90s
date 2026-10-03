# Editable weapon effects

13 native Aseprite animations, 60 frames, authored with Pixel Forge Sprite/DSL.
Each animation has an editable `.aseprite` file and exact per-frame Forge DSL and indexed Sprite JSON in `forge/`.
Runtime PNG strips and timing/pivot/palette metadata are in `public/assets/neon/weapon-effects/`.

Version 1: mop, golden mop, soaker water, foam ball, nail, VHS, vinyl, CD.
Version 2: broom bristles, cutter glint, party confetti, bottle rocket, extinguisher foam.
No generated code is required at runtime. Export horizontal strips without trimming or resizing, preserving frame order and transparent padding.

Grip metadata covers all 80 roots; 67 roots retain prior effect art. Fusion visuals inherit the base weapon.
Native export roundtrips and offline 8-direction/light/dark/dense-floor reviews passed. Live gameplay visual QA remains outstanding.
