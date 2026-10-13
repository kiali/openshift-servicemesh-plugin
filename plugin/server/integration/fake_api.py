"""Fake OpenShift API backend for the container integration tests.

Runs inside the fake API container on 127.0.0.1:6080 (plain HTTP). An nginx TLS
front end on 127.0.0.1:6443 proxies to it, so the API server's TLS negotiation
(protocols and groups) is genuinely restricted. POST /control switches the
returned profile, the HTTP status, and a trickle mode for slow-response tests.
"""

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API_PATH = "/apis/config.openshift.io/v1/apiservers/cluster"
STATE = {"status": 200, "profile": None, "present": False, "mode": "ok"}
LOCK = threading.Lock()


def body_for(state):
    spec = {}
    if state["present"]:
        spec["tlsSecurityProfile"] = state["profile"]
    if state["status"] != 200:
        return json.dumps({"kind": "Status", "status": "Failure", "message": f"fake failure {state['status']}"})
    return json.dumps(
        {"apiVersion": "config.openshift.io/v1", "kind": "APIServer", "metadata": {"name": "cluster"}, "spec": spec}
    )


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        pass

    def do_GET(self):
        with LOCK:
            state = dict(STATE)
        if self.path != API_PATH:
            self.send_error(404)
            return
        body = body_for(state).encode()
        if state["mode"] == "trickle":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "100000")
            self.end_headers()
            try:
                for _ in range(100000):
                    self.wfile.write(b" ")
                    self.wfile.flush()
                    time.sleep(0.5)
            except OSError:
                pass
            return
        self.send_response(state["status"])
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        update = json.loads(self.rfile.read(length) or b"{}")
        with LOCK:
            STATE.update(update)
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()


ThreadingHTTPServer(("127.0.0.1", 6080), Handler).serve_forever()
