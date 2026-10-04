#!/usr/bin/env bash
# Rebuild the sheet from inputs/ (Python 3 with Pillow + NumPy). Writes into this folder's work/.
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p work; cd work
for f in ../*.py; do ln -sf "$f" .; done
python3 lock_feet.py > /dev/null
for c in 1 2 4 5; do python3 nw_fix.py $c -11 -3; done
python3 se_windup.py > /dev/null
python3 se_fix.py 4 55 66 3 2; python3 se_fix.py 5 57 66 3 2
python3 assemble.py
echo "work/bargain-hunter-charge-768x1024.png + work/sheet-report.json"
