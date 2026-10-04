"""Small regular-file snapshot helper for local export boundaries."""
import os
from pathlib import Path
import stat


def read_bounded(path, maximum):
    """Read one bounded regular-file snapshot without following a leaf symlink.

    O_NONBLOCK makes FIFO/device inspection nonblocking; fstat checks the opened
    descriptor before reading, avoiding a stat/read replacement race.
    """
    fd = os.open(Path(path), os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):
            raise ValueError('input must be a regular file')
        if info.st_size > maximum:
            raise ValueError(f'input exceeds {maximum} bytes')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            data = stream.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError(f'input exceeds {maximum} bytes')
        return data
    finally:
        os.close(fd)
