"""Runtime TLS capabilities from the image's openssl CLI.

The openssl CLI links the same libssl as nginx, so it gives exact suite
identity and availability for the runtime that will serve the policy.
Python's ssl module is not used for this: get_ciphers() never reports IANA
names.

Definitive results are cached for the process lifetime. Anything that is not a
definitive answer raises CapabilityError, which is never cached and never
treated as a verdict on the profile.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, FrozenSet, List, Optional

from . import paths
from .spawn import RunResult

PROBE_DEADLINE = 5.0
PROBE_STDOUT_CAP = 64 * 1024
PROBE_STDERR_CAP = 16 * 1024

_NO_MATCH = (b"Error in cipher list", b"no cipher match")


class CapabilityError(Exception):
    """The runtime's capabilities could not be evaluated right now."""


SUITE = "suite"
SELECTOR = "selector"
UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class Tls12Identity:
    kind: str
    openssl_name: Optional[str] = None
    std_name: Optional[str] = None
    auth: Optional[str] = None
    detail: str = ""


@dataclass(frozen=True)
class _CipherLine:
    std_name: str
    openssl_name: str
    version: str
    auth: Optional[str]


Runner = Callable[[List[str]], RunResult]


def _parse_cipher_lines(stdout: bytes) -> List[_CipherLine]:
    lines = []
    for raw in stdout.decode("ascii", "replace").splitlines():
        if not raw.strip():
            continue
        parts = raw.split()
        if len(parts) < 4 or parts[1] != "-":
            raise CapabilityError(f"unexpected openssl ciphers output line: {raw[:200]!r}")
        auth = next((p[3:] for p in parts if p.startswith("Au=")), None)
        lines.append(_CipherLine(parts[0], parts[2], parts[3], auth))
    return lines


def _matches(line: _CipherLine, token: str) -> bool:
    lowered = token.lower()
    return lowered in (line.std_name.lower(), line.openssl_name.lower())


class OpenSSLCapabilities:
    def __init__(self, run: Runner, openssl: str = paths.OPENSSL):
        self._run = run
        self._openssl = openssl
        self._tls12: Dict[str, Tls12Identity] = {}
        self._tls13: Dict[str, bool] = {}
        self._groups: Dict[str, FrozenSet[str]] = {}

    def _exec(self, args: List[str]) -> RunResult:
        result = self._run([self._openssl] + args)
        if not result.completed:
            raise CapabilityError(f"openssl {' '.join(args[:3])}: {result.describe()}")
        return result

    def tls12_identity(self, token: str) -> Tls12Identity:
        """Classify one well-formed cipher token for TLS 1.2 (at most two probes)."""
        cached = self._tls12.get(token)
        if cached is not None:
            return cached
        identity = self._classify(token)
        self._tls12[token] = identity
        return identity

    def _classify(self, token: str) -> Tls12Identity:
        """Two-probe protocol for one TLS 1.2 cipher name.

        p1 (the -s form, current security level applied) asks "usable for TLS 1.2 by
        this runtime": a no-match failure means unknown or unavailable, one matching
        line means a usable suite, several lines mean a selector. p2 (without -s) is
        the second chance after an empty p1: it separates a suite openssl knows but
        will not use right now from a selector that expands to nothing usable.
        """
        p1 = self._exec(["ciphers", "-s", "-tls1_2", "-stdname", token])
        if p1.returncode != 0:
            if any(marker in p1.stderr for marker in _NO_MATCH):
                return Tls12Identity(UNAVAILABLE, detail="unknown or unavailable cipher name")
            raise CapabilityError(
                f"openssl ciphers failed for a cipher token: exit code {p1.returncode}: "
                f"{p1.stderr.decode('ascii', 'replace').strip()[:300]}"
            )
        lines = _parse_cipher_lines(p1.stdout)
        if len(lines) == 1 and _matches(lines[0], token):
            line = lines[0]
            return Tls12Identity(SUITE, line.openssl_name, line.std_name, line.auth)
        if lines:
            return Tls12Identity(SELECTOR, detail=f"expands to {len(lines)} suite(s)")

        p2 = self._exec(["ciphers", "-stdname", token])
        if p2.returncode != 0:
            raise CapabilityError(
                f"openssl ciphers (without -s) failed after an empty TLS 1.2 result: exit code {p2.returncode}"
            )
        # OpenSSL always appends the TLS 1.3 suites to a cipher-string expansion.
        tls12_lines = [line for line in _parse_cipher_lines(p2.stdout) if line.version != "TLSv1.3"]
        if len(tls12_lines) == 1 and _matches(tls12_lines[0], token):
            line = tls12_lines[0]
            return Tls12Identity(
                UNAVAILABLE,
                line.openssl_name,
                line.std_name,
                line.auth,
                detail="known suite that this runtime cannot use for TLS 1.2",
            )
        return Tls12Identity(SELECTOR, detail=f"expands to {len(tls12_lines)} suite(s)")

    def tls13_available(self, name: str) -> bool:
        cached = self._tls13.get(name)
        if cached is not None:
            return cached
        result = self._exec(["ciphers", "-s", "-tls1_3", "-ciphersuites", name])
        # rc 0 with the suite echoed back means supported; "no cipher match" means not;
        # anything else is openssl misbehaving rather than a verdict on the suite.
        if result.returncode != 0:
            if any(marker in result.stderr for marker in _NO_MATCH):
                available = False
            else:
                raise CapabilityError(f"openssl ciphers -tls1_3 failed: exit code {result.returncode}")
        else:
            lines = [ln.strip() for ln in result.stdout.decode("ascii", "replace").splitlines() if ln.strip()]
            if lines == [name]:
                available = True
            elif name not in lines:
                available = False
            else:
                raise CapabilityError(f"unexpected openssl ciphers -tls1_3 output: {lines[:5]}")
        self._tls13[name] = available
        return available

    def groups(self, version: str) -> FrozenSet[str]:
        """Implemented TLS groups for "1.2" or "1.3", lowercased."""
        cached = self._groups.get(version)
        if cached is not None:
            return cached
        flag = {"1.2": "-tls1_2", "1.3": "-tls1_3"}[version]
        result = self._exec(["list", flag, "-tls-groups"])
        if result.returncode != 0:
            raise CapabilityError(f"openssl list {flag} -tls-groups failed: exit code {result.returncode}")
        text = result.stdout.decode("ascii", "replace").strip()
        names = frozenset(g.strip().lower() for g in text.split(":") if g.strip())
        if not names or any(" " in n for n in names):
            raise CapabilityError(f"unexpected openssl list {flag} -tls-groups output: {text[:200]!r}")
        self._groups[version] = names
        return names


class CapabilitiesLike:  # pragma: no cover - the interface resolve.py depends on
    def tls12_identity(self, token: str) -> Tls12Identity: ...

    def tls13_available(self, name: str) -> bool: ...

    def groups(self, version: str) -> FrozenSet[str]: ...
