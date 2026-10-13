"""Per-process OpenSSL configurations for the fetch and self-check children.

RHEL's /etc/pki/tls/openssl.cnf applies "[ssl_module] system_default =
crypto_policy" to every SSL_CTX. Re-opening "[ crypto_policy ]" after including
that file overrides single settings (here Groups and Ciphersuites) while
inheriting the rest of the system policy, including FIPS handling. OPENSSL_CONF
is read by libcrypto at startup, so these files only take effect in a child
started with OPENSSL_CONF in its environment.
"""

from __future__ import annotations

import os
import re
from typing import Iterable, Optional, Sequence, Tuple

from . import paths
from .capabilities import CapabilitiesLike, CapabilityError

# Every OpenShift TLSGroup, most preferred first.
CLIENT_GROUP_ORDER: Tuple[str, ...] = (
    "X25519MLKEM768",
    "X25519",
    "secp256r1",
    "secp384r1",
    "SecP256r1MLKEM768",
    "SecP384r1MLKEM1024",
    "secp521r1",
)

_SYSTEM_DEFAULT_RE = re.compile(r"^\s*system_default\s*=\s*crypto_policy\s*$", re.MULTILINE)
_SECTION_RE = re.compile(r"^\s*\[\s*crypto_policy\s*\]\s*$", re.MULTILINE)


def check_contract(path: str = paths.SYSTEM_OPENSSL_CNF) -> Optional[str]:
    """Return an error message if the system OpenSSL config cannot be overridden as designed."""
    # If the system openssl.cnf is ever reshaped, re-opening [crypto_policy] silently
    # stops working and the client falls back to system-default groups; this check
    # makes that loud instead of a mysterious change in TLS behavior.
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError as exc:
        return f"cannot read {path}: {exc.strerror or exc}"
    missing = []
    if not _SYSTEM_DEFAULT_RE.search(text):
        missing.append("'system_default = crypto_policy'")
    if not _SECTION_RE.search(text):
        missing.append("a '[ crypto_policy ]' section")
    if missing:
        return f"{path} lacks {' and '.join(missing)}; the API client cannot set its TLS groups"
    return None


def read_fips(path: str = paths.FIPS_ENABLED) -> bool:
    try:
        with open(path) as f:
            return f.read().strip() == "1"
    except OSError:
        return False


def client_groups(caps: CapabilitiesLike, fips: bool) -> Tuple[str, ...]:
    """Groups the API client offers: every OpenShift group the runtime implements.

    Independent of the profile, because the client must be able to read a
    profile it does not know yet. Raises CapabilityError if probes fail.
    """
    implemented = caps.groups("1.3") | caps.groups("1.2")
    # X25519MLKEM768 is dropped under FIPS because X25519 itself is not FIPS-approved
    # (the secp256r1/secp384r1 MLKEM hybrids are fine); upstream marks the group the
    # same way.
    groups = tuple(g for g in CLIENT_GROUP_ORDER if g.lower() in implemented and not (fips and g == "X25519MLKEM768"))
    if not groups:
        raise CapabilityError("no OpenShift TLS group is implemented by this runtime")
    return groups


def render(settings: Iterable[Tuple[str, str]], system_cnf: str = paths.SYSTEM_OPENSSL_CNF) -> str:
    lines = [f".include {system_cnf}", "[ crypto_policy ]"]
    lines.extend(f"{key} = {value}" for key, value in settings)
    return "\n".join(lines) + "\n"


def render_client(groups: Sequence[str], system_cnf: str = paths.SYSTEM_OPENSSL_CNF) -> str:
    return render([("Groups", ":".join(groups))], system_cnf)


def render_selfcheck(
    tls13_suites: Sequence[str], groups: Optional[Sequence[str]], system_cnf: str = paths.SYSTEM_OPENSSL_CNF
) -> str:
    settings = [("Ciphersuites", ":".join(tls13_suites))]
    if groups is not None:
        settings.append(("Groups", ":".join(groups)))
    return render(settings, system_cnf)


def write_private(path: str, text: str) -> None:
    """Atomically write a 0600 file."""
    tmp = f"{path}.tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.fchmod(fd, 0o600)
        os.write(fd, text.encode("utf-8"))
    finally:
        os.close(fd)
    os.replace(tmp, path)
