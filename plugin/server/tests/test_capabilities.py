import importlib.util
import os
import unittest

from ossmc_tls_profile import capabilities, resolve, spawn
from ossmc_tls_profile.capabilities import SELECTOR, SUITE, UNAVAILABLE, CapabilityError, OpenSSLCapabilities
from ossmc_tls_profile.spawn import EventLoop, RunResult
from tests.helpers import SERVER_DIR, RecordedRunner, in_image_only, load_probe_fixture

# Expected classification of each recorded token (see the table in the plan, section 2).
EXPECTED = {
    "ECDHE-RSA-AES128-GCM-SHA256": (SUITE, "ECDHE-RSA-AES128-GCM-SHA256"),
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256": (SUITE, "ECDHE-RSA-AES128-GCM-SHA256"),
    "ECDHE-RSA-AES128-SHA256": (SUITE, "ECDHE-RSA-AES128-SHA256"),
    "AES128-GCM-SHA256": (SUITE, "AES128-GCM-SHA256"),
    "DHE-RSA-AES128-GCM-SHA256": (SUITE, "DHE-RSA-AES128-GCM-SHA256"),
    "DES-CBC3-SHA": (UNAVAILABLE, None),
    "RC4-SHA": (UNAVAILABLE, None),
    "NOT-A-CIPHER": (UNAVAILABLE, None),
    "ecdhe-rsa-aes128-gcm-sha256": (UNAVAILABLE, None),
    "ADH-AES256-GCM-SHA384": (UNAVAILABLE, "ADH-AES256-GCM-SHA384"),
    "aNULL": (SELECTOR, None),
    "eNULL": (SELECTOR, None),
    "NULL": (SELECTOR, None),
    "HIGH": (SELECTOR, None),
    "ALL": (SELECTOR, None),
    "DEFAULT": (SELECTOR, None),
    "kRSA": (SELECTOR, None),
    "CHACHA20": (SELECTOR, None),
    "AESGCM": (SELECTOR, None),
}


class RecordedOutputTest(unittest.TestCase):
    def setUp(self):
        self.runner = RecordedRunner()
        self.caps = OpenSSLCapabilities(self.runner)

    def test_classification(self):
        for token, (kind, name) in EXPECTED.items():
            ident = self.caps.tls12_identity(token)
            self.assertEqual(ident.kind, kind, token)
            if name:
                self.assertEqual(ident.openssl_name, name, token)

    def test_iana_name_normalized(self):
        ident = self.caps.tls12_identity("TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256")
        self.assertEqual(
            (ident.openssl_name, ident.std_name, ident.auth),
            ("ECDHE-RSA-AES128-GCM-SHA256", "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256", "RSA"),
        )

    def test_empty_p1_resolved_through_p2(self):
        self.caps.tls12_identity("aNULL")
        self.caps.tls12_identity("ADH-AES256-GCM-SHA384")
        p2 = [c for c in self.runner.calls if c[1:3] == ["ciphers", "-stdname"]]
        self.assertEqual([c[3] for c in p2], ["aNULL", "ADH-AES256-GCM-SHA384"])

    def test_at_most_two_probes_and_token_last(self):
        for token in EXPECTED:
            self.caps.tls12_identity(token)
        for call in self.runner.calls:
            self.assertIn(call[-1], EXPECTED)
            self.assertEqual(call[0], "/usr/bin/openssl")
        self.assertLessEqual(len(self.runner.calls), 2 * len(EXPECTED))

    def test_single_non_matching_line_is_selector(self):
        line = self.runner.data["p1"]["ECDHE-RSA-AES128-GCM-SHA256"]["stdout"].encode()
        runner = RecordedRunner(
            overrides={
                ("ciphers", "-s", "-tls1_2", "-stdname", "AESGCM128RSA"): RunResult("exited", 0, stdout=line),
            }
        )
        self.assertEqual(OpenSSLCapabilities(runner).tls12_identity("AESGCM128RSA").kind, SELECTOR)

    def test_tls13(self):
        for name in resolve.TLS13_SUITES:
            self.assertTrue(self.caps.tls13_available(name))
        self.assertFalse(self.caps.tls13_available("TLS_NOT_A_SUITE"))

    def test_groups(self):
        g13 = self.caps.groups("1.3")
        g12 = self.caps.groups("1.2")
        self.assertIn("x25519mlkem768", g13)
        self.assertIn("secp256r1mlkem768", g13)
        self.assertNotIn("x25519mlkem768", g12)
        self.assertIn("secp384r1", g12)

    def test_definitive_results_cached(self):
        self.caps.tls12_identity("HIGH")
        self.caps.groups("1.3")
        calls = len(self.runner.calls)
        self.caps.tls12_identity("HIGH")
        self.caps.groups("1.3")
        self.assertEqual(len(self.runner.calls), calls)

    def test_errors_are_capability_errors_and_not_cached(self):
        p1 = ("ciphers", "-s", "-tls1_2", "-stdname", "HIGH")
        failures = [
            RunResult("timeout", elapsed=5.0),
            RunResult("overflow", detail="stdout exceeded"),
            RunResult("spawn-error", detail="missing"),
            RunResult("signaled", signal=9),
            RunResult("exited", 3, stderr=b"provider init failed"),
            RunResult("exited", 0, stdout=b"garbage line\n"),
        ]
        for failure in failures:
            runner = RecordedRunner(overrides={p1: failure})
            caps = OpenSSLCapabilities(runner)
            with self.assertRaises(CapabilityError, msg=failure):
                caps.tls12_identity("HIGH")
            del runner.overrides[p1]
            self.assertEqual(caps.tls12_identity("HIGH").kind, SELECTOR)

    def test_group_probe_failure(self):
        runner = RecordedRunner(overrides={("list", "-tls1_3", "-tls-groups"): RunResult("exited", 0, stdout=b"")})
        with self.assertRaises(CapabilityError):
            OpenSSLCapabilities(runner).groups("1.3")


