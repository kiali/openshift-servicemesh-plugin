"""The real supervisor (RealPlatform, bounded runner, managed group) in its own process.

nginx, nginx -T and openssl are replaced by small fixture scripts so this runs
anywhere; test_selfcheck.py and the container tests cover the real nginx.
"""

import glob
import hashlib
import json
import os
import shutil
import signal
import socket
import ssl
import tempfile
import time
import unittest

from ossmc_tls_profile import clientconf, paths
from tests.harness import HTTPSFixture, SupervisorProcess, fetch_child_argv
from tests.helpers import FIXTURES, Certs, apiserver_json

SYSTEM_CNF_OK = clientconf.check_contract() is None
requires_crypto_policy = unittest.skipUnless(
    SYSTEM_CNF_OK, f"{paths.SYSTEM_OPENSSL_CNF} lacks the RHEL crypto_policy contract"
)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def alive(pid):
    try:
        with open(f"/proc/{pid}/stat") as f:
            return f.read().rsplit(")", 1)[1].split()[0] != "Z"
    except (OSError, IndexError):
        return False


def peer_cert_digest(port):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection(("127.0.0.1", port), timeout=3) as sock:
        with ctx.wrap_socket(sock) as tls:
            return hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()


def file_digest(path):
    with open(path) as f:
        return hashlib.sha256(ssl.PEM_cert_to_DER_cert(f.read())).hexdigest()


@requires_crypto_policy
class SupervisorProcessTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.certdir = tempfile.mkdtemp(prefix="ossmc-sup-certs-")
        cls.ca = Certs(cls.certdir)
        cls.api_cert = cls.ca.issue("api")
        cls.serving_a = cls.ca.issue("serving-a")
        cls.serving_b = cls.ca.issue("serving-b")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.certdir, True)

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ossmc-sup-")
        os.chmod(self.tmp, 0o755)
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.control = os.path.join(self.tmp, "control")
        self.state_dir = os.path.join(self.tmp, "ossmc")
        os.makedirs(self.control)
        self.token = os.path.join(self.tmp, "token")
        with open(self.token, "w") as f:
            f.write("test-token")
        self.cert = os.path.join(self.tmp, "tls.crt")
        self.key = os.path.join(self.tmp, "tls.key")
        self.install_serving(self.serving_a)
        fips = os.path.join(self.tmp, "fips")
        with open(fips, "w") as f:
            f.write("0\n")
        self.api = HTTPSFixture(*self.api_cert)
        self.addCleanup(self.api.close)
        self.api.body = apiserver_json({"type": "Modern"})
        self.port = free_port()
        self.settings = {
            "state_dir": self.state_dir,
            "helper_argv": fetch_child_argv(self.token, self.ca.ca_crt, self.control),
            "nginx": os.path.join(FIXTURES, "fake_nginx_t.py"),
            "nginx_conf": "/etc/nginx/nginx.conf",
            "nginx_argv": [os.path.join(FIXTURES, "fake_nginx.py")],
            "openssl": os.path.join(FIXTURES, "fake_openssl.py"),
            "fips_path": fips,
            "serving_cert": self.cert,
            "serving_key": self.key,
            "listen_port": self.port,
            "read_interval": 1.0,
            "read_deadline": 3.0,
            "backoff_initial": 0.2,
            "backoff_max": 1.0,
            "nginx_t_deadline": 2.0,
            "selfcheck_deadline": 5.0,
            "listener_wait": 2.0,
        }
        self.env = dict(
            os.environ,
            KUBERNETES_SERVICE_HOST="127.0.0.1",
            KUBERNETES_SERVICE_PORT=str(self.api.port),
            FAKE_CONTROL=self.control,
            FAKE_PORT=str(self.port),
            FAKE_CERT=self.cert,
            FAKE_KEY=self.key,
            FAKE_TLS_CONF=os.path.join(self.state_dir, "tls.conf"),
        )
        self.env.pop("OPENSSL_CONF", None)

    def install_serving(self, pair):
        for src, dst in zip(pair, (self.cert, self.key)):
            shutil.copyfile(src, dst + ".tmp")
            os.replace(dst + ".tmp", dst)

    def control_file(self, name, content):
        with open(os.path.join(self.control, name), "w") as f:
            f.write(content)

    def start(self, **overrides):
        settings = dict(self.settings, **overrides)
        sup = SupervisorProcess(self.tmp, settings, self.env)
        self.addCleanup(sup.stop)
        return sup

    def nginx_starts(self):
        records = []
        for path in glob.glob(os.path.join(self.control, "nginx-start-*.json")):
            with open(path) as f:
                records.append(json.load(f))
        return sorted(
            records, key=lambda r: os.path.getmtime(os.path.join(self.control, f"nginx-start-{r['pid']}.json"))
        )

    def env_records(self, name):
        path = os.path.join(self.control, f"env-{name}")
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return [json.loads(line)["OPENSSL_CONF"] for line in f if line.strip()]

    def tls_conf(self):
        with open(os.path.join(self.state_dir, "tls.conf")) as f:
            return f.read()

    def listening(self):
        try:
            with socket.create_connection(("127.0.0.1", self.port), timeout=0.5):
                return True
        except OSError:
            return False


