"""Process primitives for a PID-1 supervisor.

Rules (see the plugin README, "Process model"):

- Every child is started with os.posix_spawn in its own session and process
  group, with SIGPIPE/SIGXFSZ reset to their defaults and an empty signal mask.
- The subprocess module is never used: it calls waitpid(pid) on its own and
  could steal an exit status from the reapers here.
- Each process group has exactly one waiter. Bounded children are reaped by
  run_bounded, the managed nginx group only by ManagedGroup, and stray orphans
  only by sweep_orphans, by explicit PID.
- The supervisor blocks only in select (EventLoop.wait).
"""

from __future__ import annotations

import errno
import os
import select
import signal
import time
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Sequence


class Shutdown(Exception):
    """SIGTERM, SIGINT or SIGQUIT was received."""


# The base image declares STOPSIGNAL SIGQUIT and container runtimes honor it,
# so SIGQUIT must stop the supervisor gracefully too (as PID 1 it would otherwise be ignored).
TERMINATION_SIGNALS = (signal.SIGTERM, signal.SIGINT, signal.SIGQUIT)


class EventLoop:
    """Signal flags plus a wakeup pipe, so select returns as soon as a signal lands."""

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self.clock = clock
        self.term_requested = False
        self.watchers: List[Callable[[], None]] = []
        self._rfd: Optional[int] = None
        self._wfd: Optional[int] = None
        self._old_handlers: Dict[int, object] = {}
        self._old_wakeup = -1

    def install(self) -> None:
        # The wakeup pipe turns signals into readable bytes: the C-level handler writes
        # one byte per signal, so select returns immediately instead of sleeping to its
        # timeout while a Python-level handler waits to run.
        self._rfd, self._wfd = os.pipe()
        os.set_blocking(self._rfd, False)
        os.set_blocking(self._wfd, False)
        self._old_wakeup = signal.set_wakeup_fd(self._wfd, warn_on_full_buffer=False)
        for signum in (*TERMINATION_SIGNALS, signal.SIGCHLD):
            self._old_handlers[signum] = signal.signal(signum, self._handle)

    def uninstall(self) -> None:
        for signum, handler in self._old_handlers.items():
            signal.signal(signum, handler)
        self._old_handlers.clear()
        signal.set_wakeup_fd(self._old_wakeup)
        for fd in (self._rfd, self._wfd):
            if fd is not None:
                os.close(fd)
        self._rfd = self._wfd = None

    def _handle(self, signum: int, _frame: object) -> None:
        if signum in TERMINATION_SIGNALS:
            self.term_requested = True

    def wait(self, fds: Sequence[int], timeout: Optional[float]) -> List[int]:
        """Block in select until a signal, a readable fd, or the timeout."""
        rlist = list(fds)
        if self._rfd is not None:
            rlist.append(self._rfd)
        if timeout is not None and timeout < 0:
            timeout = 0
        ready, _, _ = select.select(rlist, [], [], timeout)
        if self._rfd is not None and self._rfd in ready:
            # Drain the wakeup bytes so a stale signal cannot wake the next select.
            try:
                while os.read(self._rfd, 512):
                    pass
            except (BlockingIOError, InterruptedError):
                pass
        return [fd for fd in ready if fd != self._rfd]

    def check(self) -> None:
        """Raise Shutdown if requested, then run the watchers (which may raise)."""
        if self.term_requested:
            raise Shutdown()
        for watcher in list(self.watchers):
            watcher()

    def sleep(self, seconds: float) -> None:
        """Wait without servicing watchers or shutdown (used while cleaning up)."""
        end = self.clock() + seconds
        while True:
            remaining = end - self.clock()
            if remaining <= 0:
                return
            self.wait([], remaining)

    def sleep_until(self, deadline: float) -> None:
        """Wait until the deadline, servicing shutdown and watchers on every wakeup."""
        while True:
            self.check()
            remaining = deadline - self.clock()
            if remaining <= 0:
                return
            self.wait([], min(remaining, 1.0))


def spawn(
    path: str,
    argv: Sequence[str],
    env: Dict[str, str],
    stdout_fd: Optional[int] = None,
    stderr_fd: Optional[int] = None,
) -> int:
    """Start a child in a new session and process group (pgid == pid).

    stdin is always /dev/null. stdout/stderr are inherited unless fds are given.
    """
    file_actions: List[tuple] = [(os.POSIX_SPAWN_OPEN, 0, os.devnull, os.O_RDONLY, 0)]
    if stdout_fd is not None:
        file_actions.append((os.POSIX_SPAWN_DUP2, stdout_fd, 1))
    if stderr_fd is not None:
        file_actions.append((os.POSIX_SPAWN_DUP2, stderr_fd, 2))
    return os.posix_spawn(
        path,
        list(argv),
        env,
        file_actions=file_actions,
        setsid=True,
        setsigdef=(signal.SIGPIPE, signal.SIGXFSZ),
        setsigmask=(),
    )


