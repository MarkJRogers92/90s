"""One-time import of the frozen refined-WEST benchmark into a forge-rig/1 + forge-pose/1 pair.

This is an import, not a repair: every pixel comes from the frozen inputs and the result
must re-render the six frozen frames byte-for-byte. What it adds is structure:
  - head: the exact source head (verified against the sheet) and its 8/10/14 degree tilts
    as authored_variant entries that the renderer recomputes and verifies;
  - shoes 0-3: one planted variant, checked as a ground contact with root offsets;
  - hand and bag: their own slots, so attachment, touch and grip are derived per frame;
  - body: the remaining frozen pixels per frame, recorded as authored art.
Joints that came from the frozen manual annotation are imported once, as rig data.

    python3 import_freeze.py   (writes rig.json, recipe.json and parts/ next to this file)
"""
import hashlib
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
FROZEN = HERE.parent / "west-refined-review"
OUT = HERE / "parts"


def load(name, mode="RGBA"):
    return np.array(Image.open(FROZEN / name).convert(mode))


def save(name, array, mode=None):
    OUT.mkdir(exist_ok=True)
    path = OUT / name
    (Image.fromarray(array) if mode is None else Image.fromarray(array, mode)).save(path)
    return {"path": f"parts/{name}", "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def pin(path):
    return {"path": str(path.relative_to(HERE)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def bag_pixels(frame, grip, hand):
    """Tan paper-bag pixels connected to the grip patch, plus the dark outline touching them."""
    r, g, b, a = (frame[:, :, i].astype(int) for i in range(4))
    tan = (a == 255) & (r >= 150) & (r <= 225) & (g >= 100) & (g <= 175) & (b >= 60) & (b <= 120) & (r - b >= 70)
    # Seed from every tan pixel within 6 px of the grip patch: a dark handle can sit between them.
    gy, gx = np.where(grip)
    ty, tx = np.where(tan)
    close = np.zeros(len(ty), bool)
    for y, x in zip(gy, gx):
        close |= (np.abs(ty - y) <= 6) & (np.abs(tx - x) <= 6)
    bag = grip.copy()
    queue = deque()
    for y, x in zip(ty[close], tx[close]):
        bag[y, x] = True; queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < 128 and 0 <= nx < 128 and not bag[ny, nx] and tan[ny, nx]:
                bag[ny, nx] = True; queue.append((ny, nx))
    dark = (a == 255) & (r + g + b < 120)
    near = np.zeros_like(bag)
    near[1:] |= bag[:-1]; near[:-1] |= bag[1:]; near[:, 1:] |= bag[:, :-1]; near[:, :-1] |= bag[:, 1:]
    return (bag | (dark & near) | grip) & ~hand


manifest = json.loads((FROZEN / "manifest.json").read_text())
sheet_path = FROZEN / "source-sheet.png"
sheet = load("source-sheet.png")
crop = load("source-crop.png")
assert np.array_equal(crop, sheet[192:288, 0:96]), "source crop must be the sheet's WEST frame 0"
head_domain = load("head-domain.png", "L") == 255
head = crop.copy(); head[~head_domain] = 0
shoe_domain = load("shoe-domain.png", "L") == 255
shoe_source = load("shoe-source.png")
shoes = shoe_source.copy(); shoes[~shoe_domain] = 0

slots = {
    "body": {"z": 10, "variants": {}},
    "shoes": {"z": 20, "contact": True, "attach": {"parent": "body", "parent_joint": "mount", "joint": "mount"},
              "variants": {"planted": {"image": save("shoes-planted.png", shoes), "domain": save("shoes-domain.png", (shoe_domain * 255).astype(np.uint8), "L"),
                                       "joints": {"mount": [0, 0]},
                                       "provenance": {"kind": "authored", "note": "Frozen planted shoe/cuff region (shoe-source within shoe-domain); exact in frames 0-3."}}}},
    "head": {"z": 30, "attach": {"parent": "body", "parent_joint": "neck", "joint": "neck"},
             "variants": {"source": {"image": save("head-source.png", head), "domain": save("head-domain.png", (head_domain * 255).astype(np.uint8), "L"),
                                     "joints": {"neck": [47, 29]},
                                     "provenance": {"kind": "source", "sheet": "walk", "at": [0, 192]}}}},
    "hand": {"z": 40, "labels": {"side": "anatomical_left", "role": "hand"},
             "attach": {"parent": "body", "parent_joint": "mount", "joint": "mount"}, "variants": {}},
    "bag": {"z": 35, "prop_of": "hand", "labels": {"owner": "near-side anatomical left hand (rig label)"},
            "attach": {"parent": "hand", "parent_joint": "hang", "joint": "hang"}, "variants": {}},  # the bag swings about the hand
}
for degrees in (8, 10, 14):
    image = load(f"head-variant-{degrees:02d}.png")
    slots["head"]["variants"][f"tilt{degrees:02d}"] = {
        "image": save(f"head-tilt{degrees:02d}.png", image), "joints": {"neck": [47, 29]},
        "provenance": {"kind": "authored_variant", "of": "head.source",
                       "method": {"op": "rotate", "degrees": degrees, "pivot": [47, 29], "algorithm": "nearest"}}}

frames, report, moved = [], [], []
roots = {"0": [0, 0], "1": [0, 0], "2": [0, 0], "3": [0, 0], "4": [0, 0], "5": [-91, 0]}  # charge 9 px/tick x 8 ticks, at 96/76 sprite scale
for frame in manifest["frames"]:
    fid = frame["id"]
    pixels = load(frame["image"]["path"])
    lock = frame["identity_locks"][0]
    offset = lock["offset"]
    variant = "source" if lock["source"] == "source-crop" else f"tilt{int(lock['source'][13:15]):02d}"
    head_image = head if variant == "source" else load(lock["source"])
    head_mask = np.zeros((128, 128), bool)
    h_opaque = head_image[:, :, 3] == 255
    ys, xs = np.where(h_opaque)
    head_mask[ys + offset[1], xs + offset[0]] = True
    hand = load(f"hand-patch-{fid}.png", "L") == 255
    grip = load(f"grip-patch-{fid}.png", "L") == 255
    bag = bag_pixels(pixels, grip, hand)
    planted = int(fid) < 4
    shoe_mask = (shoes[:, :, 3] == 255) if planted else np.zeros((128, 128), bool)
    body = pixels.copy()
    body[head_mask | hand | bag | shoe_mask] = 0
    hand_img = np.zeros_like(pixels); hand_img[hand] = pixels[hand]
    bag_img = np.zeros_like(pixels); bag_img[bag] = pixels[bag]
    anchors = frame["anchors"]
    neck = [offset[0] + 47, offset[1] + 29]
    slots["body"]["variants"][f"pose{fid}"] = {
        "image": save(f"body-pose{fid}.png", body),
        "joints": {"mount": [0, 0], "neck": neck,
                   "shoulder": anchors["anatomical_left_shoulder"], "elbow": anchors["anatomical_left_elbow"]},
        "provenance": {"kind": "authored", "note": f"Frozen refined-WEST frame {fid} body (everything but head, hand, bag and planted shoes)."}}
    slots["hand"]["variants"][f"pose{fid}"] = {
        "image": save(f"hand-pose{fid}.png", hand_img),
        "joints": {"mount": [0, 0], "grip": anchors["anatomical_left_hand_center"], "wrist": anchors["anatomical_left_wrist"],
                   "hang": anchors["anatomical_left_hand_center"]},
        "provenance": {"kind": "authored", "note": f"Frozen frame {fid} near (anatomical-left) hand, from hand-patch-{fid}."}}
    # In a rig each pixel has one owner. Where the old annotation put the bag grip on a pixel the
    # hand also claimed, use the nearest bag pixel and record the move.
    gx, gy = anchors["bag_grip"]
    if not bag[gy, gx]:
        by, bx = np.where(bag)
        k = int(np.argmin((bx - gx) ** 2 + (by - gy) ** 2))
        moved.append({"frame": fid, "from": [gx, gy], "to": [int(bx[k]), int(by[k])]})
        gx, gy = int(bx[k]), int(by[k])
    slots["bag"]["variants"][f"pose{fid}"] = {
        "image": save(f"bag-pose{fid}.png", bag_img), "joints": {"hang": anchors["anatomical_left_hand_center"], "grip": [gx, gy]},
        "provenance": {"kind": "authored", "note": f"Frozen frame {fid} bag: tan pixels connected to grip-patch-{fid} plus their outline."}}
    pose = {"body": f"pose{fid}", "head": variant, "hand": f"pose{fid}", "bag": f"pose{fid}"}
    if planted:
        pose["shoes"] = "planted"
    frames.append({"id": fid, "phase": frame["phase"], "duration_ms": [142, 142, 142, 141, 133, 133][int(fid)],
                   "root": roots[fid], "pose": pose, "hidden": [] if planted else ["shoes"],
                   "planted": ["shoes"] if planted else []})
    report.append({"frame": fid, "head": variant, "head_offset": offset, "bag_pixels": int(bag.sum()), "hand_pixels": int(hand.sum())})

# Body pose 0 is the rest pose the limb lengths are measured from.
slots["body"]["rest"] = "pose0"; slots["hand"]["rest"] = "pose0"; slots["bag"]["rest"] = "pose0"
rig = {"schema": "forge-rig/1", "character": "bargain-hunter", "facing": "WEST", "canvas": [128, 128], "asymmetric": True,
       "sheets": {"walk": pin(sheet_path) if sheet_path.is_relative_to(HERE) else None},
       "root_slot": "body", "origin": [0, 0], "slots": slots, "attachment_max_gap_px": 6, "contact_tolerance_px": 0,
       "edge_margin": [1, 1, 1, 1],
       "limbs": [{"name": "near-arm", "chain": ["body.shoulder", "body.elbow", "hand.wrist"], "tolerance_px": 4}]}
# The sheet lives beside the frozen manifest; copy it in so every pin stays beneath this folder.
(OUT / "source-sheet.png").write_bytes(sheet_path.read_bytes())
rig["sheets"]["walk"] = pin(OUT / "source-sheet.png")
(HERE / "rig.json").write_text(json.dumps(rig, indent=1) + "\n")
recipe = {"schema": "forge-pose/1", "rig": pin(HERE / "rig.json"), "frames": frames}
(HERE / "recipe.json").write_text(json.dumps(recipe, indent=1) + "\n")
(HERE / "import-report.json").write_text(json.dumps({"frames": report, "bag_grip_moved": moved}, indent=1) + "\n")
print(json.dumps({"frames": report, "bag_grip_moved": moved}, indent=1))
