"""Private same-host native Codex image bridge; no OAuth or Images API client.

An explicitly enabled operator starts one signed-in Codex stdio process. Only a
matched native imageGeneration event and completed turn can yield image bytes.
This is not a hosted subscription API. Never copy credentials into this module.
"""
from __future__ import annotations

import base64
from collections import deque
from contextlib import contextmanager
import json
import math
import os
from pathlib import Path
import queue
import select
import shutil
import signal
import subprocess
import tempfile
import threading
import time

from forge_accel.pixels import MAX_FILE_BYTES, MAX_SEQUENCE_PIXELS, decode_rgba
from forge_accel.runner import _lock
from .bounded_io import read_bounded
from .image_provider import ImageProviderError, _valid_identifier, _validate_request

PROVIDER = 'codex-native-chatgpt'
MAX_FRAME = (MAX_FILE_BYTES * 4 // 3) + 256 * 1024
MAX_STREAM = 128 * 1024 * 1024
MAX_EVENTS = 10000
_SYSTEM_CONFIGS = (Path('/etc/codex/config.toml'), Path('/etc/codex/managed_config.toml'),
                   Path('/etc/codex/requirements.toml'))
_ALLOWED_ITEMS = {'userMessage', 'agentMessage', 'reasoning', 'imageView', 'imageGeneration', 'plan'}


def _error(code, message, started=False, received=False):
    return ImageProviderError(code, message, completion=(
        'response_received' if received else 'unknown' if started else 'not_started'))


class _Stdio:
    """Bounded JSONL transport. Provider transcripts and stderr are not retained."""
    def __init__(self, command, cwd, timeout, *, codex_home=None):
        env = os.environ.copy()
        # Do not read, print, or pass these API billing/endpoint overrides.
        for key in ('OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL'):
            env.pop(key, None)
        if codex_home is not None:
            env['CODEX_HOME'] = str(codex_home)
        self.deadline = time.monotonic() + timeout
        self.started = False
        self.sequence = 0
        self.pending = deque()
        self.events = queue.Queue()
        self.closed = threading.Event()
        try:
            self.process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
        except OSError:
            raise _error('NATIVE_RUNTIME_UNAVAILABLE', 'Could not start the native Codex worker') from None
        os.set_blocking(self.process.stdin.fileno(), False)
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self):
        total = count = 0
        try:
            while not self.closed.is_set():
                line = self.process.stdout.readline(MAX_FRAME + 1)
                if not line:
                    self.events.put(('error', 'NATIVE_RUNTIME_UNAVAILABLE'))
                    return
                total += len(line); count += 1
                if len(line) > MAX_FRAME or total > MAX_STREAM or count > MAX_EVENTS:
                    self.events.put(('error', 'NATIVE_PROTOCOL_LIMIT'))
                    return
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ValueError('not an object')
                self.events.put(('event', value))
        except (OSError, ValueError, RecursionError):
            self.events.put(('error', 'NATIVE_PROTOCOL_INVALID'))

    def send(self, value):
        data = json.dumps(value, separators=(',', ':')).encode() + b'\n'
        fd = self.process.stdin.fileno()
        remaining_data = memoryview(data)
        try:
            while remaining_data:
                remaining_time = self.deadline - time.monotonic()
                if remaining_time <= 0 or not select.select([], [fd], [], remaining_time)[1]:
                    raise _error('NATIVE_TIMEOUT', 'Native worker did not accept input before the deadline', self.started)
                try:
                    written = os.write(fd, remaining_data[:4096])
                except BlockingIOError:
                    continue
                if written <= 0:
                    raise OSError('disconnected')
                remaining_data = remaining_data[written:]
        except ImageProviderError:
            raise
        except (OSError, ValueError):
            raise _error('NATIVE_RUNTIME_UNAVAILABLE', 'Native Codex worker disconnected', self.started) from None

    def receive(self):
        remaining = self.deadline - time.monotonic()
        try:
            kind, value = self.events.get(timeout=max(0, remaining))
        except queue.Empty:
            raise _error('NATIVE_TIMEOUT', 'Native worker deadline reached; reconcile before another attempt', self.started) from None
        if kind == 'error':
            raise _error(value, 'Native worker stopped or returned an invalid bounded protocol stream', self.started)
        if value.get('method') == 'account/updated':
            params = value.get('params', {})
            if not isinstance(params, dict) or params.get('authMode') != 'chatgpt':
                raise _error('AUTH_CHANGED', 'Native worker authentication changed', self.started)
        if 'method' in value and 'id' in value:
            # Never grant a shell permission, login, network grant, or tool call.
            self.send({'id': value['id'], 'error': {'code': -32601,
                'message': 'This image worker cannot approve actions; operator action required'}})
            raise _error('APPROVAL_REQUIRED', 'Native worker requires an operator action; no approval was granted', self.started)
        return value

    def rpc(self, method, params):
        self.sequence += 1
        request_id = self.sequence
        if method == 'turn/start':
            # A write failure is ambiguous: the worker may have received it.
            self.started = True
        self.send({'id': request_id, 'method': method, 'params': params})
        while True:
            message = self.receive()
            if message.get('id') == request_id:
                if 'error' in message or not isinstance(message.get('result'), dict):
                    raise _error('NATIVE_RPC_FAILED', 'Native worker rejected a protocol request', self.started)
                return message['result']
            if 'id' in message:
                raise _error('NATIVE_PROTOCOL_INVALID', 'Native worker returned an unmatched response', self.started)
            self.pending.append(message)

    def notification(self):
        return self.pending.popleft() if self.pending else self.receive()

    def close(self):
        self.closed.set()
        # This process started a new session; signal only its own process group.
        def stop(sig):
            try:
                os.killpg(self.process.pid, sig)
            except ProcessLookupError:
                pass
        stop(signal.SIGTERM)
        try:
            self.process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            stop(signal.SIGKILL)
            self.process.wait(timeout=1)
        # Also stop descendants that detached stdout and ignored TERM.
        # Their silence is not evidence that they have exited.
        stop(signal.SIGKILL)
        self.reader.join(timeout=1)
        self.process.stdin.close()
        if not self.reader.is_alive():
            self.process.stdout.close()


