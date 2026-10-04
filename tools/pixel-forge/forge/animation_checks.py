#!/usr/bin/env python3
"""Read-only pixel evidence for source-pinned animation manifests (schema 1).

No model, network, installation, image edits, runtime integration or anatomical
recognition. Joint/part names and world root offsets remain author annotations.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
from PIL import Image
try:
    from .bounded_io import read_bounded
except ImportError:  # direct file invocation
    from bounded_io import read_bounded

MAX_SIDE = 512
MAX_REFERENCE_SIDE = 4096
MAX_FRAMES = 256
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_REFERENCE_PIXELS = 4 * 1024 * 1024
MAX_IMAGE_PIXELS = 1024 * 1024
MAX_NUMERIC_ABS = 1_000_000
MAX_PALETTE_COLORS = 65_536


class InputError(ValueError):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def require(condition, message, code="INVALID_MANIFEST"):
    if not condition:
        raise InputError(code, message)


def number(value, name, minimum=0):
    require(type(value) in (int, float) and minimum <= value <= MAX_NUMERIC_ABS and math.isfinite(value),
            f"{name} must be finite and between {minimum} and {MAX_NUMERIC_ABS}")
    return value


def pair(value, name, integer=True):
    require(isinstance(value, list) and len(value) == 2, f"{name} must have two coordinates")
    for v in value:
        valid_type = type(v) is int if integer else type(v) in (int, float)
        require(valid_type and -MAX_NUMERIC_ABS <= v <= MAX_NUMERIC_ABS and math.isfinite(v),
                f"{name} requires bounded {'integer' if integer else 'finite'} coordinates")
    return tuple(value)


def sequence(value, name, limit=MAX_FRAMES):
    require(isinstance(value, list) and len(value) <= limit, f"{name} must be a list of at most {limit}")
    return value


def label(value, name):
    require(isinstance(value, str) and 0 < len(value) <= 80,
            f"{name} must be a nonempty label of at most 80 characters")
    return value


def check_manifest(manifest: dict, base_dir: str | Path) -> dict:
    """Return JSON-serializable evidence, failing closed for unsafe/malformed inputs.

    Each referenced path must remain under base_dir, be a PNG, and match its
    SHA-256. Candidate hashes establish which pixels were inspected, not approval.
    """
    report = {"schema_version": 1, "technical_status": "fail", "semantic_anatomy": "unverified",
              "all_constraints_verified": False, "checks": [], "inputs": [],
              "resource_usage": {"cached_reference_pixels": 0, "contact_summaries": 0},
              "coverage": {k: False for k in ("identity", "limbs", "attachments", "stance")},
              "forge_direct_compatibility": [], "frame_coverage": {},
              "limitations": [
                  "Anatomical labels, owner labels and mask selection are manual annotations, not machine-recognized anatomy.",
                  "Opaque pixels support coordinates only; reach checks do not prove connected or plausible limbs.",
                  "Contact drift uses annotated world root offsets; it does not verify game-engine root motion.",
                  "Edge margin is a possible clipping risk, not proof that unseen pixels were cropped.",
                  "Identity locks protect selected pixels only; they do not prove the entire character matches."]}

    def record(code, scope, status, detail, evidence="pixels"):
        report["checks"].append(dict(code=code, scope=scope, status=status, evidence=evidence, detail=detail))

    def outcome(code, scope, passed, detail, evidence="pixels"):
        record(code, scope, "pass" if passed else "fail", detail, evidence)

    try:
        require(isinstance(manifest, dict), "manifest must be an object")
        require(type(manifest.get("schema_version")) is int and manifest["schema_version"] == 1,
                "only schema_version 1 is supported")
        require(isinstance(manifest.get("facing"), str) and 0 < len(manifest["facing"]) <= 80,
                "facing must be a nonempty label")
        report["facing"] = manifest["facing"]
        width, height = pair(manifest["canvas"], "canvas")
        require(1 <= width <= MAX_SIDE and 1 <= height <= MAX_SIDE, "canvas exceeds 512px frame limit")
        root = Path(base_dir).resolve(strict=True)
        references = manifest["references"]
        require(isinstance(references, dict) and len(references) <= 1024, "references must be an object of at most 1024 entries")
        for name in references:
            label(name, "reference name")
        cache = {}
        cached_pixels = 0
        cached_by_digest = {}
        input_seen = set()

        def read_pinned(reference):
            """Bytes of a pinned file beneath the manifest directory, recorded as an input."""
            require(isinstance(reference, dict), "file reference must be an object")
            raw = reference["path"]
            expected = reference["sha256"]
            require(isinstance(raw, str) and 0 < len(raw) <= 4096, "invalid reference path")
            rel = Path(raw)
            require(not rel.is_absolute() and ".." not in rel.parts, "reference path must stay beneath manifest directory", "UNSAFE_PATH")
            target = (root / rel).resolve(strict=True)
            require(target.is_relative_to(root) and target.is_file(), "reference escapes manifest directory", "UNSAFE_PATH")
            require(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected) is not None,
                    "sha256 must be 64 lowercase hexadecimal characters")
            require(target.stat().st_size <= MAX_FILE_BYTES, "input exceeds 16 MiB limit", "INPUT_LIMIT")
            data = read_bounded(target, MAX_FILE_BYTES)
            digest = hashlib.sha256(data).hexdigest()
            if (raw, expected) not in input_seen:
                report["inputs"].append({"path": raw, "expected_sha256": expected, "actual_sha256": digest, "size_bytes": len(data)})
                input_seen.add((raw, expected))
            require(digest == expected, f"SHA-256 mismatch: {raw}", "HASH_MISMATCH")
            return data

        def load(reference, retain=False):
            nonlocal cached_pixels
            require(isinstance(reference, dict), "file reference must be an object")
            raw = reference["path"]
            expected = reference["sha256"]
            require(isinstance(raw, str) and 0 < len(raw) <= 4096, "invalid reference path")
            rel = Path(raw)
            require(not rel.is_absolute() and ".." not in rel.parts, "reference path must stay beneath manifest directory", "UNSAFE_PATH")
            target = (root / rel).resolve(strict=True)
            require(target.is_relative_to(root) and target.is_file(), "reference escapes manifest directory", "UNSAFE_PATH")
            require(isinstance(expected, str) and re.fullmatch(r"[0-9a-f]{64}", expected) is not None,
                    "sha256 must be 64 lowercase hexadecimal characters")
            require(target.stat().st_size <= MAX_FILE_BYTES, "input exceeds 16 MiB limit", "INPUT_LIMIT")
            data = read_bounded(target, MAX_FILE_BYTES)
            require(len(data) <= MAX_FILE_BYTES, "input exceeds 16 MiB limit", "INPUT_LIMIT")
            digest = hashlib.sha256(data).hexdigest()
            if (raw, expected) not in input_seen:
                report["inputs"].append({"path": raw, "expected_sha256": expected, "actual_sha256": digest, "size_bytes": len(data)})
                input_seen.add((raw, expected))
            require(digest == expected, f"SHA-256 mismatch: {raw}", "HASH_MISMATCH")
            if retain and digest in cached_by_digest:
                return cached_by_digest[digest]
            # Decode from the same bytes that were hashed: no read-after-hash race.
            with Image.open(io.BytesIO(data)) as image:
                require(image.format == "PNG", f"only PNG references are supported: {raw}")
                require(0 < image.width <= MAX_REFERENCE_SIDE and 0 < image.height <= MAX_REFERENCE_SIDE,
                        f"reference too large: {raw}", "INPUT_LIMIT")
                require(getattr(image, "n_frames", 1) == 1, "animated PNG is not a single frame")
                pixels = image.width * image.height
                require(pixels <= MAX_IMAGE_PIXELS, "image exceeds 1 megapixel limit", "INPUT_LIMIT")
                if retain:
                    require(cached_pixels + pixels <= MAX_REFERENCE_PIXELS,
                            "total reference cache exceeds 4 megapixels", "INPUT_LIMIT")
                image.load()
                decoded = image.copy()
                if retain:
                    cached_pixels += pixels
                    report["resource_usage"]["cached_reference_pixels"] = cached_pixels
                    cached_by_digest[digest] = decoded
                return decoded

        def reference_image(name):
            require(isinstance(name, str) and name in references, f"unknown reference: {name}")
            if name not in cache:
                cache[name] = load(references[name], retain=True)
            return cache[name]

        def mask_image(name):
            im = reference_image(name)
            require(im.mode in ("1", "L"), f"mask {name} must be a grayscale PNG")
            a = np.array(im.convert("L"))
            require(np.isin(a, [0, 255]).all(), f"mask {name} must be binary")
            require(np.any(a), f"mask {name} must not be empty")
            return a == 255

        palette_names = sequence(manifest["palette_sources"], "palette_sources", 32)
        require(palette_names, "at least one source palette is required")
        palette = set()
        palette_seen = set()
        for name in palette_names:
            image = reference_image(name)
            digest = references[name]["sha256"]
            if digest in palette_seen:
                continue
            palette_seen.add(digest)
            a = np.asarray(image.convert("RGBA"))
            unique = np.unique(a[a[:, :, 3] != 0], axis=0)
            require(len(unique) <= MAX_PALETTE_COLORS, "source palette exceeds 65536 colors", "INPUT_LIMIT")
            palette.update(map(tuple, unique.tolist()))
            require(len(palette) <= MAX_PALETTE_COLORS, "combined palette exceeds 65536 colors", "INPUT_LIMIT")
        require(palette, "source palette has no visible colors")
        margins = manifest.get("edge_margin", [1, 1, 1, 1])
        require(isinstance(margins, list) and len(margins) == 4 and
                all(type(x) is int and 0 <= x < min(width, height) for x in margins), "invalid edge_margin")
        frames = sequence(manifest["frames"], "frames")
        require(frames, "at least one frame is required")
        ids = [label(f["id"], "frame ID") for f in frames]
        require(all(isinstance(i, str) and i for i in ids) and len(set(ids)) == len(ids), "frame IDs must be unique strings")
        limbs = sequence(manifest.get("limbs", []), "limbs", 64)
        attachments = sequence(manifest.get("attachments", []), "attachments", 64)
        stances = sequence(manifest.get("stance_intervals", []), "stance_intervals", 64)
        grounds = sequence(manifest.get("ground_contacts", []), "ground_contacts", 64)
        for ground in grounds:
            label(ground["contact_mask"], "ground contact mask")
            require(type(ground["ground_y"]) is int and -MAX_NUMERIC_ABS <= ground["ground_y"] <= MAX_NUMERIC_ABS, "ground_y must be an integer")
            require(type(ground.get("tolerance_px", 0)) is int and 0 <= ground.get("tolerance_px", 0) <= 64, "tolerance_px must be 0-64")
        for collection in (limbs, attachments, stances, grounds):
            for item in collection:
                label(item["name"], "constraint name")
                selected = sequence(item["frames"], "constraint frames")
                require(selected and len(set(selected)) == len(selected) and all(i in ids for i in selected),
                        "constraint frames must be unique existing IDs")
        report["coverage"].update(limbs=bool(limbs), attachments=bool(attachments), stance=bool(stances) or bool(grounds))
        rig_provenance = manifest.get("rig_provenance")
        if rig_provenance is not None:
            require(isinstance(rig_provenance, dict) and all(
                isinstance(rig_provenance.get(k), str) and re.fullmatch(r"[0-9a-f]{64}", rig_provenance[k]) is not None
                for k in ("rig_sha256", "recipe_sha256")), "rig_provenance needs rig_sha256 and recipe_sha256")
            # The rig and recipe themselves must travel with the manifest: their bytes are hashed
            # (and snapshotted by the export), not just their claimed digests checked for syntax.
            for key in ("rig", "recipe"):
                pinned = rig_provenance.get(key)
                require(isinstance(pinned, dict) and pinned.get("sha256") == rig_provenance[f"{key}_sha256"],
                        f"rig_provenance.{key} must pin the same bytes as {key}_sha256")
                read_pinned(pinned)
            report["rig_provenance"] = {**{k: rig_provenance[k] for k in ("rig_sha256", "recipe_sha256")}, "verified_bytes": True}
        for attachment in attachments:
            source = attachment.get("owner_source", "annotation")
            require(source in ("annotation", "rig"), "owner_source must be annotation or rig")
            require(source != "rig" or rig_provenance is not None,
                    "owner_source rig requires pinned rig_provenance")
            require(type(attachment.get("require_touch", False)) is bool, "require_touch must be boolean")
        allowed_stance_phases = ("stance", "windup", "charge", "recovery")
        for stance in stances:
            phases = stance.get("phases", ["stance", "windup"])
            require(isinstance(phases, list) and phases and all(p in allowed_stance_phases for p in phases),
                    "stance phases must be a nonempty subset of stance/windup/charge/recovery (never airborne)")
        metadata = {}
        for frame in frames:
            scope = f"frame:{frame['id']}"
            phase = frame["phase"]
            require(phase in ("stance", "windup", "charge", "airborne", "recovery"), "unknown frame phase")
            im = load(frame["image"])
            require(im.size == (width, height), f"{scope} dimensions must equal canvas")
            a = np.asarray(im.convert("RGBA")); alpha = a[:, :, 3]; opaque = alpha != 0
            require(np.any(opaque), f"{scope} is empty", "EMPTY_FRAME")
            outcome("NON_BINARY_ALPHA", scope, bool(np.isin(alpha, [0, 255]).all()),
                    f"alpha values: {np.unique(alpha).tolist()}")
            colors = set(map(tuple, np.unique(a[opaque], axis=0).tolist()))
            missing = colors - palette
            outcome("PALETTE_VIOLATION", scope, not missing, f"{len(missing)} visible RGBA colors outside source palette")
            yy, xx = np.where(opaque); left, top, right, bottom = margins
            bounds = [int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1]
            inside = bounds[0] >= left and bounds[1] >= top and bounds[2] <= width - right and bounds[3] <= height - bottom
            outcome("EDGE_MARGIN", scope, inside, f"bbox {bounds}; margins {margins}; a violation means possible clipping")
            total_colors = len(np.unique(a.reshape(-1, 4), axis=0))
            report["forge_direct_compatibility"].append({"frame": frame["id"], "rgba_color_count": total_colors,
                "within_512px_and_64_color_limits": total_colors <= 64,
                "note": "Compatibility measurement only; this adapter does not ingest, quantize or edit Forge assets."})
            anchors = frame.get("anchors", {})
            require(isinstance(anchors, dict) and len(anchors) <= 64, "anchors must be an object of at most 64 items")
            points = {}
            for name, point in anchors.items():
                label(name, "anchor name")
                x, y = pair(point, "anchor")
                points[name] = (x, y)
                supported = 0 <= x < width and 0 <= y < height and bool(opaque[y, x])
                outcome("ANCHOR_UNSUPPORTED", f"{scope}/{name}", supported,
                        f"annotated anchor {point} {'has' if supported else 'lacks'} an opaque pixel", "pixels+annotation")
            root_offset = frame.get("root_offset")
            if root_offset is not None:
                root_offset = pair(root_offset, "root_offset")
            metadata[frame["id"]] = {"phase": phase, "anchors": points, "root_offset": root_offset}
            locks = sequence(frame.get("identity_locks", []), "identity_locks", 64)
            report["coverage"]["identity"] |= bool(locks)
            frame_coverage = {"identity": bool(locks),
                              "limbs": any(frame["id"] in item["frames"] for item in limbs),
                              "attachments": any(frame["id"] in item["frames"] for item in attachments),
                              "stance": any(frame["id"] in item["frames"] for item in stances + grounds)}
            report["frame_coverage"][frame["id"]] = frame_coverage
            for category, covered in frame_coverage.items():
                if not covered:
                    record("NOT_CHECKED", f"{scope}/{category}", "unverified",
                           f"No {category} constraint covers this frame (phase {phase}).", "missing or intentionally excluded annotation")
            for lock in locks:
                label(lock["name"], "identity lock name")
                source = np.asarray(reference_image(lock["source"]).convert("RGBA"))
                mask = mask_image(lock["mask"])
                require(mask.shape == source.shape[:2], "identity mask and source dimensions differ")
                ox, oy = pair(lock["offset"], "identity offset")
                sy, sx = np.where(mask); tx, ty = sx + ox, sy + oy
                in_bounds = bool(((tx >= 0) & (tx < width) & (ty >= 0) & (ty < height)).all())
                lock_scope = f"{scope}/{lock['name']}"
                if not in_bounds:
                    outcome("IDENTITY_CLIPPED", lock_scope, False, "translated protected pixels fall outside canvas")
                else:
                    changed = int(np.any(source[sy, sx] != a[ty, tx], axis=1).sum())
                    outcome("IDENTITY_CHANGED", lock_scope, changed == 0,
                            f"{changed}/{len(sx)} selected RGBA pixels differ after integer translation [{ox}, {oy}]")
            parts = {}
            part_refs = frame.get("masks", {})
            require(isinstance(part_refs, dict) and len(part_refs) <= 64, "masks must be an object of at most 64 items")
            for name, reference in part_refs.items():
                label(name, "part mask name")
                mask = mask_image(reference)
                require(mask.shape == opaque.shape, "part mask and frame dimensions differ")
                parts[name] = mask
                unsupported = int((mask & ~opaque).sum())
                outcome("PART_MASK_UNSUPPORTED", f"{scope}/{name}", unsupported == 0,
                        f"{unsupported} annotated part pixels lie on transparent pixels", "pixels+annotation")
            contacts = {}
            needed_contacts = {s["contact_mask"] for s in stances
                               if frame["id"] in s["frames"] and "contact_mask" in s}
            for name in needed_contacts:
                require(name in parts, "contact mask missing from frame")
                mask = parts[name]
                ys, xs = np.where(mask)
                bottom_y = int(ys.max())
                bottom_x = xs[ys == bottom_y]
                supported_anchors = {n for n, (x, y) in points.items()
                                     if y == bottom_y and 0 <= x < width and bool(mask[y, x])}
                contacts[name] = {"bottom": [(int(bottom_x.min()), bottom_y),
                                              (float(bottom_x.mean()), bottom_y),
                                              (int(bottom_x.max()), bottom_y)],
                                  "supported_anchors": supported_anchors}
                report["resource_usage"]["contact_summaries"] += 1
            metadata[frame["id"]]["contacts"] = contacts
            metadata[frame["id"]]["mask_bottom"] = {name: int(np.where(mask)[0].max()) for name, mask in parts.items()}
            for limb in limbs:
                if frame["id"] not in limb["frames"]:
                    continue
                chain = sequence(limb["chain"], "limb chain", 16)
                ranges = sequence(limb["segment_ranges"], "segment ranges", 15)
                require(len(chain) >= 2 and len(ranges) == len(chain) - 1 and all(n in points for n in chain),
                        "limb needs existing anchors and a range for each segment")
                for i, limits in enumerate(ranges):
                    low, high = pair(limits, "segment range", integer=False)
                    number(low, "lower reach"); number(high, "upper reach")
                    require(low <= high, "reach range is reversed")
                    distance = math.dist(points[chain[i]], points[chain[i + 1]])
                    outcome("LIMB_REACH", f"{scope}/{limb['name']}/{i}", low <= distance <= high,
                            f"annotated segment length {distance:.3f}px; allowed [{low}, {high}]", "annotation+pixel-supported anchors")
            for attachment in attachments:
                if frame["id"] not in attachment["frames"]:
                    continue
                target_scope = f"{scope}/{attachment['name']}"
                hand_name, grip_name = attachment["hand_anchor"], attachment["grip_anchor"]
                require(hand_name in points and grip_name in points, "attachment requires existing anchors")
                hand_part, object_part = attachment["hand_mask"], attachment["object_mask"]
                require(hand_part in parts and object_part in parts, "attachment requires named masks on each frame")
                max_gap = number(attachment["max_gap_px"], "max_gap_px")
                for name, part in ((hand_name, hand_part), (grip_name, object_part)):
                    x, y = points[name]
                    supported = 0 <= x < width and 0 <= y < height and bool(parts[part][y, x])
                    outcome("ANCHOR_PART_MISMATCH", f"{target_scope}/{name}", supported,
                            f"anchor belongs to annotated {part} mask: {supported}", "pixels+annotation")
                distance = math.dist(points[hand_name], points[grip_name])
                outcome("GRIP_DISTANCE", target_scope, distance <= max_gap,
                        f"hand-to-grip anchor distance {distance:.3f}px; maximum {max_gap}", "pixels+annotation")
                if attachment.get("require_touch", False):
                    hand, held = parts[hand_part], parts[object_part]
                    grown = hand.copy()
                    grown[1:, :] |= hand[:-1, :]; grown[:-1, :] |= hand[1:, :]
                    grown[:, 1:] |= grown[:, :-1].copy(); grown[:, :-1] |= grown[:, 1:].copy()
                    meeting = int((grown & held).sum())
                    outcome("ATTACHMENT_TOUCH", target_scope, meeting > 0,
                            f"{meeting} {object_part} pixels touch or overlap the {hand_part} pixels (8-neighbourhood)", "pixels+masks")
                label(attachment["declared_owner"], "declared_owner")
                if attachment.get("owner_source", "annotation") == "annotation":
                    record("BAG_OWNER_UNVERIFIED", target_scope, "unverified",
                           f"Declared owner '{attachment['declared_owner']}' is not anatomical evidence. Mask/anchor support and proximity do not prove ownership.", "annotation only")
        for attachment in attachments:
            if attachment.get("owner_source", "annotation") == "rig":
                # One label on the pinned rig replaces a per-frame annotation; it is still a human judgement.
                record("PROP_OWNER_RIG_LABEL", f"rig:{attachment['name']}", "unverified",
                       f"Owner '{attachment['declared_owner']}' comes from one rig label applied structurally to every frame. "
                       "The label itself is not anatomical evidence.", "rig annotation")
        for stance in stances:
            scope = f"stance:{stance['name']}"
            tolerance = number(stance["max_drift_px"], "max_drift_px")
            chosen = [metadata[i] for i in stance["frames"]]
            require(len(chosen) >= 2, "stance interval requires at least two frames")
            phases = stance.get("phases", ["stance", "windup"])
            outcome("STANCE_PHASE_CONFLICT", scope, all(f["phase"] in phases for f in chosen),
                    f"only frames annotated {'/'.join(phases)} may be stationary-contact compared in this interval", "annotation")
            anchor_name = stance["anchor"]
            require(all(anchor_name in f["anchors"] for f in chosen), "stance anchor missing")
            contact_name = stance.get("contact_mask")
            if contact_name is None:
                record("CONTACT_MASK_UNVERIFIED", scope, "unverified",
                       "No per-frame contact mask; annotated anchor coordinates cannot establish foot contact.", "annotation missing")
                continue
            require(all(contact_name in f["contacts"] for f in chosen), "contact mask missing from frame")
            for frame_id, f in zip(stance["frames"], chosen):
                supported = anchor_name in f["contacts"][contact_name]["supported_anchors"]
                outcome("CONTACT_ANCHOR_MISMATCH", f"{scope}/{frame_id}", supported,
                        "contact anchor must lie on the bottommost opaque pixels of the annotated contact mask", "pixels+annotation")
            local = [f["contacts"][contact_name]["bottom"] for f in chosen]
            if any(f["root_offset"] is None for f in chosen):
                drift = max(math.dist(p[j], local[0][j]) for p in local for j in range(3))
                outcome("LOCAL_CONTACT_DRIFT", scope, drift <= tolerance,
                        f"local sole min/mean/max drift {drift:.3f}px; limit {tolerance}px. World contact remains unverified.", "pixels+annotated masks")
                record("ROOT_MOTION_UNVERIFIED", scope, "unverified",
                       "World root offset is missing; no zero offset is assumed and no world drift verdict is issued.", "annotation missing")
            else:
                world = [[(x + f["root_offset"][0], y + f["root_offset"][1]) for x, y in local[i]]
                         for i, f in enumerate(chosen)]
                drift = max(math.dist(p[j], world[0][j]) for p in world for j in range(3))
                outcome("CONTACT_DRIFT", scope, drift <= tolerance,
                        f"world sole min/mean/max {world}; max displacement from first contact {drift:.3f}px; limit {tolerance}px", "pixels+annotated masks/root motion")
        for ground in grounds:
            tolerance = ground.get("tolerance_px", 0)
            for frame_id in ground["frames"]:
                f = metadata[frame_id]
                scope = f"ground:{ground['name']}/{frame_id}"
                require(ground["contact_mask"] in f["mask_bottom"], "ground contact mask missing from frame")
                if f["root_offset"] is None:
                    record("GROUND_CONTACT", scope, "unverified",
                           "No root offset: the contact's world height cannot be compared with the floor.", "annotation missing")
                    continue
                world = f["mask_bottom"][ground["contact_mask"]] + f["root_offset"][1]
                outcome("GROUND_CONTACT", scope, abs(world - ground["ground_y"]) <= tolerance,
                        f"lowest contact pixel at world y {world}; floor y {ground['ground_y']}; tolerance {tolerance}px",
                        "pixels+annotated masks/root motion")
        for category, covered in report["coverage"].items():
            if not covered:
                record("NOT_CHECKED", category, "unverified", f"No {category} constraints were supplied.", "missing annotation")
        report["technical_status"] = "fail" if any(c["status"] == "fail" for c in report["checks"]) else "pass"
    except (InputError, KeyError, TypeError, ValueError, OSError, OverflowError, RuntimeError, Image.DecompressionBombError) as error:
        code = error.code if isinstance(error, InputError) else "INVALID_MANIFEST"
        record(code, "manifest", "fail", str(error), "input validation")
        report["technical_status"] = "fail"
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, help="Explicit destination for JSON evidence; stdout otherwise")
    args = parser.parse_args(argv)
    try:
        require(args.manifest.stat().st_size <= 1024 * 1024, "manifest exceeds 1 MiB")
        manifest_bytes = read_bounded(args.manifest, 1024 * 1024)
        require(len(manifest_bytes) <= 1024 * 1024, "manifest exceeds 1 MiB")
        manifest = json.loads(manifest_bytes)
        report = check_manifest(manifest, args.manifest.parent)
        report["manifest_sha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    except (OSError, ValueError, RuntimeError) as error:
        report = {"technical_status": "fail", "checks": [{"code": "INVALID_MANIFEST", "scope": "manifest",
                  "status": "fail", "detail": str(error)}]}
    content = json.dumps(report, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.write_text(content)
    else:
        sys.stdout.write(content)
    return 0 if report["technical_status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
