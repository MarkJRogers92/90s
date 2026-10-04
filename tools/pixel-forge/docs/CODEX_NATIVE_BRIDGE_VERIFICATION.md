# Native bridge verification — 2026-10-04

## Verification scope

The private native-image adapter is implemented and remains experimental.
A real MCP client/server integration test exercises the complete local transport
through an explicitly synthetic native-protocol worker. It validates exact PNG
bytes, native thread/turn/image identities, provider receipts, durable paired-job
advancement, and typed MCP errors.

**No signed-in native image-generation turn has been verified through this
adapter.** Protocol fixtures are not generated artwork and do not establish
account entitlement, actual native result-format compatibility, or live
image-generation availability. Codex's internal retry behavior is unverified.

## Aggregate checks

- Native bridge and exact-plan compatibility: 89 focused tests passed.
- Full Forge suite with native Aseprite checks: 672 passed, zero skips.
- All five native round trips remained pixel-exact with timings verified.
  The `recipe-v3-base` fixture retained only its intended ground-contact failure.
- Game regression: 1,849 tests passed across 179 files.
- TypeScript and production build passed; the existing large-bundle warning
  remains.
- Independent re-review found no remaining blocking correctness or security
  defect within the documented trusted, private, unmanaged personal-host scope.

The focused suite covers lifecycle and identity matching, duplicate/foreign
results, multiple images, malformed protocol objects, auth and model changes,
approval-policy checks, rejection of unrelated tools, bounded PNG/reference
handling, concurrent serialization, input-write deadlines, process-group cleanup,
MCP error flags, and durable unknown-completion handling. The exact-plan
matrix accepts only `plus`, `pro`, and `prolite`, rejects all other official
plan identifiers and malformed/unknown values, and confirms that managed
configuration is still rejected before the worker starts.

## Reproduction

Use Forge's existing dependency environment. No live image provider is called
by these tests:

```sh
python -m pytest -q tests/test_codex_native.py tests/test_codex_native_plans.py
ASEPRITE_PATH=/path/to/aseprite python -m pytest -q tests
ASEPRITE_PATH=/path/to/aseprite FORGE_PYTHON=/path/to/python bash run_native_check.sh
```

The native-check runner requires an existing licensed Aseprite installation and
an unused output directory when `--out` is supplied. Its fixture artwork remains
review-only. Tests use synthetic accounts, subprocess peers, and configuration
metadata; none authenticate a user or establish a real image-generation session.

## Live acceptance remains required

A supported private installation must separately pass an owner-authorized native
login, a non-inference startup/auth probe, and one real mockup request with matched
native image completion and validated PNG bytes. Inspect that mockup before
requesting its associated sheet. Preserve any uncertain completion for explicit
reconciliation rather than automatically regenerating.

Until that acceptance succeeds, describe the adapter as offline-verified and
live-unverified. The implementation does not enable a hosted subscription API,
automatically configure credentials, or approve production artwork. See
[the bridge contract and setup requirements](CODEX_NATIVE_BRIDGE.md).
