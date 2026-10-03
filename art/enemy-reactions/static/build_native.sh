#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${PIXEL_FORGE_ROOT:?Set PIXEL_FORGE_ROOT to the Pixel Forge direct-authoring checkout}"
ASEPRITE_BIN=${ASEPRITE_BIN:-aseprite}
export ASEPRITE_BIN PIXEL_FORGE_ROOT
"$ASEPRITE_BIN" -b --script-param "base=$PWD/" --script author_static.lua
python3 author_crt_impact.py
"$ASEPRITE_BIN" -b --script-param "base=$PWD/" --script impact_to_aseprite.lua
python3 verify_native.py
