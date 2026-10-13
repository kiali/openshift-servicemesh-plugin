import json
import os
import unittest

from ossmc_tls_profile import apiclient
from ossmc_tls_profile.spawn import EventLoop, child_env, run_bounded
from tests.harness import API_PATH, HTTPSFixture, fetch_child_argv, ipv6_available
from tests.helpers import Certs, TempDirTestCase, apiserver_json

TOKEN = "sha256~test-token-value"


class FetchTestCase(TempDirTestCase):
    @classmethod
    def setUpClass(cls):
        import tempfile

        cls.certdir = tempfile.mkdtemp(prefix="ossmc-certs-")
        cls.ca = Certs(cls.certdir, "ca")
        cls.other_ca = Certs(cls.certdir, "otherca")
        cls.server = cls.ca.issue("server")
        cls.wrong_name = cls.ca.issue("wrongname", sans=("DNS:not-this-host.example",))
        cls.untrusted = cls.other_ca.issue("untrusted")

    @classmethod
    def tearDownClass(cls):
        import shutil

        shutil.rmtree(cls.certdir, True)

    def setUp(self):
        super().setUp()
        self.token = os.path.join(self.tmp, "token")
        self.cafile = os.path.join(self.tmp, "ca.crt")
        self.write(self.token, TOKEN)
        self.write(self.cafile, self.read(self.ca.ca_crt))
        self.api = self.make_server(*self.server)
        self.api.body = apiserver_json({"type": "Modern", "modern": {}})

    def make_server(self, cert, key, host="127.0.0.1"):
        server = HTTPSFixture(cert, key, host)
        self.addCleanup(server.close)
        return server

    @staticmethod
    def read(path):
        with open(path) as f:
            return f.read()

    @staticmethod
    def write(path, text):
        with open(path, "w") as f:
            f.write(text)

    def fetch(self, server=None, **kwargs):
        server = server or self.api
        return apiclient.fetch(server.host, str(server.port), token_path=self.token, ca_path=self.cafile, **kwargs)


