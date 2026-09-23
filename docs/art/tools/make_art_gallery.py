#!/usr/bin/env python3
"""Generate a self-contained HTML gallery of the game's RUNTIME art.

This shows the art the game actually loads (`public/assets/**`), not the art
workspace. Those are different trees and the difference matters: `~/deadmall-art`
holds ~1120 files including `.aseprite` masters, tiled proofs and review sheets,
and `docs/art/preview/manifest.json` indexes that tree. What ships to the browser
is the 84 files under `public/assets`, and that is what this gallery renders.

The output is ONE html file with every PNG inlined as a data URI, so it opens by
double-clicking with no server, and it can be moved anywhere without breaking.
It is written into `public/` so the dev server serves it at `/gallery.html`, and
so `vite build` carries it into `dist/` with the game.

Three things it reports that a plain image dump cannot, all derived from the
source rather than asserted by hand:

  * DECLARED       - is the file named by a registry in `src/game/assets.ts` or
                     `src/game/portraits.ts`? A file on disk that no registry
                     declares can never be loaded, so it is dead weight.
  * SELECTED       - for the floor and wall choices, is this piece picked by any
                     room or shop? `FLOOR_FOR_ROOM_ROLE` can name a material that
                     no room in the wing actually reaches.
  * DIMENSIONS     - does the registry's declared width/height match the PNG?

The declared/selected checks are textual, and they say so in the page: a file is
"declared" when its `/assets/...` url appears in the sources, or its filename
stem appears as a quoted string. That second rule is what catches the registries
that build urls from a helper - `decalArt('blood-drops')` and
`effectArt('melee-swing', 50)` never write the filename out in full.

Usage:
    npm run art:gallery
    python3 docs/art/tools/make_art_gallery.py [--out public/gallery.html]
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import sys
from datetime import datetime

from PIL import Image

# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------

#: The directories added by the environment + storefront pass. Kept as a list so
#: the gallery can mark them; a future pass moves this to whatever it added.
ADDED_DIRS = {"tiles", "walls", "storefront"}

SIZE_SUFFIX = re.compile(r"-\d+(x\d+)?$")


def read_png(path: str) -> tuple[int, int, int, str]:
    """Return (width, height, byte size, base64 data uri) for one PNG."""
    with open(path, "rb") as handle:
        raw = handle.read()
    image = Image.open(io.BytesIO(raw))
    encoded = base64.b64encode(raw).decode("ascii")
    return image.width, image.height, len(raw), f"data:image/png;base64,{encoded}"


def source_corpus(repo: str) -> str:
    """Every source file under src/ that can name an asset, concatenated.

    `.css` counts, and not as a technicality: the four HUD icons are named ONLY
    from `src/styles.css`, because the run HUD is DOM rather than Phaser. A
    scan that read only `.ts` reported all four as undeclared art.
    """
    chunks: list[str] = []
    for base, _dirs, files in os.walk(os.path.join(repo, "src")):
        for name in sorted(files):
            if name.endswith((".ts", ".css", ".html")):
                with open(os.path.join(base, name), encoding="utf-8") as handle:
                    chunks.append(handle.read())
    return "\n".join(chunks)


def quoted_strings(corpus: str) -> set[str]:
    """Every quoted string literal in the sources."""
    return set(re.findall(r"'([^'\n]*)'", corpus)) | set(re.findall(r'"([^"\n]*)"', corpus))


def is_declared(record: dict, corpus: str, quoted: set[str]) -> bool:
    """Whether any source names this file.

    Three rules, because three shapes of declaration really occur:

      * the `/assets/...` url appears verbatim - the plain registry entry;
      * the filename stem appears as a quoted string - `decalArt('blood-drops')`
        names the stem while building the url from a template;
      * the stem starts with a quoted string plus a dash - portraits build
        `${DIR}/${kind}.png` and `${DIR}/${kind}-expressions.png`, so the
        `-expressions` files are named by the `kind` string alone.
    """
    if record["url"] in corpus or record["stem"] in quoted:
        return True
    return any(record["stem"].startswith(name + "-") for name in quoted if len(name) > 3)


def parse_registry_entries(assets_source: str) -> tuple[dict[str, str], dict[str, tuple[int, int]]]:
    """Literal registry entries -> (url -> texture, url -> declared width/height).

    Only entries that write width and height as literals are covered; the
    decal, effect, character and enemy tables derive their sizes from a frame
    size or a sheet geometry, so they carry no literal to compare against.
    """
    textures: dict[str, str] = {}
    sizes: dict[str, tuple[int, int]] = {}
    for texture, url, width, height in re.findall(
        r"texture:\s*'([^']+)'\s*,\s*url:\s*'([^']+)'\s*,\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)",
        assets_source,
    ):
        textures[url] = texture
        sizes[url] = (int(width), int(height))
    # Single-texture constants, e.g. ALEX_WALK_URL = '/assets/characters/...'
    for const, url in re.findall(r"(\w+_URL)\s*=\s*'([^']+)'", assets_source):
        textures.setdefault(url, const)
    return textures, sizes


def parse_choice_table(source: str, name: str) -> dict[str, str]:
    """Parse a `export const NAME: Record<...> = { key: 'value', ... }` table.

    Keys may be bare (`service_corridor`) or quoted (`'mall-mart'`), and both
    shapes are in use, so the quote is optional in the pattern.
    """
    match = re.search(rf"{name}[^=]*=\s*\{{(.*?)\n\}}", source, re.S)
    if match is None:
        return {}
    return dict(re.findall(r"'?([\w-]+)'?\s*:\s*'([^']+)'", match.group(1)))


def parse_wall_kinds(source: str) -> set[str]:
    """The wall piece kinds the planner can actually emit."""
    return set(re.findall(r"kind:\s*'(wall-[a-z-]+)'", source))


def parse_wall_repeat(repo: str) -> dict[str, bool]:
    """Map wall piece stem -> does it repeat? Read from `make_walls.py`.

    The generator's `PIECES` table records the axes each piece is built to repeat
    along, and `None` means it is placed rather than tiled. That distinction is
    the difference between an honest preview and a misleading one: repeating a
    corner in a grid claims a repeat-safety the piece was never built for, while
    a column shown once is exactly how it is used.
    """
    path = os.path.join(repo, "docs", "art", "tools", "make_walls.py")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    block = re.search(r"PIECES\s*=\s*\[(.*?)\n\]", source, re.S)
    if block is None:
        return {}
    repeats: dict[str, bool] = {}
    for name, axes in re.findall(
        r'\(\s*"([\w-]+)"\s*,\s*\w+\s*,\s*(None|\([^)]*\))\s*,', block.group(1)
    ):
        repeats[SIZE_SUFFIX.sub("", name)] = axes != "None"
    return repeats


def parse_registry_keys(source: str, name: str) -> set[str]:
    """The entry keys of `export const NAME ... = { ... }`.

    This is what makes "declared but selected by nothing" honest: the set of
    kinds a floor or wall COULD be is the set the registry declares, not the set
    some table happens to mention. Deriving it from the tables instead hides the
    case that matters - a material that has drawn art and a registry entry but
    that no room ever reaches.
    """
    match = re.search(rf"export const {name}\b[^=]*=\s*\{{(.*?)\n\}};", source, re.S)
    if match is None:
        return set()
    keys: set[str] = set()
    for quoted, bare in re.findall(r"(?:'([\w-]+)'|\b([A-Za-z_][\w-]*))\s*:\s*\{", match.group(1)):
        keys.add(quoted or bare)
    return keys


def collect_assets(repo: str) -> list[dict]:
    root = os.path.join(repo, "public", "assets")
    records: list[dict] = []
    for base, _dirs, files in os.walk(root):
        for name in sorted(files):
            if not name.lower().endswith(".png"):
                continue
            path = os.path.join(base, name)
            url = "/" + os.path.relpath(path, os.path.join(repo, "public")).replace(os.sep, "/")
            width, height, size, uri = read_png(path)
            records.append(
                {
                    "url": url,
                    "file": os.path.basename(path),
                    "dir": os.path.relpath(base, root).split(os.sep)[0],
                    "stem": SIZE_SUFFIX.sub("", os.path.splitext(name)[0]),
                    "w": width,
                    "h": height,
                    "bytes": size,
                    "uri": uri,
                }
            )
    return records


def read_palette(path: str) -> list[tuple[int, int, int]]:
    colours: list[tuple[int, int, int]] = []
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith(("GIMP", "Name:", "Columns:", "#")):
                continue
            parts = line.split()
            if len(parts) >= 3:
                try:
                    colours.append((int(parts[0]), int(parts[1]), int(parts[2])))
                except ValueError:
                    continue
    return colours


# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------

CSS = """
:root { --z:6; --tz:2; --bg:#121118; --panel:#1b1922; --line:#2e2b38; --ink:#e9e7f0;
        --dim:#9893a6; --new:#7ddb9b; --unused:#e0a33c; --bad:#e2655f; }
* { box-sizing:border-box; }
html,body { margin:0; background:var(--bg); color:var(--ink);
  font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
a { color:#9fc4ff; }
header { position:sticky; top:0; z-index:5; background:rgba(18,17,24,.94);
  border-bottom:1px solid var(--line); padding:12px 20px; backdrop-filter:blur(6px); }
h1 { font-size:14px; letter-spacing:.12em; text-transform:uppercase; margin:0 0 4px; }
.sub { color:var(--dim); font-size:11px; }
main { padding:0 20px 80px; max-width:1900px; }
h2 { font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--dim);
  margin:34px 0 4px; border-bottom:1px solid var(--line); padding-bottom:6px; }
.note { color:var(--dim); font-size:11px; margin:6px 0 14px; max-width:105ch; }
/* checkerboard so transparency is visible rather than reading as black */
.check { background-image:
  linear-gradient(45deg,#2a2833 25%,transparent 25%,transparent 75%,#2a2833 75%),
  linear-gradient(45deg,#2a2833 25%,transparent 25%,transparent 75%,#2a2833 75%);
  background-size:16px 16px; background-position:0 0,8px 8px; background-color:#1f1d27; }
.grid { display:flex; flex-wrap:wrap; gap:14px; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:6px;
  padding:10px; min-width:120px; }
.card .cap { font-size:11px; margin-top:8px; }
.card .meta { font-size:10px; color:var(--dim); }
.pix { image-rendering:pixelated; display:block; }
.tile { border-radius:3px; }
.badges { margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; }
.b { font-size:9px; letter-spacing:.06em; text-transform:uppercase; padding:1px 5px;
  border-radius:3px; border:1px solid var(--line); color:var(--dim); }
.b.new { color:var(--new); border-color:#2f5c40; }
.b.unused { color:var(--unused); border-color:#5c4620; }
.b.used { color:#8fd0ff; border-color:#2a4a63; }
.b.miss { color:var(--bad); border-color:#5c2b28; }
table { border-collapse:collapse; font-size:11px; margin-top:8px; }
td,th { border:1px solid var(--line); padding:3px 8px; text-align:left; }
th { color:var(--dim); font-weight:normal; }
.shot { max-width:100%; border:1px solid var(--line); border-radius:6px; }
.row { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
.swatches { display:flex; flex-wrap:wrap; gap:2px; margin-top:8px; }
.sw { width:26px; height:26px; border-radius:2px; position:relative; }
.sw span { position:absolute; bottom:-15px; left:0; font-size:8px; color:var(--dim); }
.zoom { position:fixed; right:18px; bottom:18px; z-index:6; background:var(--panel);
  border:1px solid var(--line); border-radius:6px; padding:8px 10px; font-size:11px; }
.zoom button { background:#26232f; color:var(--ink); border:1px solid var(--line);
  border-radius:4px; padding:3px 8px; margin-left:4px; font:inherit; cursor:pointer; }
.zoom button.on { background:#3a3550; border-color:#5b5478; }
"""

JS = """
var MAX_SIDE = 800;
function setZoom(z) {
  document.documentElement.style.setProperty('--z', z);
  // Tiles scale far more slowly than sprites, and deliberately so. A floor
  // material is judged by its REPEAT, and at sprite zoom a 32px tile would be
  // 192px, leaving a 600px swatch showing barely three of them - which hides
  // exactly the thing being judged. Sprites want size; tiles want repeats.
  var tz = Math.max(1, Math.round(z / 3));
  document.documentElement.style.setProperty('--tz', tz);
  document.querySelectorAll('[data-w]').forEach(function (el) {
    var w = +el.dataset.w, h = +el.dataset.h;
    if (el.classList.contains('tile')) {
      el.style.backgroundSize = (w * tz) + 'px ' + (h * tz) + 'px';
      return;
    }
    // Spritesheets are far too big to honour a high zoom: the walk sheet is
    // 192x384, so 3x would be 1152px tall and would swamp the whole page. Cap
    // the longest side and leave small sprites at exactly the zoom asked for.
    var s = z;
    if (Math.max(w, h) * s > MAX_SIDE) s = Math.max(1, Math.floor(MAX_SIDE / Math.max(w, h)));
    el.style.width = (w * s) + 'px';
    el.style.height = (h * s) + 'px';
  });
  document.querySelectorAll('.zoom button').forEach(function (b) {
    b.classList.toggle('on', +b.dataset.z === z);
  });
  var note = document.getElementById('zoomnote');
  if (note) note.textContent = 'sprites ' + z + 'x \\u00b7 tiles ' + tz + 'x';
}
document.addEventListener('DOMContentLoaded', function () {
  // Computed, not inline: `--z` lives in the stylesheet, so reading
  // documentElement.style returns '' and a cast to number would give 0,
  // rendering every sprite at 0px until someone clicked a zoom button.
  var z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z'));
  setZoom(z > 0 ? z : 6);
});
"""


def pic(record: dict, zoom_hint: str = "") -> str:
    """A sprite at the page zoom."""
    return (
        f'<img class="pix check" data-w="{record["w"]}" data-h="{record["h"]}" '
        f'src="{record["uri"]}" alt="{record["file"]}">'
    )


def tile(record: dict, box_w: int, box_h: int, title: str, selected_by: dict) -> str:
    """A live tiling swatch: the browser repeats the texture for us."""
    return (
        f'<div class="card"><div class="tile check" data-w="{record["w"]}" '
        f'data-h="{record["h"]}" style="width:{box_w}px;height:{box_h}px;'
        f'background-image:url({record["uri"]});background-repeat:repeat;'
        f'image-rendering:pixelated"></div>'
        f'<div class="cap">{title}</div>'
        f'<div class="meta">{record["file"]} &middot; {record["w"]}&times;{record["h"]} '
        f'base, tiled {box_w//record["w"]}&times;{max(1, box_h//record["h"])}</div>'
        f'{badges(record, selected_by)}</div>'
    )


def placed(record: dict, title: str, selected_by: dict, note: str) -> str:
    """A piece shown once, at the page zoom, because it is placed not tiled."""
    return (
        f'<div class="card">{pic(record)}'
        f'<div class="cap">{title}</div>'
        f'<div class="meta">{record["file"]} &middot; {record["w"]}&times;{record["h"]} '
        f'&middot; {note}</div>'
        f'{badges(record, selected_by)}</div>'
    )


def badges(record: dict, selected_by: dict[str, list[str]]) -> str:
    out: list[str] = []
    # A candidate is not supposed to be declared, so the undeclared/used badges
    # would be noise on it. It says the one thing that matters instead.
    if record.get("official", True) is False:
        return ('<div class="badges"><span class="b unused">candidate, not shipped</span>'
                '</div>')
    if record["dir"] in ADDED_DIRS:
        out.append('<span class="b new">added this pass</span>')
    if not record["declared"]:
        out.append('<span class="b miss">undeclared</span>')
    seen = selected_by.get(record["stem"])
    if seen:
        out.append(f'<span class="b used">used by {", ".join(seen)}</span>')
    elif record["stem"] in ALL_CHOOSABLE:
        out.append('<span class="b unused">declared, unused by any room</span>')
    return f'<div class="badges">{"".join(out)}</div>' if out else ""


ALL_CHOOSABLE: set[str] = set()


def candidate_rows(repo: str, index: dict, selected_by: dict) -> str:
    """Current tile vs generated candidates, paired by the kind in the filename.

    Candidates sit outside `public/assets` on purpose: nothing in the game points
    at them, so they must not look loadable. The naming contract is
    `cand-<kind>-<n>.png`, where `<kind>` is the `FloorKind` the candidate would
    replace - that is what pairs a candidate with the tile it is competing with.
    """
    directory = os.path.join(repo, "docs", "art", "work", "tiles", "candidates")
    if not os.path.isdir(directory):
        return ""
    groups: dict[str, list[dict]] = {}
    for name in sorted(os.listdir(directory)):
        if not name.lower().endswith(".png"):
            continue
        stem = os.path.splitext(name)[0]
        match = re.match(r"cand-([a-z0-9-]+?)-\d+$", stem)
        kind = match.group(1) if match else stem
        try:
            width, height, size, uri = read_png(os.path.join(directory, name))
        except Exception:
            continue
        groups.setdefault(kind, []).append(
            {
                "url": "",
                "file": name,
                "dir": "candidates",
                "stem": stem,
                "w": width,
                "h": height,
                "bytes": size,
                "uri": uri,
                "official": False,
            }
        )
    if not groups:
        return ""

    out: list[str] = [
        '<h2>Floor candidates</h2>',
        '<div class="note"><b>Nothing here is shipped.</b> No registry and no room points at '
        'these files; they exist so the current tile and the alternatives can be judged side by '
        'side at the same tiling. Promote one by copying it into '
        '<code>public/assets/tiles/</code>, declaring it in <code>FLOOR_ART</code> and selecting '
        'it in <code>FLOOR_FOR_ROOM_ROLE</code> &mdash; and by clearing the seam and palette gates '
        'the current tiles already pass.</div>',
    ]
    for kind in sorted(groups):
        out.append('<div class="row" style="align-items:flex-start;margin-bottom:12px">')
        current = index.get(kind)
        if current:
            out.append(tile(current, 480, 240, f"current: {kind}", selected_by))
        for record in groups[kind]:
            out.append(
                tile(record, 480, 240, os.path.splitext(record["file"])[0], selected_by)
            )
        out.append("</div>")
    return "".join(out)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=None)
    parser.add_argument("--repo", default=None)
    args = parser.parse_args(argv)

    repo = args.repo or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    out = args.out or os.path.join(repo, "public", "gallery.html")

    assets_source_path = os.path.join(repo, "src", "game", "assets.ts")
    room_source_path = os.path.join(repo, "src", "game", "view", "RoomEnvironment.ts")
    with open(assets_source_path, encoding="utf-8") as handle:
        assets_source = handle.read()
    with open(room_source_path, encoding="utf-8") as handle:
        room_source = handle.read()

    corpus = source_corpus(repo)
    quoted = quoted_strings(corpus)
    texture_by_url, declared_sizes = parse_registry_entries(assets_source)
    records = collect_assets(repo)

    for record in records:
        record["declared"] = is_declared(record, corpus, quoted)
        record["texture"] = texture_by_url.get(record["url"])

    # ---- selected: which art a room or shop actually reaches -----------------
    floor_rooms = parse_choice_table(room_source, "FLOOR_FOR_ROOM_ROLE")
    floor_stores = parse_choice_table(room_source, "FLOOR_FOR_STORE_TEMPLATE")
    sign_stores = parse_choice_table(room_source, "SIGN_FOR_STORE_TEMPLATE")
    wall_kinds = parse_wall_kinds(room_source)
    repeat_by_stem = parse_wall_repeat(repo)

    selected_by: dict[str, list[str]] = {}
    for role, kind in floor_rooms.items():
        selected_by.setdefault(kind, []).append(role)
    for template, kind in floor_stores.items():
        selected_by.setdefault(kind, []).append(f"{template} shop")
    for template, kind in sign_stores.items():
        selected_by.setdefault(kind, []).append(f"{template} shop")
    for kind in wall_kinds:
        selected_by.setdefault(kind, []).append("rooms")
    # The fascia is chosen by the renderer rather than by a table: the planner
    # emits the band's geometry with no kind on it, so its use is proved from the
    # one place that names the texture.
    with open(os.path.join(repo, "src", "game", "view", "MvpRunView.ts"), encoding="utf-8") as handle:
        renderer_source = handle.read()
    if "'storefront-fascia'" in renderer_source:
        selected_by.setdefault("storefront-fascia", []).append("every shopfront")

    # Every floor kind and wall/storefront piece that is DECLARED - the set a
    # table could have named. Anything here that no table selects is art with a
    # registry entry and no room to appear in.
    choosable = (
        parse_registry_keys(assets_source, "FLOOR_ART")
        | parse_registry_keys(assets_source, "WALL_ART")
        | parse_registry_keys(assets_source, "STOREFRONT_ART")
    )
    ALL_CHOOSABLE.update(choosable)

    palette = read_palette(os.path.join(repo, "docs", "art", "work", "deadmall-global.gpl"))

    by_dir: dict[str, list[dict]] = {}
    for record in records:
        by_dir.setdefault(record["dir"], []).append(record)
    index = {record["stem"]: record for record in records}

    def pick(directory: str, stem: str) -> dict | None:
        return index.get(stem)

    # ---- integrity -----------------------------------------------------------
    declared_urls = set(texture_by_url)
    missing = sorted(url for url in declared_urls if not os.path.exists(
        os.path.join(repo, "public", url.lstrip("/"))))
    undeclared = sorted(r["url"] for r in records if not r["declared"])
    chosen_unused = sorted(k for k in choosable if k not in selected_by)
    by_url = {record["url"]: record for record in records}
    size_mismatch: list[tuple[str, tuple[int, int], tuple[int, int]]] = []
    for url, declared in sorted(declared_sizes.items()):
        record = by_url.get(url)
        if record is not None and (record["w"], record["h"]) != declared:
            size_mismatch.append((url, declared, (record["w"], record["h"])))

    # ---- page ----------------------------------------------------------------
    parts: list[str] = []
    add = parts.append
    add(f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>DEAD MALL - runtime art</title><style>{CSS}</style></head><body>
<header>
  <h1>DEAD MALL &mdash; runtime art</h1>
  <div class="sub">{len(records)} files under <code>public/assets/</code> &middot;
   {sum(1 for r in records if r["dir"] in ADDED_DIRS)} added by the environment + storefront pass &middot;
   generated {datetime.now().strftime('%Y-%m-%d %H:%M')} &middot;
   {len(palette)}-colour palette</div>
</header>
<main>""")

    add(f"""<h2>In the game</h2>
<div class="note">Straight out of the running build. The HUD is DOM rather than art,
so it is cropped off to leave only the drawn view.</div>
<div class="row">""")
    for shot, caption in (("storefront-before-after.png", "storefront, before &rarr; after"),
                          ("corridor-beige-tile.png", "service corridor, beige tile"),
                          ("storefront-signed.png", "storefront, signed and fitted")):
        path = os.path.join(repo, "docs", "art", "preview", "shots", shot)
        if not os.path.exists(path):
            continue
        with open(path, "rb") as handle:
            uri = base64.b64encode(handle.read()).decode("ascii")
        add(f'<figure style="margin:0"><img class="shot" src="data:image/png;base64,{uri}"'
            f' alt="{caption}" style="max-width:{min(1200, 1314)}px">'
            f'<figcaption class="meta">{caption}</figcaption></figure>')
    add("</div>")

    # Floors
    add(f"""<h2>Floor materials</h2>
<div class="note">32&times;32, drawn 1:1 and repeat-safe: every join was measured no
worse than the tile's own worst interior transition, with zero off-palette pixels
(<code>docs/art/work/tiles/report.json</code>). Shown here genuinely tiled by the
browser, which is how repeat-safety is judged by eye.</div><div class="grid">""")
    for kind in sorted({r["stem"] for r in records if r["dir"] == "tiles"}):
        record = pick("tiles", kind)
        if record:
            add(tile(record, 600, 300,kind, selected_by))
    add("</div>")

    add(candidate_rows(repo, index, selected_by))

    add(f"""<h2>Walls</h2>
<div class="note">The 64-tall family. A face and a corner stand two tile-rows high,
because height is what makes a wall read as a wall; the top is a separate 32&times;32
surface that repeats in both axes for runs seen from above.</div><div class="grid">""")
    for stem in ("wall-face", "wall-top", "wall-corner", "column", "railing-glass", "security-gate"):
        record = pick("walls", stem)
        if record is None:
            continue
        if repeat_by_stem.get(stem, True):
            add(tile(record, 600, 300,stem, selected_by))
        else:
            add(placed(record, stem, selected_by, "placed, not tiled"))
    add("</div>")

    # Storefronts
    add(f"""<h2>Storefronts</h2>
<div class="note">The fascia is a repeating band that runs along a shop's front edge
on both sides of its doorway; the signs are the doorway's own width, so a board sits
flush over the door with nothing aligned by hand. Both colourways are shown - which
shop gets which is <code>SIGN_FOR_STORE_TEMPLATE</code>.</div><div class="grid">""")
    fascia = pick("storefront", "storefront-fascia")
    if fascia:
        add(tile(fascia, 600, 300, "storefront-fascia", selected_by))
    for stem in ("sign-warm", "sign-cool"):
        record = pick("storefront", stem)
        if record:
            add(placed(record, stem, selected_by, "one board per shop, not tiled"))
    add("</div>")

    # Everything else
    for directory in sorted(d for d in by_dir if d not in ADDED_DIRS):
        rows = by_dir[directory]
        add(f'<h2>{directory}</h2><div class="note">{len(rows)} files, '
            f'{sum(r["bytes"] for r in rows)//1024} KB.</div><div class="grid">')
        for record in rows:
            add(f'<div class="card">{pic(record)}<div class="cap">{record["stem"]}</div>'
                f'<div class="meta">{record["file"]} &middot; {record["w"]}&times;{record["h"]}</div>'
                f'{badges(record, selected_by)}</div>')
        add("</div>")

    # Palette
    add(f'<h2>Palette</h2><div class="note">{len(palette)} colours extracted from the '
        f'approved board (<code>deadmall-global.gpl</code>), which every piece above was '
        f'generated or validated against.</div><div class="swatches">')
    for r, g, b in palette:
        add(f'<div class="sw" style="background:#{r:02x}{g:02x}{b:02x}" '
            f'title="#{r:02x}{g:02x}{b:02x}"></div>')
    add("</div>")

    # Integrity
    add(f"""<h2>Integrity</h2>
<div class="note">Derived from the source, not asserted by hand. "Declared" means the
file's <code>/assets/...</code> url appears in the sources, or its filename stem
appears as a quoted string - the second rule is what catches the registries built from
a helper such as <code>decalArt('blood-drops')</code>, which never writes the filename
out in full. Two classes of finding are expected rather than wrong, and are noted
under the tables.</div>""")
    add(f'<table><tr><th>check</th><th>count</th></tr>'
        f'<tr><td>files on disk</td><td>{len(records)}</td></tr>'
        f'<tr><td>declared by a registry</td><td>{sum(1 for r in records if r["declared"])}</td></tr>'
        f'<tr><td>declared but missing from disk</td><td>{len(missing)}</td></tr>'
        f'<tr><td>on disk but undeclared</td><td>{len(undeclared)}</td></tr>'
        f'<tr><td>declared size disagrees with the PNG</td><td>{len(size_mismatch)}</td></tr>'
        f'<tr><td>choosable kinds unused by any room</td><td>{len(chosen_unused)}</td></tr>'
        f'</table>')
    if size_mismatch:
        rows = "".join(
            f'<tr><td>{url}</td><td>{d[0]}&times;{d[1]}</td><td>{a[0]}&times;{a[1]}</td></tr>'
            for url, d, a in size_mismatch)
        add('<div class="note"><b>Declared size disagrees with the PNG</b> &mdash; the '
            'runtime draws these, so the difference is a sprite at the wrong scale:'
            f'<table><tr><th>url</th><th>declared</th><th>actual</th></tr>{rows}</table></div>')
    if missing:
        add('<div class="note"><b>Declared but missing from disk</b> &mdash; these would '
            'fail to load: ' + ", ".join(missing) + '</div>')
    if undeclared:
        add('<div class="note"><b>On disk but undeclared</b> &mdash; unreachable, since '
            'nothing names them. Some of this is deliberate: <code>EFFECT_ART</code> says '
            'it lists only cues the run can detect, so an authored strip whose event does '
            'not exist yet is parked rather than loaded.<br>' + "<br>".join(undeclared) + '</div>')
    if chosen_unused:
        add('<div class="note"><b>Choosable but selected by nothing</b> &mdash; art and a '
            'table entry exist, but no room reaches it: ' + ", ".join(chosen_unused) + '</div>')

    add('</main><div class="zoom">zoom')
    for z in (1, 2, 3, 4, 6, 8, 12):
        add(f'<button data-z="{z}" onclick="setZoom({z})">{z}x</button>')
    add(f'<div class="meta" id="zoomnote" style="margin-top:5px"></div>'
        f'</div><script>{JS}</script></body></html>')

    html = "".join(parts)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        handle.write(html)

    print(f"make_art_gallery: {len(records)} assets, {len(palette)} colours")
    print(f"  declared {sum(1 for r in records if r['declared'])}/{len(records)}"
          f"   missing {len(missing)}   undeclared {len(undeclared)}"
          f"   size-mismatch {len(size_mismatch)}   choosable-unused {len(chosen_unused)}")
    if chosen_unused:
        print(f"  unused by any room: {', '.join(chosen_unused)}")
    if undeclared:
        print(f"  undeclared on disk ({len(undeclared)}): {', '.join(undeclared[:6])}"
              + (" ..." if len(undeclared) > 6 else ""))
    print(f"  wrote {out}  ({os.path.getsize(out)//1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
