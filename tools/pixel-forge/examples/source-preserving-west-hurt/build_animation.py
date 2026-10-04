"""Build the REVIEW_ONLY four-frame source-pixel WEST recoil with its pinned peak."""
from pathlib import Path
import argparse, base64, copy, hashlib, json, shutil, sys
import numpy as np
from PIL import Image, ImageDraw
PEAK = 'c14567847026eb93b536e13ec2acb04647f97b404b23c8362cfbaae7c149fcfb'
SOURCE = '4ecc5c275ecd29210dc4b68f3d7850dd33740bd51dca76dfca937cbe181a29b3'
WALK = '7760bd56724fa1abe0dc8c7cf4e64a1a6c51056543f9146f2f1688b6f0c06b5b'
TIMING = [50, 50, 67, 67]

def parse_arguments(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--bundle', required=True, help='Fresh peak bundle from build_recoil.py')
    p.add_argument('--forge-root', default=str(Path(__file__).resolve().parents[2]), help='Directory containing forge; defaults to this checkout tools/pixel-forge')
    p.add_argument('--out', required=True, help='Fresh output directory; existing paths are refused')
    return p.parse_args(argv)

def build(args):
    root = Path(args.out).resolve()
    bundle = Path(args.bundle).resolve(strict=True)
    forge = Path(args.forge_root).resolve(strict=True)
    if hashlib.sha256((bundle / 'candidate.png').read_bytes()).hexdigest() != PEAK:
        raise ValueError('reviewed peak hash mismatch')
    if hashlib.sha256((bundle / 'source.png').read_bytes()).hexdigest() != SOURCE:
        raise ValueError('source hash mismatch')
    if hashlib.sha256((bundle / 'walk-source.png').read_bytes()).hexdigest() != WALK:
        raise ValueError('walk hash mismatch')
    root.mkdir(parents=True, exist_ok=False)
    sys.path.insert(0, str(forge))
    from forge import rig, animation_checks, animation_export
    for n in ['source.png', 'walk-source.png']:
        shutil.copyfile(bundle / n, root / n)
    for n in ['layers', 'masks', 'patches']:
        shutil.copytree(bundle / n, root / n)

    def write(n, o):
        (root / n).write_text(json.dumps(o, indent=2) + '\n')

    def pin(n):
        return {'path': n, 'sha256': hashlib.sha256((root / n).read_bytes()).hexdigest()}

    def save(n, a):
        Image.fromarray(a).save(root / n)
        return pin(n)
    doc = json.loads((bundle / 'rig.json').read_text())
    source = np.array(Image.open(root / 'source.png'))
    for phase, torso, arm in [('onset', -4, 1), ('rebound', -4, 1)]:
        for slot, degrees, pivot in [('upper', torso, [48, 60]), ('forearm', arm, [50, 50])]:
            v = doc['slots'][slot]['variants']['source']
            a = np.array(Image.open(root / v['image']['path']))
            method = {'op': 'rotate', 'degrees': degrees, 'pivot': pivot, 'algorithm': 'rotsprite'}
            a, j = rig.derive(a, v['joints'], method)
            name = f'layers/{slot}-{phase}.png'
            save(name, a)
            doc['slots'][slot]['variants'][phase] = {'image': pin(name), 'joints': j, 'provenance': {'kind': 'authored_variant', 'of': slot + '.source', 'method': method}}
    write('rig.json', doc)
    peak = json.loads((bundle / 'peak-recipe.json').read_text())['frames'][0]
    frames = []
    for index, (name, duration) in enumerate(zip(['onset', 'peak', 'rebound', 'settle'], TIMING)):
        f = copy.deepcopy(peak)
        f['id'] = name
        f['duration_ms'] = duration
        f['phase'] = 'recovery' if name == 'rebound' else 'stance'
        if name != 'peak':
            f.pop('repairs', None)
            for slot in ['upper', 'forearm']:
                f['pose'][slot] = name if name != 'settle' else 'source'
        frames.append(f)
    recipe = {'schema': 'forge-pose/1', 'rig': pin('rig.json'), 'frames': frames}
    write('recipe.json', recipe)
    _, _, rd, pins = rig.load(root / 'recipe.json')
    r = rig.Rig(rd, pins)
    domains = {n: np.array(Image.open(root / f'masks/{n}-domain.png')) == 255 for n in ['head', 'bag', 'shoes']}
    evidence = []
    for i, f in enumerate(frames):
        raw, places, _, _, _, _ = rig.render_frame(r, f, pins)
        protected = {n: {'translation': [places[n]['left'], places[n]['top']], 'rotation_degrees': 0, 'scale': 1, 'domain': f'masks/{n}-domain.png'} for n in domains}
        repair_count = 95 if f['id'] == 'peak' else 0
        if f['id'] in ['onset', 'rebound']:
            protect = np.zeros((96, 96), bool)
            for n, domain in domains.items():
                yy, xx = np.where(domain)
                dx, dy = protected[n]['translation']
                protect[yy + dy, xx + dx] = True
            repair = np.zeros_like(source)
            mask = np.zeros((96, 96), bool)
            copies = []
            for y in range(50, 86):
                xs = np.where(raw[y, :, 3] == 255)[0]
                if len(xs) < 2:
                    continue
                for x in range(int(xs.min()) + 1, int(xs.max())):
                    if raw[y, x, 3] or protect[y, x]:
                        continue
                    sx = 45 if y < 70 else 43
                    repair[y, x] = source[y, sx]
                    mask[y, x] = True
                    copies.append({'source': [sx, y], 'target': [x, y], 'rgba': source[y, sx].tolist()})
            name = f['id']
            save(f'patches/{name}-seams.png', repair)
            save(f'patches/{name}-seams-mask.png', (mask * 255).astype(np.uint8))
            write(f'patches/{name}-source-pixel-copies.json', copies)
            repair_count = len(copies)
            f['repairs'] = [{'image': pin(f'patches/{name}-seams.png'), 'mask': pin(f'patches/{name}-seams-mask.png'), 'reason': 'Copy same-row source garment pixels into exposed seams after this frame articulation; protected domains are excluded.'}]
        evidence.append({'id': f['id'], 'label': 'impact onset' if f['id'] == 'onset' else 'restrained return' if f['id'] == 'rebound' else f['id'], 'duration_ms': f['duration_ms'], 'protected': protected, 'repair_pixels': repair_count, 'upper_degrees': {'onset': -4, 'peak': -10, 'rebound': -4, 'settle': 0}[f['id']], 'forearm_degrees': {'onset': 1, 'peak': 4, 'rebound': 1, 'settle': 0}[f['id']]})
    write('recipe.json', recipe)
    rig.render_recipe(root / 'recipe.json', root / 'render')
    checks = animation_checks.check_manifest(json.loads((root / 'render/manifest.json').read_text()), root / 'render')
    write('forge-checks.json', checks)
    if any((c['status'] == 'fail' for c in checks['checks'])):
        raise ValueError('Forge checks failed: ' + str([c for c in checks['checks'] if c['status'] == 'fail']))
    report = animation_export.export_animation(root / 'render/manifest.json', root / 'checked-export', review=True)
    images = [Image.open(root / f'render/frame-{i:03d}.png').convert('RGBA') for i in range(4)]
    if hashlib.sha256((root / 'render/frame-001.png').read_bytes()).hexdigest() != PEAK:
        raise ValueError('rendered peak changed')
    if not np.array_equal(np.array(images[3]), source):
        raise ValueError('settle is not exact source')
    strip = Image.new('RGBA', (384, 96))
    for i, im in enumerate(images):
        strip.paste(im, (96 * i, 0))
    strip.save(root / 'strip.png')
    images[0].save(root / 'preview-exact.png', save_all=True, append_images=images[1:], duration=TIMING, loop=0, disposal=0, blend=0)
    colored = []
    for im in images:
        bg = Image.new('RGBA', (192, 192), (29, 31, 37, 255))
        bg.alpha_composite(im.resize((192, 192), Image.Resampling.NEAREST))
        colored.append(bg.convert('RGB'))
    atlas = Image.new('RGB', (192 * 4, 192))
    for i, im in enumerate(colored):
        atlas.paste(im, (192 * i, 0))
    palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    colored = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in colored]
    colored[0].save(root / 'preview-gif-approx.gif', save_all=True, append_images=colored[1:], duration=[50, 50, 70, 70], loop=0, disposal=1, optimize=False)
    colored[0].save(root / 'preview-slow-inspection.gif', save_all=True, append_images=colored[1:], duration=[400] * 4, loop=0, disposal=1, optimize=False)
    for scale in [1, 2, 4]:
        w, h = (96 * scale, 96 * scale)
        board = Image.new('RGBA', (w * 4, h * 2 + 70), (29, 31, 37, 255))
        draw = ImageDraw.Draw(board)
        for i, im in enumerate(images):
            draw.text((i * w + 5, 3), evidence[i]['id'] + ' ' + str(TIMING[i]) + 'ms', fill='white')
            board.alpha_composite(Image.fromarray(source).resize((w, h), Image.Resampling.NEAREST), (i * w, 25))
            board.alpha_composite(im.resize((w, h), Image.Resampling.NEAREST), (i * w, h + 50))
            draw.line((i * w, 25 + 95 * scale, (i + 1) * w - 1, 25 + 95 * scale), fill=(63, 95, 69))
            draw.line((i * w, h + 50 + 95 * scale, (i + 1) * w - 1, h + 50 + 95 * scale), fill=(63, 95, 69))
        draw.text((5, h + 30), 'Source above; four-frame recoil below. Shoes fixed on baseline y95.', fill='white')
        board.save(root / f'comparison-{scale}x.png')
    apng = 'data:image/png;base64,' + base64.b64encode((root / 'preview-exact.png').read_bytes()).decode()
    gif = 'data:image/gif;base64,' + base64.b64encode((root / 'preview-slow-inspection.gif').read_bytes()).decode()
    html = '<!doctype html><meta charset="utf-8"><title>WEST source-pixel recoil review</title><style>body{background:#1d1f25;color:#eee;font:16px system-ui;max-width:950px;margin:35px auto}section{display:inline-block;margin:15px 40px}img{image-rendering:pixelated;width:288px;height:288px}img.native{width:96px;height:96px}small{color:#bbb}</style><h1>WEST recoil: review only</h1><p>Four native 96×96 frames, original head/bag/shoes preserved. Exact source settle.</p><section><h2>Native 1×: 234 ms</h2><img class="native" src="APNG"><p>96×96 native pixels</p></section><section><h2>Enlarged 3×: 234 ms</h2><img src="APNG"><p>APNG: 50 / 50 / 67 / 67 ms</p></section><section><h2>Slow inspection</h2><img src="GIF"><p>400 ms per frame; inspection only</p></section><p>APNG stores the exact requested millisecond durations. Browser display may quantize playback to screen refresh. Every GIF is a timing/color approximation: GIF palette quantization can change colors. One shared fixed palette with dithering disabled keeps protected colors stable across frames. The fast GIF uses 50 / 50 / 70 / 70 ms, 240 ms total, because GIF cannot encode 67 ms. The native strip and RGBA-exact APNG are authoritative.</p><small>Identity and geometry tests do not approve motion quality. No runtime integration or game-playback claim.</small>'.replace('APNG"', apng + '"').replace('GIF"', gif + '"')
    (root / 'preview.html').write_text(html)
    write('animation-evidence.json', {'status': 'REVIEW_ONLY', 'source_sha256': SOURCE, 'reviewed_peak_sha256': PEAK, 'frames': evidence, 'duration_ms': 234, 'gif_duration_ms': 240, 'gif_frame_durations_ms': [50, 50, 70, 70], 'gif_color_accuracy': 'approximate shared fixed 256-color palette, dithering disabled; strip/APNG authoritative', 'exact_apng_frame_durations_ms': TIMING, 'semantic_motion': 'PENDING independent motion review', 'production_changes': False})
    print(json.dumps({'out': str(root), 'frames': evidence, 'technical_status': checks['technical_status'], 'peak_sha256': PEAK}, indent=2))
if __name__ == '__main__':
    build(parse_arguments())
