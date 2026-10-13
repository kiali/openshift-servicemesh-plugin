import os
import unittest

from ossmc_tls_profile import resolve
from ossmc_tls_profile.resolve import InvalidProfile, Policy
from tests.helpers import FIXTURES, FakeCapabilities

TLS13 = ("TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256")


def custom(ciphers=None, groups=None, min_version=None, **extra):
    body = dict(extra)
    if ciphers is not None:
        body["ciphers"] = ciphers
    if groups is not None:
        body["groups"] = groups
    if min_version is not None:
        body["minTLSVersion"] = min_version
    return {"type": "Custom", "custom": body}


class Collector:
    def __init__(self):
        self.warnings = []
        self.infos = []

    def warn(self, msg, **fields):
        self.warnings.append((msg, fields))

    def info(self, msg, **fields):
        self.infos.append((msg, fields))

    def warned(self, fragment):
        return any(fragment in msg for msg, _ in self.warnings)


class ResolveTestCase(unittest.TestCase):
    def resolve(self, profile, caps=None, fips=False):
        self.log = Collector()
        return resolve.resolve(profile, caps or FakeCapabilities(), fips, self.log.warn, self.log.info)

    def assertInvalid(self, profile, fragment, caps=None, fips=False):
        with self.assertRaises(InvalidProfile) as ctx:
            self.resolve(profile, caps, fips)
        self.assertIn(fragment, str(ctx.exception))

    def golden(self, name):
        with open(os.path.join(FIXTURES, name)) as f:
            return f.read()


class ProfilesTest(ResolveTestCase):
    def test_intermediate_golden(self):
        self.assertEqual(
            resolve.render(self.resolve({"type": "Intermediate", "intermediate": {}})),
            self.golden("render-intermediate.conf"),
        )

    def test_absent_profile_is_intermediate(self):
        self.assertEqual(resolve.render(self.resolve(None)), self.golden("render-intermediate.conf"))

    def test_modern_golden(self):
        self.assertEqual(resolve.render(self.resolve({"type": "Modern"})), self.golden("render-modern.conf"))

    def test_custom_tls12_golden(self):
        profile = custom(
            ["TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384", "ECDHE-RSA-AES128-GCM-SHA256"],
            ["secp384r1", "X25519"],
            "VersionTLS12",
        )
        self.assertEqual(resolve.render(self.resolve(profile)), self.golden("render-custom-tls12.conf"))

    def test_custom_tls13_omitted_groups_golden(self):
        profile = custom(["TLS_AES_128_GCM_SHA256"], None, "VersionTLS13")
        self.assertEqual(resolve.render(self.resolve(profile)), self.golden("render-custom-tls13-auto-groups.conf"))

    def test_omitted_min_version_is_tls12(self):
        policy = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"]))
        self.assertEqual(policy.protocols, ("TLSv1.2", "TLSv1.3"))

    def test_empty_min_version_is_tls12(self):
        policy = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], min_version=""))
        self.assertEqual(policy.protocols, ("TLSv1.2", "TLSv1.3"))


class Tls13Test(ResolveTestCase):
    def test_standard_set_even_when_custom_lists_only_tls12(self):
        policy = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"]))
        self.assertEqual(policy.tls13_suites, TLS13)
        self.assertIn("ssl_conf_command Ciphersuites " + ":".join(TLS13) + ";", resolve.render(policy))

    def test_ccm_never_rendered(self):
        policy = self.resolve(custom(["TLS_AES_128_CCM_SHA256", "ECDHE-RSA-AES128-GCM-SHA256"]))
        rendered = resolve.render(policy)
        self.assertNotIn("CCM", rendered)
        self.assertTrue(self.log.warned("outside the permitted set"))

    def test_shrinks_without_chacha(self):
        caps = FakeCapabilities(tls13_missing=["TLS_CHACHA20_POLY1305_SHA256"])
        self.assertEqual(self.resolve({"type": "Modern"}, caps).tls13_suites, TLS13[:2])

    def test_empty_tls13_set_invalid(self):
        self.assertInvalid({"type": "Modern"}, "TLS 1.3 suites", FakeCapabilities(tls13_missing=TLS13))


