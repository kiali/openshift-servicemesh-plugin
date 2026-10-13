import os
import signal
import sys
import threading
import time
import unittest

from ossmc_tls_profile import spawn
from ossmc_tls_profile.spawn import EventLoop, ManagedGroup, Shutdown, child_env, run_bounded, sweep_orphans
from tests.helpers import sig_bit

PY = sys.executable


def alive(pid):
    """True if pid exists and is not a zombie."""
    try:
        with open(f"/proc/{pid}/stat") as f:
            state = f.read().rsplit(")", 1)[1].split()[0]
    except (OSError, IndexError):
        return False
    return state != "Z"


def wait_gone(pid, bound=3.0):
    end = time.monotonic() + bound
    while time.monotonic() < end:
        if not alive(pid):
            return True
        time.sleep(0.02)
    return False


class LoopTestCase(unittest.TestCase):
    def setUp(self):
        self.loop = EventLoop()
        self.loop.install()
        self.addCleanup(self.loop.uninstall)

    def run_child(self, code, deadline=5.0, stdout_cap=65536, stderr_cap=65536, argv=None):
        return run_bounded(
            self.loop,
            argv or [PY, "-I", "-c", code],
            env=child_env(),
            deadline=deadline,
            stdout_cap=stdout_cap,
            stderr_cap=stderr_cap,
        )


class BoundedRunnerTest(LoopTestCase):
    def test_normal_exit(self):
        r = self.run_child("import sys; print('out'); print('err', file=sys.stderr); sys.exit(3)")
        self.assertEqual((r.status, r.returncode, r.stdout, r.stderr), ("exited", 3, b"out\n", b"err\n"))

    def test_signal_death(self):
        r = self.run_child("import os, signal; os.kill(os.getpid(), signal.SIGKILL)")
        self.assertEqual((r.status, r.signal), ("signaled", signal.SIGKILL))
        self.assertFalse(r.completed)

    def test_deadline_kills_whole_group(self):
        code = (
            "import os, sys, time\n"
            "pid = os.fork()\n"
            "if pid == 0:\n    time.sleep(60); os._exit(0)\n"
            "print(pid, flush=True); time.sleep(60)\n"
        )
        start = time.monotonic()
        r = self.run_child(code, deadline=1.0)
        elapsed = time.monotonic() - start
        self.assertEqual(r.status, "timeout")
        self.assertGreaterEqual(elapsed, 1.0)
        self.assertLess(elapsed, 6.0)
        grandchild = int(r.stdout.split()[0])
        self.assertTrue(wait_gone(grandchild))
        self.assertTrue(wait_gone(r.pid))

    def test_stragglers_killed_after_normal_exit(self):
        code = "import os, time\npid = os.fork()\nif pid == 0:\n    time.sleep(60)\nelse:\n    print(pid)\n"
        r = self.run_child(code)
        self.assertEqual(r.returncode, 0)
        self.assertTrue(wait_gone(int(r.stdout.split()[0])))

    def test_stdout_cap(self):
        r = self.run_child(
            "import sys, time; sys.stdout.write('x' * 200000); sys.stdout.flush(); time.sleep(30)", stdout_cap=1000
        )
        self.assertEqual(r.status, "overflow")
        self.assertIn("stdout", r.detail)
        self.assertTrue(wait_gone(r.pid))

    def test_stderr_cap(self):
        r = self.run_child(
            "import sys, time; sys.stderr.write('x' * 5000); sys.stderr.flush(); time.sleep(30)", stderr_cap=100
        )
        self.assertEqual(r.status, "overflow")
        self.assertIn("stderr", r.detail)

    def test_spawn_error(self):
        r = self.run_child("", argv=["/nonexistent/binary"])
        self.assertEqual(r.status, "spawn-error")

    def test_own_session_and_signal_state(self):
        # exec'd grep reads its own status, so this sees exactly what posix_spawn set up,
        # even though this (Python) test process ignores SIGPIPE.
        r = self.run_child(
            "", argv=["/bin/sh", "-c", "exec grep -E '^(Sig(Blk|Ign)|NSsid|NSpgid|Pid):' /proc/self/status"]
        )
        fields = dict(line.split(":\t") for line in r.stdout.decode().splitlines())
        self.assertEqual(int(fields["SigBlk"], 16), 0)
        self.assertFalse(sig_bit(fields["SigIgn"], signal.SIGPIPE))
        self.assertFalse(sig_bit(fields["SigIgn"], signal.SIGXFSZ))
        self.assertEqual(fields["NSsid"], fields["Pid"])
        self.assertEqual(fields["NSpgid"], fields["Pid"])

    def test_stdin_is_dev_null(self):
        r = self.run_child("import sys; print(repr(sys.stdin.read()))")
        self.assertEqual(r.stdout, b"''\n")

    def test_shutdown_kills_child(self):
        timer = threading.Timer(0.3, os.kill, (os.getpid(), signal.SIGTERM))
        timer.start()
        self.addCleanup(timer.cancel)
        start = time.monotonic()
        with self.assertRaises(Shutdown):
            self.run_child("import time; print('started', flush=True); time.sleep(60)", deadline=30)
        self.assertLess(time.monotonic() - start, 3.0)

    def test_sigquit_is_a_termination_request(self):
        timer = threading.Timer(0.3, os.kill, (os.getpid(), signal.SIGQUIT))
        timer.start()
        self.addCleanup(timer.cancel)
        with self.assertRaises(Shutdown):
            self.run_child("import time; time.sleep(60)", deadline=30)

    def test_watcher_exception_kills_child(self):
        class Boom(Exception):
            pass

        def watcher():
            raise Boom()

        self.loop.watchers.append(watcher)
        with self.assertRaises(Boom):
            self.run_child("import time; time.sleep(60)", deadline=30)

    def test_child_env_strips_openssl_conf(self):
        env = child_env({"OPENSSL_CONF": "/x", "A": "b"})
        self.assertEqual(env, {"A": "b"})
        self.assertEqual(child_env({"A": "b"}, OPENSSL_CONF="/y")["OPENSSL_CONF"], "/y")


