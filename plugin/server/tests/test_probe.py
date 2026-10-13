import json
import os
import socket
import subprocess
import sys
import unittest

from ossmc_tls_profile import probe
from tests.helpers import SERVER_DIR, TempDirTestCase


class ProbeTest(TempDirTestCase):
    def setUp(self):
        super().setUp()
        self.state = os.path.join(self.tmp, "state")
        self.listener = socket.socket()
        self.listener.bind(("127.0.0.1", 0))
        self.listener.listen(4)
        self.addCleanup(self.listener.close)
        self.port = self.listener.getsockname()[1]

    def write(self, **state):
        with open(self.state, "w") as f:
            json.dump(state, f)

    def check(self, port=None):
        return probe.probe(self.state, "127.0.0.1", port or self.port)

    def test_ready(self):
        self.write(ready=True, pid=os.getpid(), generation=1)
        self.assertEqual(self.check(), "")

    def test_missing_state(self):
        self.assertIn("no readable state", self.check())

    def test_not_ready(self):
        self.write(ready=False, pid=os.getpid(), generation=1)
        self.assertIn("not ready", self.check())

    def test_dead_supervisor(self):
        child = subprocess.Popen([sys.executable, "-c", "pass"])
        child.wait()
        self.write(ready=True, pid=child.pid, generation=1)
        self.assertIn("not running", self.check())

    def test_no_listener(self):
        self.write(ready=True, pid=os.getpid(), generation=1)
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            closed_port = s.getsockname()[1]
        self.assertIn("cannot connect", self.check(closed_port))

    def test_probe_imports_stay_minimal(self):
        code = (
            f"import sys; sys.path.insert(0, {SERVER_DIR!r}); sys.argv = ['x', 'probe']\n"
            "from ossmc_tls_profile import __main__ as m\n"
            "try:\n    m.main()\nexcept SystemExit:\n    pass\n"
            "heavy = ('ssl', 'ossmc_tls_profile.resolve', 'ossmc_tls_profile.supervisor')\n"
            "bad = [n for n in heavy if n in sys.modules]\n"
            "print('IMPORTED=' + ','.join(bad))\n"
        )
        out = subprocess.run([sys.executable, "-I", "-B", "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual(out.stdout.strip().splitlines()[-1], "IMPORTED=")


if __name__ == "__main__":
    unittest.main()
