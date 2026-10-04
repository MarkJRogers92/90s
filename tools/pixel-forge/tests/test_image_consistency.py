"""Offline real-PNG contracts. No provider calls or art-quality claims."""
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path

import numpy as np
from PIL import Image
import pytest

from forge import image_pair as pair


@pytest.fixture
def case(tmp_path):
    source = Image.new('RGBA', (8, 8))
    source.paste((30, 60, 90, 255), (2, 1, 6, 7))
    source.putpixel((3, 1), (220, 190, 150, 255))
    source.save(tmp_path / 'source.png')
    guide = Image.new('RGBA', (8, 8), (255, 0, 0, 255))
    guide.save(tmp_path / 'guide.png')
    mask = Image.new('L', (8, 8)); mask.putpixel((3, 1), 255)
    mask.save(tmp_path / 'mask.png')
    spec = {
        'prompt': 'A modest hurt recoil', 'style': 'Match the approved source',
        'references': [str(tmp_path / p) for p in ('source.png', 'guide.png', 'mask.png')],
        'frame_size': 8, 'frames': 2, 'facings': ['west'],
        'durations_ms': [50, 67], 'pivot': [4, 6], 'max_followups': 2,
        'consistency': {
            'version': 1, 'appearance_references': {'west': 0},
            'palette_references': [0], 'pose_guide_reference': 1,
            'identity': 'Keep the narrow head and anatomical-left bag.',
            'proportions': 'The reference figure is 6 pixels tall.',
            'poses': ['Recoil', 'Recovery'],
            'frame_checks': {'west': [
                {'height_range': [6, 6], 'baseline_y': 6,
                 'identity_locks': [{'source_reference': 0, 'mask_reference': 2, 'offset': [0, 0]}]},
                {'height_range': [6, 6], 'baseline_y': 6},
            ]},
        },
    }
    return tmp_path, spec, source


def submit(root, key, image):
    request = pair.dispatch(root, key, capabilities={'native_image_tool': True})
    path = root.parent / (request['ticket'] + '.png'); image.save(path)
    return pair.accept(root, key, request['ticket'], path,
                       {'provider': 'offline-fixture', 'invocation_id': request['ticket']})


def review(job, result='pass'):
    return {'mockup_sha256': job['artifacts']['mockup']['sha256'],
            'reviewer': 'offline-test-reviewer', 'native_size_viewed': True,
            'findings': {key: result for key in ('identity', 'facing', 'proportions', 'pose')},
            'notes': 'Synthetic fixture; no live art approval.'}


def ready(case):
    tmp, spec, source = case; root = tmp / 'jobs'
    job = pair.begin(root, spec)
    job = submit(root, job['key'], source)
    pair.review_mockup(root, job['key'], review(job))
    sheet = Image.new('RGBA', (16, 8)); sheet.paste(source, (0, 0)); sheet.paste(source, (8, 0))
    return root, job['key'], sheet


def test_contract_is_snapshotted_and_propagated_with_explicit_reference_roles(case):
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    first = job['next']['prompt']
    assert 'anatomical-left bag' in first and '6 pixels tall' in first
    assert 'motion only' in first and 'Recoil' in first
    job = submit(root, job['key'], source)
    second = job['next']
    assert second['operation'] == 'edit'
    assert 'appearance' in second['prompt'] and 'motion only' in second['prompt']
    seed = Image.open(second['referenced_image_paths'][0])
    assert seed.size == (16, 8)
    assert np.array_equal(np.array(seed)[:, :8], np.array(source))
    assert np.array_equal(np.array(seed)[:, 8:], np.array(source))
    pair.review_mockup(root, job['key'], review(job)); submit(root, job['key'], seed)
    revised = pair.revise(root, job['key'], 'sheet', 'Fix only the recovery pose.')
    assert 'anatomical-left bag' in revised['next']['prompt']
    assert 'motion only' in revised['next']['prompt']
    assert all(Path(p).is_relative_to(Path(job['path'])) for p in revised['next']['referenced_image_paths'])


def test_sheet_dispatch_requires_current_passing_native_mockup_review(case):
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    job = submit(root, job['key'], source)
    with pytest.raises(ValueError, match='review'):
        pair.dispatch(root, job['key'], capabilities={'native_image_tool': True})
    assert pair.status(root, job['key'])['state'] == 'pending'
    pair.review_mockup(root, job['key'], review(job, 'uncertain'))
    with pytest.raises(ValueError, match='review'):
        pair.dispatch(root, job['key'], capabilities={'native_image_tool': True})
    passing = pair.review_mockup(root, job['key'], review(job))
    assert passing['mockup_review']['findings']['identity'] == 'pass'
    assert pair.dispatch(root, job['key'], capabilities={'native_image_tool': True})['stage'] == 'sheet'


