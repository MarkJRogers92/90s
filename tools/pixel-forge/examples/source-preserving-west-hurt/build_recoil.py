"""One review-only source-pixel recoil. No provider calls or production writes.
Uses the existing Forge rig derivation and renderer, with all sources pinned.
"""
from pathlib import Path
import hashlib, json, shutil, sys
import numpy as np
from PIL import Image, ImageDraw
HERE = Path(__file__).resolve().parent
ROOT = HERE
FORGE = SOURCE = WALK = None
rig = animation_checks = None

def parse_arguments(argv=None):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', default=str(HERE / 'source.png'), help='Pinned 96px attack source PNG; defaults to this fixture')
    parser.add_argument('--walk', default=str(HERE / 'walk-source.png'), help='Pinned 96px supporting walk source PNG; defaults to this fixture')
    parser.add_argument('--forge-root', default=str(HERE.parent.parent), help='Directory containing forge; defaults to this checkout tools/pixel-forge')
    parser.add_argument('--out', required=True, help='Fresh output directory; existing paths are refused')
    return parser.parse_args(argv)

def save(name, a):
    p = ROOT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a).save(p)
    return pin(name)

def pin(name):
    return {'path': str(name), 'sha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest()}

def write(name, o):
    (ROOT / name).write_text(json.dumps(o, indent=2) + '\n')

def build(args):
    global ROOT, FORGE, SOURCE, WALK, rig, animation_checks
    ROOT = Path(args.out).resolve()
    SOURCE = Path(args.source).resolve(strict=True)
    WALK = Path(args.walk).resolve(strict=True)
    FORGE = Path(args.forge_root).resolve(strict=True)
    for label, path, expected in [('source', SOURCE, '4ecc5c275ecd29210dc4b68f3d7850dd33740bd51dca76dfca937cbe181a29b3'), ('walk', WALK, '7760bd56724fa1abe0dc8c7cf4e64a1a6c51056543f9146f2f1688b6f0c06b5b')]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError(label + ' hash mismatch; refusing changed immutable source')
    ROOT.mkdir(parents=True, exist_ok=False)
    sys.path.insert(0, str(FORGE))
    from forge import rig as forge_rig, animation_checks as forge_checks
    rig, animation_checks = (forge_rig, forge_checks)
    shutil.copyfile(SOURCE, ROOT / 'source.png')
    shutil.copyfile(WALK, ROOT / 'walk-source.png')
    s = np.array(Image.open(SOURCE).convert('RGBA'))
    alpha = s[:, :, 3] == 255
    masks = {n: np.zeros((96, 96), bool) for n in ['head', 'upper', 'forearm', 'hand', 'bag', 'lower', 'shoes']}
    masks['head'][:30] = True
    masks['shoes'][89:] = True
    masks['bag'][67:70, 46:55] = True
    masks['bag'][70:85, 44:57] = True
    for y, x0, x1 in [(60, 47, 53), (61, 47, 53), (62, 46, 54), (63, 45, 54), (64, 45, 54), (65, 45, 54), (66, 46, 55)]:
        masks['hand'][y, x0:x1] = True
    masks['forearm'][50:60, 47:54] = True
    masks['upper'][30:60] = True
    masks['upper'] &= ~masks['forearm']
    masks['lower'][60:89] = True
    masks['lower'] &= ~(masks['hand'] | masks['bag'])
    parts = {}
    for name, m in masks.items():
        parts[name] = np.where((m & alpha)[:, :, None], s, 0).astype(np.uint8)
        save(f'layers/{name}-source.png', parts[name])
        save(f'masks/{name}-opaque.png', ((m & alpha) * 255).astype(np.uint8))
    domains = {k: masks[k].copy() for k in ['head', 'bag', 'shoes']}
    domains['head'][:] = False
    domains['head'][13:30, 38:56] = True
    domains['bag'][67:70, 55:57] = True
    domains['bag'][70:85, 57:59] = True
    for n, m in domains.items():
        save(f'masks/{n}-domain.png', (m * 255).astype(np.uint8))
    joints = {'lower': {'hip': [48, 60], 'mount': [0, 0]}, 'upper': {'hip': [48, 60], 'neck': [47, 29], 'shoulder': [52, 38], 'elbow': [50, 50]}, 'forearm': {'elbow': [50, 50], 'wrist': [50, 60]}, 'head': {'neck': [47, 29]}, 'hand': {'wrist': [50, 60], 'grip': [49, 66], 'hang': [49, 67]}, 'bag': {'hang': [49, 67], 'grip': [49, 67]}, 'shoes': {'mount': [0, 0]}}
    attaches = {'upper': ('lower', 'hip', 'hip'), 'forearm': ('upper', 'elbow', 'elbow'), 'head': ('upper', 'neck', 'neck'), 'hand': ('forearm', 'wrist', 'wrist'), 'bag': ('hand', 'hang', 'hang'), 'shoes': ('lower', 'mount', 'mount')}
    z = {'lower': 5, 'upper': 10, 'forearm': 15, 'head': 30, 'hand': 35, 'bag': 25, 'shoes': 40}
    slots = {}
    for n in parts:
        variant = {'image': pin(f'layers/{n}-source.png'), 'joints': joints[n], 'provenance': {'kind': 'source', 'sheet': 'attack', 'at': [0, 0]}}
        if n in domains:
            variant['domain'] = pin(f'masks/{n}-domain.png')
        slots[n] = {'z': z[n], 'rest': 'source', 'variants': {'source': variant}}
        if n in attaches:
            p, pj, j = attaches[n]
            slots[n]['attach'] = {'parent': p, 'parent_joint': pj, 'joint': j}
    for n, deg, pivot in [('upper', -10, [48, 60]), ('forearm', 4, [50, 50])]:
        method = {'op': 'rotate', 'degrees': deg, 'pivot': pivot, 'algorithm': 'rotsprite'}
        a, j = rig.derive(parts[n], joints[n], method)
        save(f'layers/{n}-recoil.png', a)
        slots[n]['variants']['recoil'] = {'image': pin(f'layers/{n}-recoil.png'), 'joints': j, 'provenance': {'kind': 'authored_variant', 'of': n + '.source', 'method': method}}
    slots['hand']['labels'] = {'side': 'anatomical_left', 'role': 'hand'}
    slots['bag']['prop_of'] = 'hand'
    slots['bag']['labels'] = {'owner': 'source near-side anatomical left hand, awaiting independent semantic review'}
    slots['shoes']['contact'] = True
    doc = {'schema': 'forge-rig/1', 'character': 'bargain-hunter', 'facing': 'WEST', 'canvas': [96, 96], 'asymmetric': True, 'sheets': {'attack': pin('source.png'), 'walk': pin('walk-source.png')}, 'root_slot': 'lower', 'origin': [0, 0], 'slots': slots, 'ground_y': 95, 'edge_margin': [1, 1, 1, 0], 'attachment_max_gap_px': 3, 'contact_tolerance_px': 0, 'limbs': [{'name': 'near-arm', 'chain': ['upper.shoulder', 'upper.elbow', 'forearm.wrist'], 'tolerance_px': 2}]}
    write('rig.json', doc)

    def recipe(peak):
        return {'schema': 'forge-pose/1', 'rig': pin('rig.json'), 'frames': [{'id': 'peak' if peak else 'source', 'phase': 'stance', 'duration_ms': 67, 'root': [0, 0], 'pose': {n: 'recoil' if peak and n in ['upper', 'forearm'] else 'source' for n in parts}, 'planted': ['shoes'], 'grounded': ['shoes']}]}
    write('source-recipe.json', recipe(False))
    write('peak-recipe.json', recipe(True))
    rr, _, rd, pins = rig.load(ROOT / 'peak-recipe.json')
    r = rig.Rig(rd, pins)
    raw, places, _, _, _, _ = rig.render_frame(r, rr['frames'][0], pins)
    protect = np.zeros((96, 96), bool)
    for n, domain in domains.items():
        yy, xx = np.where(domain)
        dx, dy = (places[n]['left'], places[n]['top'])
        protect[yy + dy, xx + dx] = True
    repair = np.zeros_like(s)
    repairmask = np.zeros((96, 96), bool)
    copies = []
    for y in range(50, 86):
        xs = np.where(raw[y, :, 3] == 255)[0]
        if len(xs) < 2:
            continue
        for x in range(int(xs.min()) + 1, int(xs.max())):
            if raw[y, x, 3] or protect[y, x]:
                continue
            sx = 45 if y < 70 else 43
            repair[y, x] = s[y, sx]
            repairmask[y, x] = True
            copies.append({'source': [sx, y], 'target': [x, y], 'rgba': s[y, sx].tolist()})
    save('patches/body-seams.png', repair)
    save('patches/body-seams-mask.png', (repairmask * 255).astype(np.uint8))
    write('patches/source-pixel-copies.json', copies)
    peak = recipe(True)
    peak['frames'][0]['repairs'] = [{'image': pin('patches/body-seams.png'), 'mask': pin('patches/body-seams-mask.png'), 'reason': 'Copy adjacent same-row source garment pixels into exposed torso and trouser gaps after arm articulation and bag translation; exact per-pixel source coordinates recorded.'}]
    write('peak-recipe.json', peak)
    for name, rec in [('source-render', 'source-recipe.json'), ('candidate-render', 'peak-recipe.json')]:
        rig.render_recipe(ROOT / rec, ROOT / name)
    shutil.copyfile(ROOT / 'candidate-render/frame-000.png', ROOT / 'candidate.png')
    if hashlib.sha256((ROOT / 'candidate.png').read_bytes()).hexdigest() != 'c14567847026eb93b536e13ec2acb04647f97b404b23c8362cfbaae7c149fcfb':
        raise ValueError('rendered peak hash mismatch')
    rr, _, rd, pins = rig.load(ROOT / 'peak-recipe.json')
    r = rig.Rig(rd, pins)
    _, places, _, _, _, _ = rig.render_frame(r, rr['frames'][0], pins)
    protected = {n: {'mask': f'masks/{n}-opaque.png', 'domain': f'masks/{n}-domain.png', 'translation': [places[n]['left'], places[n]['top']], 'rotation_degrees': 0, 'scale': 1} for n in domains}
    write('artifact-provenance.json', {'status': 'REVIEW_ONLY', 'source': pin('source.png'), 'walk': pin('walk-source.png'), 'source_origin': 'exact crop [16,16,112,112] of attack WEST frame0 128px; no resampling', 'protected': protected, 'body_methods': {n: slots[n]['variants']['recoil']['provenance'] for n in ['upper', 'forearm']}, 'important': 'Source attack body is historically authored art; source means exact supplied pinned frame pixels, not a claim about original artist authorship. No old rig part images reused. Technical tests do not approve anatomy or motion.'})
    make_boards(s, np.array(Image.open(ROOT / 'candidate.png')), masks, domains, protected)
    report = animation_checks.check_manifest(json.loads((ROOT / 'candidate-render/manifest.json').read_text()), ROOT / 'candidate-render')
    write('forge-checks.json', report)
    print('FAILS', [x for x in report['checks'] if x['status'] == 'fail'])

def make_boards(s, c, masks, domains, protected):
    for scale in [1, 2, 6]:
        w = 96 * scale
        h = 96 * scale
        board = Image.new('RGBA', (w * 3, h + 45), (29, 31, 37, 255))
        d = ImageDraw.Draw(board)
        for i, (name, a) in enumerate([('Source native', s), ('Registered source (+0,+0)', s), ('Peak candidate', c)]):
            board.alpha_composite(Image.fromarray(a).resize((w, h), Image.Resampling.NEAREST), (i * w, 35))
            d.text((i * w + 3, 4), name, fill='white')
            d.line((i * w, 35 + 95 * scale, (i + 1) * w - 1, 35 + 95 * scale), fill=(66, 99, 69), width=1)
        board.save(ROOT / f'comparison-{scale}x.png')
    col = {'head': (255, 130, 150), 'bag': (245, 204, 90), 'shoes': (102, 228, 159)}
    scale = 5
    w = 96 * scale
    h = 96 * scale
    board = Image.new('RGBA', (w * 4, h + 100), (29, 31, 37, 255))
    d = ImageDraw.Draw(board)
    for i, n in enumerate(['head', 'bag', 'shoes']):
        im = Image.fromarray(s)
        bg = Image.new('RGBA', (96, 96), (29, 31, 37, 255))
        bg.alpha_composite(im)
        overlay = np.zeros((96, 96, 4), np.uint8)
        overlay[domains[n]] = col[n] + (40,)
        overlay[masks[n] & (s[:, :, 3] > 0)] = col[n] + (140,)
        bg.alpha_composite(Image.fromarray(overlay))
        board.alpha_composite(bg.resize((w, h), Image.Resampling.NEAREST), (i * w, 70))
        d.text((i * w + 8, 5), n + ' protected domain + pixels', fill=col[n])
        d.text((i * w + 8, 25), 'candidate translation ' + str(protected[n]['translation']), fill='white')
    board.alpha_composite(Image.fromarray(c).resize((w, h), Image.Resampling.NEAREST), (3 * w, 70))
    d.text((3 * w + 8, 5), 'Candidate, no overlay', fill='white')
    d.text((8, h + 77), 'Tinted opaque pixels are frozen; lighter tint is frozen domain/background. Full canvas is unchanged 96 x 96.', fill='white')
    board.save(ROOT / 'protected-mask-overlay-5x.png')
if __name__ == '__main__':
    build(parse_arguments())
