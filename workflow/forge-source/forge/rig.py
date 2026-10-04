"""Rig + pose recipe authoring (forge-rig/1, forge-pose/1).

A rig is a character facing taken apart once: named slots (head, torso, near hand,
bag, shoe, ...) whose variants are pinned PNGs with joints, a parent joint to hang
from, a draw order and labels. A pose recipe says, per frame, which variant each
slot shows, small integer nudges, the root's ground offset, which contact slots are
planted, and any bounded repair layers (mask + pixels + reason).

Rendering is deterministic and integer-only: no resampling, no blending (exact RGBA
replacement in draw order), binary alpha, no mirroring on asymmetric rigs. The
renderer then writes the schema-1 animation manifest itself, so anchors, part masks,
identity locks, attachments, planted-contact intervals and root offsets are derived
from the rig instead of being hand-annotated per frame. The output is meant to go
through the unchanged checked `animation-export`.

What stays a human judgement: whether the rig's labels are right (which slot is the
anatomical-left hand, who owns the bag), anatomy, and whether the motion looks good.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from . import animation_checks as ac
from .authoring_store import directory, publish_exclusive
from .bounded_io import read_bounded

MAX_JSON_BYTES = 1024 * 1024
MAX_SLOTS = 64
MAX_VARIANTS = 64
MAX_REPAIRS = 32
PHASES = ("stance", "windup", "charge", "airborne", "recovery")  # as animation_checks accepts
KINDS = {"source": "source", "authored_variant": "authored-variant", "authored": "authored"}


class RigError(ValueError):
    pass


def need(condition, message):
    if not condition:
        raise RigError(message)


def _int_pair(value, name):
    need(isinstance(value, list) and len(value) == 2 and all(type(v) is int and abs(v) <= 4096 for v in value),
         f"{name} must be two bounded integers")
    return int(value[0]), int(value[1])


def _name(value, what):
    need(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,40}", value) is not None,
         f"{what} must be 1-40 letters, digits, '-' or '_'")
    return value


class Pins:
    """Pinned inputs beneath one directory: safe relative paths, exact SHA-256, bounded reads."""

    def __init__(self, base):
        self.base = Path(base).resolve(strict=True)
        self.inputs = {}

    def read(self, reference, limit):
        need(isinstance(reference, dict), "file reference must be an object")
        raw, expected = reference.get("path"), reference.get("sha256")
        need(isinstance(raw, str) and 0 < len(raw) <= 4096, "invalid reference path")
        rel = Path(raw)
        need(not rel.is_absolute() and ".." not in rel.parts, f"reference path must stay beneath {self.base}")
        target = (self.base / rel).resolve(strict=True)
        need(target.is_relative_to(self.base) and target.is_file(), "reference escapes its directory")
        need(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected) is not None,
             "sha256 must be 64 lowercase hexadecimal characters")
        data = read_bounded(target, limit)
        digest = hashlib.sha256(data).hexdigest()
        need(digest == expected, f"SHA-256 mismatch: {raw}")
        self.inputs[raw] = (digest, data)
        return data

    def json(self, reference):
        try:
            return json.loads(self.read(reference, MAX_JSON_BYTES))
        except ValueError as error:
            if isinstance(error, RigError):
                raise
            raise RigError(f"invalid JSON: {error}") from error

    def png(self, reference, max_side=ac.MAX_SIDE):
        data = self.read(reference, ac.MAX_FILE_BYTES)
        with Image.open(io.BytesIO(data)) as image:
            need(image.format == "PNG" and getattr(image, "n_frames", 1) == 1, f"{reference['path']} must be a single-frame PNG")
            need(0 < image.width <= max_side and 0 < image.height <= max_side, f"{reference['path']} exceeds {max_side} px")
            need(image.width * image.height <= ac.MAX_IMAGE_PIXELS, f"{reference['path']} exceeds 1 megapixel")
            rgba = np.array(image.convert("RGBA"))
        need(np.isin(rgba[:, :, 3], [0, 255]).all(), f"{reference['path']} must have binary alpha (no blending)")
        return rgba


def _mask(pins, reference, shape):
    data = pins.read(reference, ac.MAX_FILE_BYTES)
    with Image.open(io.BytesIO(data)) as image:
        need(image.format == "PNG" and image.mode in ("1", "L"), f"{reference['path']} must be a grayscale PNG mask")
        array = np.array(image.convert("L"))
    need(np.isin(array, [0, 255]).all() and array.shape == shape, f"{reference['path']} must be a binary mask of the canvas")
    return array == 255


def load(recipe_path):
    recipe_path = Path(recipe_path).resolve(strict=True)
    pins = Pins(recipe_path.parent)
    recipe_bytes = read_bounded(recipe_path, MAX_JSON_BYTES)
    try:
        recipe = json.loads(recipe_bytes)
    except ValueError as error:
        raise RigError(f"invalid recipe JSON: {error}") from error
    need(isinstance(recipe, dict) and recipe.get("schema") == "forge-pose/1", "recipe schema must be forge-pose/1")
    rig_doc = pins.json(recipe.get("rig"))
    need(isinstance(rig_doc, dict) and rig_doc.get("schema") == "forge-rig/1", "rig schema must be forge-rig/1")
    return recipe, recipe_bytes, rig_doc, pins


class Rig:
    def __init__(self, doc, pins):
        self.doc, self.pins = doc, pins
        self.width, self.height = _int_pair(doc.get("canvas"), "canvas")
        need(1 <= self.width <= ac.MAX_SIDE and 1 <= self.height <= ac.MAX_SIDE, "canvas exceeds 512 px")
        self.asymmetric = doc.get("asymmetric", True)
        need(type(self.asymmetric) is bool, "asymmetric must be boolean")
        sheets = doc.get("sheets")
        need(isinstance(sheets, dict) and 0 < len(sheets) <= 8, "rig needs 1-8 pinned source sheets")
        self.sheets = {_name(k, "sheet name"): pins.png(v, ac.MAX_REFERENCE_SIDE) for k, v in sheets.items()}  # references, not frames
        self.sheet_refs = sheets
        slots = doc.get("slots")
        need(isinstance(slots, dict) and 0 < len(slots) <= MAX_SLOTS, f"rig needs 1-{MAX_SLOTS} slots")
        self.root = doc.get("root_slot")
        need(self.root in slots, "root_slot must name a slot")
        self.origin = _int_pair(doc.get("origin"), "origin")
        self.slots, self.variants = {}, {}
        for slot, spec in slots.items():
            _name(slot, "slot name")
            need(not slot.startswith("_"), f"slot name {slot!r} may not start with '_' (reserved)")
            need(isinstance(spec, dict) and type(spec.get("z")) is int, f"slot {slot} needs an integer z")
            attach = spec.get("attach")
            if slot == self.root:
                need(attach is None, "the root slot does not attach to a parent")
            else:
                need(isinstance(attach, dict) and attach.get("parent") in slots and attach["parent"] != slot,
                     f"slot {slot} must attach to another slot")
            variants = spec.get("variants")
            need(isinstance(variants, dict) and 0 < len(variants) <= MAX_VARIANTS, f"slot {slot} needs variants")
            self.slots[slot] = spec
            for name, variant in variants.items():
                self.variants[(slot, _name(name, "variant name"))] = self._variant(slot, name, variant)
        self._verify_derivations()
        self.order = self._attach_order()
        for slot, spec in self.slots.items():
            if "prop_of" in spec:
                need(spec["prop_of"] in self.slots and spec["prop_of"] != slot, f"{slot}: prop_of must name another slot")
            need(type(spec.get("contact", False)) is bool, f"{slot}: contact must be boolean")
        self.edge_margin = doc.get("edge_margin", [1, 1, 1, 1])
        self.limbs = []
        limbs = doc.get("limbs", [])
        need(isinstance(limbs, list) and len(limbs) <= 16, "limbs must be a list of at most 16")
        for limb in limbs:
            need(isinstance(limb, dict) and isinstance(limb.get("chain"), list) and 2 <= len(limb["chain"]) <= 8,
                 "a limb needs a chain of 2-8 slot.joint names")
            chain = []
            for point in limb["chain"]:
                need(isinstance(point, str) and point.count(".") == 1 and point.split(".")[0] in self.slots,
                     f"limb point {point!r} must be slot.joint")
                chain.append(tuple(point.split(".")))
            tolerance = limb.get("tolerance_px", 2)
            need(type(tolerance) in (int, float) and 0 <= tolerance <= 64, "tolerance_px must be 0-64")
            self.limbs.append({"name": _name(limb.get("name"), "limb name"), "chain": chain, "tolerance": tolerance})

    def _verify_derivations(self):
        """Recompute every derived variant from its base, bases first; refuse self-reference and cycles."""
        derived = {key: tuple(v["provenance"]["of"].split(".")) for key, v in self.variants.items() if v["kind"] == "authored_variant"}
        for (slot, name), (base_slot, base_name) in derived.items():
            need((base_slot, base_name) != (slot, name), f"{slot}.{name}: a variant cannot derive from itself")
            need(base_slot == slot and (base_slot, base_name) in self.variants, f"{slot}.{name}: 'of' must name another variant of the same slot")
        done, order = set(), []
        while len(done) < len(derived):
            ready = [k for k, base in derived.items() if k not in done and (base not in derived or base in done)]
            need(ready, "derived variants form a cycle: " + ", ".join(f"{s}.{n}" for s, n in sorted(set(derived) - done)))
            for key in sorted(ready):
                done.add(key); order.append(key)
        for slot, name in order:
            variant = self.variants[(slot, name)]
            base = self.variants[derived[(slot, name)]]
            expected, joints = derive(base["image"], {k: list(v) for k, v in base["joints"].items()}, variant["provenance"]["method"])
            need(expected.shape == variant["image"].shape and np.array_equal(expected, variant["image"]),
                 f"{slot}.{name} does not match its recorded derivation from {slot}.{derived[(slot, name)][1]}")
            declared = {k: list(v) for k, v in variant["joints"].items()}
            need(declared == joints, f"{slot}.{name}: declared joints {declared} differ from the recomputed joints {joints}")
            variant["derivation_verified"] = True

    def rest_variant(self, slot):
        rest = self.slots[slot].get("rest", next(iter(self.slots[slot]["variants"])))
        need((slot, rest) in self.variants, f"{slot}: rest variant {rest!r} does not exist")
        return rest

    def joint(self, placements, slot, joint):
        place = placements[slot]
        joints = self.variants[(slot, place["variant"])]["joints"]
        need(joint in joints, f"{slot}.{place['variant']} lacks joint {joint}")
        return [place["left"] + joints[joint][0], place["top"] + joints[joint][1]]

    def _variant(self, slot, name, spec):
        need(isinstance(spec, dict), f"{slot}.{name} must be an object")
        image = self.pins.png(spec.get("image"))
        joints = spec.get("joints", {})
        need(isinstance(joints, dict) and len(joints) <= 32, f"{slot}.{name}: joints must be an object")
        joints = {_name(k, "joint name"): _int_pair(v, f"{slot}.{name}.{k}") for k, v in joints.items()}
        provenance = spec.get("provenance")
        need(isinstance(provenance, dict) and provenance.get("kind") in KINDS, f"{slot}.{name}: provenance kind must be one of {sorted(KINDS)}")
        if provenance.get("mirrored", False):
            need(not self.asymmetric, f"{slot}.{name}: a mirrored variant is refused on an asymmetric rig")
        kind = provenance["kind"]
        if kind == "source":
            sheet = self.sheets.get(provenance.get("sheet"))
            need(sheet is not None, f"{slot}.{name}: unknown source sheet")
            x, y = _int_pair(provenance.get("at"), f"{slot}.{name}.at")
            h, w = image.shape[:2]
            need(0 <= x and 0 <= y and x + w <= sheet.shape[1] and y + h <= sheet.shape[0], f"{slot}.{name}: source rectangle leaves the sheet")
            opaque = image[:, :, 3] == 255
            need(np.array_equal(image[opaque], sheet[y:y + h, x:x + w][opaque]),
                 f"{slot}.{name}: claimed source pixels differ from the sheet")
        elif kind == "authored_variant":
            of = provenance.get("of")
            need(isinstance(of, str) and re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", of) is not None,
                 f"{slot}.{name}: authored_variant needs 'of' as slot.variant")
            need(isinstance(provenance.get("method"), dict), f"{slot}.{name}: authored_variant needs a method record")
        else:
            need(isinstance(provenance.get("note"), str) and 0 < len(provenance["note"]) <= 400,
                 f"{slot}.{name}: authored art needs a note saying what it is")
        domain = None
        if spec.get("domain") is not None:
            data = self.pins.read(spec["domain"], ac.MAX_FILE_BYTES)
            with Image.open(io.BytesIO(data)) as im:
                need(im.format == "PNG" and im.mode in ("1", "L"), f"{slot}.{name}: domain must be a grayscale PNG")
                domain = np.array(im.convert("L"))
            need(np.isin(domain, [0, 255]).all() and domain.shape == image.shape[:2], f"{slot}.{name}: domain must be a binary mask of the variant")
            domain = domain == 255
        return {"image": image, "joints": joints, "kind": kind, "ref": spec["image"], "provenance": provenance, "domain": domain}

    def _attach_order(self):
        order, placed = [self.root], {self.root}
        while len(order) < len(self.slots):
            ready = sorted(s for s, spec in self.slots.items() if s not in placed and spec["attach"]["parent"] in placed)
            need(ready, "slot attachments form a cycle")
            order.extend(ready)
            placed.update(ready)
        return order


# --- Derived variants -------------------------------------------------------------

def _scale2x(a):
    """Scale2x/EPX on RGBA: copies existing pixels only, so palette and binary alpha survive."""
    packed = np.ascontiguousarray(a).view(np.uint32)[:, :, 0]
    p = np.pad(packed, 1, mode="edge")
    e, b, d, f, h = p[1:-1, 1:-1], p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 2:], p[2:, 1:-1]
    out = np.empty((packed.shape[0] * 2, packed.shape[1] * 2), np.uint32)
    out[0::2, 0::2] = np.where((d == b) & (b != f) & (d != h), d, e)
    out[0::2, 1::2] = np.where((b == f) & (b != d) & (f != h), f, e)
    out[1::2, 0::2] = np.where((d == h) & (d != b) & (h != f), d, e)
    out[1::2, 1::2] = np.where((h == f) & (d != h) & (b != f), f, e)
    return out.view(np.uint8).reshape(out.shape[0], out.shape[1], 4)


def _rotate(a, degrees, pivot, algorithm, track=False):
    if algorithm == "nearest":
        return np.array(Image.fromarray(a).rotate(degrees, resample=Image.NEAREST, center=tuple(pivot)))
    # RotSprite (Xenowhirl's public algorithm): Scale2x three times, rotate at 8x, sample block centres.
    # When tracking positions, upscale by plain repetition so each 8x8 block keeps its source index.
    up = a
    if track:
        up = np.repeat(np.repeat(a, 8, axis=0), 8, axis=1)
    for _ in range(0 if track else 3):
        up = _scale2x(up)
    turned = np.array(Image.fromarray(up).rotate(degrees, resample=Image.NEAREST, center=(pivot[0] * 8, pivot[1] * 8)))
    return np.ascontiguousarray(turned[4::8, 4::8])


def derive(image, joints, method):
    """Deterministically derive a variant (and where its joints go) from a source image.

    Joints follow their own pixel: the same rotation is run on an index image (every
    pixel a unique colour), so each output pixel names the source pixel it came from,
    with exactly the library's rounding. A joint whose pixel disappears, or that lies
    outside the part, is rotated about pixel centres instead.
    """
    need(isinstance(method, dict) and method.get("op") == "rotate", "only the rotate derivation is supported")
    degrees = method.get("degrees")
    need(type(degrees) in (int, float) and -360 <= degrees <= 360, "rotate needs degrees in [-360, 360]")
    pivot = _int_pair(method.get("pivot"), "pivot")
    algorithm = method.get("algorithm", "nearest")
    need(algorithm in ("nearest", "rotsprite"), "algorithm must be nearest or rotsprite")
    image = np.ascontiguousarray(image, dtype=np.uint8)
    h, w = image.shape[:2]
    out = _rotate(image, degrees, pivot, algorithm)
    index = np.arange(1, h * w + 1, dtype=np.uint32)
    index_image = np.zeros((h, w, 4), np.uint8)
    index_image[:, :, 0] = (index & 255).reshape(h, w); index_image[:, :, 1] = ((index >> 8) & 255).reshape(h, w)
    index_image[:, :, 2] = ((index >> 16) & 255).reshape(h, w); index_image[:, :, 3] = 255
    moved = _rotate(index_image, degrees, pivot, algorithm, track=True).astype(np.uint32)
    came_from = np.where(moved[:, :, 3] == 255, moved[:, :, 0] | (moved[:, :, 1] << 8) | (moved[:, :, 2] << 16), 0)
    theta = np.radians(degrees)
    new_joints = {}
    for name, (jx, jy) in joints.items():
        if [jx, jy] == list(pivot):
            new_joints[name] = [jx, jy]           # the rotation's fixed point never moves
            continue
        dx, dy = jx + 0.5 - pivot[0], jy + 0.5 - pivot[1]
        fx = pivot[0] + dx * np.cos(theta) + dy * np.sin(theta)
        fy = pivot[1] - dx * np.sin(theta) + dy * np.cos(theta)
        # Geometric position tracking: for RotSprite the index image is upscaled without Scale2x's
        # colour decisions, so a hit means "this output pixel sampled inside the joint's source pixel".
        hits = np.argwhere(came_from == (jy * w + jx + 1)) if 0 <= jx < w and 0 <= jy < h else np.empty((0, 2))
        best = min(hits.tolist(), key=lambda p: (p[1] + 0.5 - fx) ** 2 + (p[0] + 0.5 - fy) ** 2) if len(hits) else None
        if best is not None and abs(best[1] + 0.5 - fx) <= 1.5 and abs(best[0] + 0.5 - fy) <= 1.5:
            new_joints[name] = [int(best[1]), int(best[0])]
        else:
            new_joints[name] = [int(np.floor(fx)), int(np.floor(fy))]
    return out, new_joints


def _pose_entry(value, slot):
    if isinstance(value, str):
        return value, (0, 0)
    need(isinstance(value, dict) and isinstance(value.get("variant"), str), f"pose for {slot} must be a variant name or {{variant, nudge}}")
    return value["variant"], _int_pair(value.get("nudge", [0, 0]), f"{slot} nudge")


def render_frame(rig, frame, pins):
    pose = frame.get("pose")
    hidden = frame.get("hidden", [])
    need(isinstance(pose, dict) and isinstance(hidden, list), "frame needs a pose object")
    need(set(pose) | set(hidden) == set(rig.slots) and not set(pose) & set(hidden),
         "every slot must be posed or listed as hidden exactly once")
    placements = {}
    for slot in rig.order:
        if slot in hidden:
            continue
        variant_name, (nx, ny) = _pose_entry(pose[slot], slot)
        variant = rig.variants.get((slot, variant_name))
        need(variant is not None, f"unknown variant {slot}.{variant_name}")
        if slot == rig.root:
            jx, jy = variant["joints"].get("root", (0, 0))
            left, top = rig.origin[0] - jx + nx, rig.origin[1] - jy + ny
        else:
            attach = rig.slots[slot]["attach"]
            parent = placements.get(attach["parent"])
            need(parent is not None, f"{slot} hangs from hidden slot {attach['parent']}")
            pvariant = rig.variants[(attach["parent"], parent["variant"])]
            need(attach.get("parent_joint") in pvariant["joints"], f"{attach['parent']}.{parent['variant']} lacks joint {attach.get('parent_joint')}")
            need(attach.get("joint") in variant["joints"], f"{slot}.{variant_name} lacks joint {attach.get('joint')}")
            px, py = pvariant["joints"][attach["parent_joint"]]
            cx, cy = variant["joints"][attach["joint"]]
            left, top = parent["left"] + px - cx + nx, parent["top"] + py - cy + ny
        placements[slot] = {"variant": variant_name, "left": left, "top": top, "nudge": [nx, ny]}
    out = np.zeros((rig.height, rig.width, 4), np.uint8)
    owner = np.full((rig.height, rig.width), -1, np.int16)
    layers = {}
    slots = list(rig.slots)
    for slot in sorted(placements, key=lambda s: (rig.slots[s]["z"], s)):
        place = placements[slot]
        image = rig.variants[(slot, place["variant"])]["image"]
        h, w = image.shape[:2]
        x0, y0 = place["left"], place["top"]
        ys, xs = np.where(image[:, :, 3] == 255)
        need(len(ys) == 0 or (xs.min() + x0 >= 0 and ys.min() + y0 >= 0 and xs.max() + x0 < rig.width and ys.max() + y0 < rig.height),
             f"{slot}.{place['variant']} at [{x0}, {y0}]: visible pixels leave the canvas")
        cel = np.zeros_like(out)
        sx0, sy0 = max(0, -x0), max(0, -y0)                       # clear margins may hang off the canvas
        dx0, dy0 = max(0, x0), max(0, y0)
        cw, ch = min(w - sx0, rig.width - dx0), min(h - sy0, rig.height - dy0)
        cel[dy0:dy0 + ch, dx0:dx0 + cw] = image[sy0:sy0 + ch, sx0:sx0 + cw]
        opaque = cel[:, :, 3] == 255
        out[opaque] = cel[opaque]
        owner[opaque] = slots.index(slot)
        layers[slot] = cel
    repairs = []
    repair_cel = np.zeros_like(out)
    frame_repairs = frame.get("repairs", [])
    need(isinstance(frame_repairs, list) and len(frame_repairs) <= MAX_REPAIRS, f"at most {MAX_REPAIRS} repairs per frame")
    for repair in frame_repairs:
        need(isinstance(repair, dict) and isinstance(repair.get("reason"), str) and 0 < len(repair["reason"]) <= 200,
             "every repair needs a reason")
        image = pins.png(repair.get("image"))
        mask = _mask(pins, repair.get("mask"), (rig.height, rig.width))
        need(image.shape[:2] == mask.shape, "repair image must match the canvas")
        out[mask] = image[mask]
        out[mask & (image[:, :, 3] == 0)] = 0
        owner[mask] = -2
        for cel in layers.values():
            cel[mask] = 0                     # the layered document must compose to the same frame
        repair_cel[mask] = image[mask]
        repairs.append({"reason": repair["reason"], "pixels": int(mask.sum()),
                        "image_sha256": repair["image"]["sha256"], "mask_sha256": repair["mask"]["sha256"]})
    if repairs:
        layers["_repair"] = repair_cel
    visible = {slot: owner == slots.index(slot) for slot in placements}
    return out, placements, visible, layers, repairs, owner


def _to_local(canvas_mask, place, h, w, fill):
    """A canvas-sized mask seen in a variant's own coordinates (off-canvas cells get `fill`)."""
    local = np.full((h, w), fill, bool)
    ch, cw = canvas_mask.shape
    x0, y0 = place["left"], place["top"]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    width, height = min(w - sx0, cw - dx0), min(h - sy0, ch - dy0)
    if width > 0 and height > 0:
        local[sy0:sy0 + height, sx0:sx0 + width] = canvas_mask[dy0:dy0 + height, dx0:dx0 + width]
    return local


