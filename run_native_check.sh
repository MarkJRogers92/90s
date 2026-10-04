#!/usr/bin/env bash
# Native (Aseprite) checks for the rig work. Installs nothing.
# Usage: ASEPRITE_PATH=/path/to/aseprite [FORGE_PYTHON=/path/to/python] bash run_native_check.sh
# FORGE_PYTHON (else workflow/forge-source/.venv/bin/python, else python3) must already have the
# packages in workflow/forge-source/requirements-tested.txt.
set -euo pipefail
: "${ASEPRITE_PATH:?set ASEPRITE_PATH to your licensed Aseprite executable}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
FORGE="$ROOT/workflow/forge-source"
PY="${FORGE_PYTHON:-}"
[ -z "$PY" ] && { [ -x "$FORGE/.venv/bin/python" ] && PY="$FORGE/.venv/bin/python" || PY="$(command -v python3)"; }
"$PY" -c "import PIL, numpy, pytest, mcp, pydantic, anyio" 2>/dev/null || {
  echo "This Python lacks the tested requirements; install workflow/forge-source/requirements-tested.txt yourself, then rerun." >&2; exit 2; }
export FORGE_PYTHON="$PY"
OUT="$ROOT/native-check-$(date +%Y%m%d-%H%M%S)"
mkdir "$OUT"
cd "$FORGE"
echo "== 1. full test suite (with Aseprite, the native tests run instead of skipping)"
"$PY" -m pytest -q tests 2>&1 | tee "$OUT/pytest.txt" | tail -2
echo "== 2. frozen benchmark: native round trip of the original .aseprite"
bash ./forge.sh animation-export ../examples/west-refined-review/manifest.json --out "$OUT/frozen-native" --review \
  --document ../../frozen-asset/Bargain_Hunter_West_Refined_REVIEW_ONLY.aseprite | tail -n +1 > "$OUT/frozen-native.json"
echo "== 3. rig recipes: one rig-review each (render, checked export, previews, native document + verification)"
for recipe in ../examples/west-rig/recipe*.json; do
  name="$(basename "$recipe" .json)"
  bash ./forge.sh rig-review "$recipe" --out "$OUT/$name" > /dev/null || true
  echo "-- $name"; sed -n '1,12p' "$OUT/$name/SUMMARY.md"
done
echo "Results in $OUT. Expect: all tests pass with no skips; every SUMMARY says technical pass and native verified, pixel exact True."
