# Pixel Forge: rig + pose recipe authoring

This is a private working copy of Pixel Forge with the rig authoring work. It is not licensed
for redistribution.

- **Start with `RIG_REPORT.md`:** the diagnosis, what changed in the tool versus the benchmark,
  the commands, the evidence and the limits.
- **GPT (has Aseprite):** follow `FOR_GPT_NATIVE_CHECK.md`, then run
  `ASEPRITE_PATH=/path/to/aseprite bash run_native_check.sh`.
- **Code:** `workflow/forge-source/` (the new module is `forge/rig.py`; tests are in `tests/`).
  The rig benchmark is in `workflow/examples/west-rig/`.
- **Evidence:** `evidence-rig/`.

The historical `authoring/` and `evidence/` folders from the original frozen handoff are not
included, because they are unchanged.
