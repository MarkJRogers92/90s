"""Rig + pose recipe authoring: real PNG cases, rendered then checked by the unchanged checker."""
import copy
import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from forge import animation_checks, rig

A, B, C, D, E = (50, 70, 90, 255), (210, 180, 140, 255), (200, 40, 40, 255), (160, 100, 60, 255), (240, 240, 230, 255)


def ref(root, name):
    return {"path": name, "sha256": hashlib.sha256((root / name).read_bytes()).hexdigest()}


def png(root, name, array):
    Image.fromarray(np.asarray(array, dtype=np.uint8)).save(root / name)
    return ref(root, name)


def source_sheet():
    s = np.zeros((16, 16, 4), np.uint8)
    s[1:4, 6:10] = B          # head
    s[4:12, 6:10] = A         # torso
    s[7:9, 10] = C            # near hand
    s[8:11, 11:14] = D        # bag
    s[12:14, 6:10] = E        # shoe
    return s


PARTS = {  # slot: (rect x, y, w, h, joints in local coordinates; a joint may sit just outside the part)
    "torso": ((6, 4, 4, 8), {"neck": [1, 0], "shoulder": [3, 2], "hip": [1, 7]}),
    "head": ((6, 1, 4, 3), {"neck": [1, 3]}),
    "hand": ((10, 7, 1, 2), {"wrist": [-1, -1], "grip": [0, 1]}),
    "bag": ((11, 8, 3, 3), {"handle": [-1, 0], "grip": [0, 0]}),
    "shoe": ((6, 12, 4, 2), {"top": [1, -1]}),
}

@pytest.fixture
def project(tmp_path):
    root = tmp_path
    sheet = source_sheet()
    png(root, "sheet.png", sheet)
    slots = {}
    attach = {"head": ("torso", "neck", "neck"), "hand": ("torso", "shoulder", "wrist"),
              "bag": ("hand", "grip", "handle"), "shoe": ("torso", "hip", "top")}
    z = {"shoe": 5, "torso": 10, "head": 20, "hand": 30, "bag": 25}
    for slot, ((x, y, w, h), joints) in PARTS.items():
        png(root, f"{slot}.png", sheet[y:y + h, x:x + w])
        variant = {"image": ref(root, f"{slot}.png"), "joints": joints,
                   "provenance": {"kind": "source", "sheet": "sheet", "at": [x, y]}}
        slots[slot] = {"z": z[slot], "variants": {"rest": variant}}
        if slot in attach:
            parent, at, via = attach[slot]
            slots[slot]["attach"] = {"parent": parent, "parent_joint": at, "joint": via}
    slots["hand"]["labels"] = {"side": "anatomical_left", "role": "hand"}
    slots["bag"]["prop_of"] = "hand"
    slots["bag"]["labels"] = {"owner": "near-side anatomical left hand"}
    slots["shoe"]["contact"] = True
    rig_doc = {"schema": "forge-rig/1", "character": "test", "facing": "WEST", "canvas": [24, 24],
               "asymmetric": True, "sheets": {"sheet": ref(root, "sheet.png")},
               "root_slot": "torso", "origin": [8, 6], "slots": slots,
               "attachment_max_gap_px": 2, "edge_margin": [1, 1, 1, 1],
               "limbs": [{"name": "near-arm", "chain": ["torso.shoulder", "hand.grip"], "tolerance_px": 1}]}
    (root / "rig.json").write_text(json.dumps(rig_doc))
    frames = []
    for i in range(3):
        frames.append({"id": str(i), "phase": "windup" if i < 2 else "charge", "duration_ms": 100,
                       "root": [0, 0], "pose": {s: "rest" for s in slots}, "planted": ["shoe"]})
    recipe = {"schema": "forge-pose/1", "rig": ref(root, "rig.json"), "frames": frames}
    (root / "recipe.json").write_text(json.dumps(recipe))
    return root


def edit(root, name, change):
    doc = json.loads((root / name).read_text())
    change(doc)
    (root / name).write_text(json.dumps(doc))
    if name == "rig.json":  # keep the recipe's pin honest
        edit(root, "recipe.json", lambda r: r.__setitem__("rig", ref(root, "rig.json")))


def render(root, out="out"):
    return rig.render_recipe(root / "recipe.json", root / out)