def child_env(base: Optional[Dict[str, str]] = None, **extra: str) -> Dict[str, str]:
    """Copy the environment without OPENSSL_CONF, then apply extra variables."""
    env = dict(os.environ if base is None else base)
    env.pop("OPENSSL_CONF", None)
    env.update(extra)
    return env


@dataclass
class RunResult:
    # "exited", "signaled", "timeout", "overflow" or "spawn-error"
    status: str
    returncode: Optional[int] = None
    signal: Optional[int] = None
    stdout: bytes = b""
    stderr: bytes = b""
    elapsed: float = 0.0
    pid: Optional[int] = None
    detail: str = ""

    @property
    def completed(self) -> bool:
        """True when the child ran to its own exit (any exit code)."""
        return self.status == "exited"

    def describe(self) -> str:
        if self.status == "exited":
            return f"exit code {self.returncode}"
        if self.status == "signaled":
            return f"killed by signal {self.signal}"
        if self.status == "timeout":
            return f"wall-clock deadline exceeded after {self.elapsed:.1f}s"
        if self.status == "overflow":
            return f"output cap exceeded ({self.detail})"
        return f"failed to start: {self.detail}"


REAP_BOUND = 1.0


def _kill_group(pgid: int, signum: int) -> None:
    try:
        os.killpg(pgid, signum)
    except (ProcessLookupError, PermissionError):
        pass


def _reap_group(loop: EventLoop, pid: int, bound: float = REAP_BOUND) -> Optional[int]:
    """Reap pid, then every remaining child in its process group, bounded in time.

    Returns the wait status of pid, or None if it could not be reaped in time.
    """
    status: Optional[int] = None
    end = loop.clock() + bound
    # The leader first: while it is unreaped its pgid stays valid, so waitpid(-pid)
    # below can only ever match this group's members.
    while status is None:
        try:
            wpid, wstatus = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            break
        if wpid == pid:
            status = wstatus
            break
        if loop.clock() >= end:
            return None
        loop.wait([], 0.01)
    # Then any remaining group members (for example orphaned workers), still bounded
    # by the same deadline; anything not reaped in time is left for sweep_orphans.
    while True:
        try:
            wpid, _ = os.waitpid(-pid, os.WNOHANG)
        except ChildProcessError:
            break
        if wpid == 0:
            if loop.clock() >= end:
                break
            loop.wait([], 0.01)
    return status