class InProcessFetchTest(FetchTestCase):
    def test_success_and_exact_request(self):
        result = self.fetch()
        self.assertEqual(
            result, {"ok": True, "status": 200, "profile": {"type": "Modern", "modern": {}}, "present": True}
        )
        self.assertEqual(self.api.requests, [{"method": "GET", "path": API_PATH, "authorization": f"Bearer {TOKEN}"}])

    def test_absent_and_null_profile(self):
        self.api.body = apiserver_json(present=False)
        self.assertEqual(self.fetch(), {"ok": True, "status": 200, "profile": None, "present": False})
        self.api.body = apiserver_json(None)
        self.assertFalse(self.fetch()["present"])

    def test_token_rotation(self):
        self.fetch()
        self.write(self.token, "rotated-token\n")
        self.fetch()
        self.assertEqual([r["authorization"] for r in self.api.requests], [f"Bearer {TOKEN}", "Bearer rotated-token"])

    def test_untrusted_ca_then_ca_rotation(self):
        untrusted = self.make_server(*self.untrusted)
        untrusted.body = self.api.body
        result = self.fetch(untrusted)
        self.assertEqual(result["kind"], "tls")
        self.assertIn("CERTIFICATE_VERIFY_FAILED", result["detail"])
        self.write(self.cafile, self.read(self.other_ca.ca_crt))
        self.assertTrue(self.fetch(untrusted)["ok"])

    def test_hostname_mismatch(self):
        result = self.fetch(self.make_server(*self.wrong_name))
        self.assertEqual(result["kind"], "tls")
        self.assertIn("certificate rejected", result["detail"])

    @unittest.skipUnless(ipv6_available(), "no IPv6 loopback")
    def test_ipv6(self):
        server = self.make_server(*self.server, host="::1")
        server.body = self.api.body
        self.assertTrue(self.fetch(server)["ok"])

    def test_http_errors(self):
        self.api.status = 403
        self.api.body = json.dumps({"kind": "Status", "message": 'apiservers "cluster" is forbidden'}).encode()
        result = self.fetch()
        self.assertEqual((result["ok"], result["kind"], result["status"]), (False, "http", 403))
        self.assertIn("forbidden", result["detail"])
        self.api.status = 500
        self.api.body = b"oops"
        self.assertEqual(self.fetch()["kind"], "http")

    def test_malformed_and_wrong_kind(self):
        self.api.body = b"{not json"
        self.assertEqual(self.fetch()["kind"], "json")
        self.api.body = json.dumps({"kind": "ConfigMap"}).encode()
        self.assertEqual(self.fetch()["kind"], "json")
        self.api.body = json.dumps({"kind": "APIServer", "spec": []}).encode()
        self.assertEqual(self.fetch()["kind"], "json")

    def test_truncated(self):
        self.api.mode = "truncated"
        self.assertEqual(self.fetch()["kind"], "http")

    def test_oversized(self):
        self.api.body = apiserver_json({"type": "Custom", "custom": {"ciphers": ["X" * 50] * 10}})
        result = self.fetch(body_cap=100)
        self.assertEqual(result["kind"], "io")
        self.assertIn("exceeds", result["detail"])

    def test_missing_or_empty_files(self):
        os.remove(self.token)
        self.assertEqual(self.fetch()["kind"], "io")
        self.write(self.token, "   \n")
        self.assertIn("empty", self.fetch()["detail"])
        self.write(self.token, TOKEN)
        os.remove(self.cafile)
        self.assertEqual(self.fetch()["kind"], "io")
        self.assertEqual(self.api.requests, [])

    def test_missing_env(self):
        result = apiclient.fetch(None, "443", token_path=self.token, ca_path=self.cafile)
        self.assertEqual(result["kind"], "config")
        self.assertEqual(apiclient.fetch("10.0.0.1", "", token_path=self.token, ca_path=self.cafile)["kind"], "config")

    def test_bad_port(self):
        result = apiclient.fetch("10.0.0.1", "https", token_path=self.token, ca_path=self.cafile)
        self.assertEqual(result["kind"], "config")
        self.assertIn("not a number", result["detail"])
        for bad in ("0", "-1", "65536"):
            result = apiclient.fetch("10.0.0.1", bad, token_path=self.token, ca_path=self.cafile)
            self.assertEqual(result["kind"], "config", bad)
            self.assertIn("out of range", result["detail"])

    def test_token_never_in_failures(self):
        self.api.status = 401
        self.api.body = json.dumps({"message": "Unauthorized"}).encode()
        self.assertNotIn(TOKEN, json.dumps(self.fetch()))

    def test_only_get_of_singleton(self):
        for _ in range(3):
            self.fetch()
        for req in self.api.requests:
            self.assertEqual((req["method"], req["path"]), ("GET", API_PATH))
            self.assertNotIn("watch", req["path"])


class FetchChildTest(FetchTestCase):
    """The real fetch child through the bounded runner."""

    def setUp(self):
        super().setUp()
        self.loop = EventLoop()
        self.loop.install()
        self.addCleanup(self.loop.uninstall)

    def run_fetch(self, server=None, **env):
        server = server or self.api
        env = child_env(KUBERNETES_SERVICE_HOST=server.host, KUBERNETES_SERVICE_PORT=str(server.port), **env)
        return run_bounded(
            self.loop,
            fetch_child_argv(self.token, self.cafile) + ["fetch"],
            env=env,
            deadline=30,
            stdout_cap=2 * 1024 * 1024,
            stderr_cap=64 * 1024,
        )

    def test_success(self):
        result = self.run_fetch()
        self.assertEqual(result.returncode, 0)
        self.assertTrue(json.loads(result.stdout)["ok"])
        self.assertNotIn(TOKEN.encode(), result.stdout + result.stderr)

    def test_system_trust_store_not_used(self):
        untrusted = self.make_server(*self.untrusted)
        # Even when the default verify paths would trust the server, only ca.crt counts.
        result = self.run_fetch(untrusted, SSL_CERT_FILE=self.other_ca.ca_crt, SSL_CERT_DIR=self.certdir)
        self.assertEqual(json.loads(result.stdout)["kind"], "tls")

    def test_oversized_body(self):
        self.api.body = b'{"kind":"APIServer","spec":{},"pad":"' + b"x" * (1024 * 1024 + 10) + b'"}'
        self.assertEqual(json.loads(self.run_fetch().stdout)["kind"], "io")

    @unittest.skipUnless(ipv6_available(), "no IPv6 loopback")
    def test_ipv6(self):
        server = self.make_server(*self.server, host="::1")
        server.body = self.api.body
        self.assertTrue(json.loads(self.run_fetch(server).stdout)["ok"])


if __name__ == "__main__":
    unittest.main()
