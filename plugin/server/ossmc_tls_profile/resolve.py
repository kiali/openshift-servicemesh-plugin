"""Resolve an OpenShift TLSSecurityProfile into an nginx policy.

Profile-shape handling follows the Kiali server (tlspolicy/resolver.go):
an absent profile means Intermediate, unknown types and a Custom profile
without a body are rejected, TLS 1.0/1.1 are rejected, and under a TLS 1.3
minimum the cipher list is ignored. Cipher and group names are resolved
against the actual OpenSSL runtime (capabilities.py), not Go's tables.

resolve() raises InvalidProfile for a definitive verdict and lets
CapabilityError (transient) propagate.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from . import profiles
from .capabilities import SELECTOR, SUITE, CapabilitiesLike

TLS12 = "TLSv1.2"
TLS13 = "TLSv1.3"

# The only TLS 1.3 suites ever rendered, in OpenShift profile order.
TLS13_SUITES: Tuple[str, ...] = (
    "TLS_AES_128_GCM_SHA256",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
)
# TLS 1.3 suites OpenSSL knows that are never rendered (the CCM suite is the
# root cause of OSSMC issue 874).
OTHER_TLS13_SUITES = frozenset(
    {"TLS_AES_128_CCM_SHA256", "TLS_AES_128_CCM_8_SHA256", "TLS_SHA256_SHA256", "TLS_SHA384_SHA384"}
)

# Also the injection barrier: nothing outside this grammar reaches the include.
TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*\Z")

_VERSIONS = {
    "": TLS12,
    "TLSv1.2": TLS12,
    "TLS1.2": TLS12,
    profiles.VERSION_TLS12: TLS12,
    "TLSv1.3": TLS13,
    "TLS1.3": TLS13,
    profiles.VERSION_TLS13: TLS13,
}
_REJECTED_VERSIONS = {
    "TLSv1.0": "1.0",
    "TLS1.0": "1.0",
    profiles.VERSION_TLS10: "1.0",
    "TLSv1.1": "1.1",
    "TLS1.1": "1.1",
    profiles.VERSION_TLS11: "1.1",
}

_GROUP_SPELLING = {g.lower(): g for g in profiles.TLS_GROUPS}
FIPS_EXCLUDED_GROUPS = frozenset({"x25519mlkem768"})


class InvalidProfile(Exception):
    """The profile can definitively not be applied."""


@dataclass(frozen=True)
class Policy:
    protocols: Tuple[str, ...]
    tls13_suites: Tuple[str, ...]
    tls12_ciphers: Tuple[str, ...]
    # None means "no opinion": nginx follows the system crypto policy.
    groups: Optional[Tuple[str, ...]]

    @property
    def tls12_enabled(self) -> bool:
        return TLS12 in self.protocols

    def summary(self) -> str:
        groups = "system-default" if self.groups is None else ":".join(self.groups)
        ciphers = ":".join(self.tls12_ciphers) or "-"
        return (
            f"protocols={' '.join(self.protocols)} tls13={':'.join(self.tls13_suites)} tls12={ciphers} groups={groups}"
        )


Logger = Callable[..., None]


def _noop(*_args: Any, **_kwargs: Any) -> None:
    pass


@dataclass
class _Spec:
    name: str
    ciphers: List[str]
    groups: Optional[List[str]]
    min_version: str


def _string_list(value: Any, field: str) -> List[str]:
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise InvalidProfile(f"{field} must be a list of strings")
    return list(value)


def profile_spec(profile: Any) -> _Spec:
    """Extract the effective spec, matching Kiali's getTLSProfileSpec."""
    if profile is None:
        preset = profiles.PRESETS["Intermediate"]
        return _Spec("Intermediate (default)", list(preset.ciphers), list(preset.groups), preset.min_tls_version)
    if not isinstance(profile, dict):
        raise InvalidProfile("spec.tlsSecurityProfile must be an object")
    ptype = profile.get("type")
    if isinstance(ptype, str) and ptype in profiles.PRESETS:
        preset = profiles.PRESETS[ptype]
        return _Spec(ptype, list(preset.ciphers), list(preset.groups), preset.min_tls_version)
    if ptype == "Custom":
        custom = profile.get("custom")
        if custom is None:
            raise InvalidProfile("custom TLS profile specified but the custom field is missing or null")
        if not isinstance(custom, dict):
            raise InvalidProfile("spec.tlsSecurityProfile.custom must be an object")
        ciphers = custom.get("ciphers")
        groups = custom.get("groups")
        min_version = custom.get("minTLSVersion")
        if min_version is None:
            min_version = ""
        if not isinstance(min_version, str):
            raise InvalidProfile("custom.minTLSVersion must be a string")
        return _Spec(
            "Custom",
            [] if ciphers is None else _string_list(ciphers, "custom.ciphers"),
            # Kiali treats an empty list like an omitted one: no opinion.
            None if not groups else _string_list(groups, "custom.groups"),
            min_version,
        )
    shown = ptype if isinstance(ptype, str) else ("" if ptype is None else repr(ptype))
    raise InvalidProfile(f"unknown TLS profile type: [{shown}]")