def frame(root, i, out="out"):
    return np.asarray(Image.open(root / out / f"frame-{i:03d}.png").convert("RGBA"))


def check(root, out="out"):
    manifest = json.loads((root / out / "manifest.json").read_text())
    return animation_checks.check_manifest(manifest, root / out)


def statuses(report, code):
    return [c["status"] for c in report["checks"] if c["code"] == code]


def test_rest_pose_reassembles_the_source_character_exactly(project):
    render(project)
    out = frame(project, 0)
    expected = np.zeros((24, 24, 4), np.uint8)
    expected[2:16, 8:16] = source_sheet()[0:14, 6:14]   # origin [8,6] puts torso (6,4) at (8,6): +2,+2
    assert np.array_equal(out, expected)


def test_children_follow_their_parent_joint(project):
    edit(project, "recipe.json", lambda r: r["frames"][1]["pose"].__setitem__("torso", {"variant": "rest", "nudge": [2, 1]}))
    render(project)
    a, b = frame(project, 0), frame(project, 1)
    assert np.array_equal(np.roll(np.roll(a, 1, axis=0), 2, axis=1), b)


def test_generated_manifest_passes_the_existing_checker_with_derived_annotations(project):
    result = render(project)
    report = check(project)
    assert report["technical_status"] == "pass", [c for c in report["checks"] if c["status"] == "fail"]
    assert result["hand_annotations"] == 0
    codes = {c["code"] for c in report["checks"]}
    assert {"IDENTITY_CHANGED", "ATTACHMENT_TOUCH", "CONTACT_DRIFT", "GRIP_DISTANCE"} <= codes
    assert "BAG_OWNER_UNVERIFIED" not in codes and "ROOT_MOTION_UNVERIFIED" not in codes
    assert statuses(report, "PROP_OWNER_RIG_LABEL") == ["unverified"]


def test_source_claim_is_verified_against_the_sheet(project):
    bad = np.asarray(Image.open(project / "head.png").convert("RGBA")).copy()
    bad[0, 0] = A
    png(project, "head.png", bad)
    edit(project, "rig.json", lambda r: r["slots"]["head"]["variants"]["rest"].__setitem__("image", ref(project, "head.png")))
    with pytest.raises(rig.RigError, match="source"):
        render(project)


def test_authored_variant_locks_are_never_labelled_original(project):
    tilted = np.asarray(Image.open(project / "head.png").convert("RGBA")).copy()
    tilted[0, 3] = 0
    png(project, "head-tilt.png", tilted)
    def add(r):
        r["slots"]["head"]["variants"]["tilt"] = {"image": ref(project, "head-tilt.png"), "joints": {"neck": [1, 2]},
                                                  "provenance": {"kind": "authored", "note": "hand-trimmed hair"}}
    edit(project, "rig.json", add)
    edit(project, "recipe.json", lambda r: r["frames"][2]["pose"].__setitem__("head", "tilt"))
    render(project)
    manifest = json.loads((project / "out" / "manifest.json").read_text())
    names = [l["name"] for l in manifest["frames"][2]["identity_locks"]]
    assert "authored:head.tilt" in names and not any(n.startswith("source:head") for n in names)
    assert "source:head.rest" in [l["name"] for l in manifest["frames"][0]["identity_locks"]]


def test_occluded_source_pixels_are_left_out_of_the_lock(project):
    edit(project, "recipe.json", lambda r: r["frames"][1]["pose"].__setitem__("hand", {"variant": "rest", "nudge": [-1, 0]}))
    render(project)
    assert check(project)["technical_status"] == "pass"


def test_planted_foot_is_checked_against_the_ground(project):
    def slide(r):
        r["frames"][1]["root"] = [3, 0]
        r["frames"][1]["pose"]["shoe"] = {"variant": "rest", "nudge": [-3, 0]}   # torso moves, foot stays
    edit(project, "recipe.json", slide)
    render(project)
    assert statuses(check(project), "CONTACT_DRIFT") == ["pass"]
    edit(project, "recipe.json", lambda r: r["frames"][1]["pose"].__setitem__("shoe", "rest"))   # foot rides along: a slide
    render(project, "out2")
    assert statuses(check(project, "out2"), "CONTACT_DRIFT") == ["fail"]


