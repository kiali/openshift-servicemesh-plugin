"""Integration tests against the locally built OSSMC image (make test-ossmc-tls-profile-container).

Requires podman, openssl and python3 >= 3.9 on the host. OSSMC_IMAGE names the
image under test (the Make target passes the image it just built); a registry
image is never pulled for it.
"""

import os
import shutil
import time
import unittest

from integration.pod import INTEGRATION_DIR, Pod, nginx_conf_from_manifest, podman

IMAGE = os.environ.get("OSSMC_IMAGE", "")
MODERN = {"type": "Modern"}
INTERMEDIATE = {"type": "Intermediate"}


def custom(**body):
    return {"type": "Custom", "custom": body}


@unittest.skipUnless(shutil.which("podman") and IMAGE, "requires podman and OSSMC_IMAGE (the locally built image)")
class ContainerTestCase(unittest.TestCase):
    def setUp(self):
        exists = podman("image", "exists", IMAGE, check=False)
        if exists.returncode != 0:
            self.fail(f"image {IMAGE} not found locally; run make build-plugin-image first")
        self.pod = Pod(IMAGE)
        self.addCleanup(self.pod.cleanup)

    def start(self, profile=MODERN, **kwargs):
        if profile is not None:
            self.pod.set_profile(profile)
        self.pod.start_ossmc(**kwargs)

    def assertAccepted(self, *args, http=True):
        result = self.pod.s_client(*args)
        self.assertIsNotNone(result["protocol"], result["raw"][-3000:])
        self.assertEqual(result["verify"], "0", result["raw"][-3000:])
        if http:
            self.assertEqual(result["http"], "200", result["raw"][-3000:])
        return result

    def assertRejected(self, *args, control=None):
        """A rejected handshake only counts after the same client succeeds against a permissive server."""
        if control is not None:
            self.positive_control(args, control)
        result = self.pod.s_client(*args)
        self.assertIsNone(result["protocol"], result["raw"][-3000:])
        self.assertIsNone(result["http"])

    def positive_control(self, client_args, server_args):
        podman(
            "exec",
            "-d",
            self.pod.api,
            "openssl",
            "s_server",
            "-accept",
            "127.0.0.1:7443",
            "-cert",
            "/work/serving-a.crt",
            "-key",
            "/work/serving-a.key",
            "-naccept",
            "1",
            "-quiet",
            *server_args,
        )
        time.sleep(0.7)
        result = self.pod.s_client(*client_args, port=7443, request=False)
        self.assertIsNotNone(result["protocol"], f"positive control failed: {result['raw'][-3000:]}")

    def assertNoListener(self):
        self.assertIsNone(self.pod.s_client(request=False)["protocol"])
        self.assertNotEqual(self.pod.probe(), 0)


