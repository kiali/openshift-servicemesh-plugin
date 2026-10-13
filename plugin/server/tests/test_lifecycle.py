"""Supervisor decision logic with a fake platform and a fake clock."""

import contextlib
import io
import os
import unittest

from ossmc_tls_profile.resolve import Policy
from ossmc_tls_profile.spawn import Shutdown
from ossmc_tls_profile.supervisor import (
    FatalExit,
    FetchOutcome,
    SelfCheckOutcome,
    Settings,
    Supervisor,
    ValidateOutcome,
)
from tests.helpers import FakeCapabilities, TempDirTestCase

MODERN = {"type": "Modern"}
INTERMEDIATE = {"type": "Intermediate"}
OLD = {"type": "Old"}


def ok(profile):
    return FetchOutcome(True, profile=profile, present=profile is not None, status=200)


FAIL = FetchOutcome(False, kind="connect", detail="connection refused")
FORBIDDEN = FetchOutcome(False, kind="http", status=403, detail="forbidden")


class FakePlatform:
    def __init__(self, settings):
        self.s = settings
        self.clock = 1000.0
        self.capabilities = FakeCapabilities()
        self.fips_flag = False
        self.contract = None
        self.profile_results = []
        self.default_fetch = ok(MODERN)
        self.fetch_duration = 0.5
        self.validate_results = []
        self.selfcheck_results = []
        self.cert_results = []
        self.cert = ("cert-1", None)
        self.listener_ok = True
        self.stop_ok = True
        self.running = False
        self.events = []
        self.fetch_starts = []
        self.sleeps = []

    # platform interface
    def now(self):
        return self.clock

    def sleep_until(self, deadline):
        self.events.append("sleep")
        self.sleeps.append(round(deadline - self.clock, 3))
        self.clock = max(self.clock, deadline)

    def fips(self):
        return self.fips_flag

    def contract_error(self):
        return self.contract

    def fetch(self):
        self.events.append("fetch")
        self.fetch_starts.append(self.clock)
        self.clock += self.fetch_duration
        return self.profile_results.pop(0) if self.profile_results else self.default_fetch

    def validate(self):
        self.events.append("validate")
        if self.validate_results:
            return self.validate_results.pop(0)
        with open(self.s.tls_conf) as f:
            content = f.read()
        return ValidateOutcome(
            "ok",
            dump=f"# configuration file /etc/nginx/nginx.conf:\n...\n"
            f"# configuration file {self.s.tls_conf}:\n{content}",
        )

    def nginx_running(self):
        return self.running

    def start_nginx(self):
        self.events.append("start")
        self.running = True

    def stop_nginx(self):
        self.events.append("stop")
        if self.stop_ok:
            self.running = False
        return self.stop_ok

    def wait_listener(self):
        return self.listener_ok

    def self_check(self, policy):
        self.events.append("self_check")
        if self.selfcheck_results:
            return self.selfcheck_results.pop(0)
        return SelfCheckOutcome(True, None if not policy.tls12_enabled else True, {})

    def cert_state(self):
        self.events.append("cert")
        if self.cert_results:
            self.cert = self.cert_results.pop(0)
        return self.cert

    def sweep_orphans(self):
        self.events.append("sweep")


class LifecycleTestCase(TempDirTestCase):
    def setUp(self):
        super().setUp()
        self.settings = Settings(state_dir=os.path.join(self.tmp, "ossmc"))
        self.p = FakePlatform(self.settings)
        self.sup = Supervisor(self.settings, self.p)
        self.stderr = io.StringIO()
        redirect = contextlib.redirect_stderr(self.stderr)
        redirect.__enter__()
        self.addCleanup(redirect.__exit__, None, None, None)
        self.sup.prepare()

    def cycles(self, n=1):
        for _ in range(n):
            self.sup.cycle()

    def clear(self):
        self.p.events.clear()

    def tls_conf(self):
        with open(self.settings.tls_conf) as f:
            return f.read()