class Tls12RulesTest(ResolveTestCase):
    def test_dhe_mixed_with_ecdhe_reduced(self):
        policy = self.resolve(custom(["DHE-RSA-AES128-GCM-SHA256", "ECDHE-RSA-AES128-GCM-SHA256"]))
        self.assertEqual(policy.tls12_ciphers, ("ECDHE-RSA-AES128-GCM-SHA256",))
        self.assertTrue(self.log.warned("DHE"))

    def test_dhe_only_invalid(self):
        self.assertInvalid(custom(["DHE-RSA-AES128-GCM-SHA256", "DHE-RSA-AES256-GCM-SHA384"]), "no usable")

    def test_unknown_only_invalid(self):
        self.assertInvalid(custom(["NOT-A-CIPHER", "ALSO-NOT"]), "no usable")

    def test_unavailable_only_invalid(self):
        caps = FakeCapabilities(unavailable=["ECDHE-RSA-CHACHA20-POLY1305", "ECDHE-ECDSA-CHACHA20-POLY1305"])
        self.assertInvalid(custom(["ECDHE-RSA-CHACHA20-POLY1305", "ECDHE-ECDSA-CHACHA20-POLY1305"]), "no usable", caps)

    def test_empty_custom_list_uses_filtered_intermediate(self):
        caps = FakeCapabilities(unavailable=["ECDHE-RSA-CHACHA20-POLY1305", "ECDHE-ECDSA-CHACHA20-POLY1305"])
        policy = self.resolve(custom([]), caps)
        self.assertEqual(
            policy.tls12_ciphers,
            (
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
                "ECDHE-ECDSA-AES256-GCM-SHA384",
                "ECDHE-RSA-AES256-GCM-SHA384",
            ),
        )
        self.assertTrue(any("Intermediate" in m for m, _ in self.log.infos))

    def test_omitted_custom_list_uses_intermediate(self):
        policy = self.resolve(custom(min_version="VersionTLS12"))
        self.assertEqual(len(policy.tls12_ciphers), 6)

    def test_unusable_default_set_invalid(self):
        caps = FakeCapabilities(unavailable=list(FakeCapabilities.INTERMEDIATE_TLS12))
        self.assertInvalid(custom([]), "default Intermediate", caps)

    def test_only_tls13_names_gives_tls13_only(self):
        policy = self.resolve(custom(["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384"], min_version="VersionTLS12"))
        self.assertEqual(policy.protocols, ("TLSv1.3",))
        self.assertEqual(policy.tls12_ciphers, ())
        self.assertNotIn("ssl_ciphers", resolve.render(policy))
        self.assertTrue(self.log.warned("TLS 1.2 is disabled"))

    def test_dhe_plus_tls13_name_gives_tls13_only(self):
        policy = self.resolve(custom(["DHE-RSA-AES128-GCM-SHA256", "TLS_AES_128_GCM_SHA256"]))
        self.assertEqual(policy.protocols, ("TLSv1.3",))

    def test_ecdsa_only_warns_without_substitution(self):
        policy = self.resolve(custom(["ECDHE-ECDSA-AES128-GCM-SHA256"]))
        self.assertEqual(policy.tls12_ciphers, ("ECDHE-ECDSA-AES128-GCM-SHA256",))
        self.assertTrue(self.log.warned("ECDSA certificate"))

    def test_profile_order_preserved_and_deduplicated(self):
        policy = self.resolve(
            custom(
                ["ECDHE-RSA-AES256-GCM-SHA384", "ECDHE-RSA-AES128-GCM-SHA256", "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"]
            )
        )
        self.assertEqual(policy.tls12_ciphers, ("ECDHE-RSA-AES256-GCM-SHA384", "ECDHE-RSA-AES128-GCM-SHA256"))

    def test_known_unavailable_and_typos_skipped(self):
        policy = self.resolve(custom(["DES-CBC3-SHA", "ECDHE-RSA-AES128-GCM-SHAZ56", "ECDHE-RSA-AES128-GCM-SHA256"]))
        self.assertEqual(policy.tls12_ciphers, ("ECDHE-RSA-AES128-GCM-SHA256",))
        self.assertTrue(self.log.warned("not usable"))


