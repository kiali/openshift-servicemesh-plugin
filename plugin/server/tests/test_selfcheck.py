"""Loopback self-check, against real nginx and openssl s_server in the pinned image."""

import contextlib
import io
import json
import os
import socket
import ssl
import subprocess
import threading
import time
import unittest

from ossmc_tls_profile import capabilities, clientconf, resolve, selfcheck
from ossmc_tls_profile.resolve import Policy
from ossmc_tls_profile.spawn import EventLoop, ManagedGroup, child_env, run_bounded
from ossmc_tls_profile.supervisor import RealPlatform, Settings
from tests.helpers import OPENSSL, Certs, TempDirTestCase, helper_argv, in_image_only

GCM = ("TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_listening(port, bound=10.0):
    end = time.monotonic() + bound
    while time.monotonic() < end:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.05)
    raise AssertionError(f"nothing listening on {port}")


class SelfCheckTestCase(TempDirTestCase):
    def setUp(self):
        super().setUp()
        self.loop = EventLoop()
        self.loop.install()
        self.addCleanup(self.loop.uninstall)
        self.port = free_port()
        self.settings = Settings(
            state_dir=self.tmp,
            helper_argv=helper_argv(),
            listen_port=self.port,
            selfcheck_deadline=10.0,
        )
        self.platform = RealPlatform(self.settings, self.loop)

    def self_check(self, policy):
        clientconf.write_private(
            self.settings.selfcheck_conf, clientconf.render_selfcheck(policy.tls13_suites, policy.groups)
        )
        return self.platform.self_check(policy)


class HungPeerTest(SelfCheckTestCase):
    def test_hung_peer_killed_at_deadline(self):
        server = socket.socket()
        server.bind(("127.0.0.1", self.port))
        server.listen(4)
        self.addCleanup(server.close)
        held = []
        threading.Thread(target=lambda: held.append(server.accept()), daemon=True).start()
        self.settings.selfcheck_deadline = 1.5
        start = time.monotonic()
        outcome = self.self_check(Policy(("TLSv1.3",), GCM, (), None))
        elapsed = time.monotonic() - start
        self.assertFalse(outcome.tls13_ok)
        self.assertIn("deadline", outcome.detail["error"])
        self.assertGreaterEqual(elapsed, 1.5)
        self.assertLess(elapsed, 1.5 + 5)