def parse_min_version(value: str, profile_name: str) -> str:
    version = value.strip()
    if version in _VERSIONS:
        return _VERSIONS[version]
    if version in _REJECTED_VERSIONS:
        raise InvalidProfile(
            f"profile {profile_name} requires a TLS {_REJECTED_VERSIONS[version]} minimum; "
            "OSSMC does not support TLS versions below 1.2 and stays stopped until the cluster "
            "profile requires TLS 1.2 or higher"
        )
    raise InvalidProfile(f"unknown TLS version [{value}]; supported versions are TLSv1.2 and TLSv1.3")


def _check_tokens(tokens: Sequence[str], field: str) -> None:
    bad = [t for t in tokens if not TOKEN_RE.match(t)]
    if bad:
        raise InvalidProfile(f"malformed {field} entries {bad!r}; each must match {TOKEN_RE.pattern}")


def _resolve_tls12(spec: _Spec, caps: CapabilitiesLike, warn: Logger, info: Logger) -> Tuple[Tuple[str, ...], bool]:
    """Return (retained TLS 1.2 suites, whether a standard TLS 1.3 name was listed).

    Malformed names reject the profile outright (corrupt data); TLS 1.3 suite names
    are set aside (they are never TLS 1.2 ciphers); selectors are rejected (they
    would silently broaden the policy); then each remaining name is classified
    against the runtime, skipping with a warning what nginx cannot serve (unusable
    suites, and DHE suites because no ssl_dhparam is configured).
    """
    names = spec.ciphers
    defaulted = False
    if not names:
        defaulted = True
        names = [c for c in profiles.PRESETS["Intermediate"].ciphers if c not in TLS13_SUITES]
        info("custom profile lists no ciphers; using the Intermediate TLS 1.2 suites", ciphers=":".join(names))
    _check_tokens(names, "cipher")

    upper13 = set(TLS13_SUITES)
    listed_tls13 = any(n.upper() in upper13 for n in names)
    tls12_tokens = []
    for name in names:
        upper = name.upper()
        if upper in upper13:
            continue
        if upper in OTHER_TLS13_SUITES:
            warn("skipping TLS 1.3 suite outside the permitted set", cipher=name)
            continue
        tls12_tokens.append(name)

    identities = [(t, caps.tls12_identity(t)) for t in tls12_tokens]
    selectors = [t for t, ident in identities if ident.kind == SELECTOR]
    if selectors:
        raise InvalidProfile(
            f"cipher list contains cipher-string selectors {selectors!r}; only individual suite names are accepted"
        )

    retained: List[str] = []
    auths = set()
    for token, ident in identities:
        if ident.kind != SUITE:
            warn("skipping cipher not usable by this runtime", cipher=token, reason=ident.detail)
            continue
        assert ident.openssl_name is not None
        std = (ident.std_name or "").upper()
        if ident.openssl_name.startswith(("DHE-", "EDH-")) or "_DHE_" in std:
            warn("skipping DHE cipher; no ssl_dhparam is configured", cipher=token)
            continue
        if ident.openssl_name not in retained:
            retained.append(ident.openssl_name)
            auths.add(ident.auth)

    if retained and auths == {"ECDSA"}:
        warn(
            "every retained TLS 1.2 suite requires an ECDSA certificate; TLS 1.2 handshakes fail with an RSA "
            "serving certificate (the service CA issues RSA keys)"
        )
    if not retained:
        if defaulted:
            raise InvalidProfile("none of the default Intermediate TLS 1.2 suites is usable by this runtime")
        if not listed_tls13:
            raise InvalidProfile(
                f"no usable TLS cipher suites found from list {spec.ciphers!r} "
                "(DHE, unknown and runtime-unavailable suites are skipped)"
            )
    return tuple(retained), listed_tls13