def test_repairs_replace_through_their_mask_and_are_counted(project):
    image = np.zeros((24, 24, 4), np.uint8); image[6, 8] = A
    mask = np.zeros((24, 24), np.uint8); mask[6, 8] = 255; mask[5, 8] = 255    # one recolour, one deletion
    png(project, "fix.png", image); png(project, "fix-mask.png", mask)
    edit(project, "recipe.json", lambda r: r["frames"][0].__setitem__("repairs", [
        {"image": ref(project, "fix.png"), "mask": ref(project, "fix-mask.png"), "reason": "neck seam"}]))
    result = render(project)
    out = frame(project, 0)
    assert tuple(out[6, 8]) == A and out[5, 8, 3] == 0
    assert result["repair_pixels"] == 2
    prov = json.loads((project / "out" / "provenance.json").read_text())
    assert prov["frames"][0]["repairs"][0]["reason"] == "neck seam"


def test_mirrored_variants_are_refused_on_asymmetric_rigs(project):
    edit(project, "rig.json", lambda r: r["slots"]["bag"]["variants"]["rest"]["provenance"].update(mirrored=True))
    with pytest.raises(rig.RigError, match="mirror"):
        render(project)


def test_changed_pinned_input_fails_closed(project):
    (project / "bag.png").write_bytes((project / "bag.png").read_bytes() + b"\0")
    with pytest.raises(rig.RigError, match="SHA-256"):
        render(project)


def test_partial_alpha_parts_are_rejected_not_blended(project):
    soft = np.asarray(Image.open(project / "bag.png").convert("RGBA")).copy(); soft[0, 0, 3] = 128
    png(project, "bag.png", soft)
    edit(project, "rig.json", lambda r: r["slots"]["bag"]["variants"]["rest"].__setitem__("image", ref(project, "bag.png")))
    with pytest.raises(rig.RigError, match="binary alpha"):
        render(project)


def test_render_is_deterministic_and_never_overwrites(project):
    render(project, "a"); render(project, "b")
    for name in ("manifest.json", "frame-000.png", "frame-002.png", "provenance.json"):
        left, right = (project / "a" / name).read_bytes(), (project / "b" / name).read_bytes()
        assert left == right or name == "provenance.json" and json.loads(left)["frames"] == json.loads(right)["frames"]
    with pytest.raises(FileExistsError):
        render(project, "a")


def test_layers_are_written_per_slot_for_native_documents(project):
    render(project)
    layers = project / "out" / "layers"
    assert sorted(p.name for p in layers.iterdir()) == ["bag", "hand", "head", "shoe", "torso"]
    composed = np.zeros((24, 24, 4), np.uint8)
    for slot in ("shoe", "torso", "head", "bag", "hand"):   # z order
        cel = np.asarray(Image.open(layers / slot / "000.png").convert("RGBA"))
        composed[cel[:, :, 3] == 255] = cel[cel[:, :, 3] == 255]
    assert np.array_equal(composed, frame(project, 0))


def test_cli_render_then_the_unchanged_checked_export_accepts_it(project):
    from forge import animation_export, cli
    assert cli.main(["rig-render", str(project / "recipe.json"), "--out", str(project / "cli-out")]) == 0
    result = animation_export.export_animation(project / "cli-out" / "manifest.json", project / "export", review=True)
    assert result["status"] == "review_only" and result["approved"] is False
    assert result["manual_review_required"] == ["PROP_OWNER_RIG_LABEL:rig:bag", "SEMANTIC_ANATOMY:manual_visual_review"]
    with pytest.raises(animation_export.ExportBlocked, match="manual review record"):
        animation_export.export_animation(project / "cli-out" / "manifest.json", project / "final")


def test_limb_reach_is_measured_from_the_rig_rest_pose(project):
    render(project)
    report = check(project)
    assert statuses(report, "LIMB_REACH") == ["pass", "pass", "pass"]
    edit(project, "recipe.json", lambda r: r["frames"][1]["pose"].__setitem__("hand", {"variant": "rest", "nudge": [3, 2]}))
    render(project, "stretched")
    assert "fail" in statuses(check(project, "stretched"), "LIMB_REACH")


# --- Derived variants (verified by recomputation), RotSprite, previews, native builder ---

def blob():
    a = np.zeros((11, 11, 4), np.uint8)
    a[2:9, 4:7] = A; a[2:4, 4:7] = B; a[8, 6] = C
    return a