class CodexNativeBackend:
    """Opt-in private stdio adapter using Codex-managed ChatGPT authentication.

    `model` is the explicit Codex orchestrator model, not an Images API model.
    It is recorded as such in docs; native image-model selection belongs to
    Codex. All workers for one login must share work_root (one serialized stream).
    """
    name = PROVIDER

    def __init__(self, *, executable='codex', work_root, codex_home, model, revision, enabled=False, timeout=900):
        if (not _valid_identifier(model) or not _valid_identifier(revision)
                or type(enabled) is not bool or isinstance(timeout, bool)
                or not isinstance(timeout, (int, float)) or not math.isfinite(timeout)
                or not 0.1 <= timeout <= 3600):
            raise _error('INVALID_CONFIGURATION', 'Explicit model, revision, enablement and bounded timeout are required')
        if (not isinstance(executable, (str, Path)) or not str(executable).strip()
                or '\x00' in str(executable) or not isinstance(work_root, (str, Path))
                or not str(work_root).strip() or '\x00' in str(work_root)
                or not isinstance(codex_home, (str, Path)) or not str(codex_home).strip()
                or '\x00' in str(codex_home)):
            raise _error('INVALID_CONFIGURATION', 'A local Codex executable is required')
        self.executable = str(executable)
        self.work_root = Path(work_root).expanduser().absolute()
        self.codex_home = Path(codex_home).expanduser().absolute()
        self.model = model
        self.revision = revision
        self.enabled = enabled
        self.timeout = float(timeout)

    def capability(self):
        configured = shutil.which(self.executable) is not None and self.codex_home.is_dir()
        return {'provider': PROVIDER, 'model': self.model, 'revision': self.revision,
                'enabled': self.enabled, 'configured': configured,
                'available': None if configured and self.enabled else False,
                'status': 'disabled' if not self.enabled else 'unverified' if configured else 'unavailable',
                'transport': 'private-stdio', 'auth': 'codex-managed-chatgpt',
                'model_role': 'codex-orchestrator', 'native_image_access': 'unverified',
                'account_access': 'unverified', 'network_access': 'unverified',
                'adapter_automatic_retries': False, 'automatic_fallback': False,
                'native_internal_retries': 'unverified', 'supported_host': 'private-unmanaged-personal',
                'hosted_service_supported': False, 'dedicated_profile_required': True}

    @contextmanager
    def _worker(self):
        if not self.enabled:
            raise _error('PROVIDER_DISABLED', 'Native generation requires explicit operator enablement')
        if not self.codex_home.is_dir():
            raise _error('NATIVE_PROFILE_REQUIRED', 'An operator-created, separately signed-in Codex profile is required')
        try:
            skills = self.codex_home / 'skills'
            custom_skills = skills.is_symlink() or (skills.exists() and (
                not skills.is_dir() or any(p.name != '.system' or p.is_symlink() for p in skills.iterdir())))
            inherited = list(_SYSTEM_CONFIGS)
            for directory in (self.work_root, *self.work_root.parents):
                inherited.extend((directory / '.codex' / 'config.toml', directory / 'config.toml'))
            if (self.codex_home.is_symlink() or any(self.codex_home.glob('*.toml')) or custom_skills
                    or any(path.exists() or path.is_symlink() for path in inherited)
                    or any((self.codex_home / name).exists() or (self.codex_home / name).is_symlink()
                           for name in ('hooks.json', 'AGENTS.md', 'plugins'))):
                raise _error('NATIVE_PROFILE_UNSAFE', 'Only a clean private profile on an unmanaged host is supported; configuration was not read or changed')
        except OSError:
            raise _error('NATIVE_PROFILE_UNSAFE', 'Native worker configuration metadata could not be verified') from None
        if shutil.which(self.executable) is None:
            raise _error('NATIVE_RUNTIME_UNAVAILABLE', 'A supported Codex installation is required on this host')
        worker = None
        try:
            if self.work_root.is_symlink():
                raise OSError('symlink root')
            self.work_root.mkdir(parents=True, exist_ok=True)
            with _lock(self.work_root / '.native-worker.lock', self.timeout):
                run = Path(tempfile.mkdtemp(prefix='native-', dir=self.work_root))
                command = [self.executable, 'app-server', '--listen', 'stdio://', '--strict-config']
                for feature in ('hooks', 'apps', 'plugins', 'shell_tool', 'browser_use', 'computer_use', 'multi_agent', 'multi_agent_v2'):
                    command += ['--disable', feature]
                command += ['-c', 'web_search="disabled"', '-c', 'agents.enabled=false', '-c', 'notify=[]']
                try:
                    worker = _Stdio(command, run, self.timeout, codex_home=self.codex_home)
                    worker.rpc('initialize', {'clientInfo': {'name': 'pixel_forge_native',
                        'title': 'Pixel Forge private native image worker', 'version': '1.0'}})
                    worker.send({'method': 'initialized', 'params': {}})
                    account = worker.rpc('account/read', {'refreshToken': False}).get('account')
                    if not isinstance(account, dict) or account.get('type') != 'chatgpt':
                        raise _error('CHATGPT_LOGIN_REQUIRED', 'Sign in to Codex with ChatGPT on this host before using native images')
                    if account.get('planType') not in ('plus', 'pro'):
                        raise _error('UNSUPPORTED_NATIVE_ACCOUNT', 'This private adapter currently supports personal Plus/Pro accounts only')
                    yield worker, run
                finally:
                    if worker:
                        worker.close()

        except ImageProviderError:
            raise
        except (OSError, ValueError, TimeoutError):
            raise _error('NATIVE_RUNTIME_UNAVAILABLE', 'Native worker storage or serialization is unavailable',
                         worker.started if worker else False) from None

    def probe(self):
        """Check startup and existing auth only. Does not spend an inference turn."""
        with self._worker():
            return {**self.capability(), 'account_access': 'chatgpt_verified',
                    'runtime_startup': 'verified', 'native_image_access': 'unverified',
                    'note': 'Only a completed native image turn verifies image access.'}

    def generate(self, request):
        request = _validate_request(request)
        if not self.enabled:
            raise _error('PROVIDER_DISABLED', 'Native generation requires explicit operator enablement')
        if set(request) != {'prompt', 'referenced_image_paths', 'transparent_background'}:
            raise _error('INVALID_REQUEST', 'Native requests accept prompt, references and transparency only')
        snapshots = []
        total_bytes = total_pixels = 0
        for ref in request['referenced_image_paths']:
            try:
                raw = read_bounded(ref, MAX_FILE_BYTES)
                total_bytes += len(raw)
                with decode_rgba(raw) as image:
                    total_pixels += image.width * image.height
                if total_bytes > MAX_FILE_BYTES or total_pixels > MAX_SEQUENCE_PIXELS:
                    raise ValueError('aggregate references')
                snapshots.append(raw)
            except (ValueError, OSError):
                raise _error('INVALID_REFERENCE', 'References must be bounded, readable static PNG files') from None
        with self._worker() as (worker, run):
            references = []
            for index, raw in enumerate(snapshots):
                path = run / f'reference-{index + 1}.png'
                with path.open('xb') as file:
                    file.write(raw)
                references.append({'type': 'localImage', 'path': str(path)})
            thread = worker.rpc('thread/start', {'cwd': str(run), 'ephemeral': True,
                'model': self.model, 'modelProvider': 'openai', 'sandbox': 'read-only',
                'approvalPolicy': 'on-request', 'approvalsReviewer': 'user',
                'config': {'features.shell_tool': False, 'features.apps': False,
                    'features.plugins': False, 'features.browser_use': False,
                    'features.computer_use': False, 'web_search': 'disabled'},
                'developerInstructions': 'This private worker may use only native image generation and image viewing. '
                    'Never use an API, shell, browser, external tool, generated code, or placeholder. '
                    'Do not request new credentials or alter authentication. Produce exactly one native image, '
                    'then stop; no retry, second image, or provider/model fallback. If unavailable, explain and stop.'})
            if thread.get('modelProvider') != 'openai':
                raise _error('NATIVE_PROVIDER_REQUIRED', 'Native OpenAI provider was not selected; no image started')
            if thread.get('model') != self.model:
                raise _error('MODEL_MISMATCH', 'Codex model did not match the explicit selection; no image started')
            sandbox = thread.get('sandbox', {})
            if (thread.get('approvalPolicy') != 'on-request' or thread.get('approvalsReviewer') != 'user'
                    or not isinstance(sandbox, dict) or sandbox.get('type') != 'readOnly'
                    or sandbox.get('networkAccess', False) is not False):
                raise _error('UNSAFE_WORKER_POLICY', 'Native worker did not honor the required read-only approval policy')
            thread_body = thread.get('thread')
            thread_id = thread_body.get('id') if isinstance(thread_body, dict) else None
            if not _valid_identifier(thread_id):
                raise _error('NATIVE_PROTOCOL_INVALID', 'Native worker returned an invalid thread identity')
            prompt = 'Use your actual built-in image generation tool exactly once. '
            prompt += ('Use a genuinely transparent background. ' if request['transparent_background']
                       else 'Use an opaque background. ')
            prompt += 'Inspect and preserve the supplied reference identity and ordering. '
            prompt += 'Return the native image directly; do not draw it in code or save/copy unrelated files.\n\n'
            prompt += request['prompt']
            turn = worker.rpc('turn/start', {'threadId': thread_id,
                'input': [{'type': 'text', 'text': prompt}, *references],
                'serviceTierForTurn': 'default'})
            turn_body = turn.get('turn')
            turn_id = turn_body.get('id') if isinstance(turn_body, dict) else None
            if not _valid_identifier(turn_id):
                raise _error('NATIVE_PROTOCOL_INVALID', 'Native worker returned an invalid turn identity', True)
            images = {}
            image_calls = set()
            while True:
                message = worker.notification()
                params = message.get('params', {})
                if message.get('method') == 'account/updated':
                    if not isinstance(params, dict) or params.get('authMode') != 'chatgpt':
                        raise _error('AUTH_CHANGED', 'Native worker authentication changed during the request', True)
                if not isinstance(params, dict) or params.get('threadId') != thread_id:
                    continue
                method = message.get('method')
                if method == 'model/rerouted' and params.get('turnId') == turn_id:
                    raise _error('MODEL_REROUTED', 'Codex reported a model change; result was not accepted', True)
                if method in ('item/started', 'item/completed') and params.get('turnId') == turn_id:
                    item = params.get('item', {})
                    if not isinstance(item, dict) or item.get('type') not in _ALLOWED_ITEMS:
                        raise _error('UNEXPECTED_TOOL', 'Native image worker attempted an unrelated tool', True)
                    if item.get('type') == 'imageGeneration':
                        if not _valid_identifier(item.get('id')):
                            raise _error('NATIVE_PROTOCOL_INVALID', 'Native image event has an invalid identity', True)
                        image_calls.add(item['id'])
                        if len(image_calls) > 1:
                            raise _error('MULTIPLE_IMAGES', 'Native worker attempted more than one image', True)
                    if method == 'item/completed' and item.get('type') == 'imageGeneration':
                        item_id = item.get('id')
                        if not _valid_identifier(item_id):
                            raise _error('NATIVE_PROTOCOL_INVALID', 'Native image event has an invalid identity', True)
                        if item_id in images and item != images[item_id]:
                            raise _error('NATIVE_PROTOCOL_INVALID', 'Native image completion changed unexpectedly', True)
                        images[item_id] = item
                        if len(images) > 1:
                            raise _error('MULTIPLE_IMAGES', 'Native worker generated more than the one requested image', True)
                completed_turn = params.get('turn')
                if method == 'turn/completed' and not isinstance(completed_turn, dict):
                    raise _error('NATIVE_PROTOCOL_INVALID', 'Native worker returned an invalid completion', True)
                if method == 'turn/completed' and completed_turn.get('id') == turn_id:
                    if params['turn'].get('status') != 'completed':
                        raise _error('TURN_FAILED', 'Native image turn did not complete successfully', True)
                    break
            if len(images) != 1:
                raise _error('NATIVE_IMAGE_MISSING', 'No matched native image completion was received', True)
            item_id, item = next(iter(images.items()))
            if item.get('status') != 'completed' or item.get('failure') is not None:
                raise _error('NATIVE_IMAGE_FAILED', 'Native image generation failed or reached a usage limit', received=True)
            if item.get('transparentBackground') is not request['transparent_background']:
                raise _error('BACKGROUND_MISMATCH', 'Native image transparency did not match the request', received=True)
            try:
                value = item['result']
                if not isinstance(value, str) or len(value) > (MAX_FILE_BYTES + 2) // 3 * 4:
                    raise ValueError('unbounded image')
                raw = base64.b64decode(value, validate=True)
                if len(raw) > MAX_FILE_BYTES:
                    raise ValueError('unbounded image')
                decode_rgba(raw).close()
            except (KeyError, TypeError, ValueError, OSError):
                raise _error('INVALID_NATIVE_IMAGE', 'Native image event did not contain one bounded base64 PNG', received=True) from None
            invocation_id = f'{thread_id}:{turn_id}:{item_id}'
            if len(invocation_id) > 256:
                raise _error('NATIVE_PROTOCOL_INVALID', 'Native invocation identity exceeds the receipt limit', received=True)
            result = {'image_bytes': raw, 'provider': PROVIDER, 'model': self.model,
                      'request_id': invocation_id}
            revised = item.get('revisedPrompt')
            if revised is not None:
                if not isinstance(revised, str) or not 1 <= len(revised) <= 32000:
                    raise _error('INVALID_NATIVE_IMAGE', 'Native image revised prompt was invalid', received=True)
                result['revised_prompt'] = revised
            return result


