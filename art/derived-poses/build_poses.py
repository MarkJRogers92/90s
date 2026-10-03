"""Derived action sheets (roadmap V2 and V4): re-posed from each character's own
walk sheet, so palette, silhouette and all 8 facings stay exact. No generation.

    python3 art/derived-poses/build_poses.py

- Alex dash (alex-dash.png): 4 frames x 8 facings at the 64 px walk canvas:
  lean in, full stretch with a motion smear, smear fading, recover.
- Wind-up attack sheets for the Spritzer, Mascot Brute and Roofer
  (<kind>-attack.png): 6 frames x 8 facings at each walk canvas. Frames 0-3
  anticipate (lean away, crouch), 4-5 release (lunge along the facing).
  attackFrameFor() maps the sim's telegraph progress onto frames 0-3 and the
  snap just before release onto 4-5.
Rows follow ACTOR_DIRECTION_ORDER: S, SW, W, NW, N, NE, E, SE.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIRS = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]


def repose(src: Image.Image, frame: int, feet_y: float, lean: float, sx: float, sy: float, shift: float, dx: int) -> Image.Image:
    """Nearest-neighbour re-pose about the feet: shear the body along the facing's
    horizontal component (lean > 0 leans toward the facing), squash/stretch, and
    slide `shift` px along it (a lunge)."""
    out = Image.new('RGBA', (frame, frame), (0, 0, 0, 0))
    s, o = src.load(), out.load()
    cx = frame / 2
    for y in range(frame):
        for x in range(frame):
            height = feet_y - (y + 0.5)              # pixels above the feet
            u = cx + ((x + 0.5 - cx) - dx * (lean * height + shift)) / sx - 0.5
            v = feet_y + ((y + 0.5) - feet_y) / sy - 0.5
            u, v = round(u), round(v)
            if 0 <= u < frame and 0 <= v < frame:
                o[x, y] = s[u, v]
    return out


def smear(base: Image.Image, frame: int, d: tuple, length: int, alpha: float) -> Image.Image:
    """A motion smear: two fading copies of the pose trailing behind the motion."""
    out = Image.new('RGBA', (frame, frame), (0, 0, 0, 0))
    for step, fade in ((length, alpha * 0.45), (length // 2, alpha)):
        ghost = base.copy()
        px = ghost.load()
        for y in range(frame):
            for x in range(frame):
                r, g, b, a = px[x, y]
                if a:
                    px[x, y] = (r, g, b, int(a * fade))
        out.alpha_composite(ghost, (-d[0] * step, -d[1] * step // 2))
    out.alpha_composite(base)
    return out


def sheet(walk_path: Path, frames: int, poses, feet_y: float, with_smear=False) -> Image.Image:
    walk = Image.open(walk_path).convert('RGBA')
    frame = walk.height // 8
    out = Image.new('RGBA', (frame * frames, frame * 8), (0, 0, 0, 0))
    for row, d in enumerate(DIRS):
        base = walk.crop((frame, row * frame, frame * 2, (row + 1) * frame))  # mid-stride column
        for column, (lean, sx, sy, shift, trail) in enumerate(poses):
            img = repose(base, frame, feet_y, lean, sx, sy, shift, d[0])
            if with_smear and trail:
                img = smear(img, frame, d, trail, 0.55)
            out.paste(img, (column * frame, row * frame))
    return out


def feet(walk_path: Path, idle_path: Path) -> float:
    walk_frame = Image.open(walk_path).height // 8
    idle_frame = Image.open(idle_path).height
    return (walk_frame - idle_frame) / 2 + idle_frame * 0.84


if __name__ == '__main__':
    player = ROOT / 'public/assets/neon/player'
    # (lean, scaleX, scaleY, shift, smear length): lean in, stretch + smear, smear fading, recover.
    dash = [(0.10, 1.00, 0.97, 0, 0), (0.22, 1.10, 0.92, 2, 8), (0.18, 1.06, 0.95, 2, 4), (0.06, 1.00, 0.99, 0, 0)]
    sheet(player / 'alex-walk.png', 4, dash, feet(player / 'alex-walk.png', player / 'alex-idle.png'), with_smear=True).save(player / 'alex-dash.png')
    print('wrote alex-dash.png')

    enemies = ROOT / 'public/assets/neon/enemies'
    # Anticipation: lean away and crouch deeper; release: lunge along the facing.
    windup = [(-0.06, 1.02, 0.97, 0, 0), (-0.12, 1.04, 0.94, -1, 0), (-0.18, 1.06, 0.91, -2, 0), (-0.22, 1.08, 0.88, -2, 0),
              (0.24, 0.95, 1.06, 4, 0), (0.12, 0.98, 1.02, 2, 0)]
    for kind in ('spritzer', 'mascot', 'roofer'):
        walk, idle = enemies / f'{kind}-walk.png', enemies / f'{kind}-idle.png'
        sheet(walk, 6, windup, feet(walk, idle)).save(enemies / f'{kind}-attack.png')
        print(f'wrote {kind}-attack.png')
