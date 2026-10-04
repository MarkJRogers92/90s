#!/bin/bash
# Pixel Forge launcher: ./forge.sh serve | make "..." | mcp | rig-review ... | ...
# Interpreter: $FORGE_PYTHON if set, else ./.venv/bin/python if present, else python3.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${FORGE_PYTHON:-}"
if [ -z "$PY" ]; then
  if [ -x "$DIR/.venv/bin/python" ]; then PY="$DIR/.venv/bin/python"; else PY="$(command -v python3)"; fi
fi
cd "$DIR" && exec "$PY" -m forge "$@"
