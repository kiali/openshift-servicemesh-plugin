"""Shared test utilities. Standard library only.

Tests may use the subprocess module (the helper itself must not).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from typing import Dict, FrozenSet, List, Optional, Sequence

from ossmc_tls_profile import capabilities, paths
from ossmc_tls_profile.spawn import RunResult

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(SERVER_DIR, "tests", "fixtures")

# True inside the plugin's base image, where the real runtime is available.
IN_IMAGE = os.path.exists(paths.S2I_RUN) and os.path.exists(paths.NGINX)
OPENSSL = shutil.which("openssl") or paths.OPENSSL

in_image_only = unittest.skipUnless(IN_IMAGE, "requires the base image runtime (run make test-ossmc-tls-profile)")


def helper_argv() -> List[str]:
    """Run the helper package from this source tree as a child process."""
    code = f"import sys; sys.path.insert(0, {SERVER_DIR!r}); from ossmc_tls_profile.__main__ import main; main()"
    return [sys.executable, "-I", "-B", "-c", code]


def load_probe_fixture() -> Dict:
    with open(os.path.join(FIXTURES, "openssl-probes.json")) as f:
        return json.load(f)


class RecordedRunner:
    """Feeds recorded openssl outputs from the pinned image to OpenSSLCapabilities."""

    def __init__(self, data: Optional[Dict] = None, overrides: Optional[Dict] = None):
        self.data = data or load_probe_fixture()
        self.overrides = overrides or {}
        self.calls: List[List[str]] = []

    def __call__(self, argv: List[str]) -> RunResult:
        self.calls.append(argv)
        args = tuple(argv[1:])
        if args in self.overrides:
            return self.overrides[args]
        if args[:4] == ("ciphers", "-s", "-tls1_2", "-stdname"):
            rec = self.data["p1"][args[4]]
        elif args[:2] == ("ciphers", "-stdname"):
            rec = self.data["p2"][args[2]]
        elif args[:4] == ("ciphers", "-s", "-tls1_3", "-ciphersuites"):
            rec = self.data["tls13"][args[4]]
        elif args[0] == "list":
            rec = self.data["groups"][args[1].replace("-tls", "")]
        else:
            raise AssertionError(f"unexpected probe {argv}")
        return RunResult("exited", returncode=rec["rc"], stdout=rec["stdout"].encode(), stderr=rec["stderr"].encode())


class FakeCapabilities:
    """Injectable capabilities with image-like defaults."""

    INTERMEDIATE_TLS12 = {
        "ECDHE-ECDSA-AES128-GCM-SHA256": ("TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256", "ECDSA"),
        "ECDHE-RSA-AES128-GCM-SHA256": ("TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256", "RSA"),
        "ECDHE-ECDSA-AES256-GCM-SHA384": ("TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384", "ECDSA"),
        "ECDHE-RSA-AES256-GCM-SHA384": ("TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384", "RSA"),
        "ECDHE-ECDSA-CHACHA20-POLY1305": ("TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256", "ECDSA"),
        "ECDHE-RSA-CHACHA20-POLY1305": ("TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256", "RSA"),
        "ECDHE-RSA-AES128-SHA256": ("TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256", "RSA"),
        "AES128-GCM-SHA256": ("TLS_RSA_WITH_AES_128_GCM_SHA256", "RSA"),
        "DHE-RSA-AES128-GCM-SHA256": ("TLS_DHE_RSA_WITH_AES_128_GCM_SHA256", "RSA"),
        "DHE-RSA-AES256-GCM-SHA384": ("TLS_DHE_RSA_WITH_AES_256_GCM_SHA384", "RSA"),
    }
    SELECTORS = {"HIGH", "ALL", "DEFAULT", "aNULL", "eNULL", "NULL", "kRSA", "CHACHA20"}
    GROUPS13 = frozenset(
        "secp256r1 secp384r1 secp521r1 x25519 x448 ffdhe2048 mlkem768 securep256r1mlkem768 "
        "x25519mlkem768 secp256r1mlkem768 secp384r1mlkem1024".split()
    )
    GROUPS12 = frozenset("secp256r1 secp384r1 secp521r1 x25519 x448".split())

    def __init__(
        self,
        unavailable: Sequence[str] = (),
        tls13_missing: Sequence[str] = (),
        groups13: Optional[FrozenSet[str]] = None,
        groups12: Optional[FrozenSet[str]] = None,
        error: Optional[str] = None,
    ):
        self.unavailable = set(unavailable)
        self.tls13_missing = set(tls13_missing)
        self.groups13 = self.GROUPS13 if groups13 is None else groups13
        self.groups12 = self.GROUPS12 if groups12 is None else groups12
        self.error = error
        self.tls12_calls: List[str] = []

    def _maybe_fail(self) -> None:
        if self.error:
            raise capabilities.CapabilityError(self.error)

    def tls12_identity(self, token: str) -> capabilities.Tls12Identity:
        self._maybe_fail()
        self.tls12_calls.append(token)
        if token in self.SELECTORS:
            return capabilities.Tls12Identity(capabilities.SELECTOR)
        for ossl, (std, auth) in self.INTERMEDIATE_TLS12.items():
            if token.lower() in (ossl.lower(), std.lower()):
                if ossl in self.unavailable:
                    return capabilities.Tls12Identity(capabilities.UNAVAILABLE, ossl, std, auth, "filtered")
                return capabilities.Tls12Identity(capabilities.SUITE, ossl, std, auth)
        return capabilities.Tls12Identity(capabilities.UNAVAILABLE, detail="unknown")

    def tls13_available(self, name: str) -> bool:
        self._maybe_fail()
        return name not in self.tls13_missing

    def groups(self, version: str) -> FrozenSet[str]:
        self._maybe_fail()
        return self.groups13 if version == "1.3" else self.groups12


class TempDirTestCase(unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.tmp = tempfile.mkdtemp(prefix="ossmc-test-")
        os.chmod(self.tmp, 0o755)
        self.addCleanup(shutil.rmtree, self.tmp, True)


def openssl(*args: str, cwd: Optional[str] = None) -> None:
    subprocess.run([OPENSSL, *args], check=True, cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class Certs:
    """A throwaway CA and server certificates, created with the openssl CLI."""

    def __init__(self, directory: str, name: str = "ca"):
        self.dir = directory
        self.ca_crt = os.path.join(directory, f"{name}.crt")
        self.ca_key = os.path.join(directory, f"{name}.key")
        openssl(
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "2",
            "-subj",
            f"/CN=test {name}",
            "-addext",
            "basicConstraints=critical,CA:TRUE",
            "-addext",
            "keyUsage=critical,keyCertSign,cRLSign",
            "-addext",
            "subjectKeyIdentifier=hash",
            "-keyout",
            self.ca_key,
            "-out",
            self.ca_crt,
        )

    def issue(
        self,
        name: str,
        sans: Sequence[str] = ("IP:127.0.0.1", "IP:::1", "DNS:localhost"),
        key: str = "rsa",
    ) -> tuple:
        crt = os.path.join(self.dir, f"{name}.crt")
        keyfile = os.path.join(self.dir, f"{name}.key")
        csr = os.path.join(self.dir, f"{name}.csr")
        ext = os.path.join(self.dir, f"{name}.ext")
        with open(ext, "w") as f:
            f.write(
                "subjectAltName=" + ",".join(sans) + "\n"
                "basicConstraints=CA:FALSE\n"
                "keyUsage=critical,digitalSignature,keyEncipherment\n"
                "extendedKeyUsage=serverAuth\n"
                "subjectKeyIdentifier=hash\n"
                "authorityKeyIdentifier=keyid\n"
            )
        newkey = ["-newkey", "rsa:2048"] if key == "rsa" else ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256"]
        openssl("req", "-new", *newkey, "-nodes", "-subj", f"/CN={name}", "-keyout", keyfile, "-out", csr)
        openssl(
            "x509",
            "-req",
            "-in",
            csr,
            "-CA",
            self.ca_crt,
            "-CAkey",
            self.ca_key,
            "-CAcreateserial",
            "-days",
            "2",
            "-extfile",
            ext,
            "-out",
            crt,
        )
        return crt, keyfile


def apiserver_json(profile: object = None, present: bool = True) -> bytes:
    spec: Dict = {}
    if present:
        spec["tlsSecurityProfile"] = profile
    return json.dumps(
        {"apiVersion": "config.openshift.io/v1", "kind": "APIServer", "metadata": {"name": "cluster"}, "spec": spec}
    ).encode()


def proc_status(pid: int) -> Dict[str, str]:
    out = {}
    with open(f"/proc/{pid}/status") as f:
        for line in f:
            key, _, value = line.partition(":")
            out[key] = value.strip()
    return out


def sig_bit(mask_hex: str, signum: int) -> bool:
    return bool(int(mask_hex, 16) & (1 << (signum - 1)))
