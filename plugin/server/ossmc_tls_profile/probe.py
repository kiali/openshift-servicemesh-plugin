"""Readiness probe entry point (kubelet exec probe).

Imports only os, json and socket so each probe starts quickly even under a
tight CPU limit. Do not import ssl, the resolver or the supervisor here.
"""

import json
import os
import socket

from . import paths


def probe(state_file: str = paths.STATE_FILE, host: str = paths.LISTEN_HOST, port: int = paths.LISTEN_PORT) -> str:
    """Return "" when ready, otherwise the reason it is not.

    Three independent signals, cheapest first: the supervisor's state file (its own
    verdict), the supervisor pid still being alive (a ready flag cannot outlive its
    writer), and the listener accepting a connection (the thing traffic goes to).
    """
    try:
        with open(state_file) as f:
            state = json.load(f)
    except (OSError, ValueError) as exc:
        return f"no readable state file: {exc}"
    if not isinstance(state, dict) or state.get("ready") is not True:
        return "supervisor reports not ready"
    pid = state.get("pid")
    if not isinstance(pid, int) or pid <= 0:
        return "state file has no supervisor pid"
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return f"supervisor pid {pid} is not running"
    except PermissionError:
        pass
    try:
        with socket.create_connection((host, port), timeout=1.0):
            pass
    except OSError as exc:
        return f"cannot connect to {host}:{port}: {exc}"
    return ""


def main() -> int:
    reason = probe()
    if reason:
        print(f"not ready: {reason}")
        return 1
    return 0