def render_recipe(recipe_path, out_dir):
    """Render a pose recipe into a new directory: frames, layers, derived manifest, provenance."""
    out = Path(out_dir).expanduser().absolute()
    need(out.name.isascii(), "output directory basename must be ASCII")
    if out.exists() or out.is_symlink():
        raise FileExistsError(f"{out} exists; never overwriting")
    recipe, recipe_bytes, rig_doc, pins = load(recipe_path)
    rig = Rig(rig_doc, pins)
    frames = recipe.get("frames")
    need(isinstance(frames, list) and 0 < len(frames) <= ac.MAX_FRAMES, "recipe needs frames")
    ids = [f.get("id") for f in frames]
    need(all(isinstance(i, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,40}", i) for i in ids) and len(set(ids)) == len(ids),
         "frame ids must be unique short names")
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".forge-rig-", dir=out.parent) as tmp:
        stage = Path(tmp) / "render"
        stage.mkdir()

        def write(rel, array, mode=None):
            target = stage / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            buffer = io.BytesIO()
            (Image.fromarray(array) if mode is None else Image.fromarray(array, mode)).save(buffer, format="PNG")
            target.write_bytes(buffer.getvalue())
            return {"path": rel, "sha256": hashlib.sha256(buffer.getvalue()).hexdigest()}

        references, manifest_frames, prov_frames = {}, [], []
        # Reference names use ':' and paths use directories: no slot, variant or frame name can contain
        # either, so distinct parts can never share a name or a file.
        for name, sheet in rig.sheets.items():
            references[f"sheet:{name}"] = write(f"inputs/sheets/{name}.png", sheet)
        for (slot, variant), spec in rig.variants.items():
            references[f"part:{slot}:{variant}"] = write(f"inputs/parts/{slot}/{variant}.png", spec["image"])
        planted_runs, ground_frames = {}, {}
        repair_total, manual_coordinates = 0, 0
        ground_y = rig_doc.get("ground_y")
        need(ground_y is None or type(ground_y) is int, "ground_y must be an integer row")
        rest = render_frame(rig, {"pose": {s: rig.rest_variant(s) for s in rig.slots}}, pins)[1]
        limb_specs = []
        for limb in rig.limbs:
            points = [rig.joint(rest, s, j) for s, j in limb["chain"]]
            lengths = [float(np.hypot(b[0] - a[0], b[1] - a[1])) for a, b in zip(points, points[1:])]
            limb_specs.append({**limb, "ranges": [[max(0.0, l - limb["tolerance"]), l + limb["tolerance"]] for l in lengths],
                               "frames": []})
        for index, frame in enumerate(frames):
            need(isinstance(frame, dict) and frame.get("phase") in PHASES,
                 f"frame {frame.get('id')}: unknown phase")
            duration = frame.get("duration_ms", 100)
            need(type(duration) is int and 1 <= duration <= 10000, "duration_ms must be an integer 1-10000")
            root = _int_pair(frame.get("root", [0, 0]), "root")
            planted = frame.get("planted", [])
            need(isinstance(planted, list) and all(p in rig.slots and rig.slots[p].get("contact") for p in planted),
                 "planted must list contact slots")
            need(not planted or frame["phase"] != "airborne", "an airborne frame cannot have a planted contact")
            grounded = frame.get("grounded", [])
            need(isinstance(grounded, list) and all(g in rig.slots and rig.slots[g].get("contact") for g in grounded),
                 "grounded must list contact slots")
            need(not grounded or frame["phase"] != "airborne", "an airborne frame cannot touch the ground")
            touching = list(dict.fromkeys(planted + grounded))
            image, placements, visible, layers, repairs, owner_map = render_frame(rig, frame, pins)
            fid = frame["id"]
            frame_ref = write(f"frame-{index:03d}.png", image)
            for slot, cel in layers.items():
                write(f"layers/{slot}/{index:03d}.png", cel)
            repair_total += sum(r["pixels"] for r in repairs)
            manual_coordinates += sum(1 for p in placements.values() if p["nudge"] != [0, 0]) + (1 if root != (0, 0) else 0)
            locks, masks, anchors = [], {}, {}
            for slot, place in placements.items():
                variant = rig.variants[(slot, place["variant"])]
                h, w = variant["image"].shape[:2]
                local = _to_local(visible[slot], place, h, w, False)
                if variant["domain"] is not None:
                    # Declared clear border pixels stay protected where nothing else (or a repair) covers them.
                    free = _to_local(owner_map == -1, place, h, w, False)
                    local |= variant["domain"] & (variant["image"][:, :, 3] == 0) & free
                if local.any():
                    lock_mask = write(f"masks/{fid}/lock/{slot}.png", (local * 255).astype(np.uint8), "L")
                    references[f"lock:{fid}:{slot}"] = lock_mask
                    locks.append({"name": f"{KINDS[variant['kind']]}:{slot}.{place['variant']}",
                                  "source": f"part:{slot}:{place['variant']}", "mask": f"lock:{fid}:{slot}",
                                  "offset": [place["left"], place["top"]]})
                spec = rig.slots[slot]
                needs_mask = spec.get("contact") or "prop_of" in spec or any(s.get("prop_of") == slot for s in rig.slots.values())
                if needs_mask and visible[slot].any():
                    references[f"mask:{fid}:{slot}"] = write(f"masks/{fid}/part/{slot}.png", (visible[slot] * 255).astype(np.uint8), "L")
                    masks[slot] = f"mask:{fid}:{slot}"
                    if "grip" in variant["joints"]:
                        gx, gy = variant["joints"]["grip"]
                        anchors[f"{slot}.grip"] = [place["left"] + gx, place["top"] + gy]
                    if spec.get("contact") and slot in touching:
                        ground_frames.setdefault(slot, []).append(fid)
                    if spec.get("contact"):
                        ys, xs = np.where(visible[slot])
                        bottom = int(ys.max())
                        anchors[f"{slot}.sole"] = [int(xs[ys == bottom].min()), bottom]
            for limb in limb_specs:
                if all(s in placements for s, _ in limb["chain"]):
                    for s, j in limb["chain"]:
                        anchors[f"{s}.{j}"] = rig.joint(placements, s, j)
                    limb["frames"].append(fid)
            for slot in rig.slots:
                if rig.slots[slot].get("contact"):
                    run = planted_runs.setdefault(slot, [[]])
                    if slot in planted and slot in masks:
                        run[-1].append(fid)
                    elif run[-1]:
                        run.append([])
            manifest_frames.append({"id": fid, "image": frame_ref, "phase": frame["phase"], "root_offset": list(root),
                                    "anchors": anchors, "masks": masks, "identity_locks": locks})
            prov_frames.append({"id": fid, "duration_ms": duration, "phase": frame["phase"], "root": list(root),
                                "placements": {s: {**p, "kind": rig.variants[(s, p["variant"])]["kind"]} for s, p in placements.items()},
                                "planted": planted, "grounded": grounded, "repairs": repairs})
        phase_of = {f["id"]: f["phase"] for f in manifest_frames}
        stances = []
        for slot, runs in planted_runs.items():
            for k, run in enumerate(r for r in runs if len(r) >= 2):
                stances.append({"name": f"planted:{slot}:{k}", "frames": run, "anchor": f"{slot}.sole", "contact_mask": slot,
                                "max_drift_px": rig_doc.get("contact_tolerance_px", 0),
                                "phases": sorted({phase_of[i] for i in run})})
        attachments = []
        for slot, spec in rig.slots.items():
            hand = spec.get("prop_of")
            if hand is None:
                continue
            both = [f["id"] for f in manifest_frames if slot in f["masks"] and hand in f["masks"]
                    and f"{slot}.grip" in f["anchors"] and f"{hand}.grip" in f["anchors"]]
            if both:
                attachments.append({"name": slot, "declared_owner": spec.get("labels", {}).get("owner", f"rig slot {hand}"),
                                    "hand_anchor": f"{hand}.grip", "grip_anchor": f"{slot}.grip", "hand_mask": hand,
                                    "object_mask": slot, "max_gap_px": rig_doc.get("attachment_max_gap_px", 2),
                                    "require_touch": True, "owner_source": "rig", "frames": both})
        rig_sha = recipe["rig"]["sha256"]
        recipe_sha = hashlib.sha256(recipe_bytes).hexdigest()
        (stage / "inputs" / "rig.json").write_bytes(pins.inputs[recipe["rig"]["path"]][1])
        (stage / "inputs" / "recipe.json").write_bytes(recipe_bytes)
        manifest = {"schema_version": 1, "facing": rig_doc.get("facing", "UNSPECIFIED"), "canvas": [rig.width, rig.height],
                    "references": references, "palette_sources": [f"sheet:{n}" for n in rig.sheets],
                    "edge_margin": rig.edge_margin, "frames": manifest_frames, "attachments": attachments,
                    "stance_intervals": stances,
                    "ground_contacts": [] if ground_y is None else [
                        {"name": f"floor:{slot}", "frames": fids, "contact_mask": slot, "ground_y": ground_y,
                         "tolerance_px": rig_doc.get("ground_tolerance_px", 0)} for slot, fids in ground_frames.items()],
                    "limbs": [{"name": l["name"], "chain": [f"{s}.{j}" for s, j in l["chain"]], "segment_ranges": l["ranges"],
                               "frames": l["frames"]} for l in limb_specs if l["frames"]],
                    "rig_provenance": {"rig_sha256": rig_sha, "recipe_sha256": recipe_sha,
                                       "rig": {"path": "inputs/rig.json", "sha256": rig_sha},
                                       "recipe": {"path": "inputs/recipe.json", "sha256": recipe_sha}},
                    "notes": ["Generated by forge rig-render: anchors, masks, locks, attachments and contacts are derived from the pinned rig and recipe.",
                              "Rig labels (anatomical side, prop owner) remain human annotations made once on the rig."]}
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
        provenance = {"workflow": "forge rig-render", "rig_sha256": rig_sha, "recipe_sha256": recipe_sha,
                      "character": rig_doc.get("character"), "facing": rig_doc.get("facing"),
                      "inputs": {path: digest for path, (digest, _) in sorted(pins.inputs.items())},
                      "slots_in_draw_order": sorted(rig.slots, key=lambda s: (rig.slots[s]["z"], s)),
                      "frames": prov_frames,
                      "totals": {"repair_pixels": repair_total, "manual_coordinates": manual_coordinates,
                                 "per_frame_hand_annotations": 0}}
        (stage / "provenance.json").write_text(json.dumps(provenance, indent=1) + "\n")
        (stage / "native").mkdir()
        (stage / "native" / "build.lua").write_text(_native_script(stage, rig, prov_frames))
        with directory(Path(tmp)) as source_dir, directory(out.parent.resolve()) as target_dir:
            publish_exclusive(source_dir, "render", target_dir, out.name)
    return {"out": str(out), "frames": len(frames), "repair_pixels": repair_total,
            "manual_coordinates": manual_coordinates, "hand_annotations": 0,
            "manifest_sha256": hashlib.sha256((out / "manifest.json").read_bytes()).hexdigest()}