def test_mockup_revision_invalidates_review_and_old_sheet(case):
    root, key, sheet = ready(case); done = submit(root, key, sheet)
    old_review = review(done)
    pair.revise(root, key, 'mockup', 'A smaller recoil.')
    source = case[2].copy(); source.putpixel((4, 2), (220, 190, 150, 255))
    changed = submit(root, key, source)
    assert 'sheet' not in changed['artifacts'] and changed['mockup_review'] is None
    with pytest.raises(ValueError, match='hash'):
        pair.review_mockup(root, key, old_review)
    with pytest.raises(ValueError, match='review'):
        pair.dispatch(root, key, capabilities={'native_image_tool': True})


@pytest.mark.parametrize('mutation, error', [
    (lambda a: a.__setitem__((2, 2), [255, 0, 0, 255]), 'palette'),
    (lambda a: a.__setitem__((7, 2), [30, 60, 90, 255]), 'baseline'),
    (lambda a: a.__setitem__((1, 3), [30, 60, 90, 255]), 'identity'),
])
def test_native_failures_retain_raw_but_do_not_accept_sheet(case, mutation, error):
    root, key, sheet = ready(case); data = np.array(sheet); mutation(data)
    bad = submit(root, key, Image.fromarray(data))
    assert bad['state'] == 'needs_revision'
    assert error in ' '.join(bad['validation']['errors'])
    assert Path(bad['history'][-1]['raw']['path']).exists()
    assert 'sheet' not in bad['artifacts']


def test_missing_annotations_and_semantics_are_explicitly_unverified(case):
    tmp, spec, source = case
    spec['consistency']['frame_checks'] = {'west': [{}, {}]}
    root, key, sheet = ready(case); done = submit(root, key, sheet)
    report = done['validation']['consistency']
    assert done['state'] == 'review_ready' and done['review_status'] == 'REVIEW_ONLY'
    assert report['semantic_status'] == 'unverified'
    assert {'identity', 'facing', 'proportions', 'motion'} <= set(report['visual_review_required'])
    assert any(c['status'] == 'unverified' and c['code'] == 'baseline_unannotated' for c in report['checks'])
    assert any(c['status'] == 'unverified' and c['code'] == 'identity_unannotated' for c in report['checks'])


def test_normalization_cannot_bypass_palette_contract(case):
    root, key, sheet = ready(case)
    oversized = sheet.resize((18, 9), Image.Resampling.NEAREST)
    oversized.putpixel((3, 2), (255, 0, 0, 255))
    bad = submit(root, key, oversized)
    assert bad['state'] == 'needs_revision'
    normalized = pair.normalize_sheet(root, key)
    assert normalized['state'] == 'needs_revision'
    assert 'palette' in ' '.join(normalized['validation']['errors'])


def test_native_previews_playback_metadata_and_integrity_are_automatic(case):
    root, key, sheet = ready(case); done = submit(root, key, sheet)
    previews = done['previews']
    assert Path(previews['comparison']['path']).is_file()
    assert 'native 1x' in Path(previews['playback']['path']).read_text() or 'native' in Path(previews['playback']['path']).read_text()
    meta = json.loads(Path(previews['atlas_metadata']['path']).read_text())
    assert [f['duration'] for f in meta['frames'].values()] == [50, 67]
    assert all(f['sourceSize'] == {'w': 8, 'h': 8} for f in meta['frames'].values())
    assert all(f['pivot'] == {'x': .5, 'y': .75} for f in meta['frames'].values())
    assert np.array_equal(np.array(Image.open(previews['atlas']['path'])), np.array(sheet))
    Path(previews['comparison']['path']).write_bytes(b'corrupt')
    with pytest.raises(RuntimeError, match='integrity'):
        pair.status(root, key)


def test_contract_and_guide_bytes_participate_in_job_identity(case):
    tmp, spec, source = case; root = tmp / 'jobs'; first = pair.begin(root, spec)
    altered = deepcopy(spec); altered['consistency']['poses'][0] = 'A deeper recoil'
    assert pair.begin(root, altered)['key'] != first['key']
    Image.new('RGBA', (8, 8), 'blue').save(spec['references'][1])
    assert pair.begin(root, spec)['key'] != first['key']
    assert pair.status(root, first['key'])['state'] == 'pending'


