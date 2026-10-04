"""Explicit adapters. No provider is selected or invoked on import.

The CLI compatibility adapter is tested with a fixture, not the user's live Mac.
Native callbacks receive reference PNGs; the legacy CLI receives text hints only.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol
import hashlib
import math
import os
import signal
import subprocess
import time
from PIL import Image
from .briefs import ArtRequest, compile_brief, digest
from .pixels import load_rgba


class Backend(Protocol):
    @property
    def identity(self) -> str: ...
    def generate(self, request: ArtRequest, work: Path, profile: dict | None) -> Image.Image: ...


@dataclass(frozen=True)
class CallbackBackend:
    name: str
    revision: str
    callback: Callable[[ArtRequest, Path, dict | None], Image.Image] = field(repr=False)
    cache_artifacts: tuple[str, ...] = ()

    def __post_init__(self):
        if not self.name or not self.revision or not callable(self.callback):
            raise ValueError('callback backend requires a name, version/config revision, and callable')
        for name in self.cache_artifacts:
            if not isinstance(name, str) or Path(name).is_absolute() or '..' in Path(name).parts:
                raise ValueError('cache artifacts must be relative paths inside the job')

    @property
    def identity(self) -> str:
        # Caller MUST change revision when model, parameters, or callback behavior change.
        return digest({'callback':self.name,'revision':self.revision})

    def generate(self, request: ArtRequest, work: Path, profile: dict | None) -> Image.Image:
        return self.callback(request,work,profile)


def _process(args: list[str], cwd: Path, log: Path, timeout_s: float) -> None:
    """No shell. On timeout kill the process group and leave logs for inspection.

    Stopping a local process cannot guarantee cancellation/refund at a provider.
    """
    if os.name != 'posix':
        raise RuntimeError('CLI process-group supervision requires macOS/Linux')
    deadline=time.monotonic()+timeout_s
    with log.open('xb') as stream:
        proc=subprocess.Popen(args,cwd=cwd,stdout=stream,stderr=subprocess.STDOUT,
                              stdin=subprocess.DEVNULL,start_new_session=True)
        try:
            while proc.poll() is None:
                if time.monotonic()>=deadline:
                    raise TimeoutError('Forge timeout; remote completion may be uncertain. Inspect this job; do not auto-retry.')
                if log.stat().st_size>8*1024*1024:
                    raise RuntimeError('backend log limit exceeded')
                time.sleep(.02)
            if proc.returncode:
                raise RuntimeError(f'Forge exited with code {proc.returncode}; inspect {log.name}')
        except BaseException:
            try: os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError: pass
            proc.wait()
            raise


class ForgeCLIBackend:
    """Opt-in one-draft legacy make adapter; not a replacement for forge_prepare.

    Forces n=1, rounds=0, no-combine. This is ONE CLI invocation, NOT a claim of
    one model call. Installed Forge internals and provider defaults still apply.
    No paid route is added; no claim is made that inherited config is free.
    """
    def __init__(self, root: str | Path, *, revision: str, artist: str='gpt-image', timeout_s: float=180):
        self.root=Path(root).expanduser().resolve()
        self.script=self.root/'forge.sh'
        if not self.script.is_file() or not os.access(self.script,os.X_OK):
            raise ValueError('Forge root must contain an executable forge.sh')
        if not isinstance(revision,str) or not 1<=len(revision)<=256:
            raise ValueError('provide a backend revision identifying your model/config')
        if artist not in {'gpt-image','gpt','claude'}:
            raise ValueError('artist must be gpt-image, gpt or claude')
        if isinstance(timeout_s,bool) or not isinstance(timeout_s,(int,float)) or not math.isfinite(timeout_s) or not .01<=timeout_s<=3600:
            raise ValueError('timeout_s must be in [.01,3600]')
        self.revision=revision;self.artist=artist;self.timeout_s=float(timeout_s)

    @property
    def identity(self) -> str:
        files={self.script}
        for name in ('pyproject.toml','requirements.txt','projects.json'):
            p=self.root/name
            if p.is_file(): files.add(p)
        for directory in ('forge','profiles'):
            base=self.root/directory
            if base.is_dir():
                files.update(p for p in base.rglob('*') if p.is_file() and p.suffix in {'.py','.json','.md','.png'})
        if len(files)>1024 or sum(p.stat().st_size for p in files)>64*1024*1024:
            raise ValueError('backend fingerprint file limit exceeded')
        content=[(str(p.relative_to(self.root)),hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(files)]
        return digest({'adapter':'legacy-forge-make-v1','revision':self.revision,'artist':self.artist,'files':content})

    def command(self, request: ArtRequest, output: Path, profile: dict | None=None) -> list[str]:
        return [str(self.script),'make',compile_brief(request,profile),'-W',str(request.width),'-H',str(request.height),
                '-n','1','--rounds','0','--no-combine','--artist',self.artist,'--out',str(output.resolve())]

    def generate(self, request: ArtRequest, work: Path, profile: dict | None) -> Image.Image:
        help_log=work/'cli-help.log'
        _process([str(self.script),'make','--help'],self.root,help_log,min(15,self.timeout_s))
        help_text=help_log.read_text(encoding='utf-8',errors='replace')
        needed=['-W','-H','-n','--rounds','--no-combine','--artist','--out']
        missing=[s for s in needed if s not in help_text]
        if missing:
            raise RuntimeError('installed Forge CLI lacks required flags: '+', '.join(missing))
        output=work/'backend-output.png'
        _process(self.command(request,output,profile),self.root,work/'backend.log',self.timeout_s)
        if not output.is_file():
            raise RuntimeError('Forge did not produce the requested PNG; inspect backend.log')
        return load_rgba(output)