def _resolve_groups(
    requested: Optional[List[str]],
    tls12_enabled: bool,
    caps: CapabilitiesLike,
    fips: bool,
    warn: Logger,
) -> Optional[Tuple[str, ...]]:
    if requested is None:
        return None
    # Well-formed but unknown group names are skipped with a warning rather than
    # rejected: a newer OpenShift may know groups this helper does not. Malformed
    # names still reject the whole profile.
    _check_tokens(requested, "group")
    g13 = caps.groups("1.3")
    g12 = caps.groups("1.2") if tls12_enabled else frozenset()
    retained: List[str] = []
    for name in requested:
        lowered = name.lower()
        spelling = _GROUP_SPELLING.get(lowered)
        if spelling is None:
            warn("skipping group that is not an OpenShift TLS group", group=name)
            continue
        if fips and lowered in FIPS_EXCLUDED_GROUPS:
            warn("removing group not permitted in FIPS mode", group=spelling)
            continue
        if lowered not in g13 and lowered not in g12:
            warn("removing group not implemented by this runtime", group=spelling)
            continue
        if spelling not in retained:
            retained.append(spelling)
    if not retained:
        raise InvalidProfile(f"no usable TLS groups remain from list {requested!r}")
    if tls12_enabled and not any(g.lower() in g12 for g in retained):
        warn(
            "no retained group is usable for TLS 1.2; TLS 1.2 ECDHE handshakes cannot succeed",
            groups=":".join(retained),
        )
    return tuple(retained)


def resolve(
    profile: Any,
    caps: CapabilitiesLike,
    fips: bool = False,
    warn: Logger = _noop,
    info: Logger = _noop,
) -> Policy:
    """Resolve spec.tlsSecurityProfile (None when absent) into a Policy."""
    spec = profile_spec(profile)
    min_version = parse_min_version(spec.min_version, spec.name)

    tls12_ciphers: Tuple[str, ...] = ()
    if min_version == TLS13:
        protocols: Tuple[str, ...] = (TLS13,)
        if spec.ciphers and spec.name == "Custom":
            info("TLS 1.2 ciphers do not apply under a TLS 1.3 minimum; ignoring the profile's cipher list")
    else:
        tls12_ciphers, _ = _resolve_tls12(spec, caps, warn, info)
        if tls12_ciphers:
            protocols = (TLS12, TLS13)
        else:
            warn("no TLS 1.2 suite remains; TLS 1.2 is disabled and only TLS 1.3 is served")
            protocols = (TLS13,)

    tls13 = tuple(s for s in TLS13_SUITES if caps.tls13_available(s))
    if not tls13:
        raise InvalidProfile("none of the permitted TLS 1.3 suites is available in this runtime")

    groups = _resolve_groups(spec.groups, TLS12 in protocols, caps, fips, warn)
    return Policy(protocols, tls13, tls12_ciphers, groups)


def render(policy: Policy) -> str:
    """Render the nginx include. Equal policies render byte-identical text."""
    lines = [
        "# Generated by ossmc-tls-profile from the cluster TLS security profile. Do not edit.",
        f"ssl_protocols {' '.join(policy.protocols)};",
    ]
    if policy.tls12_ciphers:
        lines.append(f"ssl_ciphers {':'.join(policy.tls12_ciphers)};")
    lines.append(f"ssl_conf_command Ciphersuites {':'.join(policy.tls13_suites)};")
    if policy.groups is not None:
        lines.append(f"ssl_ecdh_curve {':'.join(policy.groups)};")
    return "\n".join(lines) + "\n"


def describe_result(policy: Policy) -> Dict[str, Any]:
    return {
        "protocols": list(policy.protocols),
        "tls13_suites": list(policy.tls13_suites),
        "tls12_ciphers": list(policy.tls12_ciphers),
        "groups": None if policy.groups is None else list(policy.groups),
    }
