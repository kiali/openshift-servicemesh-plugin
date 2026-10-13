#!/usr/bin/python3
"""Replays openssl CLI outputs recorded from the pinned image (openssl-probes.json)."""

import json
import os
import sys

FIXTURES = os.path.dirname(os.path.abspath(__file__))


def record_env():
    control = os.environ.get("FAKE_CONTROL")
    if control:
        with open(os.path.join(control, "env-openssl"), "a") as f:
            f.write(json.dumps({"OPENSSL_CONF": os.environ.get("OPENSSL_CONF")}) + "\n")


def main():
    record_env()
    with open(os.path.join(FIXTURES, "openssl-probes.json")) as f:
        data = json.load(f)
    args = sys.argv[1:]
    if args[:4] == ["ciphers", "-s", "-tls1_2", "-stdname"]:
        rec = data["p1"].get(args[4])
    elif args[:2] == ["ciphers", "-stdname"]:
        rec = data["p2"].get(args[2])
    elif args[:4] == ["ciphers", "-s", "-tls1_3", "-ciphersuites"]:
        rec = data["tls13"].get(args[4])
    elif args[:1] == ["list"]:
        rec = data["groups"][args[1].replace("-tls", "")]
    else:
        rec = None
    if rec is None:
        sys.stderr.write("Error in cipher list\nno cipher match\n")
        sys.exit(1)
    sys.stdout.write(rec["stdout"])
    sys.stderr.write(rec["stderr"])
    sys.exit(rec["rc"])


main()
