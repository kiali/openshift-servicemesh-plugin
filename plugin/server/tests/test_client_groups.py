"""The fetch child against API servers restricted to one TLS group (pinned image only).

Each server is "openssl s_server -tls1_3 -groups <g> -WWW" serving the
fixture APIServer JSON at the API path, so the group restriction is real.
Run the suite with --network none; everything stays on 127.0.0.1.
"""

import json
import os
import socket
import subprocess
import time
import unittest

from ossmc_tls_profile import capabilities, clientconf
from ossmc_tls_profile.spawn import EventLoop, child_env, run_bounded
from tests.harness import API_PATH, fetch_child_argv
from tests.helpers import OPENSSL, Certs, TempDirTestCase, apiserver_json, in_image_only

HYBRID = ("X25519MLKEM768", "SecP256r1MLKEM768", "SecP384r1MLKEM1024")
CLASSICAL = ("secp256r1", "secp521r1")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@in_image_only
class ClientGroupsTest(TempDirTestCase):
    def setUp(self):
        super().setUp()
        self.loop = EventLoop()
        self.loop.install()
        self.addCleanup(self.loop.uninstall)
        self.certs = Certs(self.tmp)
        self.cert, self.key = self.certs.issue("api")
        self.token = os.path.join(self.tmp, "token")
        with open(self.token, "w") as f:
            f.write("t")
        www = os.path.join(self.tmp, "www")
        os.makedirs(os.path.join(www, os.path.dirname(API_PATH.lstrip("/"))))
        with open(os.path.join(www, API_PATH.lstrip("/")), "wb") as f:
            f.write(apiserver_json({"type": "Modern"}))
        self.www = www
        caps = capabilities.OpenSSLCapabilities(
            lambda argv: run_bounded(
                self.loop,
                argv,
                env=child_env(),
                deadline=5,
                stdout_cap=capabilities.PROBE_STDOUT_CAP,
                stderr_cap=capabilities.PROBE_STDERR_CAP,
            )
        )
        self.groups = clientconf.client_groups(caps, fips=False)
        self.client_conf = os.path.join(self.tmp, "openssl-client.cnf")
        clientconf.write_private(self.client_conf, clientconf.render_client(self.groups))

    def serve(self, group, ca_override=None):
        port = free_port()
        proc = subprocess.Popen(
            [
                OPENSSL,
                "s_server",
                "-accept",
                f"127.0.0.1:{port}",
                "-cert",
                self.cert,
                "-key",
                self.key,
                "-tls1_3",
                "-groups",
                group,
                "-WWW",
                "-quiet",
            ],
            cwd=self.www,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(proc.wait)
        self.addCleanup(proc.kill)
        end = time.monotonic() + 10
        while time.monotonic() < end:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=0.5).close()
                return port
            except OSError:
                time.sleep(0.05)
        self.fail("s_server did not start")

    def fetch(self, port, with_conf=True, ca=None):
        extra = {"KUBERNETES_SERVICE_HOST": "127.0.0.1", "KUBERNETES_SERVICE_PORT": str(port)}
        if with_conf:
            extra["OPENSSL_CONF"] = self.client_conf
        result = run_bounded(
            self.loop,
            fetch_child_argv(self.token, ca or self.certs.ca_crt) + ["fetch"],
            env=child_env(**extra),
            deadline=15,
            stdout_cap=2 * 1024 * 1024,
            stderr_cap=65536,
        )
        self.assertEqual(result.returncode, 0, result)
        return json.loads(result.stdout)

    def test_client_group_list(self):
        self.assertEqual(
            self.groups,
            (
                "X25519MLKEM768",
                "X25519",
                "secp256r1",
                "secp384r1",
                "SecP256r1MLKEM768",
                "SecP384r1MLKEM1024",
                "secp521r1",
            ),
        )

    def test_every_group_with_generated_config(self):
        for group in HYBRID + CLASSICAL:
            with self.subTest(group):
                envelope = self.fetch(self.serve(group))
                self.assertTrue(envelope["ok"], envelope)
                self.assertEqual(envelope["profile"], {"type": "Modern"})

    def test_verification_still_enforced(self):
        other = Certs(self.tmp, "other")
        envelope = self.fetch(self.serve("X25519MLKEM768"), ca=other.ca_crt)
        self.assertEqual(envelope["kind"], "tls")
        self.assertIn("CERTIFICATE_VERIFY_FAILED", envelope["detail"])

    def test_negative_control_without_config(self):
        for group in ("X25519MLKEM768", "SecP256r1MLKEM768"):
            with self.subTest(group):
                envelope = self.fetch(self.serve(group), with_conf=False)
                self.assertFalse(envelope["ok"])
                self.assertEqual(envelope["kind"], "tls")
        self.assertTrue(self.fetch(self.serve("secp256r1"), with_conf=False)["ok"])


if __name__ == "__main__":
    unittest.main()