class PolicyTest(ContainerTestCase):
    def test_modern(self):
        self.start(MODERN)
        self.pod.wait_ready()
        result = self.assertAccepted("-tls1_3", "-ciphersuites", "TLS_AES_128_GCM_SHA256")
        self.assertEqual((result["protocol"], result["cipher"]), ("TLSv1.3", "TLS_AES_128_GCM_SHA256"))
        hybrid = self.assertAccepted("-tls1_3", "-groups", "X25519MLKEM768")
        self.assertEqual(hybrid["group"], "X25519MLKEM768")
        self.assertRejected("-tls1_2", control=["-tls1_2"])
        self.assertRejected(
            "-tls1_3",
            "-ciphersuites",
            "TLS_AES_128_CCM_SHA256",
            control=["-tls1_3", "-ciphersuites", "TLS_AES_128_CCM_SHA256"],
        )
        self.check_process_tree()

    def test_verification_controls(self):
        """The TLS client used by these tests really aborts on verification failures."""
        self.start(MODERN)
        self.pod.wait_ready()
        self.assertAccepted("-tls1_3")
        wrong_name = self.pod.s_client("-tls1_3", servername="wrong.example")
        self.assertIsNone(wrong_name["http"], wrong_name["raw"][-2000:])
        self.assertNotEqual(wrong_name["verify"], "0")
        wrong_ca = self.pod.s_client("-tls1_3", ca="/work/otherca.crt")
        self.assertIsNone(wrong_ca["http"], wrong_ca["raw"][-2000:])
        self.assertNotEqual(wrong_ca["verify"], "0")

    def check_process_tree(self):
        procs = {p["pid"]: p for p in self.pod.processes()}
        self.assertIn("ossmc-tls-profile", procs["1"]["cmd"])
        masters = [p for p in procs.values() if p["cmd"].startswith("nginx: master")]
        self.assertEqual(len(masters), 1, procs)
        master = masters[0]
        self.assertEqual((master["ppid"], master["pgid"]), ("1", master["pid"]))
        workers = [p for p in procs.values() if p["cmd"].startswith("nginx: worker")]
        self.assertTrue(workers)
        for worker in workers:
            self.assertEqual((worker["ppid"], worker["pgid"]), (master["pid"], master["pid"]))

    def test_intermediate(self):
        self.start(INTERMEDIATE)
        self.pod.wait_ready()
        tls12 = self.assertAccepted("-tls1_2", "-cipher", "ECDHE-RSA-AES128-GCM-SHA256")
        self.assertEqual((tls12["protocol"], tls12["cipher"]), ("TLSv1.2", "ECDHE-RSA-AES128-GCM-SHA256"))
        self.assertEqual(self.assertAccepted("-tls1_3")["protocol"], "TLSv1.3")
        self.assertRejected(
            "-tls1_2", "-cipher", "AES128-GCM-SHA256", control=["-tls1_2", "-cipher", "AES128-GCM-SHA256"]
        )
        self.assertRejected(
            "-tls1_2", "-cipher", "ECDHE-RSA-AES128-SHA256", control=["-tls1_2", "-cipher", "ECDHE-RSA-AES128-SHA256"]
        )
        self.assertRejected(
            "-tls1_3",
            "-ciphersuites",
            "TLS_AES_128_CCM_SHA256",
            control=["-tls1_3", "-ciphersuites", "TLS_AES_128_CCM_SHA256"],
        )

    def test_custom_ciphers_and_groups(self):
        self.start(custom(minTLSVersion="VersionTLS12", ciphers=["ECDHE-RSA-AES256-GCM-SHA384"], groups=["secp384r1"]))
        self.pod.wait_ready()
        self.assertAccepted("-tls1_2", "-cipher", "ECDHE-RSA-AES256-GCM-SHA384", "-groups", "secp384r1")
        self.assertRejected(
            "-tls1_2",
            "-cipher",
            "ECDHE-RSA-AES128-GCM-SHA256",
            control=["-tls1_2", "-cipher", "ECDHE-RSA-AES128-GCM-SHA256"],
        )
        self.assertEqual(self.assertAccepted("-tls1_3", "-groups", "secp384r1")["group"], "secp384r1")
        self.assertRejected("-tls1_3", "-groups", "secp521r1", control=["-tls1_3", "-groups", "secp521r1"])

    def test_tls13_only_branch(self):
        self.start(
            custom(minTLSVersion="VersionTLS12", ciphers=["TLS_AES_256_GCM_SHA384", "DHE-RSA-AES128-GCM-SHA256"])
        )
        self.pod.wait_ready()
        self.assertAccepted("-tls1_3")
        self.assertRejected("-tls1_2", control=["-tls1_2"])


