"""Explicit source/pose contracts and native pixel evidence, never anatomy AI."""
from __future__ import annotations

from copy import deepcopy
from io import BytesIO
import json

import numpy as np
from PIL import Image

from forge_accel import atlas
from forge_accel.constraints import binary_mask, check_revision
from forge_accel.pixels import decode_rgba, integer, review_sheet

VISUAL_FINDINGS = ('identity', 'facing', 'proportions', 'pose')
FIELDS = {'version', 'appearance_references', 'palette_references', 'identity',
          'proportions', 'poses', 'pose_guide_reference', 'frame_checks'}
MAX_PALETTE_COLORS = 65_536


def _text(value, name, limit):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise ValueError(f'{name} requires 1..{limit} characters')


def _visible_colors(image):
    a = np.array(image); rgb = a[a[:, :, 3] != 0, :3].astype(np.uint32)
    return np.unique((rgb[:, 0] << 16) | (rgb[:, 1] << 8) | rgb[:, 2])


def _palette(reference_bytes, indices):
    palette = set()
    for index in indices:
        colors = _visible_colors(decode_rgba(reference_bytes[index]))
        # Bound cardinality before expanding NumPy's packed values into Python objects.
        if len(colors) > MAX_PALETTE_COLORS: raise ValueError('source exceeds palette color budget of 65536')
        palette.update(map(int, colors))
        if len(palette) > MAX_PALETTE_COLORS: raise ValueError('combined sources exceed palette color budget of 65536')
    if not palette: raise ValueError('source palette contains no visible pixels')
    return palette


