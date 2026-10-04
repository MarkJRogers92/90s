"""Reproduce this one approved art conversion with unchanged Pixel Forge primitives.

This is an asset-specific recipe, not a new provider or general extraction system.
Run: PYTHONDONTWRITEBYTECODE=1 python art/damaged-vending/build.py OUTPUT_DIRECTORY
"""
from pathlib import Path
from io import BytesIO
import hashlib, json, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[1]
sys.path.insert(0, str(REPO_ROOT / 'tools/pixel-forge'))
from forge_accel.pixels import finish, FinishOptions, inspect, review_sheet, pixel_hash
from forge_accel.atlas import slice_grid, Frame, export_bundle, inspect_motion
from forge_accel.constraints import check_revision
from forge import image_consistency

out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=False)
raw_path = ROOT / 'source/generated-sheet.png'
raw = Image.open(raw_path).convert('RGBA')
assert raw.size == (2172, 724)
slots = slice_grid(raw, (543, 724))
crops = [slot.crop((128, 32, 488, 688)) for slot in slots]
# Exact measured slots and common crop. Every crop is uniformly reduced 8x.
# No stretching of the whole 3:1 generated canvas into the 4:1 native atlas.
visible = np.concatenate([np.array(c)[np.array(c)[:, :, 3] >= 128, :3] for c in crops])
sample = visible[::4]
quant = Image.fromarray(sample.reshape(1, -1, 3)).quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
palette = tuple(map(tuple, np.array(quant.getpalette()[:144], dtype=np.uint8).reshape(-1, 3).tolist()))
converted = []
for crop in crops:
    cleaned = finish(crop, FinishOptions(palette=palette, alpha_threshold=128))
    native = finish(cleaned, FinishOptions(target_size=(45, 82), alpha_threshold=128))
    a = np.array(native); a[a[:, :, 3] == 0] = 0
    cell = Image.new('RGBA', (96, 96)); cell.paste(Image.fromarray(a), (26, 9))
    converted.append(cell)

# Freeze frame 0's body, cracks, cans and alpha. Retain other source frames' light states only.
base = np.array(converted[0]); allowed = np.zeros((96, 96), dtype=bool)
def amber(a):
    return (a[:, :, 0] > 130) & (a[:, :, 1] > 85) & (a[:, :, 0] > a[:, :, 2] * 1.5) & (a[:, :, 1] > a[:, :, 2] * 1.2) & (a[:, :, 3] > 0)
sign = amber(base) | amber(np.array(converted[2])); sign[:18] = False; sign[28:] = False
allowed |= sign
frames_arrays = [base.copy() for _ in range(4)]
for i in (1, 2):
    source = np.array(converted[i]); frames_arrays[i][sign, :3] = source[sign, :3]

# The tiny original sparks disappear under modal reduction. Preserve their actual
# bright source footprint: vote within the SAME 8x8 blocks, no painted new effect.
spark_source = np.array(slots[2])
spark = (spark_source[:, :, 0] > 200) & (spark_source[:, :, 1] > 150) & (spark_source[:, :, 2] < 190) & (spark_source[:, :, 3] >= 128)
spark[:470] = False; spark[565:] = False; spark[:, :285] = False; spark[:, 335:] = False
spark_pixels = []
for cy in range(82):
    for cx in range(45):
        region = spark[32+cy*8:40+cy*8, 128+cx*8:136+cx*8]
        if int(region.sum()) < 8: continue
        rgba = spark_source[32+cy*8:40+cy*8, 128+cx*8:136+cx*8][region]
        rgb = rgba[np.argmax(rgba[:, :3].astype(int).sum(1)), :3]
        one = Image.new('RGBA', (1, 1), tuple(map(int, rgb)) + (255,))
        color = np.array(finish(one, FinishOptions(palette=palette)))[0, 0, :3]
        x, y = 26+cx, 9+cy
        assert base[y, x, 3] == 255
        frames_arrays[2][y, x, :3] = color
        allowed[y, x] = True
        spark_pixels.append({'pixel':[x,y], 'source_bright_votes':int(region.sum()), 'rgb':color.tolist()})

edit_mask = Image.fromarray(allowed.astype(np.uint8) * 255)
lock_mask = Image.fromarray((~allowed).astype(np.uint8) * 255)
edit_mask.save(out / 'editable-light-mask.png'); lock_mask.save(out / 'locked-body-mask.png')
palette_image = Image.new('RGBA', (48, 1)); palette_image.putdata([tuple(c)+(255,) for c in palette]); palette_image.save(out / 'shared-palette.png')
(out/'shared-palette.json').write_text(json.dumps(palette, indent=2))
frames = []
(out/'frames').mkdir()
durations = [280, 90, 90, 340]
for i, a in enumerate(frames_arrays):
    im = Image.fromarray(a); im.save(out/f'frames/damaged-vending-{i}.png')
    frames.append(Frame(f'frame-{i}', im, durations[i], 'damaged-flicker', (48,89)))