class LifecycleTest(ContainerTestCase):
    def test_profile_change_replaces_nginx_in_container(self):
        self.start(MODERN, command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_ready()
        container_id = self.pod.inspect("{{.Id}}")
        old_nginx = set(self.pod.nginx_pids())
        time.sleep(6)  # unchanged polls
        self.assertEqual(self.pod.logs().count('msg="nginx started"'), 1)
        self.assertEqual(set(self.pod.nginx_pids()), old_nginx)
        changed = time.monotonic()
        self.pod.set_profile(INTERMEDIATE)
        self.pod.wait_log("policy applied", count=2, timeout=30)
        # Shortened bound: interval (2s) + deadline (4s) + apply time.
        self.assertLess(time.monotonic() - changed, 20)
        self.assertAccepted("-tls1_2", "-cipher", "ECDHE-RSA-AES128-GCM-SHA256")
        self.assertEqual(self.pod.inspect("{{.Id}}"), container_id)
        self.assertEqual(self.pod.inspect("{{.RestartCount}}"), "0")
        new_nginx = set(self.pod.nginx_pids())
        self.assertTrue(new_nginx)
        self.assertFalse(old_nginx & new_nginx, "old nginx master/workers must be gone")

    def test_stray_orphan_reaped(self):
        self.start(MODERN, command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_ready()
        podman("exec", self.pod.ossmc, "sh", "-c", "(sleep 0.5 &) ; exit 0")
        time.sleep(6)
        zombies = [p for p in self.pod.processes() if p["state"] == "Z"]
        self.assertEqual(zombies, [])

    def test_sigterm_shutdown_bound(self):
        self.start(MODERN)
        self.pod.wait_ready()
        start = time.monotonic()
        podman("stop", "-t", "30", self.pod.ossmc, timeout=60)
        self.assertLess(time.monotonic() - start, 10)
        self.assertEqual(self.pod.exit_code(), 0)


class FailureModesTest(ContainerTestCase):
    def test_api_down_at_startup_then_recovery(self):
        self.pod.set_api(status=503)
        self.start(None)
        self.pod.wait_log("cannot read the cluster TLS profile", count=2)
        self.assertNoListener()
        self.pod.set_profile(MODERN)
        self.pod.wait_ready()

    def test_forbidden_at_startup(self):
        self.pod.set_api(status=403)
        self.start(None)
        text = self.pod.wait_log("ossmconsole-service-account")
        self.assertIn("ossmconsole-tls", text)
        self.assertNoListener()
        self.assertTrue(self.pod.running())
        self.assertNotIn("OpenShift Service Mesh Console: Version", text)

    def test_old_while_serving_then_errors_then_recovery(self):
        self.start(MODERN, command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_ready()
        self.pod.set_profile({"type": "Old"})
        self.pod.wait_log("invalid cluster TLS profile")
        self.pod.wait_ready(False)
        self.assertNoListener()
        self.pod.set_api(status=500)
        self.pod.wait_log("cannot read the cluster TLS profile", count=2)
        self.assertNoListener()
        self.pod.set_profile(MODERN)
        self.pod.wait_ready()

    def test_invalid_profiles_never_start_nginx(self):
        cases = {
            "dhe-only": custom(ciphers=["DHE-RSA-AES128-GCM-SHA256", "DHE-RSA-AES256-GCM-SHA384"]),
            "unsupported-only": custom(ciphers=["DES-CBC3-SHA", "NOT-A-CIPHER"]),
            "selector": custom(ciphers=["HIGH"]),
            "selector-mixed": custom(ciphers=["ECDHE-RSA-AES128-GCM-SHA256", "aNULL"]),
            "groups-unusable": custom(minTLSVersion="VersionTLS13", groups=["NotAGroup"]),
        }
        self.start(cases.pop("dhe-only"), command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_log("invalid cluster TLS profile")
        self.assertNoListener()
        for name, profile in cases.items():
            with self.subTest(name):
                count = self.pod.logs().count("invalid cluster TLS profile")
                self.pod.set_profile(profile)
                self.pod.wait_log("invalid cluster TLS profile", count=count + 2)
                self.assertNoListener()

    def test_rotated_serving_cert(self):
        self.start(MODERN, command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_ready()
        before = self.pod.s_client("-showcerts", request=False)["raw"]
        self.pod.install_serving("serving-b")
        self.pod.wait_log("serving certificate changed", timeout=30)
        self.pod.wait_ready()
        after = self.pod.s_client("-showcerts", request=False)["raw"]
        self.assertIn("CN=serving-a", before)
        self.assertIn("CN=serving-b", after)

    def test_untrusted_api_server(self):
        self.pod.reload_front("X25519:secp256r1", cert="api-untrusted")
        self.start(MODERN)
        text = self.pod.wait_log("CERTIFICATE_VERIFY_FAILED")
        self.assertIn('kind="tls"', text)
        self.assertNoListener()


class HybridApiServerTest(ContainerTestCase):
    def test_cold_start_hybrid_only(self):
        for group in ("X25519MLKEM768", "SecP256r1MLKEM768"):
            with self.subTest(group):
                if self.pod.ossmc:
                    podman("rm", "-f", "-t", "0", self.pod.ossmc)
                self.pod.reload_front(group)
                self.start(custom(minTLSVersion="VersionTLS13", groups=[group]))
                self.pod.wait_ready()
                self.assertEqual(self.assertAccepted("-tls1_3", "-groups", group)["group"], group)

    def test_live_transition_to_hybrid_only(self):
        self.pod.reload_front("secp256r1")
        self.start(INTERMEDIATE, command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_ready()
        self.pod.reload_front("X25519MLKEM768")
        self.pod.set_profile(custom(minTLSVersion="VersionTLS13", groups=["X25519MLKEM768"]))
        self.pod.wait_log("policy applied", count=2, timeout=30)
        self.assertEqual(self.assertAccepted("-tls1_3", "-groups", "X25519MLKEM768")["group"], "X25519MLKEM768")
        # Later polls keep succeeding: a further change is still picked up.
        self.pod.set_profile(custom(minTLSVersion="VersionTLS13", groups=["X25519MLKEM768", "X25519"]))
        self.pod.wait_log("policy applied", count=3, timeout=30)

    def test_group_missing_from_client_list(self):
        self.start(MODERN, command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_ready()
        self.pod.reload_front("ffdhe2048")
        text = self.pod.wait_log('kind="tls"', timeout=30)
        self.assertIn('client_groups="X25519MLKEM768:X25519:secp256r1', text)
        self.assertEqual(self.pod.probe(), 0)
        self.assertAccepted("-tls1_3")


class SlowApiTest(ContainerTestCase):
    def test_trickling_api(self):
        self.start(MODERN, command=self.pod.short_interval_command(interval=2, deadline=4))
        self.pod.wait_ready()
        self.pod.set_api(mode="trickle")
        self.pod.wait_log("wall-clock deadline exceeded", timeout=30)
        self.assertEqual(self.pod.probe(), 0)
        self.assertAccepted("-tls1_3")
        start = time.monotonic()
        podman("stop", "-t", "30", self.pod.ossmc, timeout=60)
        self.assertLess(time.monotonic() - start, 10)


class FilesystemTest(ContainerTestCase):
    # Documented baseline (plugin README): nss_wrapper's passwd written by the s2i run script, podman's
    # passwd entry for the arbitrary UID, mount points, nginx's pid file, temp dirs and log symlinks.
    BASELINE = (
        "/etc",
        "/etc/passwd",
        "/opt",
        "/opt/app-root",
        "/opt/app-root/etc",
        "/opt/app-root/etc/passwd",
        "/run",
        "/run/nginx.pid",
        # Podman's bind-mounted fake ServiceAccount token creates its parent mount points.
        # GitHub-hosted runners report these in `podman diff`; local podman versions may not.
        "/run/secrets/kubernetes.io",
        "/run/secrets/kubernetes.io/serviceaccount",
        "/tmp",
        "/var",
        "/var/lib",
        "/var/lib/nginx",
        "/var/log",
        "/var/log/nginx",
        "/var/serving-cert",
    )

    def test_writes_and_static_exposure(self):
        self.start(MODERN)
        self.pod.wait_ready()
        diff = podman("diff", self.pod.ossmc).stdout.split("\n")
        paths = [line.split(None, 1)[1] for line in diff if line.strip()]
        self.assertFalse([p for p in paths if "__pycache__" in p], paths)
        unexpected = [
            p
            for p in paths
            if not (
                p.startswith("/tmp/ossmc")
                or p in self.BASELINE
                or p.startswith(("/var/log/nginx/", "/var/lib/nginx/tmp"))
            )
        ]
        self.assertEqual(unexpected, [], paths)
        for path in (
            "/tmp/ossmc/tls.conf",
            "/tmp/ossmc/state",
            "/tmp/ossmc/openssl-client.cnf",
            "/var/run/secrets/kubernetes.io/serviceaccount/token",
        ):
            for request in (path, f"/../../..{path}", f"/%2e%2e/%2e%2e/%2e%2e{path}"):
                self.assertNotEqual(self.fetch_status(request), "200", f"{request} must not be served")
        self.assertEqual(self.fetch_status("/plugin-manifest.json"), "200")

    def fetch_status(self, path):
        script = (
            f"printf 'GET {path} HTTP/1.1\\r\\nHost: x\\r\\nConnection: close\\r\\n\\r\\n' | timeout 10 "
            "openssl s_client -connect 127.0.0.1:9443 -quiet -ign_eof 2>/dev/null | head -1"
        )
        first = podman("exec", self.pod.api, "sh", "-c", script, check=False).stdout.split()
        return first[1] if len(first) > 1 else ""


class CompatibilityTest(ContainerTestCase):
    def test_new_image_with_pre_change_template(self):
        self.start(
            None,
            command=None,
            nginx_conf_manifest=os.path.join(INTEGRATION_DIR, "fixtures", "manifest-pre-change.yaml"),
            with_sa=False,
        )
        self.pod.wait_log("OpenShift Service Mesh Console: Version")
        self.assertAccepted("-tls1_3")
        procs = {p["pid"]: p for p in self.pod.processes()}
        self.assertTrue(procs["1"]["cmd"].startswith("nginx: master"), procs)
        self.assertFalse([p for p in procs.values() if "ossmc-tls-profile" in p["cmd"]])

    def test_helper_without_permissions_stays_unready(self):
        self.pod.set_api(status=403)
        self.start(None)
        self.pod.wait_log("cannot read the cluster TLS profile", count=2)
        self.assertTrue(self.pod.running())
        self.assertNoListener()
        self.assertFalse([p for p in self.pod.processes() if p["cmd"].startswith("nginx")])

    def test_legacy_nginx_conf_with_helper_exits(self):
        legacy = nginx_conf_from_manifest(os.path.join(INTEGRATION_DIR, "fixtures", "manifest-pre-change.yaml"))
        self.start(MODERN, nginx_conf_text=legacy)
        self.assertNotEqual(self.pod.exit_code(), 0)
        self.assertIn("include /tmp/ossmc/tls.conf;", self.pod.logs())
        self.assertNotIn("OpenShift Service Mesh Console: Version", self.pod.logs())


if __name__ == "__main__":
    unittest.main()