def test_rotation_zero_is_identity_and_joints_ride_their_pixels():
    image, joints = rig.derive(blob(), {"top": [5, 2], "foot": [6, 8]}, {"op": "rotate", "degrees": 0, "pivot": [5, 5]})
    assert np.array_equal(image, blob()) and joints == {"top": [5, 2], "foot": [6, 8]}
    for degrees in (8, 14, -10, 90):
        image, joints = rig.derive(blob(), {"foot": [6, 8]}, {"op": "rotate", "degrees": degrees, "pivot": [5, 5]})
        assert np.isin(image[:, :, 3], [0, 255]).all()
        x, y = joints["foot"]
        assert tuple(image[y, x]) == C, degrees     # the joint is still on the red pixel it named


def test_rotsprite_keeps_palette_alpha_and_mass_and_differs_from_nearest():
    source = blob()
    colours = {tuple(c) for c in source.reshape(-1, 4) if c[3]}
    smooth, _ = rig.derive(source, {}, {"op": "rotate", "degrees": 14, "pivot": [5, 5], "algorithm": "rotsprite"})
    nearest, _ = rig.derive(source, {}, {"op": "rotate", "degrees": 14, "pivot": [5, 5]})
    assert {tuple(c) for c in smooth.reshape(-1, 4) if c[3]} <= colours
    assert np.isin(smooth[:, :, 3], [0, 255]).all()
    assert abs(int((smooth[:, :, 3] > 0).sum()) - int((source[:, :, 3] > 0).sum())) <= 3
    assert not np.array_equal(smooth, nearest)
    again, _ = rig.derive(source, {}, {"op": "rotate", "degrees": 14, "pivot": [5, 5], "algorithm": "rotsprite"})
    assert np.array_equal(smooth, again)


def test_derived_variants_are_verified_by_recomputation(project):
    head = np.asarray(Image.open(project / "head.png").convert("RGBA"))
    padded = np.zeros((7, 8, 4), np.uint8); padded[2:5, 2:6] = head
    png(project, "head-pad.png", padded)
    method = {"op": "rotate", "degrees": 10, "pivot": [3, 5]}
    tilted, joints = rig.derive(padded, {"neck": [3, 5]}, method)
    png(project, "head-tilt.png", tilted)
    def add(r):
        r["slots"]["head"]["variants"]["pad"] = {"image": ref(project, "head-pad.png"), "joints": {"neck": [3, 5]},
                                                 "provenance": {"kind": "authored", "note": "source head on a padded canvas"}}
        r["slots"]["head"]["variants"]["tilt10"] = {"image": ref(project, "head-tilt.png"), "joints": joints,
                                                    "provenance": {"kind": "authored_variant", "of": "head.pad", "method": method}}
    edit(project, "rig.json", add)
    edit(project, "recipe.json", lambda r: r["frames"][2]["pose"].__setitem__("head", "tilt10"))
    render(project)
    names = [l["name"] for l in json.loads((project / "out" / "manifest.json").read_text())["frames"][2]["identity_locks"]]
    assert "authored-variant:head.tilt10" in names
    tampered = tilted.copy(); tampered[3, 3] = A
    png(project, "head-tilt.png", tampered)
    edit(project, "rig.json", lambda r: r["slots"]["head"]["variants"]["tilt10"].__setitem__("image", ref(project, "head-tilt.png")))
    with pytest.raises(rig.RigError, match="does not match its recorded derivation"):
        render(project, "tampered")


def test_previews_play_in_place_and_against_the_ground(project):
    def move(r):
        for i, f in enumerate(r["frames"]):
            f["root"] = [-4 * i, 0]
            f["duration_ms"] = 120 + i
    edit(project, "recipe.json", move)
    render(project)
    made = rig.previews(project / "out", project / "previews", background=(30, 28, 40))
    for name in ("strip-1x.png", "strip-2x.png", "in-place-2x.gif", "in-place-2x.png", "ground-2x.gif", "ground-2x.png"):
        assert (project / "previews" / name).is_file(), name
    with Image.open(project / "previews" / "ground-2x.png") as apng:
        durations, lefts = [], []
        for i in range(apng.n_frames):
            apng.seek(i)
            durations.append(apng.info["duration"])
            lefts.append(np.argwhere(np.any(np.asarray(apng.convert("RGB")) != (30, 28, 40), axis=2))[:, 1].min())
    assert durations == [120, 121, 122]
    assert lefts[0] - lefts[1] == 8 and lefts[1] - lefts[2] == 8     # root moves 4 px left per frame at 2x
    assert made["frames"] == 3