@pytest.mark.parametrize('change', [
    lambda c: c.update(unknown_annotation=True),
    lambda c: c.update(appearance_references={'east': 0}),
    lambda c: c.update(palette_references=[1]),
    lambda c: c.update(poses=['Only one pose']),
    lambda c: c['frame_checks']['west'][0].update(foot_contact=True),
    lambda c: c['frame_checks']['west'][0].update(baseline_y=8),
    lambda c: c['frame_checks']['west'][0].update(height_range=[7, 3]),
])
def test_invalid_or_unknown_contract_fields_fail_before_job_creation(case, change):
    tmp, spec, source = case; change(spec['consistency'])
    with pytest.raises(ValueError): pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_review_record_cannot_omit_visual_findings_or_native_inspection(case):
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    job = submit(root, job['key'], source)
    for bad in [dict(review(job), native_size_viewed=False), dict(review(job), findings={'identity': 'pass'})]:
        with pytest.raises(ValueError): pair.review_mockup(root, job['key'], bad)


def test_cli_and_mcp_record_same_review_contract(case, capsys):
    from forge import image_pair_cli, mcp_server
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    job = submit(root, job['key'], source)
    record = tmp / 'review.json'; record.write_text(json.dumps(review(job)))
    assert image_pair_cli.main(['review-mockup', '--root', str(root), '--key', job['key'], '--review-record', str(record)]) == 0
    assert json.loads(capsys.readouterr().out)['mockup_review']['findings']['identity'] == 'pass'
    result = json.loads(mcp_server.forge_image_pair('review-mockup', str(root), key=job['key'], review_record=review(job)))
    assert result['mockup_review']['mockup_sha256'] == job['artifacts']['mockup']['sha256']


def test_native_bridge_stdio_exposes_and_records_review_without_a_provider(case):
    import asyncio
    import sys
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    job = submit(root, job['key'], source)
    async def run():
        params = StdioServerParameters(command=sys.executable, cwd=Path(__file__).resolve().parents[1],
            args=['-c', 'from forge.codex_native import serve; serve(None)'])
        async with stdio_client(params, errlog=sys.__stderr__) as streams, ClientSession(*streams, read_timeout_seconds=15) as client:
            await client.initialize()
            tool = (await client.list_tools()).tools[0]
            assert 'review_record' in tool.input_schema['properties']
            result = await client.call_tool('forge_image_pair', {'action': 'review-mockup', 'root': str(root),
                'key': job['key'], 'review_record': review(job)})
            assert not result.is_error
            assert json.loads(result.content[0].text)['mockup_review']['mockup_sha256'] == job['artifacts']['mockup']['sha256']
    asyncio.run(run())


def test_failed_preview_write_resumes_same_ticket_without_provider_retry(case, monkeypatch):
    root, key, sheet = ready(case)
    request = pair.dispatch(root, key, capabilities={'native_image_tool': True})
    path = root.parent / 'sheet.png'; sheet.save(path)
    original = pair._write_artifact
    def fail_preview(path, state, name, data):
        if name.endswith('preview.html'): raise OSError('interrupted preview write')
        return original(path, state, name, data)
    monkeypatch.setattr(pair, '_write_artifact', fail_preview)
    receipt = {'provider': 'offline-fixture', 'invocation_id': 'same-result'}
    with pytest.raises(OSError): pair.accept(root, key, request['ticket'], path, receipt)
    assert pair.status(root, key)['state'] == 'in_flight'
    monkeypatch.setattr(pair, '_write_artifact', original)
    assert pair.accept(root, key, request['ticket'], path, receipt)['state'] == 'review_ready'


def test_changed_review_artifact_blocks_dispatch(case):
    root, key, sheet = ready(case); job = pair.status(root, key)
    Path(job['artifacts']['mockup_review']['path']).write_text('{}')
    with pytest.raises(RuntimeError, match='integrity'):
        pair.dispatch(root, key, capabilities={'native_image_tool': True})


def test_oversized_consistency_preview_fails_preflight(case):
    tmp, spec, source = case
    Image.new('RGBA', (512, 512), 'red').save(spec['references'][0])
    spec.update(frame_size=512, frames=16, durations_ms=[100]*16)
    c = spec['consistency']; c['poses'] = ['recoil']*16; c['frame_checks'] = {'west': [{} for _ in range(16)]}
    with pytest.raises(ValueError, match='preview'): pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_unicode_review_remains_readable_after_accepted_write(case):
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    job = submit(root, job['key'], source)
    record = review(job); record['notes'] = '😀' * 2000
    pair.review_mockup(root, job['key'], record)
    assert pair.status(root, job['key'])['mockup_review']['notes'] == record['notes']