class HappyPathTest(SupervisorProcessTestCase):
    def test_applies_policy_and_isolates_children(self):
        sup = self.start()
        sup.wait_log("policy applied")
        sup.wait_ready()
        self.assertIn("ssl_protocols TLSv1.3;", self.tls_conf())
        starts = self.nginx_starts()
        self.assertEqual(len(starts), 1)
        nginx = starts[0]
        self.assertEqual(int(nginx["SigBlk"], 16), 0)
        self.assertEqual((nginx["pgid"], nginx["sid"]), (nginx["pid"], nginx["pid"]))
        self.assertIsNone(nginx["OPENSSL_CONF"])
        self.assertTrue(self.env_records("fetch"))
        self.assertEqual(set(self.env_records("fetch")), {os.path.join(self.state_dir, "openssl-client.cnf")})
        self.assertEqual(set(self.env_records("self-check")), {os.path.join(self.state_dir, "openssl-selfcheck.cnf")})
        self.assertEqual(set(self.env_records("nginx-t")), {None})
        self.assertEqual(set(self.env_records("openssl")), {None})
        self.assertEqual(os.stat(self.state_dir).st_mode & 0o777, 0o700)

    def test_profile_change_replaces_nginx_in_place(self):
        sup = self.start()
        sup.wait_ready()
        first = self.nginx_starts()[0]
        time.sleep(2.5)  # several unchanged polls
        self.assertEqual(len(self.nginx_starts()), 1, "an unchanged policy must not replace nginx")
        changed = time.monotonic()
        self.api.body = apiserver_json({"type": "Intermediate"})
        sup.wait_log("policy applied", count=2, timeout=15)
        # Shortened bound: read_interval (1s) + read_deadline (3s) + apply time.
        self.assertLess(time.monotonic() - changed, 10)
        self.assertIn("ssl_protocols TLSv1.2 TLSv1.3;", self.tls_conf())
        starts = self.nginx_starts()
        self.assertEqual(len(starts), 2)
        self.assertFalse(alive(first["pid"]))
        self.assertFalse(alive(first["worker"]))
        self.assertIsNone(sup.proc.poll(), "the supervisor (container) must keep running")

    def test_sigterm_stops_nginx_promptly(self):
        sup = self.start()
        sup.wait_ready()
        nginx = self.nginx_starts()[0]
        elapsed = sup.stop()
        self.assertEqual(sup.proc.returncode, 0)
        self.assertLess(elapsed, 10)
        self.assertFalse(alive(nginx["pid"]))
        self.assertFalse(alive(nginx["worker"]))
        self.assertFalse(sup.state()["ready"])

    def test_sigquit_stops_like_sigterm(self):
        """The base image's STOPSIGNAL is SIGQUIT, which runtimes send on container stop."""
        sup = self.start()
        sup.wait_ready()
        nginx = self.nginx_starts()[0]
        start = time.monotonic()
        sup.proc.send_signal(signal.SIGQUIT)
        self.assertEqual(sup.wait_exit(timeout=15), 0)
        self.assertLess(time.monotonic() - start, 10)
        self.assertFalse(alive(nginx["pid"]))

    def test_certificate_rotation(self):
        sup = self.start()
        sup.wait_ready()
        self.assertEqual(peer_cert_digest(self.port), file_digest(self.serving_a[0]))
        self.install_serving(self.serving_b)
        sup.wait_log("serving certificate changed", timeout=10)
        sup.wait_log("policy applied", count=2, timeout=10)
        self.assertEqual(peer_cert_digest(self.port), file_digest(self.serving_b[0]))

    def test_stale_state_cleared(self):
        os.makedirs(self.state_dir)
        with open(os.path.join(self.state_dir, "state"), "w") as f:
            json.dump({"ready": True, "pid": os.getpid(), "generation": 9}, f)
        self.api.status = 503
        sup = self.start()
        sup.wait_log("cannot read the cluster TLS profile")
        self.assertFalse(sup.state()["ready"])


