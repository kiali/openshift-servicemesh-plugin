#!/usr/bin/python3
"""Stands in for "nginx -T -c <conf>". Behavior comes from $FAKE_CONTROL/nginx-t-mode:
ok (default), fail, hang, noinclude."""

import json
import os
import sys
import time

control = os.environ["FAKE_CONTROL"]
with open(os.path.join(control, "env-nginx-t"), "a") as f:
    f.write(json.dumps({"OPENSSL_CONF": os.environ.get("OPENSSL_CONF")}) + "\n")
try:
    with open(os.path.join(control, "nginx-t-mode")) as f:
        mode = f.read().strip()
except OSError:
    mode = "ok"
tls_conf = os.environ["FAKE_TLS_CONF"]
if mode == "hang":
    time.sleep(120)
if mode == "fail":
    sys.stderr.write('nginx: [emerg] invalid value "BAD" in /tmp/ossmc/tls.conf:2\n')
    sys.exit(1)
sys.stdout.write(f"# configuration file {sys.argv[-1]}:\nhttp {{ server {{ include {tls_conf}; }} }}\n\n")
if mode != "noinclude":
    with open(tls_conf) as f:
        sys.stdout.write(f"# configuration file {tls_conf}:\n{f.read()}\n")
sys.stderr.write("nginx: configuration file test is successful\n")
