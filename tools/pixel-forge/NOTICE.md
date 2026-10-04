# Source and third-party notices

The supplied source identifies Pixel Forge as Mark's local pixel-art tool for DEAD MALL. Its earlier cloud export records source commit `3b1f796ca9ee895127f023b156c01e96007a3c6b`; the immediate integration source is `MarkJRogers92/90s` branch `pixel-forge-rig`, commit `e8ec6ee555711375b134d4c2bffad9ecf47ab0e2`.

The immediate source README states: “This is a private working copy of Pixel Forge with the rig authoring work. It is not licensed for redistribution.” This integration preserves that notice and grants no additional copyright license. Repository visibility does not itself supply a redistribution license.

The upstream tool describes Piskel as its Apache-2.0 editor. No Piskel frontend, vendored dependencies, or Piskel binaries are included here. Aseprite is not bundled; native checks use an existing user-provided licensed executable. Python dependencies are listed in requirement files, not redistributed in this directory.

The PNG and Aseprite files in `examples/` are the supplied Bargain Hunter test fixtures. The `.aseprite` file is an editable art document, not an application executable. The original frozen fixture is retained byte-for-byte for native regression checks.

The original modules in `forge_accel/` were supplied in Pixel_Forge_Quality_Speed_Upgrade.zip and carry their own MIT license (`forge_accel/LICENSE`) and notices (`forge_accel/NOTICE`). They were adapted locally with native result integrity checks and strict atlas-structure validation. No sprite-gen, SpriteBrew, Pixelorama, LibreSprite, Universal LPC or fal source/art was copied. The quality/speed module adds no mandatory runtime dependency. The pre-existing private Forge/source-art notices remain in force.

The optional grid adapter vendors the MIT-licensed Retro Diffusion pixel-art-fixer Python modules, copyright Astropulse, LLC, pinned at `ef376e57e1c272633ca2dbf5f29ec3fcf6596465`. See `forge/_vendor/rd_pixelfixer/LICENSE` and `PROVENANCE.json` in that directory for the exact upstream source and file hashes. Its optional SciPy/OpenCV dependencies are listed separately in `requirements-grid.txt`; none are bundled or installed automatically.