def validate(contract, spec, reference_bytes):
    """Validate every annotation before creating a job or calling a provider."""
    if not isinstance(contract, dict) or set(contract) - FIELDS:
        raise ValueError('unknown consistency contract fields')
    c = deepcopy(contract)
    if type(c.get('version')) is not int or c['version'] != 1:
        raise ValueError('consistency version must be 1')
    size = spec['frame_size']; facings = spec['facings']
    # Reserve a bounded native+2x comparison before any paid work can start.
    if size * size * spec['frames'] * len(facings) > 1_048_576:
        raise ValueError('consistency automatic preview budget is at most 1048576 native sheet pixels')
    def index(value):
        return integer(value, 'reference index', 0, len(reference_bytes) - 1)
    appearance = c.get('appearance_references')
    if not isinstance(appearance, dict) or set(appearance) != set(facings):
        raise ValueError('appearance_references must name every requested facing exactly')
    for value in appearance.values():
        if decode_rgba(reference_bytes[index(value)]).size != (size, size):
            raise ValueError('appearance references must be exact native frame-sized PNGs')
    palette = c.get('palette_references')
    if not isinstance(palette, list) or not 1 <= len(palette) <= 5:
        raise ValueError('palette_references must contain 1..5 reference indices')
    for value in palette: index(value)
    if len(set(palette)) != len(palette): raise ValueError('duplicate palette reference')
    resolved_palette = _palette(reference_bytes, palette)
    guide = c.get('pose_guide_reference')
    if guide is not None:
        index(guide)
        if guide in palette or guide in appearance.values():
            raise ValueError('pose guide may not be an appearance or palette authority')
    _text(c.get('identity'), 'identity', 2000)
    _text(c.get('proportions'), 'proportions', 1000)
    poses = c.get('poses')
    if not isinstance(poses, list) or len(poses) != spec['frames']:
        raise ValueError('poses must describe every frame')
    for pose in poses: _text(pose, 'pose', 500)
    checks = c.setdefault('frame_checks', {f: [{} for _ in poses] for f in facings})
    if not isinstance(checks, dict) or set(checks) != set(facings):
        raise ValueError('frame_checks must name every requested facing exactly')
    mask_indices = set(); identity_sources = set(); total_locks = 0
    for facing, frames in checks.items():
        if not isinstance(frames, list) or len(frames) != len(poses):
            raise ValueError('frame_checks must contain one entry for every frame')
        for frame in frames:
            if not isinstance(frame, dict) or set(frame) - {'height_range', 'baseline_y', 'identity_locks'}:
                raise ValueError('unknown native frame annotation')
            if 'baseline_y' in frame: integer(frame['baseline_y'], 'baseline_y', 0, size - 1)
            if 'height_range' in frame:
                value = frame['height_range']
                if not isinstance(value, list) or len(value) != 2:
                    raise ValueError('height_range must contain minimum and maximum')
                low, high = [integer(v, 'height_range', 1, size) for v in value]
                if low > high: raise ValueError('height_range is reversed')
            locks = frame.get('identity_locks', [])
            if not isinstance(locks, list) or len(locks) > 8: raise ValueError('at most eight identity locks per frame')
            total_locks += len(locks)
            if total_locks > 64: raise ValueError('aggregate identity annotation budget is 64 locks per job')
            required_rgba = np.zeros((size, size, 4), dtype=np.uint8) if locks else None
            required_pixels = np.zeros((size, size), dtype=bool) if locks else None
            for lock in locks:
                if not isinstance(lock, dict) or set(lock) != {'source_reference', 'mask_reference', 'offset'}:
                    raise ValueError('identity lock fields are source_reference, mask_reference, offset')
                source = decode_rgba(reference_bytes[index(lock['source_reference'])])
                identity_sources.add(lock['source_reference'])
                if lock['source_reference'] == guide:
                    raise ValueError('pose guide cannot be an identity lock authority')
                if source.size != (size, size): raise ValueError('identity source must match the native frame size')
                mask_index = index(lock['mask_reference']); mask_indices.add(mask_index)
                if lock['source_reference'] == mask_index:
                    raise ValueError('identity masks cannot also supply locked appearance')
                with Image.open(BytesIO(reference_bytes[mask_index])) as mask:
                    mask.load(); selected = binary_mask(mask, source.size)
                    if not selected.any(): raise ValueError('identity mask must not be empty')
                locked = np.array(source)[selected]
                if not np.isin(locked[:, 3], [0, 255]).all():
                    raise ValueError('locked source pixels require binary alpha for a native sheet')
                opaque_rgb = locked[locked[:, 3] != 0, :3].astype(np.uint32)
                colors = (opaque_rgb[:, 0] << 16) | (opaque_rgb[:, 1] << 8) | opaque_rgb[:, 2]
                if any(int(color) not in resolved_palette for color in np.unique(colors)):
                    raise ValueError('locked source colors are outside the selected palette')
                offset = lock['offset']
                if not isinstance(offset, list) or len(offset) != 2:
                    raise ValueError('identity offset requires x,y')
                for value in offset: integer(value, 'identity offset', -size, size)
                y, x = np.where(selected); x = x + offset[0]; y = y + offset[1]
                if not ((x >= 0) & (x < size) & (y >= 0) & (y < size)).all():
                    raise ValueError('identity lock selects pixels outside native cell')
                if np.any(required_pixels[y, x] & np.any(required_rgba[y, x] != locked, axis=1)):
                    raise ValueError('conflicting identity locks require different RGBA at the same native pixel')
                required_rgba[y, x] = locked; required_pixels[y, x] = True
    if mask_indices & (set(palette) | set(appearance.values()) | identity_sources | ({guide} if guide is not None else set())):
        raise ValueError('identity masks cannot also supply appearance, palette, or pose guidance')
    if len(json.dumps(c, ensure_ascii=False)) > 16000:
        raise ValueError('aggregate consistency prompt budget is 16000 characters')
    return c


def seed_sheet(spec, references):
    size = spec['frame_size']; sheet = Image.new('RGBA', (size * spec['frames'], size * len(spec['facings'])))
    for row, facing in enumerate(spec['facings']):
        source = decode_rgba(references[spec['consistency']['appearance_references'][facing]])
        for column in range(spec['frames']): sheet.paste(source, (column * size, row * size))
    return sheet