def test_native_builder_script_lists_every_layer_cel_and_duration(project):
    render(project)
    script = (project / "out" / "native" / "build.lua").read_text()
    for slot in ("shoe", "torso", "head", "bag", "hand"):
        assert script.count(f"layers/{slot}/") == 3
    assert "0.1" in script and "saveAs" in script


@pytest.mark.skipif(__import__("forge.aseprite", fromlist=["x"]).find_executable() is None, reason="Aseprite not installed")
def test_native_document_round_trips_through_aseprite(project):
    render(project)
    doc = rig.build_native(project / "out", project / "out.aseprite")
    from forge import animation_export
    result = animation_export.export_animation(project / "out" / "manifest.json", project / "native-export", review=True, document=doc)
    assert result["native_document"]["visible_frames_pixel_exact"] is True


def test_a_variant_domain_also_protects_its_transparent_border(project):
    domain = np.zeros((3, 4), np.uint8); domain[:, :] = 255
    head = np.asarray(Image.open(project / "head.png").convert("RGBA")).copy(); head[0, 3] = 0   # one clear border pixel
    png(project, "head.png", head); png(project, "head-domain.png", domain)
    def add(r):
        r["slots"]["head"]["variants"]["rest"]["image"] = ref(project, "head.png")
        r["slots"]["head"]["variants"]["rest"]["domain"] = ref(project, "head-domain.png")
    edit(project, "rig.json", add)
    render(project)
    manifest = json.loads((project / "out" / "manifest.json").read_text())
    lock = next(l for l in manifest["frames"][0]["identity_locks"] if l["name"] == "source:head.rest")
    mask = np.asarray(Image.open(project / "out" / manifest["references"][lock["mask"]]["path"]))
    assert mask[0, 3] == 255                     # the clear pixel is protected too
    assert check(project)["technical_status"] == "pass"


def test_source_sheets_may_exceed_the_frame_cap_but_parts_may_not(project):
    big = np.zeros((600, 40, 4), np.uint8); big[:16, :16] = source_sheet()
    png(project, "sheet.png", big)
    edit(project, "rig.json", lambda r: r["sheets"].__setitem__("sheet", ref(project, "sheet.png")))
    render(project)                                   # a 600 px sheet is fine as a reference
    png(project, "bag.png", np.zeros((600, 3, 4), np.uint8))
    edit(project, "rig.json", lambda r: r["slots"]["bag"]["variants"]["rest"].__setitem__("image", ref(project, "bag.png")))
    with pytest.raises(rig.RigError, match="512"):
        render(project, "big-part")


def test_clear_margins_may_hang_off_the_canvas_but_visible_pixels_may_not(project):
    head = np.asarray(Image.open(project / "head.png").convert("RGBA"))
    roomy = np.zeros((3 + 20, 4, 4), np.uint8); roomy[20:] = head      # 20 clear rows above the head
    png(project, "head-roomy.png", roomy)
    edit(project, "rig.json", lambda r: r["slots"]["head"]["variants"]["rest"].update(
        image=ref(project, "head-roomy.png"), joints={"neck": [1, 23]}, provenance={"kind": "authored", "note": "padded head"}))
    render(project)
    assert check(project)["technical_status"] == "pass"
    edit(project, "recipe.json", lambda r: r["frames"][0]["pose"].__setitem__("head", {"variant": "rest", "nudge": [0, -5]}))
    with pytest.raises(rig.RigError, match="visible pixels leave the canvas"):
        render(project, "clipped")


# --- Hardening (review findings 1-6) ---

def add_tilt(project, joints=None, of="head.pad", name="tilt10", degrees=10):
    head = np.asarray(Image.open(project / "head.png").convert("RGBA"))
    padded = np.zeros((7, 8, 4), np.uint8); padded[2:5, 2:6] = head
    png(project, "head-pad.png", padded)
    method = {"op": "rotate", "degrees": degrees, "pivot": [3, 5]}
    tilted, derived = rig.derive(padded, {"neck": [3, 5]}, method)
    png(project, f"head-{name}.png", tilted)
    def add(r):
        r["slots"]["head"]["variants"]["pad"] = {"image": ref(project, "head-pad.png"), "joints": {"neck": [3, 5]},
                                                 "provenance": {"kind": "authored", "note": "padded source head"}}
        r["slots"]["head"]["variants"][name] = {"image": ref(project, f"head-{name}.png"), "joints": joints or derived,
                                                "provenance": {"kind": "authored_variant", "of": of, "method": method}}
    edit(project, "rig.json", add)
    return derived


