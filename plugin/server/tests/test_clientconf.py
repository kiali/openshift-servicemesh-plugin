import os
import stat
import unittest

from ossmc_tls_profile import clientconf
from ossmc_tls_profile.capabilities import CapabilityError
from tests.helpers import IN_IMAGE, FakeCapabilities, TempDirTestCase

ALL = ("X25519MLKEM768", "X25519", "secp256r1", "secp384r1", "SecP256r1MLKEM768", "SecP384r1MLKEM1024", "secp521r1")


class ClientGroupsTest(unittest.TestCase):
    def test_order(self):
        self.assertEqual(clientconf.client_groups(FakeCapabilities(), fips=False), ALL)

    def test_fips_drops_x25519mlkem768(self):
        """Logic test only."""
        self.assertEqual(clientconf.client_groups(FakeCapabilities(), fips=True), ALL[1:])

    def test_filtered_to_implemented_union(self):
        caps = FakeCapabilities(groups13=frozenset({"x25519mlkem768"}), groups12=frozenset({"secp521r1"}))
        self.assertEqual(clientconf.client_groups(caps, False), ("X25519MLKEM768", "secp521r1"))

    def test_empty_is_capability_error(self):
        caps = FakeCapabilities(groups13=frozenset({"x448"}), groups12=frozenset({"x448"}))
        with self.assertRaises(CapabilityError):
            clientconf.client_groups(caps, False)


class RenderTest(unittest.TestCase):
    def test_client(self):
        self.assertEqual(
            clientconf.render_client(ALL),
            ".include /etc/pki/tls/openssl.cnf\n[ crypto_policy ]\nGroups = " + ":".join(ALL) + "\n",
        )
        self.assertNotIn("?", clientconf.render_client(ALL))

    def test_selfcheck_explicit_groups(self):
        text = clientconf.render_selfcheck(("TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384"), ("X25519",))
        self.assertIn("Ciphersuites = TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384\n", text)
        self.assertIn("Groups = X25519\n", text)

    def test_selfcheck_auto_groups_omits_override(self):
        text = clientconf.render_selfcheck(("TLS_AES_128_GCM_SHA256",), None)
        self.assertNotIn("Groups", text)


class ContractTest(TempDirTestCase):
    def write(self, text):
        path = os.path.join(self.tmp, "openssl.cnf")
        with open(path, "w") as f:
            f.write(text)
        return path

    def test_good(self):
        self.assertIsNone(
            clientconf.check_contract(
                self.write("[ssl_module]\nsystem_default = crypto_policy\n\n[ crypto_policy ]\n.include = /x\n")
            )
        )

    def test_missing_system_default(self):
        self.assertIn("system_default", clientconf.check_contract(self.write("[ crypto_policy ]\n")))

    def test_missing_section(self):
        self.assertIn("crypto_policy", clientconf.check_contract(self.write("system_default = crypto_policy\n")))

    def test_missing_file(self):
        self.assertIn("cannot read", clientconf.check_contract(os.path.join(self.tmp, "nope")))

    @unittest.skipUnless(IN_IMAGE, "base image contract")
    def test_base_image(self):
        self.assertIsNone(clientconf.check_contract())

    def test_write_private(self):
        path = os.path.join(self.tmp, "x.cnf")
        clientconf.write_private(path, "a\n")
        self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)

    def test_fips_flag(self):
        path = os.path.join(self.tmp, "fips")
        with open(path, "w") as f:
            f.write("1\n")
        self.assertTrue(clientconf.read_fips(path))
        with open(path, "w") as f:
            f.write("0\n")
        self.assertFalse(clientconf.read_fips(path))
        self.assertFalse(clientconf.read_fips(os.path.join(self.tmp, "absent")))


if __name__ == "__main__":
    unittest.main()