class GroupsTest(ResolveTestCase):
    def test_preset_groups(self):
        self.assertEqual(
            self.resolve({"type": "Intermediate"}).groups, ("X25519MLKEM768", "X25519", "secp256r1", "secp384r1")
        )

    def test_omitted_custom_groups_no_directive(self):
        policy = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"]))
        self.assertIsNone(policy.groups)
        self.assertNotIn("ssl_ecdh_curve", resolve.render(policy))

    def test_empty_custom_groups_is_no_opinion(self):
        self.assertIsNone(self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], [])).groups)

    def test_explicit_order_preserved(self):
        policy = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], ["secp521r1", "SecP256r1MLKEM768", "X25519"]))
        self.assertEqual(policy.groups, ("secp521r1", "SecP256r1MLKEM768", "X25519"))

    def test_unavailable_removed(self):
        caps = FakeCapabilities(groups13=frozenset({"x25519", "secp256r1"}))
        policy = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], ["SecP384r1MLKEM1024", "X25519"]), caps)
        self.assertEqual(policy.groups, ("X25519",))
        self.assertTrue(self.log.warned("not implemented"))

    def test_fips_removes_x25519mlkem768(self):
        """Logic test only: proving FIPS behavior needs a real FIPS cluster."""
        policy = self.resolve({"type": "Intermediate"}, fips=True)
        self.assertEqual(policy.groups, ("X25519", "secp256r1", "secp384r1"))
        self.assertTrue(self.log.warned("FIPS"))

    def test_fips_hybrid_only_becomes_invalid(self):
        """Logic test only."""
        self.assertInvalid(custom(None, ["X25519MLKEM768"], "VersionTLS13"), "no usable TLS groups", fips=True)

    def test_explicit_list_empty_after_filtering_invalid(self):
        caps = FakeCapabilities(groups13=frozenset({"x25519"}), groups12=frozenset({"x25519"}))
        self.assertInvalid(custom(None, ["secp521r1"], "VersionTLS13"), "no usable TLS groups", caps)

    def test_hybrid_only_under_tls12_warns(self):
        policy = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], ["X25519MLKEM768"], "VersionTLS12"))
        self.assertEqual(policy.groups, ("X25519MLKEM768",))
        self.assertTrue(self.log.warned("TLS 1.2 ECDHE handshakes cannot succeed"))

    def test_case_insensitive_rendered_in_openshift_spelling(self):
        policy = self.resolve(custom(None, ["x25519mlkem768", "SECP256R1"], "VersionTLS13"))
        self.assertEqual(policy.groups, ("X25519MLKEM768", "secp256r1"))

    def test_no_question_marks(self):
        for profile in ({"type": "Intermediate"}, {"type": "Modern"}, custom(None, ["X25519"], "VersionTLS13")):
            self.assertNotIn("?", resolve.render(self.resolve(profile)))