def test_1_declared_joints_of_a_derived_variant_must_match_the_recomputation(project):
    derived = add_tilt(project)
    render(project)                                            # honest joints render
    add_tilt(project, joints={"neck": [derived["neck"][0] + 2, derived["neck"][1]]})
    with pytest.raises(rig.RigError, match="joints"):
        render(project, "moved-joint")
    add_tilt(project, joints={**derived, "extra": [0, 0]})
    with pytest.raises(rig.RigError, match="joints"):
        render(project, "extra-joint")


def test_2_a_joint_on_the_pivot_never_moves_and_tracking_stays_near_the_geometry():
    source = blob()
    corners = {"pivot": [5, 5], "corner": [4, 2], "clear": [1, 1], "edge": [6, 8], "outside": [12, -3]}
    for algorithm in ("nearest", "rotsprite"):
        for degrees in (-30, -14, 7, 15, 45, 90):
            _, joints = rig.derive(source, corners, {"op": "rotate", "degrees": degrees, "pivot": [5, 5], "algorithm": algorithm})
            assert joints["pivot"] == [5, 5], (algorithm, degrees)
            theta = np.radians(degrees)
            for name, (x, y) in corners.items():
                dx, dy = x + 0.5 - 5, y + 0.5 - 5
                gx, gy = 5 + dx * np.cos(theta) + dy * np.sin(theta), 5 - dx * np.sin(theta) + dy * np.cos(theta)
                jx, jy = joints[name]
                assert abs(jx + 0.5 - gx) <= 1.5 and abs(jy + 0.5 - gy) <= 1.5, (algorithm, degrees, name, joints[name], (gx, gy))


def test_3_variant_and_native_outputs_are_created_exclusively(project, tmp_path):
    from forge import cli
    target = tmp_path / "dangling.png"
    target.symlink_to(tmp_path / "nowhere.png")             # a dangling symlink must not be followed or replaced
    code = cli.main(["rig-variant", str(project / "head.png"), "--of", "head.rest", "--rotate", "5", "--pivot", "1,1", "--out", str(target)])
    assert code == 1 and target.is_symlink() and not (tmp_path / "nowhere.png").exists()
    fresh = tmp_path / "fresh.png"
    assert cli.main(["rig-variant", str(project / "head.png"), "--of", "head.rest", "--rotate", "5", "--pivot", "1,1", "--out", str(fresh)]) == 0
    assert fresh.is_file()
    render(project)
    doc = tmp_path / "doc.aseprite"
    doc.symlink_to(tmp_path / "elsewhere.aseprite")
    with pytest.raises(FileExistsError):
        rig.build_native(project / "out", doc)


def test_4_generated_names_cannot_collide(project):
    def two(r):
        bag = r["slots"]["bag"]["variants"]["rest"]
        r["slots"]["bag"]["variants"]["x-y"] = bag
        r["slots"]["bag-x"] = {"z": 26, "attach": {"parent": "hand", "parent_joint": "grip", "joint": "handle"},
                               "variants": {"y": bag}}
    edit(project, "rig.json", two)
    edit(project, "recipe.json", lambda r: [f["hidden"].append("bag-x") if "hidden" in f else f.__setitem__("hidden", ["bag-x"]) for f in r["frames"]])
    render(project)
    manifest = json.loads((project / "out" / "manifest.json").read_text())
    paths = [v["path"] for v in manifest["references"].values()]
    assert len(paths) == len(set(paths))
    assert any(":" in name for name in manifest["references"])          # separators no slot/variant name can contain
    edit(project, "rig.json", lambda r: r["slots"].__setitem__("_repair", r["slots"].pop("bag-x")))
    with pytest.raises(rig.RigError, match="slot name"):
        render(project, "reserved")