_LUA_HEADER = """-- Generated by forge rig-render. Builds an editable layered document from layers/.
-- aseprite -b --script-param root=<render dir> --script-param out=<file.aseprite> --script native/build.lua
local root = app.params.root
local spr = Sprite(%d, %d, ColorMode.RGB)
"""


def _native_script(stage, rig, frames):
    lines = [_LUA_HEADER % (rig.width, rig.height)]
    for i in range(1, len(frames)):
        lines.append("spr:newEmptyFrame()")
    for i, frame in enumerate(frames, 1):
        lines.append(f"spr.frames[{i}].duration = {frame['duration_ms'] / 1000:.3f}")
    order = sorted(rig.slots, key=lambda s: (rig.slots[s]["z"], s))
    if (stage / "layers" / "_repair").is_dir():
        order.append("_repair")
    for n, slot in enumerate(order):
        lines.append("local layer = spr.layers[1]" if n == 0 else "local layer = spr:newLayer()")
        title = "repairs (bounded, see provenance.json)" if slot == "_repair" else f"{slot} ({rig.slots[slot]['z']})"
        lines.append(f"layer.name = {json.dumps(title)}")
        for i in range(len(frames)):
            rel = f"layers/{slot}/{i:03d}.png"
            if (stage / rel).is_file():
                lines.append(f"spr:newCel(layer, {i + 1}, Image{{fromFile=root..\"/{rel}\"}}, Point(0, 0))")
    lines.append("spr:saveAs(app.params.out)")
    return "\n".join(lines) + "\n"