def prompt_contract(spec, reference_paths, inputs):
    c = spec['consistency']
    roles = []
    for index, path in enumerate(reference_paths):
        role = []
        faces = [f for f, i in c['appearance_references'].items() if i == index]
        if faces: role.append('appearance authority for ' + ', '.join(faces))
        if index in c['palette_references']: role.append('exact palette authority')
        if index == c.get('pose_guide_reference'): role.append('pose guide: motion only, never appearance or palette')
        if any(index == lock['mask_reference'] for frames in c['frame_checks'].values()
               for frame in frames for lock in frame.get('identity_locks', [])):
            role.append('mechanical identity mask only; do not draw it')
        roles.append({'input_image': inputs.index(path) + 1, 'role': '; '.join(role) or 'supporting original reference'})
    return ('\nCONSISTENCY CONTRACT: Change pose only. Same-facing appearance references outrank the generated mockup. '
            'The mockup controls the peak action, never a redesign. A pose guide controls motion only. '
            'Keep the specified facing and camera; never mirror asymmetric anatomy or swap an accessory hand. '
            'Preserve native cell scale and the annotated baseline; never independently scale poses.\n'
            + json.dumps({'reference_roles': roles, 'identity': c['identity'], 'proportions': c['proportions'],
                          'ordered_poses': c['poses'], 'native_annotations': c['frame_checks']}, ensure_ascii=False))


def check_native(image, spec, references):
    """Check only measurable pixels. Names and annotations are supplied by the caller."""
    c = spec['consistency']; size = spec['frame_size']; checks = []; errors = []
    def record(code, scope, status, detail):
        checks.append({'code': code, 'scope': scope, 'status': status, 'detail': detail})
        if status == 'fail': errors.append(f'consistency_{code}:{scope}')
    palette = _palette(references, c['palette_references'])
    for row, facing in enumerate(spec['facings']):
        for column, annotation in enumerate(c['frame_checks'][facing]):
            scope = f'{facing}/{column}'
            cell = image.crop((column * size, row * size, (column + 1) * size, (row + 1) * size))
            colors = _visible_colors(cell)
            missing = np.count_nonzero(~np.isin(colors, np.fromiter(palette, dtype=np.uint32)))
            record('palette', scope, 'fail' if missing else 'pass', {'off_palette_colors': int(missing)})
            bounds = cell.getchannel('A').getbbox()
            for field, code in (('baseline_y', 'baseline'), ('height_range', 'height')):
                if field not in annotation:
                    record(code + '_unannotated', scope, 'unverified', 'No annotation supplied; none inferred.')
                else:
                    measured = (bounds[3] - 1 if field == 'baseline_y' else bounds[3] - bounds[1]) if bounds else None
                    expected = annotation[field]
                    passed = measured is not None and (measured == expected if field == 'baseline_y' else expected[0] <= measured <= expected[1])
                    record(code, scope, 'pass' if passed else 'fail', {'measured': measured, 'expected': expected})
            locks = annotation.get('identity_locks', [])
            if not locks: record('identity_unannotated', scope, 'unverified', 'No exact identity mask supplied.')
            for number, lock in enumerate(locks):
                source = decode_rgba(references[lock['source_reference']])
                with Image.open(BytesIO(references[lock['mask_reference']])) as mask:
                    mask.load(); selected = binary_mask(mask, source.size)
                y, x = np.where(selected); x = x + lock['offset'][0]; y = y + lock['offset'][1]
                if not ((x >= 0) & (x < size) & (y >= 0) & (y < size)).all():
                    record('identity_clipped', f'{scope}/{number}', 'fail', 'Protected pixels leave the native cell.'); continue
                expected = Image.new('RGBA', (size, size)); expected.paste(source, tuple(lock['offset']))
                editable = np.full((size, size), 255, dtype=np.uint8); editable[y, x] = 0
                result = check_revision(expected, cell, Image.fromarray(editable), max_changed_pixels=size * size)
                record('identity', f'{scope}/{number}', 'pass' if result['accepted'] else 'fail', result)
    return {'errors': errors, 'checks': checks, 'semantic_status': 'unverified',
            'visual_review_required': ['identity', 'facing', 'proportions', 'motion'],
            'limitations': ['Palette membership does not prove correct color placement.',
                            'Baseline is the lowest opaque pixel, not recognized foot contact.',
                            'Height is a silhouette bound, not an anatomical proportion measurement.',
                            'Exact masks protect only their annotated regions; no facing or anatomy is inferred.']}