class ShapeTest(ResolveTestCase):
    """Kiali parity (tlspolicy/resolver.go)."""

    def test_null_profile_is_intermediate(self):
        self.assertEqual(self.resolve(None).protocols, ("TLSv1.2", "TLSv1.3"))

    def test_empty_object_unknown_type(self):
        self.assertInvalid({}, "unknown TLS profile type: []")

    def test_empty_type_unknown(self):
        self.assertInvalid({"type": ""}, "unknown TLS profile type: []")

    def test_unknown_type(self):
        self.assertInvalid({"type": "Paranoid"}, "unknown TLS profile type: [Paranoid]")

    def test_custom_null_body(self):
        self.assertInvalid({"type": "Custom", "custom": None}, "missing or null")
        self.assertInvalid({"type": "Custom"}, "missing or null")

    def test_min_version_spellings(self):
        for spelling in ("VersionTLS12", "TLSv1.2", "TLS1.2", " VersionTLS12 "):
            self.assertEqual(
                self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], min_version=spelling)).protocols,
                ("TLSv1.2", "TLSv1.3"),
                spelling,
            )
        for spelling in ("VersionTLS13", "TLSv1.3", "TLS1.3"):
            self.assertEqual(self.resolve(custom(None, min_version=spelling)).protocols, ("TLSv1.3",), spelling)

    def test_old_and_low_versions_rejected(self):
        self.assertInvalid({"type": "Old"}, "below 1.2")
        for spelling in ("VersionTLS10", "TLSv1.0", "TLS1.0", "VersionTLS11", "TLSv1.1", "TLS1.1"):
            self.assertInvalid(custom(["ECDHE-RSA-AES128-GCM-SHA256"], min_version=spelling), "below 1.2")

    def test_unknown_version(self):
        self.assertInvalid(custom(min_version="VersionTLS14"), "unknown TLS version")

    def test_wrong_json_types(self):
        self.assertInvalid("Intermediate", "must be an object")
        self.assertInvalid({"type": "Custom", "custom": []}, "must be an object")
        self.assertInvalid(custom("ECDHE-RSA-AES128-GCM-SHA256"), "list of strings")
        self.assertInvalid(custom([1, 2]), "list of strings")
        self.assertInvalid(custom(["ECDHE-RSA-AES128-GCM-SHA256"], "X25519"), "list of strings")
        self.assertInvalid({"type": "Custom", "custom": {"minTLSVersion": 12}}, "must be a string")
        self.assertInvalid({"type": 3}, "unknown TLS profile type")


class Tls13MinimumIgnoresCiphersTest(ResolveTestCase):
    def test_selectors_and_garbage_ignored(self):
        caps = FakeCapabilities()
        policy = self.resolve(
            custom(["HIGH", "DHE-RSA-AES128-GCM-SHA256", "bad;value\n", "!x"], None, "VersionTLS13"), caps
        )
        self.assertEqual(policy, Policy(("TLSv1.3",), TLS13, (), None))
        self.assertEqual(caps.tls12_calls, [])
        self.assertTrue(any("do not apply" in m for m, _ in self.log.infos))


class InvalidInputTest(ResolveTestCase):
    def test_grammar_violations(self):
        for bad in (
            "ECDHE-RSA-AES128-GCM-SHA256;",
            "A\nB",
            'A"',
            "A'",
            "A:B",
            "!MD5",
            "-ECDHE",
            "A B",
            "A+B",
            "@STRENGTH",
        ):
            self.assertInvalid(custom([bad]), "malformed", None)
            self.assertInvalid(custom(None, [bad], "VersionTLS13"), "malformed", None)

    def test_selectors_rejected(self):
        for selector in ("HIGH", "ALL", "DEFAULT", "aNULL", "eNULL", "NULL", "kRSA"):
            self.assertInvalid(custom([selector]), "selectors")

    def test_selectors_mixed_with_usable_suites_rejected(self):
        self.assertInvalid(custom(["aNULL", "ECDHE-RSA-AES128-GCM-SHA256"]), "selectors")
        self.assertInvalid(custom(["ECDHE-RSA-AES128-GCM-SHA256", "HIGH"]), "selectors")


class StabilityTest(ResolveTestCase):
    def test_deterministic(self):
        a = resolve.render(self.resolve({"type": "Intermediate"}))
        b = resolve.render(self.resolve({"type": "Intermediate", "intermediate": {}}))
        self.assertEqual(a, b)

    def test_unrelated_fields_do_not_change_policy(self):
        p1 = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], ["X25519"], "VersionTLS12"))
        p2 = self.resolve(custom(["ECDHE-RSA-AES128-GCM-SHA256"], ["X25519"], "VersionTLS12", unrelated=True))
        self.assertEqual(p1, p2)
        self.assertEqual(hash(p1), hash(p2))

    def test_order_is_part_of_policy(self):
        p1 = self.resolve(custom(None, ["X25519", "secp256r1"], "VersionTLS13"))
        p2 = self.resolve(custom(None, ["secp256r1", "X25519"], "VersionTLS13"))
        self.assertNotEqual(p1, p2)


if __name__ == "__main__":
    unittest.main()
