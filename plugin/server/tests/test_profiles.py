import unittest

from ossmc_tls_profile import profiles


class PresetTableTest(unittest.TestCase):
    """Golden copy of openshift/api TLSProfiles at OPENSHIFT_API_REVISION.

    When bumping the revision, update this table only after comparing it with
    the upstream file (see the plugin README).
    """

    def test_revision(self):
        self.assertEqual(profiles.OPENSHIFT_API_REVISION, "v0.0.0-20260605005319-1194f4c62539")

    def test_presets(self):
        groups = ("X25519MLKEM768", "X25519", "secp256r1", "secp384r1")
        tls13 = ("TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256")
        intermediate12 = (
            "ECDHE-ECDSA-AES128-GCM-SHA256",
            "ECDHE-RSA-AES128-GCM-SHA256",
            "ECDHE-ECDSA-AES256-GCM-SHA384",
            "ECDHE-RSA-AES256-GCM-SHA384",
            "ECDHE-ECDSA-CHACHA20-POLY1305",
            "ECDHE-RSA-CHACHA20-POLY1305",
        )
        old_extra = (
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
        )
        self.assertEqual(
            dict(profiles.PRESETS),
            {
                "Old": profiles.ProfileSpec(tls13 + intermediate12 + old_extra, groups, "VersionTLS10"),
                "Intermediate": profiles.ProfileSpec(tls13 + intermediate12, groups, "VersionTLS12"),
                "Modern": profiles.ProfileSpec(tls13, groups, "VersionTLS13"),
            },
        )

    def test_group_enum(self):
        self.assertEqual(
            profiles.TLS_GROUPS,
            (
                "X25519",
                "secp256r1",
                "secp384r1",
                "secp521r1",
                "X25519MLKEM768",
                "SecP256r1MLKEM768",
                "SecP384r1MLKEM1024",
            ),
        )

    def test_immutable(self):
        with self.assertRaises(TypeError):
            profiles.PRESETS["Custom"] = None  # type: ignore[index]


if __name__ == "__main__":
    unittest.main()
