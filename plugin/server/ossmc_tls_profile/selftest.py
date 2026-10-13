"""Image build check: fail the build if the interpreter contract breaks.

Run by the Dockerfile right after the helper zipapp is installed
(`/usr/local/bin/ossmc-tls-profile --self-test`). It pins the assumptions the
helper makes about the base image: Python >= 3.9 with TLS 1.3, os.posix_spawn
with setsid support (spawn.py depends on both), the system OpenSSL config shape
that clientconf.py overrides, and that every module loads from the zipapp's
bytecode rather than falling back to source.
"""

from __future__ import annotations

import importlib
import os
import ssl
import sys
from typing import List

from . import clientconf

MODULES = (
    "ossmc_tls_profile",
    "ossmc_tls_profile.__main__",
    "ossmc_tls_profile.apiclient",
    "ossmc_tls_profile.capabilities",
    "ossmc_tls_profile.clientconf",
    "ossmc_tls_profile.log",
    "ossmc_tls_profile.paths",
    "ossmc_tls_profile.probe",
    "ossmc_tls_profile.profiles",
    "ossmc_tls_profile.resolve",
    "ossmc_tls_profile.selfcheck",
    "ossmc_tls_profile.selftest",
    "ossmc_tls_profile.spawn",
    "ossmc_tls_profile.supervisor",
    "ossmc_tls_profile._version",
)


def problems(require_bytecode: bool = True) -> List[str]:
    found: List[str] = []
    if sys.version_info < (3, 9):  # noqa: UP036 - a guard against a changed base image
        found.append(f"Python >= 3.9 required, found {sys.version.split()[0]}")
    if not ssl.HAS_TLSv1_3:
        found.append("ssl.HAS_TLSv1_3 is false")
    if not hasattr(os, "posix_spawn"):
        found.append("os.posix_spawn is unavailable")
    else:
        try:
            # The exact call shape spawn.py relies on; not every libc exposes the
            # setsid/setsigmask keywords.
            pid = os.posix_spawn("/bin/true", ["true"], {}, setsid=True, setsigmask=())
            os.waitpid(pid, 0)
        except (OSError, TypeError) as exc:
            found.append(f"os.posix_spawn with setsid failed: {exc}")
    contract = clientconf.check_contract()
    if contract:
        found.append(contract)
    for name in MODULES:
        try:
            module = importlib.import_module(name)
        except ImportError as exc:
            found.append(f"cannot import {name}: {exc}")
            continue
        origin = getattr(module, "__file__", "") or ""
        # Zip-imported modules report their .pyc path in __file__ when loaded from
        # bytecode, and the .py path when the zip importer fell back to source.
        if require_bytecode and not origin.endswith(".pyc"):
            found.append(f"{name} was not loaded from bytecode ({origin})")
    return found


def main() -> int:
    found = problems()
    for problem in found:
        sys.stderr.write(f"ossmc-tls-profile: self-test failed: {problem}\n")
    if found:
        return 1
    sys.stdout.write("ossmc-tls-profile: self-test passed\n")
    return 0
