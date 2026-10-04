#!/usr/bin/env bash
# Native Aseprite checks. Uses existing dependencies; installs nothing.
# Usage: ASEPRITE_PATH=/path/to/aseprite [FORGE_PYTHON=/path/to/python] \
#        bash run_native_check.sh [--out NEW_DIRECTORY]
# Python: FORGE_PYTHON, else .venv/bin/python beside this script, else python3.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out)
      if [ "$#" -lt 2 ] || [ -z "$2" ] || [ -n "$OUT" ]; then
        echo "Usage: $0 [--out NEW_DIRECTORY]" >&2; exit 2
      fi
      OUT="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ASEPRITE_PATH=/path/to/aseprite [FORGE_PYTHON=/path/to/python] $0 [--out NEW_DIRECTORY]"
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
: "${ASEPRITE_PATH:?set ASEPRITE_PATH to your existing licensed Aseprite executable}"
if [ ! -f "$ASEPRITE_PATH" ] || [ ! -x "$ASEPRITE_PATH" ]; then
  echo "ASEPRITE_PATH must name an existing executable file." >&2; exit 2
fi
# Resolve caller-relative paths before changing into the flattened package.
ASEPRITE_PATH="$(cd "$(dirname "$ASEPRITE_PATH")" && pwd)/$(basename "$ASEPRITE_PATH")"
PY="${FORGE_PYTHON:-}"
if [ -z "$PY" ]; then
  if [ -x "$ROOT/.venv/bin/python" ]; then PY="$ROOT/.venv/bin/python"; else PY="$(command -v python3)"; fi
fi
PY="$(command -v "$PY")"
PY="$(cd "$(dirname "$PY")" && pwd)/$(basename "$PY")"
export FORGE_PYTHON="$PY" ASEPRITE_PATH
if [ -n "$OUT" ]; then
  mkdir -- "$OUT"  # Deliberately refuses existing directories and symlinks.
else
  OUT="$(mktemp -d "$ROOT/native-check-$(date +%Y%m%d-%H%M%S)-XXXXXX")"
fi
OUT="$(cd "$OUT" && pwd)"
trap 'status=$?; if [ "$status" -ne 0 ]; then echo "Native check failed; evidence retained in $OUT" >&2; fi' EXIT
cd "$ROOT"
"$PY" -c "import PIL, numpy, pytest, mcp, pydantic, anyio" || {
  echo "Use a Python with requirements-tested.txt already installed, then rerun. Nothing was installed." >&2; exit 2; }
echo "Evidence: $OUT"
echo "== 1. full test suite, including native tests"
# Ignore ambient selection flags only for this subprocess; the caller environment is unchanged.
if PYTEST_ADDOPTS= "$PY" -m pytest -q -o addopts= tests "--junitxml=$OUT/pytest.xml" 2>&1 | tee "$OUT/pytest.txt"; then
  status=0
else
  status=$?
fi
printf '%s\n' "$status" > "$OUT/pytest.status"
"$PY" "$ROOT/validate_native_check.py" pytest "$OUT/pytest.xml" "$status"
echo "== 2. frozen original native round trip"
if bash "$ROOT/forge.sh" animation-export "$ROOT/examples/west-refined-review/manifest.json" \
  --out "$OUT/frozen-native" --review --document "$ROOT/examples/west-refined-review/frozen.aseprite" \
  > "$OUT/frozen-native.json" 2> "$OUT/frozen-native.stderr"; then
  status=0
else
  status=$?
fi
printf '%s\n' "$status" > "$OUT/frozen-native.status"
"$PY" "$ROOT/validate_native_check.py" frozen "$OUT/frozen-native/export-report.json" "$status"
echo "== 3. fixed rig benchmark recipes"
for name in recipe recipe-v2 recipe-v3-base recipe-v3; do
  if bash "$ROOT/forge.sh" rig-review "$ROOT/examples/west-rig/$name.json" --out "$OUT/$name" \
    > "$OUT/$name.stdout" 2> "$OUT/$name.stderr"; then
    status=0
  else
    status=$?
  fi
  printf '%s\n' "$status" > "$OUT/$name.status"
  "$PY" "$ROOT/validate_native_check.py" "$name" "$OUT/$name/SUMMARY.json" "$status"
done
echo "Native benchmark verified. recipe-v3-base has its expected sole ground-contact failure; every native round trip is pixel-exact."
echo "Results in $OUT. Review evidence only; artwork still requires human review."