class FailureModesTest(SupervisorProcessTestCase):
    def test_api_down_at_startup_then_recovers(self):
        self.api.status = 503
        sup = self.start()
        sup.wait_log("cannot read the cluster TLS profile", count=2)
        self.assertEqual(self.nginx_starts(), [])
        self.assertFalse(self.listening())
        self.assertFalse(sup.state()["ready"])
        self.api.status = 200
        sup.wait_ready(timeout=10)

    def test_forbidden_at_startup(self):
        self.api.status = 403
        self.api.body = json.dumps({"kind": "Status", "message": "forbidden"}).encode()
        sup = self.start()
        text = sup.wait_log("ossmconsole-service-account")
        self.assertIn("ossmconsole-tls", text)
        self.assertEqual(self.nginx_starts(), [])

    def test_old_while_serving_then_errors_then_recovery(self):
        sup = self.start()
        sup.wait_ready()
        self.api.body = apiserver_json({"type": "Old"})
        sup.wait_log("invalid cluster TLS profile")
        sup.wait_ready(False)
        self.assertFalse(self.listening())
        self.api.status = 500
        sup.wait_log("cannot read the cluster TLS profile", count=2)
        self.assertFalse(self.listening())
        self.assertFalse(sup.state()["ready"])
        self.api.status = 200
        self.api.body = apiserver_json({"type": "Modern"})
        sup.wait_ready(timeout=10)
        self.assertTrue(self.listening())

    def test_failed_nginx_t_restores_previous_include(self):
        sup = self.start()
        sup.wait_ready()
        before = self.tls_conf()
        self.control_file("nginx-t-mode", "fail")
        self.api.body = apiserver_json({"type": "Intermediate"})
        sup.wait_log("nginx rejected the rendered configuration")
        self.assertEqual(self.tls_conf(), before)
        self.assertFalse(os.path.exists(os.path.join(self.state_dir, "tls.conf.new")))
        sup.wait_ready(False)

    def test_failed_first_nginx_t_removes_include(self):
        self.control_file("nginx-t-mode", "fail")
        sup = self.start()
        sup.wait_log("nginx rejected the rendered configuration")
        self.assertFalse(os.path.exists(os.path.join(self.state_dir, "tls.conf")))
        self.assertEqual(self.nginx_starts(), [])

    def test_nginx_t_timeout_is_transient(self):
        self.control_file("nginx-t-mode", "hang")
        sup = self.start()
        sup.wait_log("cannot validate the nginx configuration right now")
        self.assertEqual(self.nginx_starts(), [])
        os.remove(os.path.join(self.control, "nginx-t-mode"))
        sup.wait_ready(timeout=15)

    def test_missing_include_exits_nonzero(self):
        self.control_file("nginx-t-mode", "noinclude")
        sup = self.start()
        self.assertEqual(sup.wait_exit(), 1)
        self.assertIn("include ", sup.text())
        self.assertEqual(self.nginx_starts(), [])

    def test_unexpected_nginx_exit(self):
        self.control_file("nginx-mode", "die-later")
        sup = self.start()
        sup.wait_ready()
        self.assertEqual(sup.wait_exit(timeout=15), 1)
        self.assertIn("nginx exited unexpectedly", sup.text())

    def test_nginx_exit_during_startup(self):
        self.control_file("nginx-mode", "exit-on-start")
        sup = self.start()
        self.assertEqual(sup.wait_exit(timeout=15), 1)
        self.assertIn("nginx exited unexpectedly", sup.text())

    def test_listener_never_accepts(self):
        self.control_file("nginx-mode", "no-listen")
        sup = self.start()
        self.assertEqual(sup.wait_exit(timeout=15), 1)
        self.assertIn("did not accept connections", sup.text())
        for record in self.nginx_starts():
            self.assertFalse(alive(record["pid"]))
            self.assertFalse(alive(record["worker"]))


class SlowApiTest(SupervisorProcessTestCase):
    """Slow peers can neither stall supervision nor exceed the termination bound."""

    def check_slow(self, mode):
        sup = self.start()
        sup.wait_ready()
        nginx = self.nginx_starts()[0]
        self.api.mode = mode
        text = sup.wait_log("wall-clock deadline exceeded", timeout=15)
        self.assertIn("keeping the current policy", text)
        self.assertTrue(sup.state()["ready"])
        self.assertTrue(self.listening())
        # SIGTERM while a slow read is in flight.
        time.sleep(1.0)
        elapsed = sup.stop()
        self.assertEqual(sup.proc.returncode, 0)
        self.assertLess(elapsed, 10)
        self.assertFalse(alive(nginx["pid"]))

    def test_slow_headers(self):
        self.check_slow("slow-headers")

    def test_slow_body(self):
        self.check_slow("slow-body")

    def test_stalled_handshake(self):
        self.check_slow("stall")


if __name__ == "__main__":
    unittest.main()
