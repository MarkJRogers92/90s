"""Content-addressed review jobs; no automatic retry of failed/uncertain work."""
from __future__ import annotations
from contextlib import contextmanager
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from typing import Sequence
import hashlib
import json
import math
import os
import time
import uuid
import numpy as np
import PIL
from . import __version__
from .backends import Backend
from .briefs import ArtRequest, digest, learn_style
from .pixels import MAX_FILE_BYTES, FinishOptions, decode_rgba, finish, inspect, review_sheet, integer


class UncertainJobError(RuntimeError):
    """A prior job may have consumed a provider call. Human reconciliation needed."""


class CachedArtifactError(RuntimeError):
    """An existing result failed integrity verification. Never auto-regenerate."""


@dataclass(frozen=True)
class Result:
    key: str
    path: Path
    cached: bool
    elapsed_s: float


def _json_write(path: Path, value: dict) -> None:
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    with temp.open('x',encoding='utf-8') as f:
        json.dump(value,f,sort_keys=True,indent=2,allow_nan=False);f.flush();os.fsync(f.fileno())
    os.replace(temp,path)
    # Persist the directory entry too on POSIX. File-system durability still
    # depends on the host; incomplete jobs never auto-retry after a crash.
    fd=os.open(path.parent,os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@contextmanager
def _lock(path: Path, timeout: float):
    if os.name!='posix': raise RuntimeError('cross-process job locks require macOS/Linux')
    import fcntl
    start=time.monotonic()
    with path.open('a+b') as file:
        while True:
            try:
                fcntl.flock(file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);break
            except BlockingIOError:
                if time.monotonic()-start>=timeout:
                    raise TimeoutError('another worker owns this job; no duplicate generation started')
                time.sleep(.02)
        try: yield
        finally: fcntl.flock(file.fileno(),fcntl.LOCK_UN)


class JobStore:
    def __init__(self, root: str | Path, *, lock_timeout_s: float=240):
        if isinstance(lock_timeout_s,bool) or not isinstance(lock_timeout_s,(int,float)) or not math.isfinite(lock_timeout_s) or not .01<=lock_timeout_s<=7200:
            raise ValueError('invalid lock timeout')
        self.root=Path(root).expanduser().resolve(); self.lock_timeout_s=lock_timeout_s

    def run(self, request: ArtRequest, backend: Backend, *, options: FinishOptions | None=None) -> Result:
        started=time.monotonic();options=options or FinishOptions()
        reference_bytes=[]
        for name in request.references:
            p=Path(name).expanduser()
            if p.stat().st_size>MAX_FILE_BYTES: raise ValueError('reference byte limit exceeded')
            data=p.read_bytes();decode_rgba(data);reference_bytes.append(data)
        if sum(len(b) for b in reference_bytes)>64*1024*1024:
            raise ValueError('total reference byte limit exceeded')
        ref_hashes=[hashlib.sha256(b).hexdigest() for b in reference_bytes]
        req_data=asdict(request);req_data.pop('references')
        identity=backend.identity
        if not isinstance(identity,str) or not 1<=len(identity)<=4096:
            raise ValueError('backend must provide a stable versioned identity')
        payload={'request':req_data,'reference_sha256':ref_hashes,'finish':asdict(options),
                 'backend':identity,'engine':__version__,'pillow':PIL.__version__,'numpy':np.__version__}
        key=digest(payload);path=self.root/key
        self.root.mkdir(parents=True,exist_ok=True);(self.root/'.locks').mkdir(exist_ok=True)
        with _lock(self.root/'.locks'/f'{key}.lock',self.lock_timeout_s):
            if path.exists():
                self._verify(path,key)
                return Result(key,path,True,time.monotonic()-started)
            path.mkdir();work=path/'work';work.mkdir();refs=path/'references';refs.mkdir()
            state={'key':key,'state':'running','review_status':'REVIEW_ONLY',
                   'created_utc':datetime.now(timezone.utc).isoformat(),'inputs':payload}
            _json_write(path/'job.json',state)
            try:
                snapshots=[]
                for i,data in enumerate(reference_bytes):
                    p=refs/f'ref-{i}.png'
                    with p.open('xb') as file: file.write(data)
                    snapshots.append(p)
                frozen=replace(request,references=tuple(str(p) for p in snapshots))
                profile=learn_style(snapshots) if snapshots else None
                raw=backend.generate(frozen,work,profile)
                if not isinstance(raw,PIL.Image.Image): raise ValueError('backend must return a PIL image')
                raw=raw.convert('RGBA')
                # Validate bounds before saving; retain source image even if finishing fails.
                from .pixels import dimensions
                dimensions(raw.size)
                with (path/'raw.png').open('xb') as file: raw.save(file,format='PNG')
                if [_sha(p) for p in snapshots]!=ref_hashes:
                    raise ValueError('backend changed an immutable reference snapshot')
                output=finish(raw,options)
                if output.size!=(request.width,request.height):
                    raise ValueError('backend/output dimensions differ from the requested native canvas')
                with (path/'sprite.png').open('xb') as file: output.save(file,format='PNG')
                report=inspect(output,kind=request.kind);_json_write(path/'qa.json',report)
                if report['errors']: raise ValueError('mechanical check failed: '+','.join(report['errors']))
                with (path/'review.png').open('xb') as file: review_sheet(output).save(file,format='PNG')
                names=['raw.png','sprite.png','review.png','qa.json']+[str(p.relative_to(path)) for p in snapshots]
                names += list(getattr(backend, 'cache_artifacts', ()))
                for name in names:
                    artifact = path/name
                    if not artifact.resolve().is_relative_to(path.resolve()) or artifact.is_symlink():
                        raise ValueError('backend artifact must remain inside the job')
                state.update(state='succeeded',artifacts={n:_sha(path/n) for n in names},
                             elapsed_s=time.monotonic()-started,backend_invocations=1,
                             model_calls='not measured; a backend invocation may make multiple model calls')
                _json_write(path/'job.json',state)
                return Result(key,path,False,time.monotonic()-started)
            except BaseException as error:
                state.update(state='failed',error_type=type(error).__name__,error=str(error)[:2000],
                             retry_policy='never automatic; inspect existing work before an explicit new revision')
                _json_write(path/'job.json',state)
                raise

    def _verify(self,path:Path,key:str) -> None:
        state_file=path/'job.json'
        if not state_file.is_file():
            raise UncertainJobError(f'incomplete prior job: {path}; inspect before a new revision')
        try:
            if state_file.stat().st_size>2_000_000: raise ValueError('job metadata too large')
            state=json.loads(state_file.read_text(encoding='utf-8'))
        except (ValueError,OSError) as e:
            raise CachedArtifactError(f'cannot read job metadata: {path}') from e
        if state.get('state')!='succeeded':
            raise UncertainJobError(f'prior {state.get("state","unknown")} job: {path}; never auto-retried')
        required={'raw.png','sprite.png','review.png','qa.json'}
        artifacts=state.get('artifacts',{})
        if state.get('key')!=key or not required.issubset(artifacts):
            raise CachedArtifactError(f'incomplete cache manifest: {path}')
        for name,expected in artifacts.items():
            p=path/name
            if not p.resolve().is_relative_to(path.resolve()) or p.is_symlink() or not p.is_file() or _sha(p)!=expected:
                raise CachedArtifactError(f'cached artifact changed: {p}; no provider call started')

    def run_many(self,requests:Sequence[ArtRequest],backend:Backend,*,max_workers:int=1,
                 options:FinishOptions|None=None) -> list[Result]:
        """Independent state/asset jobs, ordered results; 1 worker by default.

        Opt into 2..4 only after verifying the installed backend is concurrency-safe.
        A batch failure cannot cancel calls already submitted by other workers.
        """
        integer(max_workers,'max_workers',1,4)
        if not 1<=len(requests)<=128: raise ValueError('batch requires 1..128 jobs')
        # A bounded frontier, not eager map(): after an error, do not start
        # additional provider jobs that happened to be queued already.
        results = [None] * len(requests)
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            pending = {}
            next_index = 0
            def submit_one():
                nonlocal next_index
                index = next_index; next_index += 1
                pending[pool.submit(self.run, requests[index], backend, options=options)] = index
            for _ in range(min(max_workers, len(requests))): submit_one()
            while pending:
                done, _ = wait(pending, return_when=FIRST_COMPLETED)
                try:
                    # Check every completed job before scheduling any new work.
                    for future in done:
                        results[pending[future]] = future.result()
                except BaseException:
                    for future in pending: future.cancel()
                    raise
                for future in done: pending.pop(future)
                while len(pending) < max_workers and next_index < len(requests): submit_one()
        return results