def serve(backend):
    """Expose only the existing durable image-pair workflow over local MCP stdio."""
    from mcp.server.mcpserver import MCPServer
    from mcp import types
    from .image_pair_cli import action as pair_action
    server = MCPServer('pixel-forge-native-image')

    @server.tool(description='Private native Codex mockup and sprite-sheet jobs. '
        'begin creates a pending job; run executes exactly one native image request; '
        'status reads it; revise requests a bounded correction. Inspect the mockup before '
        'running the sheet. No API fallback or automatic retry. All output remains REVIEW_ONLY.')
    def forge_image_pair(action: str, root: str, spec: dict | None = None, key: str | None = None,
                         ticket: str | None = None, image_path: str | None = None,
                         receipt: dict | None = None, native_image_tool: bool = False,
                         stage: str | None = None, feedback: str | None = None,
                         edit_mask: str | None = None, max_changed_pixels: int | None = None):
        try:
            result = pair_action(action, root, spec=spec, key=key, ticket=ticket,
                image_path=image_path, receipt=receipt, native_image_tool=native_image_tool,
                stage=stage, feedback=feedback, edit_mask=edit_mask,
                max_changed_pixels=max_changed_pixels, backend=backend)
            return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result))],
                                        structured_content=result)
        except ImageProviderError as error:
            result = error.result()
            return types.CallToolResult(content=[types.TextContent(type='text', text=json.dumps(result))],
                                        structured_content=result, is_error=True)
    server.run('stdio')