@in_image_only
class RealCliTest(unittest.TestCase):
    """The real openssl CLI in the pinned image, through the bounded runner."""

    def setUp(self):
        self.loop = EventLoop()
        self.loop.install()
        self.addCleanup(self.loop.uninstall)
        self.caps = OpenSSLCapabilities(
            lambda argv: spawn.run_bounded(
                self.loop,
                argv,
                env=spawn.child_env(),
                deadline=5,
                stdout_cap=capabilities.PROBE_STDOUT_CAP,
                stderr_cap=capabilities.PROBE_STDERR_CAP,
            )
        )

    def test_classification_table(self):
        for token, (kind, name) in EXPECTED.items():
            ident = self.caps.tls12_identity(token)
            self.assertEqual(ident.kind, kind, token)
            if name:
                self.assertEqual(ident.openssl_name, name, token)

    def test_tls13_and_groups(self):
        for name in resolve.TLS13_SUITES:
            self.assertTrue(self.caps.tls13_available(name))
        self.assertIn("x25519mlkem768", self.caps.groups("1.3"))
        self.assertIn("secp384r1", self.caps.groups("1.2"))


@in_image_only
class FixtureDriftTest(unittest.TestCase):
    """The committed openssl-probes.json must match this image's openssl; otherwise the recorded
    tests assert behavior the plugin no longer ships with (see hack/record-openssl-probes.py)."""

    def test_recorded_probes_match_this_openssl(self):
        spec = importlib.util.spec_from_file_location(
            "record_openssl_probes", os.path.join(SERVER_DIR, "hack", "record-openssl-probes.py")
        )
        recorder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(recorder)
        live = recorder.collect()
        recorded = load_probe_fixture()
        diffs = []
        if recorded.get("openssl") != live.get("openssl"):
            diffs.append(f"openssl {recorded.get('openssl')!r} -> {live.get('openssl')!r}")
        for section in ("p1", "p2", "tls13", "groups"):
            old, new = recorded.get(section, {}), live.get(section, {})
            changed = sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))
            if changed:
                diffs.append(f"{section}: {', '.join(changed)}")
        self.assertEqual(diffs, [], "openssl-probes.json is stale for this image; run: make record-ossmc-tls-probes")


if __name__ == "__main__":
    unittest.main()
