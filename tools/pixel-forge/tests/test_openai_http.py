"""The stdlib Images client and the `image-pair run` CLI, against a local fake server only."""
import base64
import http.server
import io
import json
import threading

import pytest
from PIL import Image

from forge import openai_http
from forge.image_provider import OpenAIImagesBackend


def png_bytes(size=(8, 8), color=(200, 40, 40, 255)):
    out = io.BytesIO()
    Image.new('RGBA', size, color).save(out, 'PNG')
    return out.getvalue()


class Fake(http.server.BaseHTTPRequestHandler):
    calls = []
    status = 200

    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        type(self).calls.append({'path': self.path, 'auth': self.headers.get('Authorization'),
                                 'type': self.headers.get('Content-Type'), 'body': body})
        if type(self).status != 200:
            self.send_response(type(self).status); self.end_headers(); self.wfile.write(b'{"error":{}}'); return
        payload = json.dumps({'data': [{'b64_json': base64.b64encode(png_bytes()).decode()}],
                              'usage': {'input_tokens': 3, 'output_tokens': 5, 'total_tokens': 8}}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json'); self.send_header('x-request-id', 'req_abc123')
        self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)

    def log_message(self, *args):
        pass


@pytest.fixture
def server():
    Fake.calls = []; Fake.status = 200
    httpd = http.server.HTTPServer(('127.0.0.1', 0), Fake)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
    yield f'http://127.0.0.1:{httpd.server_address[1]}/v1'
    httpd.shutdown()


def test_client_is_sdk_shaped_and_never_retries(server):
    client = openai_http.OpenAIHttpClient(api_key='sk-test', base_url=server)
    assert client.max_retries == 0
    copy = client.with_options(max_retries=0)
    assert copy.max_retries == 0
    with pytest.raises(ValueError):
        client.with_options(max_retries=2)
    assert OpenAIImagesBackend(client, model='gpt-image-1', revision='r1', enabled=True).capability()['configured'] is True


def test_generate_posts_json_and_decodes_one_png(server):
    backend = OpenAIImagesBackend(openai_http.OpenAIHttpClient(api_key='sk-test', base_url=server),
                                  model='gpt-image-1', revision='r1', enabled=True)
    result = backend.generate({'prompt': 'a pixel shopper', 'referenced_image_paths': [], 'transparent_background': True})
    assert result['image_bytes'][:8] == b'\x89PNG\r\n\x1a\n'
    assert result['request_id'] == 'req_abc123' and result['usage']['total_tokens'] == 8
    [call] = Fake.calls
    assert call['path'] == '/v1/images/generations' and call['auth'] == 'Bearer sk-test'
    sent = json.loads(call['body'])
    assert sent == {'model': 'gpt-image-1', 'prompt': 'a pixel shopper', 'n': 1, 'output_format': 'png', 'background': 'transparent'}


def test_edit_uploads_every_reference_as_multipart(server, tmp_path):
    refs = []
    for index in range(2):
        path = tmp_path / f'ref{index}.png'; path.write_bytes(png_bytes(color=(index, 0, 0, 255))); refs.append(str(path))
    backend = OpenAIImagesBackend(openai_http.OpenAIHttpClient(api_key='sk-test', base_url=server),
                                  model='gpt-image-1', revision='r1', enabled=True)
    backend.generate({'prompt': 'sheet', 'referenced_image_paths': refs, 'transparent_background': False, 'quality': 'high'})
    [call] = Fake.calls
    assert call['path'] == '/v1/images/edits' and call['type'].startswith('multipart/form-data; boundary=')
    body = call['body']
    assert body.count(b'name="image[]"; filename="reference-') == 2
    assert b'name="background"\r\n\r\nopaque' in body and b'name="quality"\r\n\r\nhigh' in body
    assert str(tmp_path).encode() not in body              # local paths never leave the machine


def test_http_error_is_an_unknown_completion_and_not_retried(server):
    Fake.status = 500
    backend = OpenAIImagesBackend(openai_http.OpenAIHttpClient(api_key='sk-test', base_url=server),
                                  model='gpt-image-1', revision='r1', enabled=True)
    with pytest.raises(Exception) as error:
        backend.generate({'prompt': 'x', 'referenced_image_paths': [], 'transparent_background': True})
    assert error.value.completion == 'unknown' and len(Fake.calls) == 1
    assert 'sk-test' not in str(error.value)


def test_cli_run_reads_the_key_from_the_environment_and_never_prints_it(server, tmp_path, monkeypatch, capsys):
    from forge import image_pair_cli
    ref = tmp_path / 'walk.png'; ref.write_bytes(png_bytes((64, 64)))
    spec = tmp_path / 'pair.json'
    spec.write_text(json.dumps({'prompt': 'charge', 'style': 'match', 'references': [str(ref)], 'frame_size': 8,
                                'frames': 1, 'facings': ['south'], 'durations_ms': [100], 'pivot': [4, 7],
                                'max_followups': 0, 'revision': 't1'}))
    root = tmp_path / 'jobs'
    image_pair_cli.main(['begin', '--root', str(root), '--spec', str(spec)])
    key = json.loads(capsys.readouterr().out)['key']
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    with pytest.raises(SystemExit):
        image_pair_cli.main(['run', '--root', str(root), '--key', key, '--model', 'gpt-image-1', '--base-url', server])
    assert Fake.calls == []                                 # no key: nothing is sent
    monkeypatch.setenv('OPENAI_API_KEY', 'sk-secret-value')
    image_pair_cli.main(['run', '--root', str(root), '--key', key, '--model', 'gpt-image-1', '--base-url', server])
    out = capsys.readouterr().out
    assert 'sk-secret-value' not in out and len(Fake.calls) == 1
    assert Fake.calls[0]['auth'] == 'Bearer sk-secret-value'
    result = json.loads(out)
    # One call produced the mockup; the job now waits for its sheet (the next `run`).
    assert result['artifacts']['mockup']['sha256'] and result['validation']['accepted'] is True
    assert result['state'] == 'pending' and result['review_status'] == 'REVIEW_ONLY'