def test_aggregate_identity_annotations_are_bounded_before_creation(case):
    tmp, spec, source = case
    facings = list(pair.FACINGS); spec.update(facings=facings, frames=16, durations_ms=[100]*16)
    c = spec['consistency']; c['poses'] = ['recoil']*16
    c['appearance_references'] = {f: 0 for f in facings}
    lock = c['frame_checks']['west'][0]['identity_locks'][0]
    c['frame_checks'] = {f: [{'identity_locks': [deepcopy(lock) for _ in range(8)]} for _ in range(16)] for f in facings}
    with pytest.raises(ValueError, match='aggregate'): pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_pose_guide_cannot_be_identity_lock_authority(case):
    tmp, spec, source = case
    spec['consistency']['frame_checks']['west'][0]['identity_locks'][0]['source_reference'] = 1
    with pytest.raises(ValueError, match='pose guide'): pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_maximum_unicode_prompt_and_followup_stay_within_reader_budget(case):
    tmp, spec, source = case; root = tmp / 'jobs'
    spec.update(prompt='😀'*2000, style='😀'*2000, constraints=['😀'*500]*12,
                frames=16, durations_ms=[100]*16)
    c = spec['consistency']; c.update(identity='😀'*2000, proportions='😀'*1000,
        poses=['😀'*500]*16, frame_checks={'west': [{} for _ in range(16)]})
    job = pair.begin(root, spec); job = submit(root, job['key'], source)
    pair.revise(root, job['key'], 'mockup', '😀'*2000)
    job = submit(root, job['key'], source)
    assert pair.status(root, job['key'])['state'] == 'pending'
    for request in Path(job['path']).glob('results/*/request.json'):
        assert request.stat().st_size <= 256*1024


def test_palette_cardinality_is_bounded_before_job_creation(case):
    tmp, spec, source = case
    ids = np.arange(257*256, dtype=np.uint32).reshape(256, 257)
    rgba = np.stack([(ids >> 16) & 255, (ids >> 8) & 255, ids & 255, np.full_like(ids, 255)], axis=2).astype(np.uint8)
    path = tmp / 'too-many-colors.png'; Image.fromarray(rgba).save(path)
    spec['references'].append(str(path)); spec['consistency']['palette_references'] = [3]
    with pytest.raises(ValueError, match='palette color budget'): pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_identity_masks_cannot_also_supply_locked_appearance(case):
    tmp, spec, source = case
    spec['consistency']['frame_checks']['west'][0]['identity_locks'][0]['source_reference'] = 2
    with pytest.raises(ValueError, match='identity masks'): pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_identity_lock_clipping_is_rejected_before_generation(case):
    tmp, spec, source = case
    spec['consistency']['frame_checks']['west'][0]['identity_locks'][0]['offset'] = [8, 0]
    with pytest.raises(ValueError, match='outside native cell'): pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_interrupted_legacy_unicode_request_resumes_unchanged(case):
    tmp, spec, source = case; spec.pop('consistency'); spec['prompt'] = 'Legacy hurt ☃'
    root = tmp / 'jobs'; job = pair.begin(root, spec)
    request = pair.dispatch(root, job['key'], capabilities={'native_image_tool': True})
    partial = Path(job['path']) / 'results/000-mockup'; partial.mkdir(parents=True)
    image = tmp / 'legacy.png'; source.save(image)
    # Exact pre-upgrade request serialization, interrupted before receipt/ledger publication.
    old_request = json.dumps(request, sort_keys=True, indent=2).encode()
    (partial / 'request.json').write_bytes(old_request)
    (partial / 'raw.png').write_bytes(image.read_bytes())
    result = pair.accept(root, job['key'], request['ticket'], image,
        {'provider': 'offline-fixture', 'invocation_id': 'legacy-interrupted'})
    assert result['state'] == 'pending'
    assert (partial / 'request.json').read_bytes() == old_request


