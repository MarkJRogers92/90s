# Pinned WEST regression fixtures

These fixtures exercise the tool; they do not install or approve game art. Source and recipe hashes remain unchanged from `pixel-forge-rig` at `e8ec6ee555711375b134d4c2bffad9ecf47ab0e2`.

- `west-rig/recipe.json`: original six-frame rig reproduction. Technical pass; exact frozen pixels; stance coverage remains unverified for release frames.
- `west-rig/recipe-v2.json`: earlier verified rotational improvements. Technical pass.
- `west-rig/recipe-v3-base.json`: split torso/legs rig that reproduces all six frozen frames exactly. Expected technical failure: frame 4's foot is at world y=110 while the floor is y=111. The negative test is intentionally retained.
- `west-rig/recipe-v3.json`: torso lean, bag lag, and one-pixel grounding correction. Technical pass; six editable layers. Anatomy and anatomical prop ownership still require visual review.
- `west-refined-review/manifest.json` and `frozen.aseprite`: original checked pixels and native art document for byte-preserving native round-trip regression.

All examples use six 128×128 frames timed 142, 142, 142, 141, 133, and 133 milliseconds. Native checks require pixel-exact rendering and these durations. The v3-base fixture is allowed only its exact documented floor failure, not arbitrary failed checks.

Historical import/build scripts, private handoff documents, generated evidence galleries, environments, and binaries are deliberately excluded. To author new art, copy a rig/recipe to a new working directory, keep original references pinned, register newly drawn pieces as `authored`, and use a new output path for each review.
