"""Provider-free regressions for request-owned GPT-image edits and handoff."""
import inspect
import json
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from forge import artist, cli, library, profiles
from forge.sprite import Sprite


def png(path, color='red', size=(8, 8)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new('RGBA', size, color).save(path)
    return path


def output_path(command):
    line = next(line for line in command[-1].splitlines() if line.startswith('Output PNG path: '))
    return Path(json.loads(line.removeprefix('Output PNG path: ')))


def successful_provider(monkeypatch, color='blue'):
    calls = []
    def run(command, **options):
        calls.append((command, options))
        png(output_path(command), color)
        return subprocess.CompletedProcess(command, 0, 'DONE', '')
    monkeypatch.setattr(artist.subprocess, 'run', run)
    return calls


def test_start_is_first_image_and_explicit_model_is_used(tmp_path, monkeypatch):
    assert 'start' in inspect.signature(artist.paint_with_gpt_image).parameters
    start = png(tmp_path / 'start.png')
    refs = [png(tmp_path / 'ref1.png'), png(tmp_path / 'ref2.png')]
    calls = successful_provider(monkeypatch)
    result = artist.paint_with_gpt_image('repair left handle', 8, 8, None, tmp_path / 'work',
                                         log=lambda _: None, start=start, references=refs,
                                         model='chosen-model')
    command = calls[0][0]
    attached = [command[i + 1] for i, arg in enumerate(command) if arg == '-i']
    assert attached == [str(p.resolve()) for p in [start, *refs]]
    assert command[command.index('-m') + 1] == 'chosen-model'
    assert 'Operation: edit' in command[-1]
    assert 'first input image' in command[-1]
    assert 'never mirror' in command[-1]
    assert result == output_path(command)
    assert Image.open(result).getpixel((0, 0)) == (0, 0, 255, 255)


def test_generation_uses_only_its_exact_handoff_and_unique_directory(tmp_path, monkeypatch):
    unrelated = png(tmp_path / 'generated' / 'other-job' / 'newest.png', 'green')
    monkeypatch.setattr(artist, 'GENERATED_DIR', unrelated.parent.parent)
    calls = successful_provider(monkeypatch)
    work = tmp_path / 'work'
    outputs = [artist.paint_with_gpt_image('cola', 8, 8, None, work, log=lambda _: None)
               for _ in range(2)]
    assert outputs[0] != outputs[1]
    for result, (command, options) in zip(outputs, calls):
        assert 'Operation: generate' in command[-1]
        assert result == output_path(command)
        assert result.parent == Path(options['cwd'])
        assert result.is_relative_to(work)
        assert command[command.index('-s') + 1] == 'workspace-write'


def test_unrelated_global_image_cannot_satisfy_missing_handoff(tmp_path, monkeypatch):
    unrelated = png(tmp_path / 'generated' / 'other-job' / 'newest.png')
    monkeypatch.setattr(artist, 'GENERATED_DIR', unrelated.parent.parent)
    monkeypatch.setattr(artist.subprocess, 'run', lambda cmd, **kw: subprocess.CompletedProcess(cmd, 0, 'DONE', ''))
    with pytest.raises(artist.ArtistError, match='request-owned PNG'):
        artist.paint_with_gpt_image('cola', 8, 8, None, tmp_path / 'work', log=lambda _: None)


@pytest.mark.parametrize('failure', ['exit', 'invalid', 'jpeg', 'symlink'])
def test_unverified_output_is_rejected(tmp_path, monkeypatch, failure):
    assert 'model' in inspect.signature(artist.paint_with_gpt_image).parameters
    foreign = png(tmp_path / 'foreign.png')
    def run(command, **options):
        out = output_path(command)
        if failure == 'invalid':
            out.write_bytes(b'not a png')
        elif failure == 'jpeg':
            Image.new('RGB', (8, 8)).save(out, format='JPEG')
        elif failure == 'symlink':
            out.symlink_to(foreign)
        else:
            png(out)
        return subprocess.CompletedProcess(command, 1 if failure == 'exit' else 0,
                                            'private output must not be logged', '')
    monkeypatch.setattr(artist.subprocess, 'run', run)
    with pytest.raises(artist.ArtistError) as error:
        artist.paint_with_gpt_image('cola', 8, 8, None, tmp_path / 'work', log=lambda _: None)
    assert 'private output' not in str(error.value)


def test_explicit_unsupported_model_is_not_silently_replaced(tmp_path, monkeypatch):
    assert 'model' in inspect.signature(artist.paint_with_gpt_image).parameters
    calls = []
    def run(command, **options):
        calls.append(command)
        return subprocess.CompletedProcess(command, 1, '', artist._REFUSED)
    monkeypatch.setattr(artist.subprocess, 'run', run)
    with pytest.raises(artist.ArtistError, match='not supported'):
        artist.paint_with_gpt_image('cola', 8, 8, None, tmp_path / 'work',
                                   log=lambda _: None, model='unsupported-explicit')
    assert len(calls) == 1
    assert calls[0][calls[0].index('-m') + 1] == 'unsupported-explicit'


@pytest.fixture
def local_make(tmp_path, monkeypatch):
    monkeypatch.setattr(library, 'ROOT', tmp_path / 'library')
    monkeypatch.setattr(profiles, 'ROOT', tmp_path / 'profiles')
    seen = []
    class DrawingBackend(artist.Backend):
        name = 'fixture'
        model = 'fixture-refiner'
        def ask(self, system, text, images, workdir):
            return json.dumps({'width': 8, 'height': 8, 'palette': {'a': '#ff0000'},
                               'ops': [{'op': 'rect', 'x': 1, 'y': 1, 'w': 6, 'h': 6, 'c': 'a'}]})
    monkeypatch.setattr(artist, 'make_backend', lambda *args: DrawingBackend())
    painting = png(tmp_path / 'painting.png', 'blue')
    def paint(*args, **kwargs):
        seen.append((args, kwargs))
        Path(args[4]).mkdir(parents=True, exist_ok=True)
        return painting
    monkeypatch.setattr(artist, 'paint_with_gpt_image', paint)
    return seen


def test_make_forwards_raw_start_png_model_references_and_brief(tmp_path, local_make):
    start = tmp_path / 'start.png'
    # More colours than Sprite supports: edits must not pre-index the source image.
    source = Image.new('RGBA', (8, 8))
    source.putdata([(n, n * 2, 255 - n, 255) for n in range(64)])
    source.save(start)
    ref = png(tmp_path / 'ref.png')
    result = cli.make('repair the handle', artist_name='gpt-image', model='chosen-model',
                      start=str(start), refs=[str(ref)], rounds=0, polish=False,
                      brief={'protected_details': ['left-side handle']}, log=lambda _: None)
    args, options = local_make[0]
    assert Path(options['start']).read_bytes() == start.read_bytes()
    assert options['model'] == 'chosen-model'
    assert options['references'] == [ref]
    assert 'left-side handle' in args[0]
    assert result['size'] == [8, 8]


def test_make_snapshots_programmatic_base_as_edit_target(tmp_path, local_make):
    base = Sprite.from_image(Image.new('RGBA', (8, 8), 'green'))
    cli.make('repair', artist_name='gpt-image', base=base, rounds=0, polish=False, log=lambda _: None)
    args, options = local_make[0]
    assert 'start' in options
    path = Path(options['start'])
    assert path.is_relative_to(Path(args[4]))
    assert Image.open(path).convert('RGBA').tobytes() == base.to_image().tobytes()


def test_mcp_exposes_and_forwards_existing_make_controls(tmp_path, monkeypatch):
    from forge import mcp_server
    signature = inspect.signature(mcp_server.forge_make)
    extra = {'refs': ['reference.png'], 'refiner': 'gpt', 'retouch_only': True,
             'polish': False, 'use_references': False, 'cache_dir': str(tmp_path / 'cache'),
             'generation_revision': 'test-v1', 'state': 'damaged',
             'brief': {'protected_details': ['left handle']}}
    assert set(extra) <= set(signature.parameters)
    seen = []
    result_png = png(tmp_path / 'sprite.png')
    def make(*args, **kwargs):
        seen.append((args, kwargs))
        return {'png': str(result_png)}
    monkeypatch.setattr(cli, 'make', make)
    mcp_server.forge_make('repair', start_png='start.png', model='chosen-model', **extra)
    assert seen[0][0][7:9] == ('chosen-model', 'start.png')
    assert {key: seen[0][1][key] for key in extra} == extra


@pytest.mark.parametrize('alpha', [90, 255])
def test_cached_start_preserves_exact_png_bytes_and_invalidation(tmp_path, local_make, alpha):
    import hashlib
    from PIL.PngImagePlugin import PngInfo
    start = tmp_path / 'start.png'
    original = Image.new('RGBA', (8, 8))
    original.putdata([(n, n * 2, 255 - n, alpha) for n in range(64)])
    original.save(start)
    first_bytes = start.read_bytes()
    ref = png(tmp_path / 'reference.png')
    options = dict(artist_name='gpt-image', model='chosen-model', start=str(start),
                   refs=[str(ref)], rounds=0, polish=False, log=lambda _: None,
                   cache_dir=tmp_path / 'cache', generation_revision='fixture-v1')
    first = cli.make('repair', **options)
    args, forwarded = local_make[0]
    snapshot = Path(forwarded['start'])
    assert snapshot != start
    assert snapshot.is_relative_to(Path(first['cache']['path']))
    assert snapshot.read_bytes() == first_bytes
    assert len(forwarded['references']) == 1
    assert Path(forwarded['references'][0]).read_bytes() == ref.read_bytes()
    job = json.loads((Path(first['cache']['path']) / 'job.json').read_text())
    assert hashlib.sha256(first_bytes).hexdigest() in job['artifacts'].values()
    again = cli.make('repair', **options)
    assert again['cache']['hit']
    assert len(local_make) == 1
    # Encoding-only changes still have distinct source identity: hash exact PNG bytes.
    metadata = PngInfo(); metadata.add_text('revision', '2')
    original.save(start, pnginfo=metadata)
    changed = cli.make('repair', **options)
    assert changed['cache']['key'] != first['cache']['key']
    assert len(local_make) == 2
    assert Path(local_make[1][1]['start']).read_bytes() == start.read_bytes()
    assert snapshot.read_bytes() == first_bytes


def test_cached_edit_target_corruption_fails_closed_without_provider(tmp_path, local_make):
    from forge_accel.runner import CachedArtifactError
    start = png(tmp_path / 'start.png')
    options = dict(artist_name='gpt-image', start=str(start), rounds=0, polish=False,
                   log=lambda _: None, cache_dir=tmp_path / 'cache', generation_revision='fixture-v1')
    cli.make('repair', **options)
    Path(local_make[0][1]['start']).write_bytes(b'corrupted immutable input')
    with pytest.raises(CachedArtifactError, match='cached artifact changed'):
        cli.make('repair', **options)
    assert len(local_make) == 1


def test_default_model_failure_never_retries_or_substitutes(tmp_path, monkeypatch):
    calls = []
    def run(command, **options):
        calls.append(command)
        if len(calls) == 1:
            png(output_path(command))
            return subprocess.CompletedProcess(command, 1, '', artist._REFUSED)
        return subprocess.CompletedProcess(command, 0, 'DONE', '')
    monkeypatch.setattr(artist.subprocess, 'run', run)
    with pytest.raises(artist.ArtistError):
        artist.paint_with_gpt_image('cola', 8, 8, None, tmp_path / 'work', log=lambda _: None)
    assert len(calls) == 1
