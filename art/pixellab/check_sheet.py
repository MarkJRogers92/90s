"""Check (and line up) any 8-facing action sheet against its walk sheet, whatever made it.

    python3 art/pixellab/check_sheet.py <sheet.png> public/assets/neon/enemies/<kind>-<action>.png [--frames N] [--fix]

The sheet must be N frames wide and 8 rows tall (rows: south, south-west, west, north-west,
north, north-east, east, south-east), square frames, transparent background. It reports:
  - frame size and that it is the walk frame grown evenly (or equal);
  - per facing, how far the first frame's feet and centre sit from the walk sheet's;
  - per facing, figure height vs the walk figure and mean-colour drift.
--fix shifts each row so the feet and centre match and writes the runtime path (losslessly).
"""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from animate_characters import ORDER, drift, register, walk_sheet_for  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith('--')]
if len(args) != 2:
    raise SystemExit(__doc__)
src, out = args
sheet = Image.open(src).convert('RGBA')
size = sheet.height // 8
frames = int(sys.argv[sys.argv.index('--frames') + 1]) if '--frames' in sys.argv else sheet.width // size
problems = []
if sheet.height % 8 or sheet.width != frames * size:
    problems.append(f'sheet is {sheet.width}x{sheet.height}: expected {frames} square frames x 8 rows')
walk = Image.open(walk_sheet_for(out)).convert('RGBA')
wsize = walk.height // 8
if size < wsize or (size - wsize) % 2:
    problems.append(f'frame is {size}px; it must be the {wsize}px walk frame or larger by an even number')
print(f'{src}: {frames} frames x 8 facings at {size}px (walk frame {wsize}px)')
for row in range(8):
    ab = sheet.crop((0, row * size, size, (row + 1) * size)).getchannel('A').getbbox()
    wb = walk.crop((0, row * wsize, wsize, (row + 1) * wsize)).getchannel('A').getbbox()
    if not ab:
        problems.append(f'row {row} ({ORDER[row]}) is empty')
        continue
    grow = (size - wsize) / 2
    dx = round((wb[0] + wb[2]) / 2 + grow - (ab[0] + ab[2]) / 2)
    dy = round(wb[3] + grow - ab[3])
    print(f'  row {row} {ORDER[row]:<10} feet/centre off by ({dx:+d}, {dy:+d}) px')
drift(sheet, size, out)
if '--fix' in sys.argv and not problems:
    fixed = register(sheet, size, frames, out)
    fixed.save(Path(__file__).resolve().parents[2] / out, optimize=True, compress_level=9)
    print(f'wrote {out}')
for p in problems:
    print('PROBLEM:', p)
raise SystemExit(1 if problems else 0)
