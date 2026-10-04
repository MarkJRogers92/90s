"""Mandatory manifest gate for cloud Forge's animation export workflow.

Explicit review exports may retain art failures for visual inspection. Final
exports require technical success plus an exact, separately supplied review
record for every unresolved finding. No export is labeled user-approved.
"""
from __future__ import annotations
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import tempfile
from PIL import Image
from . import animation_checks, aseprite
from .authoring_store import directory, publish_exclusive
from .bounded_io import read_bounded


MAX_EXPORT_BYTES = 64 * 1024 * 1024


class ExportBlocked(ValueError):
    pass


def _digest(data):
    return hashlib.sha256(data).hexdigest()


def _read_json(path):
    path = Path(path)
    if path.stat().st_size > 1024 * 1024:
        raise ExportBlocked('input manifest/review exceeds 1 MiB')
    raw = read_bounded(path, 1024 * 1024)
    if len(raw) > 1024 * 1024:
        raise ExportBlocked('input exceeds 1 MiB')
    try:
        return json.loads(raw), raw
    except (ValueError, RuntimeError) as error:
        raise ExportBlocked(f'invalid input JSON: {error}') from error


def _review_needed(report):
    findings = [f"{c['code']}:{c['scope']}" for c in report['checks'] if c['status'] == 'unverified']
    # Anatomy can never become machine-verified just because no bag was named.
    return sorted(set(findings + ['SEMANTIC_ANATOMY:manual_visual_review']))


def _gate(report, digest, review, record):
    if any(c['status'] == 'fail' and c['scope'] == 'manifest' for c in report['checks']):
        raise ExportBlocked('input validation failed; review export cannot bypass missing or changed pinned inputs')
    needed = _review_needed(report)
    if review:
        return needed
    if report['technical_status'] != 'pass':
        raise ExportBlocked('technical animation checks failed; use --review for a visibly labeled review draft')
    if record is None:
        raise ExportBlocked('manual review record required; first use --review and inspect export-report.json')
    if not isinstance(record, dict) or record.get('manifest_sha256') != digest:
        raise ExportBlocked('manual review record does not match exact manifest bytes')
    reviewer = record.get('reviewer')
    accepted = record.get('accepted_findings')
    if not isinstance(reviewer, str) or not 1 <= len(reviewer) <= 120:
        raise ExportBlocked('manual review record requires a reviewer label')
    if not isinstance(accepted, list) or accepted != needed:
        raise ExportBlocked('manual review record must acknowledge the exact sorted unresolved finding list')
    return needed


