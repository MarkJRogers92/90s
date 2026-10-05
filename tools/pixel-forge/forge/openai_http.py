"""A dependency-free, SDK-shaped OpenAI Images client for `OpenAIImagesBackend`.

Only what the adapter uses: `images.generate` (JSON) and `images.edit` (multipart, every
reference as `image[]`), `max_retries == 0` and `with_options(max_retries=0)`. One HTTP
request per call: no retry, redirect-following to other hosts, or fallback. HTTPS goes
through the standard proxy/CA environment (HTTPS_PROXY, SSL_CERT_FILE). The key is held in
memory only and never appears in a repr, error or result.
"""
from __future__ import annotations

import json
import os
import re
import ssl
import urllib.request
import uuid

DEFAULT_BASE_URL = 'https://api.openai.com/v1'
TIMEOUT_SECONDS = 300
MAX_RESPONSE_BYTES = 64 * 1024 * 1024


class OpenAIHttpError(RuntimeError):
    """A failed call: the HTTP status and the API's error code, never the key or the request.

    A 4xx answer means the API refused the request (no credit, bad key, bad parameter), so it
    never ran and was not charged: `completion` is `not_started`. Anything else (5xx, a
    timeout, a dropped connection) may have run: `unknown`.
    """

    def __init__(self, status, code=None):
        self.status = status
        self.code = code if isinstance(code, str) and re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', code) else None
        self.completion = 'not_started' if isinstance(status, int) and 400 <= status < 500 else 'unknown'
        super().__init__(f'HTTP {status}' + (f' {self.code}' if self.code else ''))


def _context():
    cafile = os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE')
    return ssl.create_default_context(cafile=cafile if cafile and os.path.isfile(cafile) else None)


class _Images:
    def __init__(self, client):
        self._client = client

    def generate(self, **payload):
        return self._client._post('/images/generations', json.dumps(payload).encode(), 'application/json')

    def edit(self, **payload):
        boundary = uuid.uuid4().hex
        parts = []
        for name, value in payload.items():
            if name == 'image':
                for stream in value:
                    parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; '
                                  f'filename="{stream.name}"\r\nContent-Type: image/png\r\n\r\n').encode()
                                 + stream.getvalue() + b'\r\n')
            else:
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        body = b''.join(parts) + f'--{boundary}--\r\n'.encode()
        return self._client._post('/images/edits', body, f'multipart/form-data; boundary={boundary}')


class OpenAIHttpClient:
    max_retries = 0

    def __init__(self, *, api_key: str, base_url: str = DEFAULT_BASE_URL, timeout: float = TIMEOUT_SECONDS):
        if not isinstance(api_key, str) or not api_key.strip():
            raise ValueError('an API key is required')
        self.__key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.images = _Images(self)

    def __repr__(self):
        return f'OpenAIHttpClient(base_url={self.base_url!r})'

    def with_options(self, *, max_retries):
        if max_retries != 0:
            raise ValueError('this client never retries')
        return self

    def _post(self, path, body, content_type):
        request = urllib.request.Request(self.base_url + path, data=body, method='POST', headers={
            'Authorization': f'Bearer {self.__key}', 'Content-Type': content_type, 'Accept': 'application/json'})
        handlers = [urllib.request.ProxyHandler()]
        if self.base_url.startswith('https:'):
            handlers.append(urllib.request.HTTPSHandler(context=_context()))
        try:
            with urllib.request.build_opener(*handlers).open(request, timeout=self.timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                request_id = response.headers.get('x-request-id')
        except urllib.error.HTTPError as error:
            try:
                code = json.loads(error.read(64 * 1024)).get('error', {}).get('code')
            except Exception:
                code = None
            raise OpenAIHttpError(error.code, code) from None
        except Exception:
            raise OpenAIHttpError('unreachable') from None
        if len(raw) > MAX_RESPONSE_BYTES:
            raise OpenAIHttpError('oversized response')
        data = json.loads(raw)
        if request_id and isinstance(data, dict):
            data['request_id'] = request_id
        return data


def from_environment(*, key_env: str = 'OPENAI_API_KEY', base_url: str = DEFAULT_BASE_URL) -> OpenAIHttpClient | None:
    """The client for the key in `key_env`, or None when that variable is unset."""
    key = os.environ.get(key_env, '')
    return OpenAIHttpClient(api_key=key, base_url=base_url) if key.strip() else None