export_bundle(frames, out/'atlas', columns=4, padding=0)
sheet = Image.open(out/'atlas/atlas.png').convert('RGBA'); sheet.save(out/'DEAD-MALL-damaged-vending-96.png')
review_sheet(sheet).save(out/'DEAD-MALL-damaged-vending-1x-2x.png')

# Existing consistency checker, now using the finished native source and explicit locks.
references = [(out/'frames/damaged-vending-0.png').read_bytes(), (out/'shared-palette.png').read_bytes(), (out/'locked-body-mask.png').read_bytes()]
spec = {'frame_size':96,'frames':4,'facings':['south-east'],'durations_ms':durations,'pivot':[48,89],
 'consistency':{'version':1,'appearance_references':{'south-east':0},'palette_references':[1],
 'identity':'Exact approved damaged vending body outside the explicit light mask.',
 'proportions':'Fixed 44x81 visible footprint and common baseline; only sign and internal sparks change.',
 'poses':['Weak light','Nearly dark','Light and source-preserved spark','Weak light hold'],
 'frame_checks':{'south-east':[{'height_range':[81,81],'baseline_y':89,'identity_locks':[{'source_reference':0,'mask_reference':2,'offset':[0,0]}]} for _ in range(4)]}}}
image_consistency.validate(spec['consistency'],spec,references)
consistency = image_consistency.check_native(sheet,spec,references)
locks = [check_revision(frames[0].image, f.image, edit_mask, max_changed_pixels=int(allowed.sum())) for f in frames]
mechanical = [inspect(f.image) for f in frames]
assert sheet.size == (384,96)
assert not consistency['errors']
assert all(r['accepted'] and r['outside_mask_pixels']==0 for r in locks)
assert all(np.array_equal(a[:,:,3],base[:,:,3]) for a in frames_arrays)
assert all(r['partial_alpha_pixels']==0 and r['visible_rgb_colors']<=48 and not r['errors'] for r in mechanical)
(out/'consistency-contract.json').write_text(json.dumps(spec,indent=2))
(out/'native-checks.json').write_text(json.dumps({'consistency':consistency,'exact_edit_checks':locks,'frames':mechanical,'motion':inspect_motion(frames)},indent=2))

# Self-contained native playback already exported by Forge. GIF is a viewing derivative.
gif_frames=[]
for f in frames:
    large=f.image.resize((384,384),Image.Resampling.NEAREST)
    bg=Image.new('RGB',(384,384),(28,28,36));bg.paste(large,(0,0),large);gif_frames.append(bg)
gif_frames[0].save(out/'DEAD-MALL-damaged-vending-animation.gif',save_all=True,append_images=gif_frames[1:],duration=durations,loop=0,disposal=2,optimize=False)
manifest={'asset':'DEAD MALL damaged vending machine','format':'384x96 RGBA PNG; four 96x96 cells','pivot':[48,89],'durations_ms':durations,'loop_ms':sum(durations),'facing':'south-east camera label; front and right side visible','source_sha256':hashlib.sha256(raw_path.read_bytes()).hexdigest(),'source_dimensions':[2172,724],'slot_dimensions':[543,724],'slot_crop':[128,32,488,688],'uniform_reduction':8,'placement':[26,9],'alpha_threshold':128,'shared_palette_colors':48,'palette_selection':'32/48/64 reviewed; 48 retains glass/metal separation, 64 has little visible benefit','palette_method':'Deterministic median-cut sampled source palette; existing Forge Oklab mapping, no dithering','geometry':'Frame 0 body and alpha are exact across all four frames; sign colors transferred from source frames 1 and 2; frame 3 is intentional exact frame-0 hold','spark_preservation':spark_pixels,'lossy_steps':['Median-cut palette selection and Oklab mapping','Alpha threshold removes translucent edge pixels','8x integer block-mode reduction discards high-resolution detail','Source frame variation outside sign/spark replaced by frame-0 geometry','Tiny original spark footprint preserved by explicit source-brightness block votes'],'tool_source_commit':'1450a956d55e55a9775b6bfed916b46aac8e5895','generation_grid':'Raw generation was not a native grid; this recipe performs an explicit derived conversion.','runtime_integration':'Not performed','sheet_pixel_sha256':pixel_hash(sheet)}
(out/'conversion-manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'out':str(out),'sheet_size':sheet.size,'frame_bounds':[f.image.getbbox() for f in frames],'palette_size':48,'actual_sheet_rgb':inspect(sheet)['visible_rgb_colors'],'spark_pixels':spark_pixels,'light_mask_size':int(allowed.sum()),'changes':[r['changed_pixels'] for r in locks],'consistency_errors':consistency['errors']},indent=2))