def build_native(render_dir, out_doc):
    """Run the generated script in Aseprite (external, licensed by the user)."""
    from . import aseprite
    render_dir = Path(render_dir).resolve(strict=True)
    out_doc = Path(out_doc).expanduser().absolute()
    if out_doc.exists() or out_doc.is_symlink():
        raise FileExistsError(f"{out_doc} exists; never overwriting")
    with tempfile.TemporaryDirectory(prefix=".forge-native-", dir=out_doc.parent) as tmp:
        staged = Path(tmp) / "document.aseprite"
        aseprite._run(["--script-param", f"root={render_dir}", "--script-param", f"out={staged}",
                       "--script", str(render_dir / "native" / "build.lua")])
        os.link(staged, out_doc)                 # atomic, and refuses any existing name (even a dangling symlink)
    return out_doc


def previews(render_dir, out_dir, background=(25, 24, 36), scales=(1, 2)):
    """Same-scale stills plus in-place and ground-relative motion (GIF and exact-timing APNG)."""
    render_dir = Path(render_dir).resolve(strict=True)
    out = Path(out_dir).expanduser().absolute()
    if out.exists():
        raise FileExistsError(f"{out} exists; never overwriting")
    provenance = json.loads(read_bounded(render_dir / "provenance.json", MAX_JSON_BYTES))
    frames = [Image.open(render_dir / f"frame-{i:03d}.png").convert("RGBA") for i in range(len(provenance["frames"]))]
    durations = [f["duration_ms"] for f in provenance["frames"]]
    roots = [f["root"] for f in provenance["frames"]]
    w, h = frames[0].size
    min_x, min_y = min(r[0] for r in roots), min(r[1] for r in roots)
    span_x, span_y = max(r[0] for r in roots) - min_x, max(r[1] for r in roots) - min_y
    out.mkdir(parents=True)
    written = []

    def save_motion(name, images):
        images[0].save(out / f"{name}.gif", save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=1)
        images[0].save(out / f"{name}.png", save_all=True, append_images=images[1:], duration=durations, loop=0, disposal=0, blend=0)
        written.extend([f"{name}.gif", f"{name}.png"])

    for scale in scales:
        strip = Image.new("RGBA", (w * len(frames) * scale, h * scale), background + (255,))
        for i, im in enumerate(frames):
            strip.alpha_composite(im.resize((w * scale, h * scale), Image.NEAREST), (i * w * scale, 0))
        strip.convert("RGB").save(out / f"strip-{scale}x.png")
        written.append(f"strip-{scale}x.png")
        in_place = []
        for im in frames:
            canvas = Image.new("RGBA", (w * scale, h * scale), background + (255,))
            canvas.alpha_composite(im.resize((w * scale, h * scale), Image.NEAREST))
            in_place.append(canvas.convert("RGB"))
        save_motion(f"in-place-{scale}x", in_place)
        ground = []
        for im, (rx, ry) in zip(frames, roots):
            canvas = Image.new("RGBA", ((w + span_x) * scale, (h + span_y) * scale), background + (255,))
            canvas.alpha_composite(im.resize((w * scale, h * scale), Image.NEAREST), ((rx - min_x) * scale, (ry - min_y) * scale))
            ground.append(canvas.convert("RGB"))
        save_motion(f"ground-{scale}x", ground)
    return {"out": str(out), "frames": len(frames), "files": written}