class ScheduleTest(LifecycleTestCase):
    def test_bootstrap_backoff_then_fixed_interval(self):
        self.p.profile_results = [FAIL] * 7
        self.cycles(7)
        self.assertEqual(self.p.sleeps, [1, 2, 4, 8, 16, 30, 30])
        self.assertNotIn("start", self.p.events)
        self.p.sleeps.clear()
        self.cycles(3)
        self.assertEqual(self.p.sleeps, [30, 30, 30])
        self.assertTrue(self.sup.ready)

    def test_fixed_wait_after_first_success(self):
        self.cycles(3)
        self.assertEqual(self.p.sleeps, [30, 30, 30])

    def test_next_read_scheduled_from_read_finish_including_timeout(self):
        self.p.fetch_duration = 30.0  # a read that hit its deadline
        self.p.profile_results = [FAIL, FAIL]
        self.cycles(3)
        starts = self.p.fetch_starts
        self.assertEqual(starts[1] - starts[0], 30 + 1)
        self.assertEqual(starts[2] - starts[1], 30 + 2)

    def test_reads_never_overlap_and_one_housekeeping_pass_each(self):
        self.cycles(3)
        sequence = [e for e in self.p.events if e in ("fetch", "sweep", "sleep")]
        self.assertEqual(sequence, ["fetch", "sweep", "sleep"] * 3)

    def test_housekeeping_order(self):
        self.cycles(1)
        self.clear()
        self.sup.selfcheck_pending = True
        self.cycles(1)
        self.assertEqual(self.p.events, ["fetch", "cert", "self_check", "sweep", "sleep"])
        self.clear()
        self.cycles(1)
        self.assertEqual(self.p.events, ["fetch", "cert", "sweep", "sleep"])


class ReadFailureTest(LifecycleTestCase):
    def test_initial_failure_keeps_nginx_stopped(self):
        self.p.profile_results = [FAIL, FORBIDDEN]
        self.cycles(2)
        self.assertNotIn("start", self.p.events)
        self.assertFalse(self.sup.ready)
        self.assertIn("ossmconsole-service-account", self.stderr.getvalue())
        self.assertIn("ossmconsole-tls", self.stderr.getvalue())

    def test_read_errors_after_success_keep_policy(self):
        self.cycles(1)
        policy = self.sup.applied_policy
        self.p.profile_results = [FAIL, FORBIDDEN, FetchOutcome(False, kind="json", detail="bad")]
        self.clear()
        self.cycles(3)
        self.assertEqual(self.sup.applied_policy, policy)
        self.assertTrue(self.sup.ready)
        self.assertNotIn("stop", self.p.events)
        self.assertNotIn("validate", self.p.events)

    def test_absent_profile_only_after_successful_read(self):
        self.p.profile_results = [FAIL]
        self.cycles(1)
        self.assertIsNone(self.sup.applied_policy)
        self.p.profile_results = [ok(None)]
        self.cycles(1)
        self.assertEqual(self.sup.applied_policy.protocols, ("TLSv1.2", "TLSv1.3"))

    def test_contract_error_fails_every_read(self):
        self.p.contract = "broken"
        self.sup.prepare()
        self.cycles(2)
        self.assertNotIn("fetch", self.p.events)
        self.assertFalse(self.sup.ready)

    def test_client_group_probe_failure_is_retried(self):
        self.p.capabilities.error = "openssl timed out"
        self.cycles(1)
        self.assertNotIn("fetch", self.p.events)
        self.p.capabilities.error = None
        self.cycles(1)
        self.assertIn("fetch", self.p.events)
        self.assertTrue(self.sup.ready)
        with open(self.settings.client_conf) as f:
            self.assertIn("Groups = X25519MLKEM768:X25519:", f.read())


class InvalidProfileTest(LifecycleTestCase):
    def test_invalid_replacement_stops_and_clears_readiness(self):
        self.cycles(1)
        self.p.profile_results = [ok(OLD)]
        self.clear()
        self.cycles(1)
        self.assertIn("stop", self.p.events)
        self.assertFalse(self.p.running)
        self.assertFalse(self.sup.ready)
        self.assertIsNotNone(self.sup.desired_invalid)

    def test_invalid_state_not_revived_by_read_error_or_cert(self):
        self.cycles(1)
        self.p.profile_results = [ok(OLD), FAIL]
        self.cycles(1)
        self.p.cert = ("cert-2", None)
        self.clear()
        self.cycles(1)
        self.assertNotIn("start", self.p.events)
        self.assertNotIn("validate", self.p.events)
        self.assertFalse(self.sup.ready)

    def test_valid_policy_recovers(self):
        self.p.profile_results = [ok(OLD), ok(OLD), ok(MODERN)]
        self.cycles(2)
        self.assertNotIn("start", self.p.events)
        self.cycles(1)
        self.assertTrue(self.p.running)
        self.assertTrue(self.sup.ready)
        self.assertIsNone(self.sup.desired_invalid)

    def test_definitive_nginx_t_error_takes_step5(self):
        self.cycles(1)
        self.p.profile_results = [ok(INTERMEDIATE)]
        self.p.validate_results = [ValidateOutcome("invalid", detail="emerg: bad")]
        self.clear()
        self.cycles(1)
        self.assertIn("stop", self.p.events)
        self.assertFalse(self.sup.ready)
        self.assertIn("nginx rejected", self.sup.desired_invalid)

    def test_first_failed_nginx_t_removes_tls_conf(self):
        self.p.validate_results = [ValidateOutcome("invalid", detail="emerg")]
        self.cycles(1)
        self.assertFalse(os.path.exists(self.settings.tls_conf))
        self.assertFalse(os.path.exists(self.settings.tls_conf + ".prev"))


