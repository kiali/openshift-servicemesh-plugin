"""Record openssl probe outputs for tests/fixtures/openssl-probes.json.

The TLS profile helper renders nginx TLS configuration from the OpenShift cluster TLS
security profile, and to do that it must know what the local OpenSSL actually supports:
which TLS 1.2 ciphers a name or alias resolves to, which TLS 1.3 ciphersuites exist, and
which TLS groups (curves) are available. It learns this by running openssl at runtime.

The unit tests exercise that mapping logic without running a real openssl, whose output
varies by OpenSSL version and build. Instead they run tests/fixtures/fake_openssl.py, a
stub that replays the rc/stdout/stderr recorded in openssl-probes.json — captured from
the openssl of the base image the plugin ships on. The tests are then deterministic but
still assert against genuine behavior rather than hand-written guesses.

This script makes that recording: it probes cipher tokens (valid names, aliases such as
CHACHA20, invalid ones such as NOT-A-CIPHER, and selectors such as ALL or aNULL), the
TLS 1.3 ciphersuites, and the TLS group lists, and writes the results to the fixture
file next to the openssl version string they came from. The per-process address openssl
prefixes to error lines is normalized, so recording an unchanged image twice yields an
identical file and a diff means real behavioral change.

Re-record whenever the base image changes: a new OpenSSL can drop or add ciphers, change
group support, or alter error strings the helper parses. Nobody has to remember that: the
in-image unit tests re-run these probes and fail as soon as the committed fixture no
longer matches the image's openssl, so drift is caught in CI. From the repo root run:

  make record-ossmc-tls-probes

That target runs this script inside the same Dockerfile base image the tests use, so the
recording cannot come from a different openssl than the fixtures claim to represent.
Review the JSON diff before committing it: a meaningful change there is the signal that
the helper's rendering logic and the golden tests may need updating too.
"""

import json
import re
import subprocess
import sys

TOKENS = [
    "ECDHE-ECDSA-AES128-GCM-SHA256",
    "ECDHE-RSA-AES128-GCM-SHA256",
    "ECDHE-ECDSA-AES256-GCM-SHA384",
    "ECDHE-RSA-AES256-GCM-SHA384",
    "ECDHE-ECDSA-CHACHA20-POLY1305",
    "ECDHE-RSA-CHACHA20-POLY1305",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "ECDHE-RSA-AES128-SHA256",
    "ECDHE-RSA-AES128-SHA",
    "AES128-GCM-SHA256",
    "AES256-GCM-SHA384",
    "AES128-SHA",
    "DES-CBC3-SHA",
    "RC4-SHA",
    "NOT-A-CIPHER",
    "DHE-RSA-AES128-GCM-SHA256",
    "DHE-RSA-AES256-GCM-SHA384",
    "ADH-AES256-GCM-SHA384",
    "aNULL",
    "eNULL",
    "NULL",
    "HIGH",
    "ALL",
    "DEFAULT",
    "kRSA",
    "CHACHA20",
    "AESGCM",
    "ecdhe-rsa-aes128-gcm-sha256",
    "TLS_AES_128_CCM_SHA256",
]
TLS13 = ["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256", "TLS_NOT_A_SUITE"]


# openssl prefixes each error line with a per-process address (e.g. "4047D825517F0000:error:...")
# that differs on every invocation. Normalize it so recordings are reproducible byte for byte;
# the capabilities parser only matches the "Error in cipher list"/"no cipher match" markers.
_ADDR = re.compile(r"\b[0-9A-F]{16}:error:")


def run(args):
    p = subprocess.run(["/usr/bin/openssl"] + args, capture_output=True, text=True, check=False)
    return {"rc": p.returncode, "stdout": p.stdout, "stderr": _ADDR.sub("<addr>:error:", p.stderr)}


def collect():
    """Runs every probe against this machine's /usr/bin/openssl and returns the fixture dict."""
    version = run(["version"])["stdout"].strip()
    out = {"openssl": version, "p1": {}, "p2": {}, "tls13": {}, "groups": {}}
    for t in TOKENS:
        out["p1"][t] = run(["ciphers", "-s", "-tls1_2", "-stdname", t])
        out["p2"][t] = run(["ciphers", "-stdname", t])
    for s in TLS13:
        out["tls13"][s] = run(["ciphers", "-s", "-tls1_3", "-ciphersuites", s])
    for v in ("1_2", "1_3"):
        out["groups"][v] = run(["list", "-tls" + v, "-tls-groups"])
    return out


def main():
    json.dump(collect(), sys.stdout, indent=1, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
