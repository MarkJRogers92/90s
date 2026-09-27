# Presentation-slice source files

This folder holds the active editable Aseprite masters and the eight cited
civilian candidate exports used to make the 2026-09-26 Opening Concourse art
decision. The asset-to-source mapping, dimensions, approved export hashes, and
approval status are recorded in
[`artifacts/provenance/presentation-vertical-slice.json`](../../../../artifacts/provenance/presentation-vertical-slice.json).

These are source and review files, not runtime dependencies. The game loads
only the approved PNG exports under `public/assets/presentation/`. Scratch
janitor-animation iterations and unrelated tests were intentionally omitted.
The nine imported Aseprite masters called out in
[`../source-cleanup-review.md`](../source-cleanup-review.md) were reopened and
verified to export pixel-for-pixel to their approved runtime PNGs. Other
masters remain traceable to the approved export through the provenance file;
that specific nine-file pixel-equivalence check should not be read as covering
every source file.

Some `originalCandidatePath` values in the provenance file name legacy
`public/assets/...` locations and are historical references that are not
present in this branch. Use `editableSourcePath` for the active tracked master;
the cited civilian candidate exports are included here where those candidate
files were part of the local source package.

The local fountain builder is included with a repository-relative output path
and writes its editable Aseprite file to this directory when run from the
repository root. The portable copy was not re-run during this handoff; compare
any regenerated output against the approved runtime PNG before replacing it.