class TransientTest(LifecycleTestCase):
    def test_capability_timeout_while_serving(self):
        self.cycles(1)
        self.p.profile_results = [ok(INTERMEDIATE)]
        self.p.capabilities.error = "openssl ciphers: wall-clock deadline exceeded"
        self.clear()
        self.cycles(1)
        self.assertEqual(self.p.events, ["fetch", "cert", "sweep", "sleep"])
        self.assertTrue(self.sup.ready)
        self.assertEqual(self.sup.applied_policy.protocols, ("TLSv1.3",))
        self.p.capabilities.error = None
        self.p.profile_results = [ok(INTERMEDIATE)]
        self.cycles(1)
        self.assertEqual(self.sup.applied_policy.protocols, ("TLSv1.2", "TLSv1.3"))

    def test_nginx_t_runner_failure_while_serving(self):
        self.cycles(1)
        before = self.tls_conf()
        for transient in ("nginx -T wall-clock deadline exceeded", "nginx -T killed by signal 9"):
            self.p.profile_results = [ok(INTERMEDIATE)]
            self.p.validate_results = [ValidateOutcome("transient", detail=transient)]
            self.clear()
            self.cycles(1)
            self.assertNotIn("stop", self.p.events)
            self.assertTrue(self.sup.ready)
            self.assertIsNone(self.sup.desired_invalid)
            self.assertEqual(self.tls_conf(), before)
        self.p.profile_results = [ok(INTERMEDIATE)]
        self.cycles(1)
        self.assertIn("ssl_protocols TLSv1.2 TLSv1.3;", self.tls_conf())

    def test_transient_at_bootstrap_leaves_nginx_stopped(self):
        self.p.validate_results = [ValidateOutcome("transient", detail="timeout")]
        self.cycles(1)
        self.assertNotIn("start", self.p.events)
        self.assertFalse(self.sup.ready)
        self.assertFalse(os.path.exists(self.settings.tls_conf))
        self.cycles(1)
        self.assertTrue(self.sup.ready)

    def test_unchanged_poll_is_noop(self):
        self.cycles(1)
        self.clear()
        self.cycles(3)
        self.assertEqual(self.p.events.count("validate"), 0)
        self.assertEqual(self.p.events.count("start"), 0)


class SelfCheckTest(LifecycleTestCase):
    def test_tls13_failure_keeps_nginx_unready_then_retries(self):
        failed = SelfCheckOutcome(False, None, {"tls13": {"ok": False}})
        # The initial check and the same cycle's housekeeping retry both fail.
        self.p.selfcheck_results = [failed, failed]
        self.cycles(1)
        self.assertEqual(self.p.events.count("self_check"), 2)
        self.assertTrue(self.p.running)
        self.assertFalse(self.sup.ready)
        self.assertTrue(self.sup.selfcheck_pending)
        self.clear()
        self.cycles(1)
        self.assertEqual(self.p.events.count("self_check"), 1)
        self.assertNotIn("start", self.p.events)
        self.assertTrue(self.sup.ready)
        self.assertFalse(self.sup.selfcheck_pending)

    def test_tls12_failure_is_warning_only(self):
        self.p.default_fetch = ok(INTERMEDIATE)
        self.p.selfcheck_results = [SelfCheckOutcome(True, False, {"tls12": {"ok": False}})]
        self.cycles(1)
        self.assertTrue(self.sup.ready)
        self.assertIn("TLS 1.2 self-check failed", self.stderr.getvalue())