class ReaperIsolationTest(LoopTestCase):
    def test_runner_and_nginx_reaper_do_not_steal(self):
        managed = ManagedGroup.start(
            PY, [PY, "-I", "-c", "import time, sys; time.sleep(0.3); sys.exit(5)"], child_env()
        )
        self.addCleanup(lambda: managed.stop(self.loop, 0.5, 0.5, 2))
        r = self.run_child("import time, sys; time.sleep(1); sys.exit(7)")
        self.assertEqual(r.returncode, 7)
        end = time.monotonic() + 3
        while not managed.master_exited and time.monotonic() < end:
            time.sleep(0.02)
        self.assertEqual(managed.describe_exit(), "exit code 5")

    def test_nginx_reaper_ignores_runner_group(self):
        managed = ManagedGroup.start(PY, [PY, "-I", "-c", "import time; time.sleep(30)"], child_env())
        self.addCleanup(lambda: managed.stop(self.loop, 0.5, 0.5, 2))
        r = self.run_child("import sys; sys.exit(9)")
        managed.reap()
        self.assertEqual(r.returncode, 9)
        self.assertFalse(managed.master_exited)


WORKER_SCRIPT = r"""
import os, signal, sys, time
mode = sys.argv[1]
if mode in ("stubborn", "worker"):
    pid = os.fork()
    if pid == 0:
        signal.signal(signal.SIGQUIT, signal.SIG_IGN)
        if mode == "stubborn":
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
        print(os.getpid(), flush=True)
        while True:
            time.sleep(1)
if mode == "graceful":
    signal.signal(signal.SIGQUIT, lambda *a: sys.exit(0))
if mode == "stubborn":
    signal.signal(signal.SIGQUIT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
if mode == "worker":
    signal.signal(signal.SIGQUIT, lambda *a: os._exit(0))
while True:
    time.sleep(1)
"""


class ManagedGroupTest(LoopTestCase):
    def start(self, mode):
        r, w = os.pipe()
        pid = spawn.spawn(PY, [PY, "-I", "-c", WORKER_SCRIPT, mode], child_env(), stdout_fd=w)
        os.close(w)
        self.addCleanup(os.close, r)
        group = ManagedGroup(pid)
        self.addCleanup(self.kill_and_reap, group)
        return group, r

    def kill_and_reap(self, group):
        spawn._kill_group(group.pgid, signal.SIGKILL)
        end = time.monotonic() + 3
        while not group.master_exited and time.monotonic() < end:
            time.sleep(0.01)

    def read_worker(self, fd):
        data = b""
        end = time.monotonic() + 5
        while not data.endswith(b"\n") and time.monotonic() < end:
            data += os.read(fd, 64)
        return int(data)

    def test_graceful_quit(self):
        group, _ = self.start("graceful")
        time.sleep(0.3)
        start = time.monotonic()
        self.assertTrue(group.stop(self.loop, 2, 1, 5))
        self.assertLess(time.monotonic() - start, 2)

    def test_escalates_to_sigkill(self):
        group, fd = self.start("stubborn")
        worker = self.read_worker(fd)
        start = time.monotonic()
        self.assertTrue(group.stop(self.loop, 0.3, 0.3, 4))
        self.assertGreaterEqual(time.monotonic() - start, 0.6)
        self.assertTrue(wait_gone(worker))

    def test_worker_outliving_master_is_cleaned_up(self):
        group, fd = self.start("worker")
        worker = self.read_worker(fd)
        self.assertTrue(group.stop(self.loop, 0.5, 1, 4))
        self.assertTrue(group.master_exited)
        self.assertFalse(alive(worker))

    def test_cleanup_failure_reported(self):
        group, _ = self.start("stubborn")
        time.sleep(0.2)
        # The total bound expires before SIGKILL can take effect.
        self.assertFalse(group.stop(self.loop, 0.2, 0.2, 0.3))


class OrphanSweepTest(unittest.TestCase):
    def zombie(self):
        pid = spawn.spawn("/bin/true", ["true"], child_env())
        end = time.monotonic() + 3
        while alive(pid) and time.monotonic() < end:
            time.sleep(0.01)
        return pid

    def test_untracked_zombie_reaped(self):
        pid = self.zombie()
        self.assertIn(pid, sweep_orphans([]))
        self.assertFalse(os.path.exists(f"/proc/{pid}"))

    def test_tracked_group_left_alone(self):
        pid = self.zombie()
        self.assertNotIn(pid, sweep_orphans([pid]))
        self.assertEqual(os.waitpid(pid, 0)[0], pid)


if __name__ == "__main__":
    unittest.main()