def test_5_derivations_cannot_point_at_themselves_or_loop(project):
    add_tilt(project, of="head.tilt10", degrees=0)
    with pytest.raises(rig.RigError, match="cycle|itself"):
        render(project)
    derived = add_tilt(project)
    def loop(r):
        v = r["slots"]["head"]["variants"]
        v["pad"] = {**v["tilt10"], "provenance": {"kind": "authored_variant", "of": "head.tilt10", "method": {"op": "rotate", "degrees": 0, "pivot": [3, 5]}}}
        v["tilt10"]["provenance"]["of"] = "head.pad"
    edit(project, "rig.json", loop)
    with pytest.raises(rig.RigError, match="cycle"):
        render(project, "loop")


def test_6_the_checked_export_verifies_and_snapshots_the_rig_and_recipe_bytes(project):
    from forge import animation_export
    render(project)
    manifest = json.loads((project / "out" / "manifest.json").read_text())
    prov = manifest["rig_provenance"]
    for key in ("rig", "recipe"):
        assert prov[key]["sha256"] == prov[f"{key}_sha256"]
        assert (project / "out" / prov[key]["path"]).is_file()
    result = animation_export.export_animation(project / "out" / "manifest.json", project / "exp", review=True)
    assert (project / "exp" / "inputs" / prov["rig"]["path"]).is_file()
    assert (project / "exp" / "inputs" / prov["recipe"]["path"]).is_file()
    assert result["checks"]["rig_provenance"]["verified_bytes"] is True
    rig_copy = project / "out" / prov["rig"]["path"]
    rig_copy.write_bytes(rig_copy.read_bytes() + b" ")       # tampered rig copy fails closed
    report = check(project)
    assert any(c["code"] == "HASH_MISMATCH" for c in report["checks"])


def test_rig_review_runs_the_whole_loop_and_summarises_it(project, monkeypatch):
    from forge import cli, aseprite
    monkeypatch.setattr(aseprite, "find_executable", lambda: None)
    render(project, "baseline")
    edit(project, "recipe.json", lambda r: r["frames"][2]["pose"].__setitem__("bag", {"variant": "rest", "nudge": [0, 1]}))
    assert cli.main(["rig-review", str(project / "recipe.json"), "--out", str(project / "review"),
                     "--baseline", str(project / "baseline")]) == 0
    summary = json.loads((project / "review" / "SUMMARY.json").read_text())
    assert summary["export"]["status"] == "review_only" and summary["export"]["technical"] == "pass"
    assert summary["export"]["manual_review_required"] == ["PROP_OWNER_RIG_LABEL:rig:bag", "SEMANTIC_ANATOMY:manual_visual_review"]
    assert summary["native"]["status"] == "skipped" and "Aseprite" in summary["native"]["reason"]
    assert summary["compare"]["changed_pixels"] == {"0": 0, "1": 0, "2": summary["compare"]["changed_pixels"]["2"]}
    assert summary["compare"]["changed_pixels"]["2"] > 0
    for rel in ("render/manifest.json", "export/export-report.json", "previews/in-place-2x.gif", "compare-2x.png", "SUMMARY.md"):
        assert (project / "review" / rel).is_file(), rel
    assert summary["approved"] is False
    assert cli.main(["rig-review", str(project / "recipe.json"), "--out", str(project / "review")]) == 1   # never overwrites


def test_feet_are_checked_against_the_floor_in_single_frames(project):
    edit(project, "rig.json", lambda r: r.__setitem__("ground_y", 15))             # the shoe's bottom row at rest
    def charge(r):
        r["frames"][2]["planted"] = []
        r["frames"][2]["grounded"] = ["shoe"]                                     # touching, not standing still
    edit(project, "recipe.json", charge)
    render(project)
    report = check(project)
    assert statuses(report, "GROUND_CONTACT") == ["pass", "pass", "pass"]
    assert not any(c["code"] == "NOT_CHECKED" and "stance" in c["scope"] for c in report["checks"])
    edit(project, "recipe.json", lambda r: r["frames"][2]["pose"].__setitem__("torso", {"variant": "rest", "nudge": [0, -1]}))
    render(project, "floating")
    assert statuses(check(project, "floating"), "GROUND_CONTACT") == ["pass", "pass", "fail"]


def test_grounded_must_name_contact_slots_and_not_airborne_frames(project):
    edit(project, "rig.json", lambda r: r.__setitem__("ground_y", 15))
    edit(project, "recipe.json", lambda r: r["frames"][0].__setitem__("grounded", ["bag"]))
    with pytest.raises(rig.RigError, match="contact"):
        render(project)