def run_bounded(
    loop: EventLoop,
    argv: Sequence[str],
    *,
    env: Dict[str, str],
    deadline: float,
    stdout_cap: int,
    stderr_cap: int,
) -> RunResult:
    """Run argv to completion under a wall-clock deadline and output caps.

    The child's whole process group is SIGKILLed on any abnormal finish and
    always reaped before returning. loop.check() runs on every wakeup, so
    Shutdown (or a watcher's exception) propagates after the child is killed.
    """
    start = loop.clock()
    out_r, out_w = os.pipe()
    err_r, err_w = os.pipe()
    try:
        pid = spawn(argv[0], argv, env, stdout_fd=out_w, stderr_fd=err_w)
    except OSError as exc:
        for fd in (out_r, out_w, err_r, err_w):
            os.close(fd)
        return RunResult("spawn-error", detail=f"{argv[0]}: {exc.strerror or exc}")
    # The parent's copies of the write ends must go, or EOF on the read ends could
    # never be observed.
    os.close(out_w)
    os.close(err_w)
    os.set_blocking(out_r, False)
    os.set_blocking(err_r, False)

    bufs = {out_r: bytearray(), err_r: bytearray()}
    caps = {out_r: stdout_cap, err_r: stderr_cap}
    names = {out_r: "stdout", err_r: "stderr"}
    open_fds = [out_r, err_r]
    result: Optional[RunResult] = None
    finished = False

    def drain(fd: int) -> Optional[str]:
        while True:
            try:
                chunk = os.read(fd, 65536)
            except (BlockingIOError, InterruptedError):
                return None
            if not chunk:
                open_fds.remove(fd)
                return None
            bufs[fd] += chunk
            if len(bufs[fd]) > caps[fd]:
                return f"{names[fd]} exceeded {caps[fd]} bytes"

    try:
        while True:
            for fd in list(open_fds):
                overflow = drain(fd)
                if overflow:
                    result = RunResult("overflow", detail=overflow)
                    break
            if result is not None:
                break
            # WNOWAIT peeks without reaping: the leader stays a (waitable) zombie, which
            # keeps the pgid owned and un-reusable until the group is killed in the
            # finally block below.
            exited = os.waitid(os.P_PID, pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
            if exited is not None:
                for fd in list(open_fds):
                    overflow = drain(fd)
                    if overflow:
                        result = RunResult("overflow", detail=overflow)
                        break
                if result is None:
                    result = RunResult("exited")
                break
            remaining = start + deadline - loop.clock()
            if remaining <= 0:
                result = RunResult("timeout")
                break
            loop.wait(open_fds, min(remaining, 0.5))
            # Shutdown or a watcher exception propagates only after the finally block
            # has killed and reaped the child.
            loop.check()
        finished = True
    finally:
        # Kill stragglers (and the child itself unless it exited on its own)
        # while the leader is unreaped, so the pgid cannot have been reused.
        _kill_group(pid, signal.SIGKILL)
        status = _reap_group(loop, pid)
        for fd in (out_r, err_r):
            os.close(fd)

    assert finished and result is not None
    result.pid = pid
    result.elapsed = loop.clock() - start
    result.stdout = bytes(bufs[out_r])
    result.stderr = bytes(bufs[err_r])
    if result.status == "exited" and status is not None:
        if os.WIFSIGNALED(status):
            result.status = "signaled"
            result.signal = os.WTERMSIG(status)
        else:
            result.returncode = os.waitstatus_to_exitcode(status)
    elif result.status == "exited":
        result.status = "signaled"
        result.detail = "exit status was not collected"
    return result


class ManagedGroup:
    """A long-running child (nginx) whose whole process group we own.

    Only this class waits on the group, and only with waitpid(-pgid). Workers
    orphaned by a dead master reparent to PID 1 but keep the pgid, so they are
    collected here too.
    """

    def __init__(self, pid: int):
        self.pid = pid
        self.pgid = pid
        self.master_status: Optional[int] = None

    @classmethod
    def start(cls, path: str, argv: Sequence[str], env: Dict[str, str]) -> ManagedGroup:
        return cls(spawn(path, argv, env))

    def reap(self) -> None:
        while True:
            try:
                wpid, status = os.waitpid(-self.pgid, os.WNOHANG)
            except ChildProcessError:
                return
            if wpid == 0:
                return
            if wpid == self.pid:
                self.master_status = status

    @property
    def master_exited(self) -> bool:
        self.reap()
        return self.master_status is not None

    def empty(self) -> bool:
        # Empty means: master reaped AND no member left in the group. killpg(pgid, 0)
        # probes for any remaining member (a live worker keeps the group alive).
        self.reap()
        if self.master_status is None:
            return False
        try:
            os.killpg(self.pgid, 0)
        except ProcessLookupError:
            return True
        except PermissionError:
            return False
        return False

    def _wait_empty(self, loop: EventLoop, until: float) -> bool:
        while True:
            if self.empty():
                return True
            if loop.clock() >= until:
                return False
            loop.wait([], min(0.05, max(0.0, until - loop.clock())))

    def stop(
        self,
        loop: EventLoop,
        quit_wait: float = 5.0,
        term_wait: float = 2.0,
        total: float = 10.0,
    ) -> bool:
        """SIGQUIT the master, then SIGTERM and SIGKILL the group. True once empty."""
        start = loop.clock()
        if not self.master_exited:
            try:
                os.kill(self.pid, signal.SIGQUIT)
            except ProcessLookupError:
                pass
        if self._wait_empty(loop, start + quit_wait):
            return True
        _kill_group(self.pgid, signal.SIGTERM)
        if self._wait_empty(loop, start + quit_wait + term_wait):
            return True
        _kill_group(self.pgid, signal.SIGKILL)
        return self._wait_empty(loop, start + total)

    def describe_exit(self) -> str:
        status = self.master_status
        if status is None:
            return "running"
        if os.WIFSIGNALED(status):
            return f"killed by signal {os.WTERMSIG(status)}"
        return f"exit code {os.waitstatus_to_exitcode(status)}"


def _parse_stat(text: str) -> Optional[tuple]:
    # /proc/<pid>/stat: "pid (comm) state ppid pgrp ..."; comm may contain spaces/parens.
    close = text.rfind(")")
    if close < 0:
        return None
    fields = text[close + 2 :].split()
    if len(fields) < 3:
        return None
    try:
        return fields[0], int(fields[1]), int(fields[2])
    except ValueError:
        return None


def sweep_orphans(tracked_pgids: Iterable[int], proc: str = "/proc") -> List[int]:
    """Reap zombie children of this process that belong to no tracked group.

    Children SIGKILLed past _reap_group's bound still become zombies of PID 1; this
    finds them in /proc and waits on each by explicit PID, which cannot race the
    other waiters (they only ever wait by pgid or on their own leader).
    """
    me = os.getpid()
    tracked = set(tracked_pgids)
    reaped: List[int] = []
    try:
        entries = os.listdir(proc)
    except OSError:
        return reaped
    for entry in entries:
        if not entry.isdigit():
            continue
        try:
            with open(os.path.join(proc, entry, "stat")) as f:
                parsed = _parse_stat(f.read())
        except OSError:
            continue
        if parsed is None:
            continue
        state, ppid, pgrp = parsed
        if state != "Z" or ppid != me or pgrp in tracked:
            continue
        pid = int(entry)
        try:
            wpid, _ = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            continue
        except OSError as exc:
            if exc.errno == errno.ECHILD:
                continue
            raise
        if wpid == pid:
            reaped.append(pid)
    return reaped
