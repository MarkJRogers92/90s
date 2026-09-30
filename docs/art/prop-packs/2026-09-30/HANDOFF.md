# DEAD MALL asset handoff

The nine props below are archived on branch `codex/deadmall-prop-packs-20260930` in `MarkJRogers92/90s`.

Repository location: `docs/art/prop-packs/2026-09-30/`. Paths in the table are relative to that directory and work on GitHub or in a local checkout.

| Prop | Main PNG | Compact PNG | Editable master |
| --- | --- | --- | --- |
| Gumball machine | [64×96, 19 colors](pack-01/gumball-machine.png) | [32×48](pack-01/small/gumball-machine.png) | [Aseprite](pack-01/aseprite/gumball-machine.aseprite) |
| Mall directory | [64×96, 12 colors](pack-01/mall-directory.png) | [32×48](pack-01/small/mall-directory.png) | [Aseprite](pack-01/aseprite/mall-directory.aseprite) |
| Wet-floor sign | [48×64, 7 colors](pack-01/wet-floor-sign.png) | [24×32](pack-01/small/wet-floor-sign.png) | [Aseprite](pack-01/aseprite/wet-floor-sign.aseprite) |
| CRT TV cart | [64×96, 11 colors](pack-01/crt-tv-cart.png) | [32×48](pack-01/small/crt-tv-cart.png) | [Aseprite](pack-01/aseprite/crt-tv-cart.aseprite) |
| Arcade cabinet | [64×96, 16 colors](pack-02/arcade-cabinet.png) | [32×48](pack-02/small/arcade-cabinet.png) | [Aseprite](pack-02/aseprite/arcade-cabinet.aseprite) |
| Soda vending machine | [64×96, 13 colors](pack-02/soda-vending-machine.png) | [32×48](pack-02/small/soda-vending-machine.png) | [Aseprite](pack-02/aseprite/soda-vending-machine.aseprite) |
| Mall planter | [64×64, 14 colors](pack-02/mall-planter.png) | [32×32](pack-02/small/mall-planter.png) | [Aseprite](pack-02/aseprite/mall-planter.aseprite) |
| Janitor cart | [96×80, 14 colors](pack-02/janitor-cart.png) | [48×40](pack-02/small/janitor-cart.png) | [Aseprite](pack-02/aseprite/janitor-cart.aseprite) |
| Payphone | [64×128, 16 colors](payphone/payphone-64x128-palette.png) | [32×64](payphone/payphone-32x64.png) | [Aseprite](payphone/payphone-64x128.aseprite) |

## Files and verification

- Root PNGs in each pack are native-size artwork. `small/` holds independently converted compact variants. `previews/` holds enlarged reference images, not runtime sprites.
- `aseprite/` holds one-layer editable masters for the eight pack props. The payphone master is alongside its PNGs. All nine masters were previously verified through pixel-identical PNG export. Published masters match the reviewed local masters byte-for-byte.
- Corresponding `.json` files are editable indexed Pixel Forge sprites. High-resolution sources, prompts, conversion reports, provenance, per-pack manifests and validation evidence are included.
- Publishing checks confirmed 19 native PNGs have binary transparency and at most 32 opaque colors. Eighteen use only the supplied [shared palette](palette-profile.json); the original payphone PNG uses its own 32-color palette.
- The main PNG and Aseprite dimensions are listed above. The payphone master matches [payphone-64x128.png](payphone/payphone-64x128.png), not its shared-palette variant.
- Published PNGs, Aseprite masters, prompts and other non-JSON files were copied byte-for-byte from the reviewed local deliverables. JSON provenance paths were made portable. [SHA256SUMS](SHA256SUMS) records published file hashes.
- Local workstation paths, temporary build scripts and roundtrip comparison images were omitted from the publication.

## Visual limitations

- The compact versions simplify symbols, controls and equipment. The directory becomes an abstract map, and the small wet-floor sign loses pictogram detail.
- Automated QA flags isolated detail pixels in the gumball machine and the compact vending machine, planter and janitor cart. They were retained and can be inspected in the previews. Technical constraints do not certify artistic readiness.
- The handoff does not include scene placement, collision, render anchors, animation or a live playtest. Candidate files are outside `public/` and are not loaded by the game.

## Continuing the art workflow

The built-in image generator produced one source per prop. Pixel Forge used `preset="illustration"`, `profile="dead-mall"`, `colors=32`, `remove_background="alpha"`, `detect_grid=false`, and the exact dimensions in the table. Per-asset prompt files and the profile palette are included. No PixelLab generation was used.

To integrate a prop, choose its PNG size, inspect it alongside neighboring sprites, then use the existing game asset pipeline to assign render scale, feet/bottom anchor, draw order and collision. Preserve these source packs for future revisions.