def _changed_pixels(a, b):
    return int(np.any(np.asarray(a.convert("RGBA")) != np.asarray(b.convert("RGBA")), axis=2).sum())


def review(recipe_path, out_dir, baseline=None):
    """One call for the whole loop: render, checked review export, previews, native document
    (only where Aseprite exists) and an optional same-scale comparison with a baseline render.
    Writes SUMMARY.json and SUMMARY.md. Nothing here approves anything."""
    from . import animation_export, aseprite
    out = Path(out_dir).expanduser().absolute()
    if out.exists() or out.is_symlink():
        raise FileExistsError(f"{out} exists; never overwriting")
    out.mkdir(parents=True)
    summary = {"workflow": "forge rig-review", "recipe": str(Path(recipe_path).resolve()), "approved": False}
    summary["render"] = render_recipe(recipe_path, out / "render")
    report = animation_export.export_animation(out / "render" / "manifest.json", out / "export", review=True)
    checks = report["checks"]
    summary["export"] = {"status": report["status"], "technical": checks["technical_status"],
                         "failed": [f"{c['code']}:{c['scope']}: {c['detail']}" for c in checks["checks"] if c["status"] == "fail"],
                         "manual_review_required": report["manual_review_required"],
                         "rig_bytes_verified": checks.get("rig_provenance", {}).get("verified_bytes", False)}
    summary["previews"] = previews(out / "render", out / "previews")["files"]
    if aseprite.find_executable() is None:
        summary["native"] = {"status": "skipped", "reason": "Aseprite not found (set ASEPRITE_PATH to build and verify the layered document)"}
    else:
        try:
            doc = build_native(out / "render", out / "native.aseprite")
            native = animation_export.export_animation(out / "render" / "manifest.json", out / "native-export", review=True, document=doc)
            summary["native"] = {"status": "verified", "document": str(doc), **(native["native_document"] or {})}
        except Exception as error:   # report, never hide: the summary is the reviewer's view
            summary["native"] = {"status": "failed", "error": str(error)}
    if baseline is not None:
        base = Path(baseline).resolve(strict=True)
        provenance = json.loads((out / "render" / "provenance.json").read_text())
        ids = [f["id"] for f in provenance["frames"]]
        new = [Image.open(out / "render" / f"frame-{i:03d}.png") for i in range(len(ids))]
        old = [Image.open(base / f"frame-{i:03d}.png") for i in range(len(ids))]
        summary["compare"] = {"baseline": str(base), "changed_pixels": {fid: _changed_pixels(a, b) for fid, a, b in zip(ids, old, new)}}
        w, h = new[0].size
        sheet = Image.new("RGBA", (w * 2 * len(ids), h * 4), (25, 24, 36, 255))
        for i, (a, b) in enumerate(zip(old, new)):
            sheet.alpha_composite(a.convert("RGBA").resize((w * 2, h * 2), Image.NEAREST), (i * w * 2, 0))
            sheet.alpha_composite(b.convert("RGBA").resize((w * 2, h * 2), Image.NEAREST), (i * w * 2, h * 2))
        sheet.convert("RGB").save(out / "compare-2x.png")
    (out / "SUMMARY.json").write_text(json.dumps(summary, indent=1) + "\n")
    lines = [f"# rig-review: {Path(recipe_path).name}", "", "Not approved: this is review evidence only.", "",
             f"- export: **{summary['export']['status']}**, technical **{summary['export']['technical']}**, "
             f"rig/recipe bytes verified: {summary['export']['rig_bytes_verified']}",
             f"- repair pixels: {summary['render']['repair_pixels']}, manual coordinates: {summary['render']['manual_coordinates']}",
             f"- native: {summary['native']['status']}" + (f" ({summary['native'].get('reason') or summary['native'].get('error')})" if summary['native']['status'] != 'verified' else
                                                           f", pixel exact {summary['native'].get('visible_frames_pixel_exact')}, durations {summary['native'].get('durations_seconds')}"),
             "", "## Needs a person", *[f"- {item}" for item in summary["export"]["manual_review_required"]]]
    if summary["export"]["failed"]:
        lines += ["", "## Failed checks", *[f"- {item}" for item in summary["export"]["failed"]]]
    if "compare" in summary:
        lines += ["", "## Changed pixels against the baseline", *[f"- frame {k}: {v}" for k, v in summary["compare"]["changed_pixels"].items()],
                  "", "`compare-2x.png`: baseline on top, this render below."]
    lines += ["", "Look at `previews/in-place-2x.gif`, `previews/ground-2x.gif` and `previews/strip-1x.png` before judging the art."]
    (out / "SUMMARY.md").write_text("\n".join(lines) + "\n")
    return summary


