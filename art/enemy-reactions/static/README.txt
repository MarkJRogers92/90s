DEAD MALL — Static / CRT native animation art
Final native art, 2026-10-03. Independent visual review passed at 72px, 96px and 2x
on light/dark backgrounds after connector-tip and trouser-joint seam corrections.

Source: original eight-facing static-idle.png, SHA256
7e058f9245d28c0577f3a553124d490b7f4c33869c495b90e8a1612427a0d893.
Verified against merged main 11b0c68 by the publication task.
No image-generation pixels. All facings retain their own original source pixels.
Edited through Aseprite Lua native segmented joints and hand-pixel casing fracture;
CRT impact was authored with actual Pixel Forge DSL. Editable .aseprite files,
Forge .sprite.json, authoring scripts, source and roundtrip receipts are included.

Actor contract: 96x96 cells, 72px runtime display, anchor (48,80.64).
Hurt: four frames per facing, 3/3/4/4 simulation ticks. Recovery is exact idle.
Death: seven frames per facing, four ticks each; existing 70-tick hold includes
24-tick final fade. Aseprite duration fields approximate 60Hz to milliseconds;
the runtime tick contract is authoritative. Source facing is preserved; no claim
of authoritative incoming attack direction. Native actor arc is brief muted cyan.
Impact: six 48px frames, two ticks each, center (24,24), binary alpha, no loop.

Verification: actual Aseprite and Forge RGBA roundtrip equality; eight unique
facing rows in each actor sheet; transparent margins in all 88 cells; binary
alpha; original opaque shoe pixels unchanged in every hurt frame; final hurt
matches original idle exactly. See native-roundtrips.json.

The motion preview is offline art rendered at exact 60Hz cadence on light/dark
backgrounds. It is not live gameplay validation. Runtime integration/tests are
separate deliverables. No simulation or prior approved asset was edited here.

Rebuild with build_native.sh. Set ASEPRITE_BIN to Aseprite and PIXEL_FORGE_ROOT
to the Pixel Forge direct-authoring checkout; paths are supplied explicitly.
The Lua authoring scripts include guards against connector tips entering leg masks.