def export_animation(manifest_path, out_dir, *, review=False, review_record=None, document=None):
    """Check, snapshot, recheck, export, atomically publish a new local directory.

    Optional native document is copied unchanged only after Aseprite renders
    every visible frame and matches the checked candidates pixel-for-pixel.
    No record is manufactured and no prior report is trusted as a cache.
    """
    path = Path(manifest_path).resolve(strict=True)
    out = Path(out_dir).expanduser().absolute()
    if not out.name.isascii():
        raise ExportBlocked('export directory basename must be ASCII for the existing Forge atomic publisher')
    if out.exists() or out.is_symlink():
        raise FileExistsError(f'{out} exists; never overwriting')
    manifest, raw = _read_json(path)
    digest = _digest(raw)
    report = animation_checks.check_manifest(manifest, path.parent)
    needed = _gate(report, digest, review, review_record)
    width, height = manifest['canvas']
    frames = manifest['frames']
    if width * height * len(frames) > 4 * 1024 * 1024:
        raise ExportBlocked('animation sheet exceeds 4 megapixel export limit')
    sizes = {item['path']: item['size_bytes'] for item in report['inputs']}
    byte_estimate = sum(sizes.values()) + sum(sizes[f['image']['path']] for f in frames)
    byte_estimate += width * height * len(frames) * 4 + len(raw)
    if document is not None:
        byte_estimate += Path(document).expanduser().stat().st_size
    if byte_estimate > MAX_EXPORT_BYTES:
        raise ExportBlocked('aggregate export byte budget exceeds 64 MiB')
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.forge-animation-', dir=out.parent) as tmp:
        staging_parent = Path(tmp)
        stage = staging_parent / 'export'
        stage.mkdir()
        inputs = stage / 'inputs'
        inputs.mkdir()
        # Copy only files actually validated; pin again while materializing.
        for item in report['inputs']:
            source = (path.parent / item['path']).resolve(strict=True)
            if not source.is_relative_to(path.parent):
                raise ExportBlocked('input path changed during snapshot')
            if source.stat().st_size > animation_checks.MAX_FILE_BYTES:
                raise ExportBlocked('input size changed during snapshot')
            data = read_bounded(source, animation_checks.MAX_FILE_BYTES)
            if len(data) > animation_checks.MAX_FILE_BYTES or _digest(data) != item['expected_sha256']:
                raise ExportBlocked('input changed during snapshot; no export written')
            destination = inputs / item['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
        (inputs / 'manifest.json').write_bytes(raw)
        report = animation_checks.check_manifest(manifest, inputs)
        needed = _gate(report, digest, review, review_record)
        suffix = '.REVIEW_ONLY' if review else ''
        sheet = Image.new('RGBA', (width * len(frames), height))
        export_files = []
        for i, frame in enumerate(frames):
            data = (inputs / frame['image']['path']).read_bytes()
            with Image.open(io.BytesIO(data)) as image:
                rgba = image.convert('RGBA')
                sheet.paste(rgba, (i * width, 0))  # exact RGBA copy, no alpha blend
            name = f'frame-{i:03d}{suffix}.png'
            (stage / name).write_bytes(data)
            export_files.append(name)
        sheet_name = f'animation{suffix}.png'
        sheet.save(stage / sheet_name)
        export_files.append(sheet_name)
        native = None
        if document is not None:
            native = _verified_native(document, inputs, frames, stage, suffix)
            export_files.append(native['filename'])
        result = {
            'workflow': 'forge animation-export',
            'status': ('review_only' if report['technical_status'] == 'pass' else 'review_only_failed_checks') if review else 'exported_with_manual_review',
            'approved': False,
            'approval_note': 'This tool does not grant user approval or infer anatomical correctness.',
            'manifest_sha256': digest,
            'checks': report,
            'manual_review_required': needed,
            'manual_review_record_supplied': review_record is not None and not review,
            'native_document': native,
            'frames': [{'id': f['id'], 'file': export_files[i]} for i, f in enumerate(frames)],
            'sheet': sheet_name,
            'outputs': {name: _digest((stage / name).read_bytes()) for name in export_files},
        }
        if review_record is not None and not review:
            (stage / 'manual-review-record.json').write_text(json.dumps(review_record, indent=2) + '\n')
        (stage / 'export-report.json').write_text(json.dumps(result, indent=2) + '\n')
        (stage / 'STATUS.txt').write_text(
            ('REVIEW ONLY: NOT APPROVED. Pixel checks may fail.\n' if review else
             'Technically checked export with supplied manual review record. User approval is not asserted.\n') +
            'Read export-report.json. Anatomy, annotation coverage and root motion limitations remain explicit.\n')
        if sum(p.stat().st_size for p in stage.rglob('*') if p.is_file()) > MAX_EXPORT_BYTES:
            raise ExportBlocked('aggregate completed export byte budget exceeds 64 MiB')
        # Existing Forge exclusive publication primitive refuses races/overwrite.
        with directory(staging_parent) as source_dir, directory(out.parent.resolve()) as target_dir:
            publish_exclusive(source_dir, 'export', target_dir, out.name)
    return {**result, 'export_directory': str(out)}


_NATIVE_RENDER = r'''
local spr = app.open(app.params.doc)
if not spr then error("Cannot open document") end
local info = {frames=#spr.frames, width=spr.width, height=spr.height, durations={}}
for i, frame in ipairs(spr.frames) do
  local image = Image(spr.spec)
  image:drawSprite(spr, i)
  image:saveAs(app.params.out.."/"..i..".png")
  info.durations[i] = frame.duration
end
local f = io.open(app.params.out.."/info.json", "w")
f:write(json.encode(info)); f:close()
'''


def _verified_native(document, inputs, frames, stage, suffix):
    source = Path(document).expanduser().resolve(strict=True)
    if source.stat().st_size > 32 * 1024 * 1024:
        raise ExportBlocked('native document exceeds 32 MiB')
    data = read_bounded(source, 32 * 1024 * 1024)
    if len(data) > 32 * 1024 * 1024:
        raise ExportBlocked('native document exceeds 32 MiB')
    if len(data) < 128:
        raise ExportBlocked('invalid native header')
    _, magic, count, width, height = struct.unpack_from('<IHHHH', data, 0)
    with Image.open(inputs / frames[0]['image']['path']) as expected:
        size = expected.size
    if magic != 0xA5E0 or count != len(frames) or (width, height) != size:
        raise ExportBlocked('native header dimensions/frame count differ from manifest')
    # Render the exact copied bytes, not a mutable authoring source.
    name = f'animation{suffix}.aseprite'
    copy = stage / name
    copy.write_bytes(data)
    with tempfile.TemporaryDirectory(prefix='.native-check-', dir=stage) as tmp:
        root = Path(tmp)
        script = root / 'render.lua'
        script.write_text(_NATIVE_RENDER)
        aseprite._run(['--script-param', f'doc={copy}', '--script-param', f'out={root}', '--script', str(script)])
        info = json.loads((root / 'info.json').read_text())
        if info['frames'] != len(frames):
            raise ExportBlocked('native document frame count differs from checked manifest')
        for i, frame in enumerate(frames, 1):
            with Image.open(root / f'{i}.png') as actual, Image.open(inputs / frame['image']['path']) as expected:
                if actual.size != expected.size or actual.convert('RGBA').tobytes() != expected.convert('RGBA').tobytes():
                    raise ExportBlocked(f'native visible pixels differ from checked frame {i-1}')
    return {'filename': name, 'sha256': _digest(data), 'visible_frames_pixel_exact': True,
            'durations_seconds': info['durations'], 'layers_preserved': True}


def cli(argv=None):
    import argparse
    parser = argparse.ArgumentParser(prog='forge animation-export')
    parser.add_argument('manifest')
    parser.add_argument('--out', required=True)
    parser.add_argument('--review', action='store_true', help='Export a visibly labeled review draft, including known pixel failures')
    parser.add_argument('--review-record', help='Exact manifest-pinned acknowledgement file; never synthesized')
    parser.add_argument('--document', help='Existing Aseprite document; preserve its layers only after exact visible-frame verification')
    args = parser.parse_args(argv)
    try:
        record = _read_json(args.review_record)[0] if args.review_record else None
        result = export_animation(args.manifest, args.out, review=args.review, review_record=record, document=args.document)
    except (ExportBlocked, OSError, ValueError, RuntimeError) as error:
        print(json.dumps({'status': 'blocked', 'approved': False, 'error': str(error)}))
        return 1
    print(json.dumps(result, indent=2))
    return 0