def validate_review(record, mockup_sha256):
    required = {'mockup_sha256', 'reviewer', 'native_size_viewed', 'findings', 'notes'}
    if not isinstance(record, dict) or set(record) != required: raise ValueError('invalid mockup review fields')
    if record['mockup_sha256'] != mockup_sha256: raise ValueError('mockup review hash is stale or incorrect')
    _text(record['reviewer'], 'reviewer', 120); _text(record['notes'], 'review notes', 2000)
    if record['native_size_viewed'] is not True: raise ValueError('mockup review requires native-size inspection')
    findings = record['findings']
    if not isinstance(findings, dict) or set(findings) != set(VISUAL_FINDINGS):
        raise ValueError('mockup review must cover identity, facing, proportions and pose')
    if any(v not in ('pass', 'fail', 'uncertain') for v in findings.values()): raise ValueError('invalid visual finding')
    return deepcopy(record)


def png_bytes(image):
    buffer = BytesIO(); image.save(buffer, format='PNG'); return buffer.getvalue()


def preview_files(image, spec, references, stage):
    """Review derivatives only. Raw/accepted bytes are never changed by previews."""
    size = spec['frame_size']; seed = seed_sheet(spec, references)
    if stage == 'mockup':
        # Display the entire raw canvas, preserving aspect ratio; no subject crop/scale inference.
        view = image.copy(); view.thumbnail((size, size), Image.Resampling.NEAREST)
        native = Image.new('RGBA', (size, size)); native.paste(view, ((size - view.width) // 2, (size - view.height) // 2))
        source = seed.crop((0, 0, size, size)); combined = Image.new('RGBA', (size * 2, size))
        combined.paste(source, (0, 0)); combined.paste(native, (size, 0))
        return {'comparison': ('comparison.png', png_bytes(review_sheet(combined))),
                'display_metadata': ('display.json', json.dumps({'status': 'REVIEW_ONLY', 'raw_size': list(image.size),
                    'display_cell': [size, size], 'method': 'whole-canvas nearest-neighbor thumbnail with transparent letterboxing',
                    'lossless': image.size == (size, size), 'not_checked': ['anatomy', 'subject registration']}).encode())}
    combined = Image.new('RGBA', (image.width, image.height * 2))
    combined.paste(seed, (0, 0)); combined.paste(image, (0, image.height))
    frames = []
    for row, facing in enumerate(spec['facings']):
        for column in range(spec['frames']):
            cell = image.crop((column * size, row * size, (column + 1) * size, (row + 1) * size))
            frames.append(atlas.Frame(f'frame-{column}', cell, spec['durations_ms'][column], facing, tuple(spec['pivot'])))
    sheet, meta = atlas.pack_frames(frames, columns=spec['frames'], padding=0)
    return {'comparison': ('comparison.png', png_bytes(review_sheet(combined))),
            'atlas': ('atlas.png', png_bytes(sheet)),
            'atlas_metadata': ('atlas.json', json.dumps(meta, indent=2).encode()),
            'playback': ('preview.html', atlas._preview(sheet, meta).encode()),
            'motion_report': ('motion-review.json', json.dumps(atlas.inspect_motion(frames), indent=2).encode())}
