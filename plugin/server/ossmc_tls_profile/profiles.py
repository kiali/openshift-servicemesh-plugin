"""Pinned copy of the OpenShift TLS security profile presets.

Source: github.com/openshift/api config/v1/types_tlssecurityprofile.go
(TLSProfiles and the TLSGroup enum) at the revision below, which is the one
the Kiali server pins. The helper never fetches these definitions at runtime.

To bump the revision, follow "Bumping the OpenShift TLS profile revision" in
the plugin README: compare the upstream TLSProfiles map and TLSGroup enum with
this file, update both, update OPENSHIFT_API_REVISION, and update the golden
test in tests/test_profiles.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Mapping, Tuple

# The openshift/api commit this snapshot was taken from:
# https://github.com/openshift/api/blob/1194f4c62539/config/v1/types_tlssecurityprofile.go
OPENSHIFT_API_REVISION = "v0.0.0-20260605005319-1194f4c62539"

VERSION_TLS10 = "VersionTLS10"
VERSION_TLS11 = "VersionTLS11"
VERSION_TLS12 = "VersionTLS12"
VERSION_TLS13 = "VersionTLS13"

# Every OpenShift TLSGroup enum value, in enum declaration order.
TLS_GROUPS: Tuple[str, ...] = (
    "X25519",
    "secp256r1",
    "secp384r1",
    "secp521r1",
    "X25519MLKEM768",
    "SecP256r1MLKEM768",
    "SecP384r1MLKEM1024",
)


@dataclass(frozen=True)
class ProfileSpec:
    ciphers: Tuple[str, ...]
    groups: Tuple[str, ...]
    min_tls_version: str


_PRESET_GROUPS = ("X25519MLKEM768", "X25519", "secp256r1", "secp384r1")

PRESETS: Mapping[str, ProfileSpec] = MappingProxyType(
    {
        "Old": ProfileSpec(
            ciphers=(
                "TLS_AES_128_GCM_SHA256",
                "TLS_AES_256_GCM_SHA384",
                "TLS_CHACHA20_POLY1305_SHA256",
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
                "ECDHE-ECDSA-AES256-GCM-SHA384",
                "ECDHE-RSA-AES256-GCM-SHA384",
                "ECDHE-ECDSA-CHACHA20-POLY1305",
                "ECDHE-RSA-CHACHA20-POLY1305",
                "ECDHE-ECDSA-AES128-SHA256",
                "ECDHE-RSA-AES128-SHA256",
                "ECDHE-ECDSA-AES128-SHA",
                "ECDHE-RSA-AES128-SHA",
                "ECDHE-ECDSA-AES256-SHA384",
                "ECDHE-RSA-AES256-SHA384",
                "ECDHE-ECDSA-AES256-SHA",
                "ECDHE-RSA-AES256-SHA",
                "AES128-GCM-SHA256",
                "AES256-GCM-SHA384",
                "AES128-SHA256",
                "AES256-SHA256",
                "AES128-SHA",
                "AES256-SHA",
                "DES-CBC3-SHA",
            ),
            groups=_PRESET_GROUPS,
            min_tls_version=VERSION_TLS10,
        ),
        "Intermediate": ProfileSpec(
            ciphers=(
                "TLS_AES_128_GCM_SHA256",
                "TLS_AES_256_GCM_SHA384",
                "TLS_CHACHA20_POLY1305_SHA256",
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
                "ECDHE-ECDSA-AES256-GCM-SHA384",
                "ECDHE-RSA-AES256-GCM-SHA384",
                "ECDHE-ECDSA-CHACHA20-POLY1305",
                "ECDHE-RSA-CHACHA20-POLY1305",
            ),
            groups=_PRESET_GROUPS,
            min_tls_version=VERSION_TLS12,
        ),
        "Modern": ProfileSpec(
            ciphers=(
                "TLS_AES_128_GCM_SHA256",
                "TLS_AES_256_GCM_SHA384",
                "TLS_CHACHA20_POLY1305_SHA256",
            ),
            groups=_PRESET_GROUPS,
            min_tls_version=VERSION_TLS13,
        ),
    }
)