class CertificateTest(LifecycleTestCase):
    def test_rotation_triggers_replacement_unchanged_does_not(self):
        self.cycles(2)
        self.assertEqual(self.p.events.count("start"), 1)
        self.p.cert = ("cert-2", None)
        self.clear()
        self.cycles(1)
        self.assertEqual(self.p.events.count("stop"), 1)
        self.assertEqual(self.p.events.count("start"), 1)
        self.assertEqual(self.sup.applied_cert_hash, "cert-2")
        self.clear()
        self.cycles(1)
        self.assertNotIn("start", self.p.events)

    def test_mismatched_pair_ignored_until_valid(self):
        self.cycles(1)
        self.p.cert = ("cert-2", "key does not match")
        self.clear()
        self.cycles(2)
        self.assertNotIn("start", self.p.events)
        self.p.cert = ("cert-3", None)
        self.cycles(1)
        self.assertIn("start", self.p.events)
        self.assertEqual(self.sup.applied_cert_hash, "cert-3")

    def test_failed_selfcheck_after_rotation_does_not_repeat_replacement(self):
        self.cycles(1)
        self.p.cert = ("cert-2", None)
        self.p.selfcheck_results = [SelfCheckOutcome(False, None, {})] * 3
        self.clear()
        self.cycles(2)
        self.assertEqual(self.p.events.count("start"), 1)
        self.assertEqual(self.sup.applied_cert_hash, "cert-2")

    def test_second_rotation_during_replacement_picked_up(self):
        self.cycles(1)
        # housekeeping sees cert-2, the replacement reads cert-2 before starting nginx,
        # then the files rotate again to cert-3.
        self.p.cert_results = [("cert-2", None), ("cert-2", None), ("cert-3", None)]
        self.clear()
        self.cycles(1)
        self.assertEqual(self.sup.applied_cert_hash, "cert-2")
        self.cycles(1)
        self.assertEqual(self.sup.applied_cert_hash, "cert-3")
        self.assertEqual(self.p.events.count("start"), 2)

    def test_hash_recorded_only_after_listener_accepts(self):
        self.cycles(1)
        self.p.cert = ("cert-2", None)
        self.p.listener_ok = False
        with self.assertRaises(FatalExit):
            self.cycles(1)
        self.assertEqual(self.sup.applied_cert_hash, "cert-1")

    def test_transient_nginx_t_during_cert_update(self):
        self.cycles(1)
        self.p.cert = ("cert-2", None)
        self.p.validate_results = [ValidateOutcome("transient", detail="timeout")]
        self.clear()
        self.cycles(1)
        self.assertNotIn("stop", self.p.events)
        self.assertTrue(self.p.running)
        self.assertTrue(self.sup.ready)
        self.assertEqual(self.sup.applied_cert_hash, "cert-1")
        self.cycles(1)
        self.assertEqual(self.sup.applied_cert_hash, "cert-2")

    def test_definitive_nginx_t_during_cert_update_never_step5(self):
        self.cycles(1)
        self.p.cert = ("cert-2", None)
        self.p.validate_results = [ValidateOutcome("invalid", detail="cannot load certificate")]
        self.clear()
        self.cycles(1)
        self.assertNotIn("stop", self.p.events)
        self.assertTrue(self.sup.ready)
        self.assertIsNone(self.sup.desired_invalid)
        self.cycles(1)
        self.assertEqual(self.sup.applied_cert_hash, "cert-2")


class ExitTest(LifecycleTestCase):
    def run_until_shutdown(self, cycles=1):
        original = self.p.sleep_until
        count = [0]

        def sleep_until(deadline):
            count[0] += 1
            if count[0] > cycles:
                raise Shutdown()
            original(deadline)

        self.p.sleep_until = sleep_until
        return self.sup.run()

    def test_shutdown_returns_zero_and_stops_nginx(self):
        self.assertEqual(self.run_until_shutdown(), 0)
        self.assertEqual(self.p.events[-1], "stop")
        self.assertFalse(self.sup.ready)

    def test_missing_include_exits_nonzero_without_starting(self):
        self.p.validate_results = [ValidateOutcome("ok", dump="# configuration file /etc/nginx/nginx.conf:\n")]
        self.assertEqual(self.run_until_shutdown(), 1)
        self.assertNotIn("start", self.p.events)
        self.assertIn(f"include {self.settings.tls_conf};", self.stderr.getvalue())

    def test_listener_never_accepts_exits_nonzero(self):
        self.p.listener_ok = False
        self.assertEqual(self.run_until_shutdown(), 1)
        self.assertEqual(self.p.events[-1], "stop")

    def test_cleanup_failure_exits_nonzero(self):
        self.p.profile_results = [ok(MODERN), ok(OLD)]
        self.p.stop_ok = False
        self.assertEqual(self.run_until_shutdown(cycles=3), 1)
        self.assertIn("could not stop", self.stderr.getvalue())

    def test_unexpected_exception_stops_nginx(self):
        def boom():
            raise RuntimeError("bug")

        self.p.sweep_orphans = boom
        self.assertEqual(self.run_until_shutdown(), 1)
        self.assertIn("RuntimeError", self.stderr.getvalue())
        self.assertEqual(self.p.events[-1], "stop")


class PolicyEqualityTest(unittest.TestCase):
    def test_frozen(self):
        p = Policy(("TLSv1.3",), ("TLS_AES_128_GCM_SHA256",), (), None)
        with self.assertRaises(AttributeError):
            p.protocols = ()  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
