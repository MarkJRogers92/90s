"""Opt-in reuse around the real Forge pipeline; local utilities remain review-only."""
from __future__ import annotations
from copy import deepcopy
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
from PIL import Image
from forge_accel.backends import CallbackBackend
from forge_accel.briefs import ArtRequest, digest, label
from forge_accel.bundles import save_bundle
from forge_accel.constraints import check_revision
from forge_accel.pixels import MAX_FILE_BYTES, decode_rgba, load_rgba, pixel_hash
from forge_accel.runner import JobStore, CachedArtifactError

BRIEF_FIELDS = {'identity', 'silhouette', 'palette_style', 'protected_details',
                'asymmetric_details', 'physical_cues'}


def compile_requirements(brief):
    if brief is None:
        return ''
    if not isinstance(brief, dict) or set(brief) - BRIEF_FIELDS:
        raise ValueError('brief requires only: ' + ', '.join(sorted(BRIEF_FIELDS)))
    for values in brief.values():
        if not isinstance(values, list) or len(values) > 8 or any(
                not isinstance(v, str) or not 1 <= len(v) <= 500 for v in values):
            raise ValueError('each brief field requires up to 8 nonempty strings of at most 500 characters')
    return ('\nREFERENCE REQUIREMENTS (preserve identity; never mirror asymmetric details):\n'
            + json.dumps(brief, sort_keys=True))


def source_revision():
    root = Path(__file__).resolve().parent.parent
    files = list((root/'forge').glob('*.py')) + list((root/'forge').glob('*.md'))
    files += list((root/'forge_accel').glob('*.py')) + [root/'requirements-tested.txt']
    return digest({str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in sorted(files)})


def make_cached(prompt, *, cache_dir, generation_revision, state='still', **options):
    """Cache the actual cli.make chain, including its keep-best judge.

    Revision explicitly names external CLI/model config, which source cannot infer.
    Never cache account credentials. A hit performs no backend construction/calls.
    """
    from . import cli, profiles, projects
    from .sprite import Sprite
    if not isinstance(generation_revision, str) or not 1 <= len(generation_revision) <= 128:
        raise ValueError('cached generation requires an explicit generation_revision (1..128 chars)')
    label(state)
    if options.pop('keep_steps', False):
        raise ValueError('keep_steps is unsupported with caching; inspect the immutable library work')
    log = options.pop('log', print)
    out = options.pop('out', None)
    open_in = options.pop('open_in', None)
    project = options.pop('project', None)
    profile_id = options.get('profile')
    if project and not profile_id:
        profile_id = projects.get(project)['id']
        if not (profiles.ROOT/f'{profile_id}.json').exists():
            raise ValueError('learn the project profile before cached generation')
        options['profile'] = profile_id
    prof = deepcopy(profiles.load(profile_id))
    refs = [str(Path(p).expanduser()) for p in (options.pop('refs', None) or [])]
    if options.pop('use_references', True):
        refs += (prof or {}).get('reference_paths', [])[:max(0, 3-len(refs))]
    # References are hashed and snapshotted by JobStore, including profile refs.
    if prof is not None:
        prof.pop('reference_paths', None)
        prof.pop('references', None)
    base = options.pop('base', None)
    start = options.pop('start', None)
    start_bytes = None
    start_size = None
    if base is None and start:
        if options.get('artist_name') == 'gpt-image':
            # An edit target is distinct from style references. Preserve its
            # encoded bytes, rich colours and soft alpha before any indexing.
            with Path(start).expanduser().open('rb') as stream:
                start_bytes = stream.read(MAX_FILE_BYTES + 1)
            start_size = decode_rgba(start_bytes).size
        else:
            image = load_rgba(Path(start).expanduser())
            base = Sprite.from_image(image)
            if base.to_image().tobytes() != image.tobytes():
                raise ValueError('indexed generation cannot preserve this source exactly; use local quality repair/finish')
    base_doc = base.to_dict() if base is not None else None
    size = start_size or (prof or {}).get('size') or [32,32]
    w = options.get('width') or (base.width if base else size[0])
    h = options.get('height') or (base.height if base else size[1])
    options.update(width=w, height=h)
    start_sha256 = hashlib.sha256(start_bytes).hexdigest() if start_bytes is not None else None
    config = {**options, 'profile_snapshot':prof, 'base':base_doc, 'edit_target_sha256':start_sha256,
              'source_revision':source_revision(), 'generation_revision':generation_revision,
              'codex_fallback':os.environ.get('FORGE_CODEX_MODEL') or cli.artist.CODEX_FALLBACK_MODEL}
    req = ArtRequest(prompt, w, h, references=tuple(refs), state=state)
    def produce(frozen, work, _observations):
        edit_target = None
        if start_bytes is not None:
            edit_target = work/'edit-target.png'
            with edit_target.open('xb') as stream:
                stream.write(start_bytes)
        native = cli.make(frozen.prompt, **options, base=Sprite.from_dict(base_doc) if base_doc else None,
                          start=str(edit_target) if edit_target is not None else None,
                          refs=list(frozen.references), use_references=False, log=log,
                          _profile_snapshot=deepcopy(prof))
        if edit_target is not None and (edit_target.is_symlink()
                or hashlib.sha256(edit_target.read_bytes()).hexdigest() != start_sha256):
            raise ValueError('backend changed the immutable edit target snapshot')
        (work/'forge-result.json').write_text(json.dumps(native, sort_keys=True))
        return load_rgba(native['png'])
    artifacts = ('work/forge-result.json',) + (('work/edit-target.png',) if start_bytes is not None else ())
    result = JobStore(cache_dir).run(req, CallbackBackend('native-forge-make', digest(config), produce, artifacts))
    metadata = result.path/'work'/'forge-result.json'
    native = json.loads(metadata.read_text())
    # Library history is immutable too: never resurrect a corrupted/missing item.
    if not Path(native['png']).is_file() or pixel_hash(load_rgba(native['png'])) != pixel_hash(load_rgba(result.path/'raw.png')):
        raise CachedArtifactError('native library result changed or missing; no regeneration started')
    native['cache'] = {'key':result.key, 'hit':result.cached, 'path':str(result.path),
                       'elapsed_s':result.elapsed_s, 'generation_pipeline_invocations':0 if result.cached else 1,
                       'model_calls':'pipeline may invoke draft, review, combine and judge; not provider billing'}
    if out:
        dst = Path(out).expanduser()
        if dst.suffix.lower() != '.png':
            dst = dst / (projects.slug(prompt)+'.png')
        dst.parent.mkdir(parents=True, exist_ok=True)
        with dst.open('xb') as stream:
            stream.write((result.path/'sprite.png').read_bytes())
        native['exported'] = str(dst)
    if open_in:
        native['opened'] = cli.editors.open_item(native['library_id'], open_in)
    return native


def publish_repair(source, candidate, mask, destination, *, budget, expected_sha=None, preserve_alpha=True):
    report = check_revision(source,candidate,mask,max_changed_pixels=budget,
                            expected_source_sha256=expected_sha)
    if preserve_alpha and source.convert('RGBA').getchannel('A').tobytes() != candidate.convert('RGBA').getchannel('A').tobytes():
        report['errors'].append('alpha_changed'); report['accepted'] = False
    if not report['accepted']:
        raise ValueError('repair rejected: ' + ', '.join(report['errors']))
    save_bundle(candidate,destination,source=source,details={'operation':'bounded_repair','contract':report})
    return report