def review_cli(argv=None):
    import argparse
    parser = argparse.ArgumentParser(prog="forge rig-review", description="Render, check, preview and (with Aseprite) natively verify a recipe in one step")
    parser.add_argument("recipe")
    parser.add_argument("--out", required=True)
    parser.add_argument("--baseline", help="an earlier render directory to compare frame by frame")
    args = parser.parse_args(argv)
    try:
        summary = review(args.recipe, args.out, args.baseline)
    except (RigError, OSError, ValueError) as error:
        print(json.dumps({"status": "blocked", "error": str(error)}))
        return 1
    print((Path(args.out) / "SUMMARY.md").read_text())
    return 0 if summary["export"]["technical"] == "pass" else 2


def variant_cli(argv=None):
    import argparse
    parser = argparse.ArgumentParser(prog="forge rig-variant", description="Derive a rotated variant; prints the rig variant block")
    parser.add_argument("image", help="source variant PNG")
    parser.add_argument("--of", required=True, help="slot.variant it derives from (recorded in provenance)")
    parser.add_argument("--joints", default="{}", help='JSON joints of the source, e.g. {"neck":[47,29]}')
    parser.add_argument("--rotate", type=float, required=True)
    parser.add_argument("--pivot", required=True, help="x,y pivot in the source image")
    parser.add_argument("--algorithm", choices=("nearest", "rotsprite"), default="nearest")
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    out = Path(args.out)
    with Image.open(args.image) as im:
        source = np.array(im.convert("RGBA"))
    method = {"op": "rotate", "degrees": args.rotate, "pivot": [int(v) for v in args.pivot.split(",")], "algorithm": args.algorithm}
    image, joints = derive(source, json.loads(args.joints), method)
    buffer = io.BytesIO()
    Image.fromarray(image).save(buffer, format="PNG")
    try:
        with open(out, "xb") as handle:          # O_EXCL: never replaces a file or follows a dangling symlink
            handle.write(buffer.getvalue())
    except FileExistsError:
        print(json.dumps({"status": "blocked", "error": f"{out} exists; never overwriting"}))
        return 1
    print(json.dumps({"image": {"path": out.name, "sha256": hashlib.sha256(buffer.getvalue()).hexdigest()}, "joints": joints,
                      "provenance": {"kind": "authored_variant", "of": args.of, "method": method}}, indent=1))
    return 0


def cli(argv=None):
    import argparse
    parser = argparse.ArgumentParser(prog="forge rig-render", description="Render a forge-pose/1 recipe into frames, layers and a checked-export manifest")
    parser.add_argument("recipe")
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    try:
        result = render_recipe(args.recipe, args.out)
    except (RigError, OSError, ValueError) as error:
        print(json.dumps({"status": "blocked", "error": str(error)}))
        return 1
    print(json.dumps(result, indent=2))
    return 0
