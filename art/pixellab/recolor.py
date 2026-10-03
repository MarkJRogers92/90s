"""Map one colour family of a PixelLab sheet onto the walk sheet's ramp (quantile by luminance).

The Developer's PixelLab character is navy; his shipped walk sheet (an older template
render) is cream. v3 animations follow the character, so the attack comes back navy.
    python3 art/pixellab/recolor.py developer-attack
    python3 art/pixellab/recolor.py santa-attack   # flat black sack -> dark red, two facings
"""
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
lum = lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]
# name: (walk sheet, is-source-colour, is-target-colour)
RULES = {
    'developer-attack': ('public/assets/neon/enemies/developer-walk.png',
                         lambda p: p[2] > p[0] + 12 and p[2] >= p[1],                   # navy suit
                         lambda p: p[0] > 90 and p[0] >= p[1] >= p[2] and p[0] - p[2] < 70 and p[0] - p[2] > 12),  # cream suit
}

# name: (walk sheet, rows, min blob area): recolour only large dark blobs (a sack), never boots or belts.
BLOBS = {
    'santa-attack': ('public/assets/neon/enemies/santa-walk.png', (1, 6), 1200),  # south-east's sack is already a shaded dark red
}


def fat(blob, depth=4):
    """The sack, without boots or a belt that touch it: keep pixels at least `depth` inside the
    blob (the thick core), then grow the core back out by `depth` within the blob."""
    blob = set(blob)
    steps = lambda x, y: ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
    dist, frontier = {}, [p for p in blob if any(n not in blob for n in steps(*p))]
    for p in frontier:
        dist[p] = 0
    while frontier:
        nxt = []
        for p in frontier:
            for n in steps(*p):
                if n in blob and n not in dist:
                    dist[n] = dist[p] + 1
                    nxt.append(n)
        frontier = nxt
    core = {p for p, d in dist.items() if d >= depth}
    # Only the largest thick region is the sack; a fat boot pressed against it is its own core.
    keep, seen = set(), set()
    for start in core:
        if start in seen:
            continue
        part, stack = [], [start]
        seen.add(start)
        while stack:
            p = stack.pop()
            part.append(p)
            for n in steps(*p):
                if n in core and n not in seen:
                    seen.add(n)
                    stack.append(n)
        if len(part) > len(keep):
            keep = set(part)
    frontier = list(keep)
    for _ in range(depth):
        nxt = []
        for p in frontier:
            for n in steps(*p):
                if n in blob and n not in keep:
                    keep.add(n)
                    nxt.append(n)
        frontier = nxt
    return [p for p in blob if p in keep]


def blobs(name):
    """Santa's PixelLab character carries a flat black sack in two facings (the walk sheet's is
    dark red), so v3 animations do too. Recolour each large near-black blob onto the walk
    sheet's dark reds, by luminance quantile."""
    walk_path, rows, area = BLOBS[name]
    sheet = Image.open(HERE / f'{name}.png').convert('RGBA')
    walk = Image.open(ROOT / walk_path).convert('RGBA')
    dark = lambda p: p[3] > 200 and lum(p) < 50 and max(p[:3]) - min(p[:3]) < 40
    dst = cdf([p[:3] for p in walk.get_flattened_data() if p[3] > 200 and p[0] > p[1] + 40 and lum(p) < 75])
    size = sheet.height // 8
    px = sheet.load()
    hits = []
    for row in rows:
        for cx in range(0, sheet.width, size):
            seen = set()
            for y in range(row * size, (row + 1) * size):
                for x in range(cx, cx + size):
                    if (x, y) in seen or not dark(px[x, y]):
                        continue
                    blob, stack = [], [(x, y)]
                    seen.add((x, y))
                    while stack:
                        bx, by = stack.pop()
                        blob.append((bx, by))
                        for nx, ny in ((bx + 1, by), (bx - 1, by), (bx, by + 1), (bx, by - 1)):
                            if cx <= nx < cx + size and row * size <= ny < (row + 1) * size and (nx, ny) not in seen and dark(px[nx, ny]):
                                seen.add((nx, ny))
                                stack.append((nx, ny))
                    if len(blob) >= area:
                        hits.extend(fat(blob))
    # The black sack is a flat silhouette, so shade it like the walk sheet's sack: a dark rim,
    # the mid red inside, the light red toward the top-left (the sprites' light source).
    reds = [c for c, _ in dst]
    rim, mid, light = reds[0], reds[len(reds) // 2], reds[-1]
    blob = set(hits)
    for x, y in hits:
        edge = any((nx, ny) not in blob for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
        lit = (x - 1, y - 1) not in blob or (x - 2, y - 2) not in blob
        px[x, y] = (rim if edge else light if lit else mid) + (px[x, y][3],)
    sheet.save(HERE / f'{name}.png')
    print(f'{name}: {len(hits)} sack pixels in rows {rows} -> {len(dst)} walk colours')


def cdf(pixels):
    """Distinct colours sorted by luminance, each with the pixel-weighted quantile it ends at."""
    counts = {}
    for p in pixels:
        counts[p] = counts.get(p, 0) + 1
    total, seen, out = sum(counts.values()), 0, []
    for c in sorted(counts, key=lum):
        seen += counts[c]
        out.append((c, (seen - counts[c] / 2) / total))
    return out


def recolor(name):
    """Pixel-weighted quantile mapping, so the suit keeps the walk sheet's balance of light and shade."""
    walk_path, is_src, is_dst = RULES[name]
    sheet = Image.open(HERE / f'{name}.png').convert('RGBA')
    walk = Image.open(ROOT / walk_path).convert('RGBA')
    src = cdf([p[:3] for p in sheet.get_flattened_data() if p[3] > 200 and is_src(p)])
    dst = cdf([p[:3] for p in walk.get_flattened_data() if p[3] > 200 and is_dst(p)])
    mapping = {c: min(dst, key=lambda d: abs(d[1] - q))[0] for c, q in src}
    px = sheet.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            p = px[x, y]
            if p[3] and p[:3] in mapping:
                px[x, y] = mapping[p[:3]] + (p[3],)
    sheet.save(HERE / f'{name}.png')
    print(f'{name}: {len(src)} source colours -> {len(dst)} walk colours')


if __name__ == '__main__':
    (blobs if sys.argv[1] in BLOBS else recolor)(sys.argv[1])
