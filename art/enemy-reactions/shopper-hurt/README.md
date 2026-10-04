# Bargain Hunter hurt: focused WEST correction

Status: REVIEW_ONLY. Static/native-scale ordered-frame review passed for the corrected WEST row.
A live in-game flinch has not yet been observed; do not treat format tests or the offline preview as live approval.

## Scope and provenance

The original candidate at commit 70c4061532a5f8ed08e4f741807a68151672d35a turned nearly front-on during
the WEST peak recoil. This version replaces only its four WEST cells (row 2). The other seven rows
remain byte-identical at the decoded-pixel level. The full sheet is 384 x 768: 4 frames x 8 facings at 96 px.
It is staged against main e58d02a24aacbb22d68bedde7e9aa9aecbe49962, retaining the Images API refusal fixes.

- original-candidate.png: preserved prior review sheet.
- reference-west-walk.png / reference-west-attack.png: exact source WEST cell crops, enlarged 6x by nearest neighbour.
- west-mockup.png: the inspected single-pose guide.
- west-row-raw.png: the matching four-frame generated row.
- shopper-hurt.png: the reproducible runtime derivative.
- job-spec.json: portable Pixel Forge specification; run from this directory when using relative paths.
- provenance.json: source/output hashes and caller-reported invocation identifiers.

Built-in image generation was used. Three earlier mockups were rejected for identity/proportion drift.
A fresh job using single-facing source crops produced the selected mockup and then its matching row.
Five image invocations total; no Images API, PixelLab, credential export or login setup was used.

## Rebuild without generation

From repository root, using the existing Forge Python environment (Pillow and NumPy):

    python art/enemy-reactions/shopper-hurt/build_shopper_hurt.py
    python art/enemy-reactions/materials/build_material_reactions.py

The raw 2172 x 724 row is four known rectangular cells, not the exact square-cell grid Forge requests.
Forge correctly rejected its dimensions. The explicit local converter crops transparent margins,
uses one uniform nearest-neighbour scale for all four poses, hardens alpha, aligns shoe/baseline
registration, then applies a common row translation for the walking rest-frame centre.
This resampling is lossy; raw generation is preserved. It never invents a new facing or mirrors a row.

## Verification and limits

- Fresh final gate: 1,939 unit tests in 182 files, five converter tests, TypeScript typecheck and build pass.
- Baseline main passed 1,920 tests before changes. Art and fixture regressions were observed failing first.
- Independent review reran 101 focused/adjacent TypeScript tests, five converter tests and typecheck successfully.
- Converter tests cover registration, unchanged rows, hard alpha, empty cells and boundary rejection.
- Runtime art tests pin the source copy, native grid, preserved rows, baseline/height and rest centre.
- A narrow-shoulder geometric regression rejects the old 36 px broad peak; it is not a facing classifier.
- Independent visual review finds consistent WEST face/body profile, source identity, bag grip and leg separation.
- check_sheet.py reports 0 px centre/baseline error for every facing.
- The untouched EAST row retains its previous mean-colour warning (33), partly due to its bag.
- The corrected WEST row is slimmer and closer to the walking source than the untouched candidate rows.
- Other prior candidate review limits remain: some facings are stockier/more shaded; chest detail differs from walk art.
- No simulation rules or attack-priority logic changed.

## Reproducible live check

The dev-only mvp-hunter-hurt fixture equips the real Laser Pointer at 410 px. A genuine shot hits the
shopper during pursue, outside charge range, leaving the normal fourteen-tick hurt window visible.
It later enters its normal charge telegraph. Unit tests verify this for immediate and delayed input.

    PW_CHROMIUM_PATH=/usr/bin/chromium npx playwright test tests/browser/hunter-hurt-review.spec.ts

The capture spec requires all four WEST shopper-hurt frames after a real hit, no charge/stun, no
console errors and no external runtime requests. It saves each observed frame and a JSON report.
This test is present and typechecked but its browser execution is still pending: the current cloud
browser routes were permission-blocked. Do not weaken browser policy or change attack priority to pass it.