def test_interrupted_legacy_validation_resumes_unchanged(case):
    tmp, spec, source = case; spec.pop('consistency'); root = tmp / 'jobs'
    job = pair.begin(root, spec); job = submit(root, job['key'], source)
    sheet = Image.new('RGBA', (16, 8)); sheet.paste(source, (0, 0)); sheet.paste(source, (8, 0))
    request = pair.dispatch(root, job['key'], capabilities={'native_image_tool': True})
    image = tmp / 'legacy-sheet.png'; sheet.save(image)
    normalized_spec = json.loads((Path(job['path']) / 'job.json').read_text())['inputs']['spec']
    _, report = pair._validate_sheet(sheet, normalized_spec)
    report.pop('derivation', None); report.update(accepted=True, review_status='REVIEW_ONLY')
    partial = Path(job['path']) / 'results/001-sheet'; partial.mkdir(parents=True)
    old_validation = json.dumps(report, sort_keys=True, indent=2).encode()
    (partial / 'validation.json').write_bytes(old_validation)
    result = pair.accept(root, job['key'], request['ticket'], image,
        {'provider': 'offline-fixture', 'invocation_id': 'legacy-validation'})
    assert result['state'] == 'review_ready'
    assert (partial / 'validation.json').read_bytes() == old_validation


def test_advertised_reference_cap_fails_before_claiming_or_calling(case):
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    with pytest.raises(ValueError, match='reference image limit'):
        pair.dispatch(root, job['key'], capabilities={'native_image_tool': True, 'max_reference_images': 2})
    assert pair.status(root, job['key'])['state'] == 'pending'
    job = submit(root, job['key'], source); pair.review_mockup(root, job['key'], review(job))
    with pytest.raises(ValueError, match='reference image limit'):
        pair.dispatch(root, job['key'], capabilities={'native_image_tool': True, 'max_reference_images': 4})
    assert pair.status(root, job['key'])['state'] == 'pending'
    request = pair.dispatch(root, job['key'], capabilities={'native_image_tool': True, 'max_reference_images': 5})
    assert len(request['referenced_image_paths']) == 5


def test_reference_cap_is_explicit_not_inferred_from_native_label(case):
    tmp, spec, source = case; root = tmp / 'jobs'
    spec['start_png'] = spec['references'][0]
    job = pair.begin(root, spec); job = submit(root, job['key'], source)
    pair.review_mockup(root, job['key'], review(job))
    request = pair.dispatch(root, job['key'], capabilities={'native_image_tool': True})
    assert len(request['referenced_image_paths']) == 6


def test_cli_and_mcp_forward_advertised_reference_cap(case):
    from forge import image_pair_cli, mcp_server
    tmp, spec, source = case; root = tmp / 'jobs'; job = pair.begin(root, spec)
    with pytest.raises(ValueError, match='reference image limit'):
        image_pair_cli.main(['dispatch', '--root', str(root), '--key', job['key'],
                            '--native-image-tool', '--max-reference-images', '2'])
    with pytest.raises(ValueError, match='reference image limit'):
        mcp_server.forge_image_pair('dispatch', str(root), key=job['key'], native_image_tool=True, max_reference_images=2)
    assert pair.status(root, job['key'])['state'] == 'pending'


def test_exact_lock_cannot_require_soft_alpha_in_a_binary_sheet(case):
    tmp, spec, source = case
    source.putpixel((3, 1), (220, 190, 150, 64)); source.save(spec['references'][0])
    with pytest.raises(ValueError, match='locked source pixels require binary alpha'):
        pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_exact_opaque_lock_cannot_conflict_with_selected_palette(case):
    tmp, spec, source = case
    palette = tmp / 'other-palette.png'; Image.new('RGBA', (8, 8), (0, 255, 0, 255)).save(palette)
    spec['references'].append(str(palette)); spec['consistency']['palette_references'] = [3]
    with pytest.raises(ValueError, match='locked source colors are outside the selected palette'):
        pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_transparent_locked_rgb_is_not_a_visible_palette_constraint(case):
    tmp, spec, source = case
    source.putpixel((3, 1), (255, 0, 255, 0)); source.save(spec['references'][0])
    assert pair.begin(tmp / 'jobs', spec)['state'] == 'pending'


def test_conflicting_exact_locks_fail_before_job_creation(case):
    tmp, spec, source = case
    other = source.copy(); other.putpixel((3, 1), (30, 60, 90, 255))
    path = tmp / 'other-native-source.png'; other.save(path); spec['references'].append(str(path))
    locks = spec['consistency']['frame_checks']['west'][0]['identity_locks']
    locks.append({'source_reference': 3, 'mask_reference': 2, 'offset': [0, 0]})
    with pytest.raises(ValueError, match='conflicting identity locks'):
        pair.begin(tmp / 'jobs', spec)
    assert not (tmp / 'jobs').exists()


def test_identical_overlapping_identity_locks_are_compatible(case):
    tmp, spec, source = case
    locks = spec['consistency']['frame_checks']['west'][0]['identity_locks']
    locks.append(deepcopy(locks[0]))
    assert pair.begin(tmp / 'jobs', spec)['state'] == 'pending'
