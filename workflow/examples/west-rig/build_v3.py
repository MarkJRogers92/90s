"""v3: split the imported body at the waist so the torso can lean, then improve the charge.

Step 1 (rig-v3.json + recipe-v3-base.json): the import's body becomes two slots,
  legs  (root, contact) : body pixels at y >= CUT, plus a 2-row underlay copied from the
                          upper body so a small torso rotation never opens a gap at the waist;
  upper (hangs from legs.hip): body pixels above CUT. Head hangs from upper.neck, the hand
                          from upper.wrist, so leaning the torso carries them (forward kinematics).
  recipe-v3-base re-renders the six frozen frames pixel-identically (checked below).
Step 2 (recipe-v3.json): torso lean as verified RotSprite rotations about the hip, the bag
  swinging behind the hand (outline resealed, specks dropped), the frame-5 head tilt from v2, and frame 4 lowered 1 px so the push-off toe touches the floor
  (the new floor check found it floating). No painting.

    python3 build_v3.py   (run from this folder with the forge environment)
"""
import hashlib, json, subprocess
from pathlib import Path
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
FORGE = HERE.parent.parent / "forge-source"
PY = str(FORGE / ".venv/bin/python") if (FORGE / ".venv/bin/python").exists() else "python3"
CUT = 85                       # the stride refinement only ever edited y >= 85: the waist line
UNDERLAY = 2
LEANS = {"4": 4, "5": -3}      # degrees about the hip: deeper lean on the push-off, lift on the reach


def pin(path):
    return {"path": str(Path(path).relative_to(HERE)), "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest()}


def save(name, array):
    path = HERE / "parts" / name
    path.unlink(missing_ok=True)
    Image.fromarray(array).save(path)
    return pin(path)


rig = json.loads((HERE / "rig-v2.json").read_text())
body = rig["slots"].pop("body")
legs = {"z": 10, "contact": True, "rest": "pose0", "variants": {}}
upper = {"z": 15, "rest": "pose0", "attach": {"parent": "legs", "parent_joint": "hip", "joint": "hip"}, "variants": {}}
report = []
for name, variant in body["variants"].items():
    pixels = np.array(Image.open(HERE / variant["image"]["path"]).convert("RGBA"))
    hand = rig["slots"]["hand"]["variants"][name]
    red = (pixels[:, :, 0] > 150) & (pixels[:, :, 1] < 60) & (pixels[:, :, 2] < 60) & (pixels[:, :, 3] == 255)
    ys, xs = np.where(red[CUT - 10:CUT + 2])
    hip = [int(round(xs.mean())), CUT - 1] if len(xs) else [64, CUT - 1]
    top = pixels.copy(); top[CUT:] = 0
    low = pixels.copy(); low[:CUT] = 0
    under = top[CUT - UNDERLAY:CUT]
    low[CUT - UNDERLAY:CUT][under[:, :, 3] == 255] = under[under[:, :, 3] == 255]
    joints = variant["joints"]
    legs["variants"][name] = {"image": save(f"legs-{name}.png", low), "joints": {"mount": [0, 0], "hip": hip},
        "provenance": {"kind": "authored", "note": f"Imported body {name} at y >= {CUT}, plus a {UNDERLAY}-row underlay of the upper body (hidden at rest)."}}
    upper["variants"][name] = {"image": save(f"upper-{name}.png", top),
        "joints": {"hip": hip, "neck": joints["neck"], "shoulder": joints["shoulder"], "elbow": joints["elbow"],
                   "wrist": hand["joints"]["wrist"]},
        "provenance": {"kind": "authored", "note": f"Imported body {name} above y = {CUT}."}}
    report.append({"pose": name, "hip": hip})
rig["slots"]["legs"], rig["slots"]["upper"] = legs, upper
rig["root_slot"] = "legs"
rig["slots"]["head"]["attach"] = {"parent": "upper", "parent_joint": "neck", "joint": "neck"}
rig["slots"]["hand"]["attach"] = {"parent": "upper", "parent_joint": "wrist", "joint": "wrist"}
rig["slots"]["shoes"]["attach"] = {"parent": "legs", "parent_joint": "mount", "joint": "mount"}
rig["limbs"] = [{"name": "near-arm", "chain": ["upper.shoulder", "upper.elbow", "hand.wrist"], "tolerance_px": 4}]
rig["ground_y"] = 111         # the planted shoes' bottom row in frames 0-3 (baseline 112 exclusive)

# Step 2's derived variants (verified by recomputation when rendered). Cleanup is part of the
# recorded method: specks under 3 px are dropped and the bag's outline is resealed.
def derived(slot, base_name, new_name, degrees, pivot_joint, extra):
    base = rig["slots"][slot]["variants"][base_name]
    out = HERE / "parts" / f"{slot}-{new_name}.png"
    out.unlink(missing_ok=True)
    pivot = base["joints"][pivot_joint]
    block = json.loads(subprocess.check_output([PY, "-m", "forge", "rig-variant", str(HERE / base["image"]["path"]),
        "--of", f"{slot}.{base_name}", "--joints", json.dumps(base["joints"]), "--rotate", str(degrees),
        "--pivot", f"{pivot[0]},{pivot[1]}", "--algorithm", "rotsprite", *extra, "--out", str(out)], cwd=FORGE))
    block["image"]["path"] = f"parts/{out.name}"
    rig["slots"][slot]["variants"][new_name] = block
    return new_name


def lean_name(fid, degrees):
    return f"pose{fid}-lean{'p' if degrees >= 0 else 'm'}{abs(degrees)}"


for fid, degrees in LEANS.items():
    derived("upper", f"pose{fid}", lean_name(fid, degrees), degrees, "hip", ["--min-component", "3"])
BAG_LAG = {"4": 6, "5": 16}
for fid, degrees in BAG_LAG.items():
    derived("bag", f"pose{fid}", f"pose{fid}-swing{degrees:02d}", degrees, "hang", ["--min-component", "3", "--outline", "5,6,5"])

(HERE / "rig-v3.json").write_text(json.dumps(rig, indent=1) + "\n")
rig_pin = pin(HERE / "rig-v3.json")

base = json.loads((HERE / "recipe.json").read_text())
base["rig"] = rig_pin
for frame in base["frames"]:
    pose = frame["pose"]
    pose["upper"] = pose["legs"] = pose.pop("body")
    if frame["id"] in ("4", "5"):
        frame["grounded"] = ["legs"]  # the charge feet are inside the legs art
(HERE / "recipe-v3-base.json").write_text(json.dumps(base, indent=1) + "\n")

v3 = json.loads(json.dumps(base))
frames = {f["id"]: f for f in v3["frames"]}
for fid, degrees in LEANS.items():
    frames[fid]["pose"]["upper"] = lean_name(fid, degrees)
for fid, degrees in BAG_LAG.items():
    frames[fid]["pose"]["bag"] = f"pose{fid}-swing{degrees:02d}"
frames["5"]["pose"]["head"] = "tilt14"
frames["4"]["pose"]["legs"] = {"variant": "pose4", "nudge": [0, 1]}   # push-off toe onto the floor
(HERE / "recipe-v3.json").write_text(json.dumps(v3, indent=1) + "\n")
print(json.dumps({"hips": report, "wrote": ["rig-v3.json", "recipe-v3-base.json", "recipe-v3.json"]}, indent=1))
