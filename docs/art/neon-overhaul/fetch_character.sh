#!/usr/bin/env bash
# Download a PixelLab character bundle and pack it for the game.
#   fetch_character.sh <character-id> <output-stem> [walk-animation-name]
# Writes docs/art/neon-overhaul/pixellab/<stem>-idle.png (and -walk.png).
set -euo pipefail
id="$1"; stem="$2"; anim="${3:-walk}"
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
curl -sfL -o "$work/c.zip" "https://api.pixellab.ai/mcp/characters/$id/download"
unzip -q -o "$work/c.zip" -d "$work/c"
python3 "$here/pack_character.py" "$work/c" --rotations "$here/pixellab/$stem-idle.png"
if python3 -c "import json,sys; m=json.load(open('$work/c/metadata.json')); sys.exit(0 if '$anim' in m['states'][0]['frames'].get('animations',{}) else 1)"; then
  python3 "$here/pack_character.py" "$work/c" "$anim" "$here/pixellab/$stem-walk.png"
fi
rm -rf "$work"
