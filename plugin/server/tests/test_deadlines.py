"""The fetch child's wall-clock deadline, with real sockets and real timing.

Each fixture keeps the read alive by trickling a byte every ~0.5 s, which a
per-operation socket timeout alone would never stop. The supervisor-level
SIGTERM cases live in test_supervisor_process.SlowApiTest.
"""

import json
import os
import shutil
import tempfile
import time
import unittest

from ossmc_tls_profile.spawn import EventLoop, child_env, run_bounded
from tests.harness import HTTPSFixture, fetch_child_argv
from tests.helpers import Certs, apiserver_json

DEADLINE = 2.0
# Generous: only distinguishes "bounded" from "ran for the whole trickle" (minutes).
UPPER = DEADLINE + 5.0


def alive(pid):
    try:
        with open(f"/proc/{pid}/stat") as f:
            return f.read().rsplit(")", 1)[1].split()[0] != "Z"
    except (OSError, IndexError):
        return False


class DeadlineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="ossmc-deadline-")
        cls.ca = Certs(cls.tmp)
        cls.cert = cls.ca.issue("api")
        cls.token = os.path.join(cls.tmp, "token")
        with open(cls.token, "w") as f:
            f.write("t")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, True)

    def setUp(self):
        self.loop = EventLoop()
        self.loop.install()
        self.addCleanup(self.loop.uninstall)
        self.ticks = 0

        def tick():
            self.ticks += 1

        self.loop.watchers.append(tick)
        self.api = HTTPSFixture(*self.cert)
        self.addCleanup(self.api.close)
        self.api.body = apiserver_json({"type": "Modern"})

    def run_fetch(self):
        env = child_env(KUBERNETES_SERVICE_HOST="127.0.0.1", KUBERNETES_SERVICE_PORT=str(self.api.port))
        start = time.monotonic()
        result = run_bounded(
            self.loop,
            fetch_child_argv(self.token, self.ca.ca_crt) + ["fetch"],
            env=env,
            deadline=DEADLINE,
            stdout_cap=2 * 1024 * 1024,
            stderr_cap=64 * 1024,
        )
        return result, time.monotonic() - start

    def check_deadline(self, mode):
        self.api.mode = mode
        result, elapsed = self.run_fetch()
        self.assertEqual(result.status, "timeout", result)
        self.assertGreaterEqual(elapsed, DEADLINE)
        self.assertLess(elapsed, UPPER)
        self.assertFalse(alive(result.pid))
        # The loop kept servicing its watchers while the read was stuck.
        self.assertGreaterEqual(self.ticks, 3)

    def test_control_fast_read(self):
        result, elapsed = self.run_fetch()
        self.assertTrue(json.loads(result.stdout)["ok"])
        self.assertLess(elapsed, DEADLINE)

    def test_slow_headers(self):
        self.check_deadline("slow-headers")

    def test_slow_body(self):
        self.check_deadline("slow-body")

    def test_stalled_handshake(self):
        self.check_deadline("stall")


if __name__ == "__main__":
    unittest.main()
