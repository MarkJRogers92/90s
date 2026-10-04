# Source and third-party notices

The supplied source identifies Pixel Forge as Mark's local pixel-art tool for DEAD MALL. Its earlier cloud export records source commit `3b1f796ca9ee895127f023b156c01e96007a3c6b`; the immediate integration source is `MarkJRogers92/90s` branch `pixel-forge-rig`, commit `e8ec6ee555711375b134d4c2bffad9ecf47ab0e2`.

The immediate source README states: “This is a private working copy of Pixel Forge with the rig authoring work. It is not licensed for redistribution.” This integration preserves that notice and grants no additional copyright license. Repository visibility does not itself supply a redistribution license.

The upstream tool describes Piskel as its Apache-2.0 editor. No Piskel frontend, vendored dependencies, or Piskel binaries are included here. Aseprite is not bundled; native checks use an existing user-provided licensed executable. Python dependencies are listed in requirement files, not redistributed in this directory.

The PNG and Aseprite files in `examples/` are the supplied Bargain Hunter test fixtures. The `.aseprite` file is an editable art document, not an application executable. The original frozen fixture is retained byte-for-byte for native regression checks.
