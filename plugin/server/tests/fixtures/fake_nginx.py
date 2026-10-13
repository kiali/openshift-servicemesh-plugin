#!/usr/bin/python3
"""Stands in for /usr/libexec/s2i/run (nginx master plus one worker in its process group).

Behavior comes from $FAKE_CONTROL/nginx-mode: serve (default), exit-on-start, no-listen,
die-later. The worker serves TLS on $FAKE_PORT with $FAKE_CERT/$FAKE_KEY.
"""

import json
import os
import signal
import socket
import ssl
import sys
import time

control = os.environ["FAKE_CONTROL"]
try:
    with open(os.path.join(control, "nginx-mode")) as f:
        mode = f.read().strip()
except OSError:
    mode = "serve"


def status_field(name):
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith(name + ":"):
                return line.split(":", 1)[1].strip()
    return ""


record = {
    "pid": os.getpid(),
    "pgid": os.getpgid(0),
    "sid": os.getsid(0),
    "SigBlk": status_field("SigBlk"),
    "OPENSSL_CONF": os.environ.get("OPENSSL_CONF"),
    "mode": mode,
}

if mode == "exit-on-start":
    sys.exit(4)

listener = None
if mode != "no-listen":
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", int(os.environ["FAKE_PORT"])))
    listener.listen(16)

worker = os.fork()
if worker == 0:
    signal.signal(signal.SIGQUIT, signal.SIG_DFL)
    if listener is None:
        while True:
            time.sleep(1)
    while True:
        conn, _ = listener.accept()
        try:
            # Reload the pair per connection, like a fresh nginx would after a restart.
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(os.environ["FAKE_CERT"], os.environ["FAKE_KEY"])
            conn.settimeout(5)
            tls = ctx.wrap_socket(conn, server_side=True)
            try:
                tls.recv(1)
            except (OSError, ssl.SSLError):
                pass
            tls.close()
        except (OSError, ssl.SSLError):
            conn.close()

record["worker"] = worker
with open(os.path.join(control, f"nginx-start-{os.getpid()}.json"), "w") as f:
    json.dump(record, f)


def quit_handler(*_):
    os.kill(worker, signal.SIGTERM)
    os.waitpid(worker, 0)
    sys.exit(0)


signal.signal(signal.SIGQUIT, quit_handler)
if mode == "die-later":
    time.sleep(1.5)
    os.kill(worker, signal.SIGKILL)
    os.waitpid(worker, 0)
    sys.exit(3)
while True:
    time.sleep(1)