@in_image_only
class RealNginxTest(SelfCheckTestCase):
    @classmethod
    def setUpClass(cls):
        import tempfile

        cls.certdir = tempfile.mkdtemp(prefix="ossmc-selfcheck-")
        os.chmod(cls.certdir, 0o755)
        cls.ca = Certs(cls.certdir)
        cls.rsa = cls.ca.issue("rsa")

    def setUp(self):
        super().setUp()
        self.caps = capabilities.OpenSSLCapabilities(
            lambda argv: run_bounded(
                self.loop,
                argv,
                env=child_env(),
                deadline=5,
                stdout_cap=capabilities.PROBE_STDOUT_CAP,
                stderr_cap=capabilities.PROBE_STDERR_CAP,
            )
        )

    def start_nginx(self, policy, cert=None):
        crt, key = cert or self.rsa
        with open(self.settings.tls_conf, "w") as f:
            f.write(resolve.render(policy))
        conf = os.path.join(self.tmp, "nginx.conf")
        with open(conf, "w") as f:
            f.write(f"""
error_log stderr;
pid {self.tmp}/nginx.pid;
events {{}}
http {{
  access_log off;
  client_body_temp_path {self.tmp}/body;
  proxy_temp_path {self.tmp}/proxy;
  fastcgi_temp_path {self.tmp}/fastcgi;
  uwsgi_temp_path {self.tmp}/uwsgi;
  scgi_temp_path {self.tmp}/scgi;
  server {{
    listen 127.0.0.1:{self.port} ssl;
    ssl_certificate {crt};
    ssl_certificate_key {key};
    include {self.settings.tls_conf};
    location / {{ return 200 "ok"; }}
  }}
}}
""")
        group = ManagedGroup.start("/usr/sbin/nginx", ["/usr/sbin/nginx", "-c", conf, "-g", "daemon off;"], child_env())
        self.addCleanup(group.stop, self.loop, 2, 1, 5)
        wait_listening(self.port)

    def resolve(self, profile):
        return resolve.resolve(profile, self.caps, False)

    def test_tls13_passes_for_profiles(self):
        profiles = {
            "Modern": {"type": "Modern"},
            "Intermediate": {"type": "Intermediate"},
            "hybrid-only": {
                "type": "Custom",
                "custom": {"minTLSVersion": "VersionTLS13", "groups": ["X25519MLKEM768"]},
            },
            "hybrid-only-p256": {
                "type": "Custom",
                "custom": {"minTLSVersion": "VersionTLS13", "groups": ["SecP256r1MLKEM768"]},
            },
            "omitted-groups": {
                "type": "Custom",
                "custom": {"minTLSVersion": "VersionTLS12", "ciphers": ["ECDHE-RSA-AES128-GCM-SHA256"]},
            },
        }
        for name, profile in profiles.items():
            with self.subTest(name):
                self.port = free_port()
                self.settings.listen_port = self.port
                policy = self.resolve(profile)
                self.start_nginx(policy)
                outcome = self.self_check(policy)
                self.assertTrue(outcome.tls13_ok, outcome.detail)
                if policy.tls12_enabled:
                    self.assertTrue(outcome.tls12_ok, outcome.detail)

    def test_ecdsa_only_tls12_with_rsa_cert_is_warning_only(self):
        policy = self.resolve({"type": "Custom", "custom": {"ciphers": ["ECDHE-ECDSA-AES128-GCM-SHA256"]}})
        self.start_nginx(policy)
        outcome = self.self_check(policy)
        self.assertTrue(outcome.tls13_ok, outcome.detail)
        self.assertFalse(outcome.tls12_ok, outcome.detail)


@in_image_only
class CcmOnlyServerTest(SelfCheckTestCase):
    """The generated Ciphersuites override stops the client from offering CCM."""

    def test_override_removes_ccm(self):
        certs = Certs(self.tmp)
        crt, key = certs.issue("ccm")
        server = subprocess.Popen(
            [
                OPENSSL,
                "s_server",
                "-accept",
                f"127.0.0.1:{self.port}",
                "-cert",
                crt,
                "-key",
                key,
                "-tls1_3",
                "-ciphersuites",
                "TLS_AES_128_CCM_SHA256",
                "-quiet",
                "-naccept",
                "10",
            ],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(server.wait)
        self.addCleanup(server.kill)
        wait_listening(self.port)
        policy = Policy(("TLSv1.3",), GCM, (), None)

        # Negative control: without the override the default client negotiates CCM.
        argv = helper_argv() + ["self-check", "127.0.0.1", str(self.port), ":".join(GCM), "-"]
        control = run_bounded(self.loop, argv, env=child_env(), deadline=10, stdout_cap=65536, stderr_cap=65536)
        control_tls13 = json.loads(control.stdout)["tls13"]
        self.assertEqual(control_tls13.get("cipher"), "TLS_AES_128_CCM_SHA256", control_tls13)
        self.assertFalse(control_tls13["ok"])

        outcome = self.self_check(policy)
        self.assertFalse(outcome.tls13_ok)
        self.assertNotIn("cipher", outcome.detail["tls13"])  # the handshake itself failed


class ArgvAndCipherTest(unittest.TestCase):
    """Bad inputs are error results, never child crashes."""

    def test_unrecognized_cipher_is_an_error_result(self):
        result = selfcheck._handshake("127.0.0.1", 1, ssl.TLSVersion.TLSv1_2, "NOT-A-CIPHER")
        self.assertFalse(result["ok"])
        self.assertIn("SSLError", result["error"])

    def test_non_numeric_port_is_rejected(self):
        with contextlib.redirect_stderr(io.StringIO()) as err:
            rc = selfcheck.main(["127.0.0.1", "https", ":".join(GCM), "-"])
        self.assertEqual(rc, 2)
        self.assertIn("not a number", err.getvalue())


if __name__ == "__main__":
    unittest.main()
