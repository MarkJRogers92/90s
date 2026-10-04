#!/usr/bin/env bash
# Native (Aseprite) checks that could not run where the rig work was built.
# Usage: ASEPRITE_PATH=/path/to/aseprite bash run_native_check.sh
# Needs Python 3.11+ and network access for pip (only the tested requirements are installed).
set -euo pipefail
: "${ASEPRITE_PATH:?set ASEPRITE_PATH to your licensed Aseprite executable}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/native-check-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
cd "$ROOT/workflow/forge-source"
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv && .venv/bin/pip install -q -r requirements-tested.txt; fi
echo "== 1. full test suite (with Aseprite the 3 native tests run instead of skipping)"
.venv/bin/python -m pytest -q tests 2>&1 | tee "$OUT/pytest.txt" | tail -3
echo "== 2. frozen benchmark: native round trip of the original .aseprite (baseline)"
bash ./forge.sh animation-export ../examples/west-refined-review/manifest.json --out "$OUT/frozen-native" --review \
  --document ../../frozen-asset/Bargain_Hunter_West_Refined_REVIEW_ONLY.aseprite > "$OUT/frozen-native.json"
echo "== 3. rig v2: render, build the layered document, then the checked export verifies it"
bash ./forge.sh rig-render ../examples/west-rig/recipe-v2.json --out "$OUT/west-rig-v2" > "$OUT/render.json"
.venv/bin/python -c "from forge import rig; print(rig.build_native('$OUT/west-rig-v2', '$OUT/west-v2.aseprite'))"
bash ./forge.sh animation-export "$OUT/west-rig-v2/manifest.json" --out "$OUT/west-v2-native" --review \
  --document "$OUT/west-v2.aseprite" > "$OUT/v2-native.json"
.venv/bin/python - "$OUT" <<'PY'
import json, sys
out = sys.argv[1]
for name in ("frozen-native", "v2-native"):
    r = json.load(open(f"{out}/{name}.json"))
    n = r.get("native_document") or {}
    print(f"{name}: status={r.get('status')} error={r.get('error')} technical={r.get('checks', {}).get('technical_status')} "
          f"pixel_exact={n.get('visible_frames_pixel_exact')} durations={n.get('durations_seconds')}")
print("v2 manual review:", json.load(open(f"{out}/v2-native.json")).get("manual_review_required"))
PY
echo "Results in $OUT. Expected: tests all pass (no skips), both pixel_exact=True,"
echo "v2 durations 0.142/0.142/0.142/0.141/0.133/0.133, and 4 manual review items."
