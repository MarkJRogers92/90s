"""Recipe-only improvement of the imported WEST charge: no new painting, no per-frame scripts.

Adds two derived (recomputable) bag variants and re-poses frames 4-5:
  - frame 4 push-off (RotSprite): bag swings 6 degrees back about its grip as the body drives forward;
  - frame 5 reach: bag trails 16 degrees (it lags the lunge), head leans to the existing 14 degree tilt.
Everything else is reused from the imported rig unchanged.
"""
import json, subprocess, sys, hashlib
from pathlib import Path
HERE = Path(__file__).resolve().parent
FORGE = HERE.parent.parent / "forge-source"
rig = json.loads((HERE / "rig.json").read_text())
for pose, degrees in (("pose4", 6), ("pose5", 16)):
    base = rig["slots"]["bag"]["variants"][pose]
    name = f"{pose}-lag{degrees:02d}"
    out = HERE / "parts" / f"bag-{name}.png"
    out.unlink(missing_ok=True)
    grip = base["joints"]["hang"]   # swing about the point where the hand holds it
    block = json.loads(subprocess.check_output([str(FORGE / ".venv/bin/python"), "-m", "forge", "rig-variant", str(HERE / base["image"]["path"]),
        "--of", f"bag.{pose}", "--joints", json.dumps(base["joints"]), "--rotate", str(degrees), "--pivot", f"{grip[0]},{grip[1]}", "--algorithm", "rotsprite", "--out", str(out)], cwd=FORGE))
    block["image"]["path"] = f"parts/{out.name}"
    rig["slots"]["bag"]["variants"][name] = block
(HERE / "rig-v2.json").write_text(json.dumps(rig, indent=1) + "\n")
recipe = json.loads((HERE / "recipe.json").read_text())
recipe["rig"] = {"path": "rig-v2.json", "sha256": hashlib.sha256((HERE / "rig-v2.json").read_bytes()).hexdigest()}
frames = {f["id"]: f for f in recipe["frames"]}
frames["4"]["pose"]["bag"] = "pose4-lag06"
frames["5"]["pose"]["bag"] = "pose5-lag16"
frames["5"]["pose"]["head"] = "tilt14"
(HERE / "recipe-v2.json").write_text(json.dumps(recipe, indent=1) + "\n")
print("wrote rig-v2.json and recipe-v2.json")