def main(argv=None):
    """Operator-owned launcher; never registers MCP, signs in, or starts HTTP."""
    import argparse
    parser = argparse.ArgumentParser(prog='python -m forge.codex_native')
    parser.add_argument('action', choices=('capabilities', 'probe', 'run', 'serve'))
    parser.add_argument('--executable', default='codex')
    parser.add_argument('--work-root', required=True)
    parser.add_argument('--codex-home', required=True, help='Dedicated user-signed-in Codex worker home; never copied auth')
    parser.add_argument('--model', required=True, help='Exact Codex orchestrator model')
    parser.add_argument('--revision', required=True)
    parser.add_argument('--enable-native', action='store_true')
    parser.add_argument('--timeout', type=float, default=900)
    parser.add_argument('--root', help='Existing image-pair job root (run only)')
    parser.add_argument('--key', help='Existing image-pair job key (run only)')
    args = parser.parse_args(argv)
    try:
        backend = CodexNativeBackend(executable=args.executable, work_root=args.work_root, codex_home=args.codex_home,
            model=args.model, revision=args.revision, enabled=args.enable_native, timeout=args.timeout)
        if args.action == 'capabilities':
            result = backend.capability()
        elif args.action == 'probe':
            result = backend.probe()
        elif args.action == 'run':
            if not args.root or not args.key:
                parser.error('run requires --root and --key')
            from .image_pair import run_provider
            result = run_provider(args.root, args.key, backend)
        else:
            if not args.enable_native:
                raise _error('PROVIDER_DISABLED', 'Serving native image jobs requires explicit operator enablement')
            serve(backend)
            return 0
        print(json.dumps(result, indent=2))
        return 0
    except ImageProviderError as error:
        print(json.dumps(error.result(), indent=2))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
