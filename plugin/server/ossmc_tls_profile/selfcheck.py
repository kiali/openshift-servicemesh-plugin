"""The self-check child: loopback TLS handshakes against our own nginx.

Started with OPENSSL_CONF pointing at a config whose Ciphersuites and Groups
match the rendered policy, so the client offers exactly what the policy
allows. It only proves our listener can complete a handshake; it makes no
trust decision, so certificate verification is off. Never reuse this context
for any other connection, and never send application data.

argv: self-check <host> <port> <tls13 suites> <tls12 ciphers or "-">
"""

from __future__ import annotations

import json
import socket
import ssl
import sys
from typing import Any, Dict, List, Optional

SOCKET_TIMEOUT = 4.0


def _handshake(host: str, port: int, version: ssl.TLSVersion, ciphers: Optional[str]) -> Dict[str, Any]:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    context.minimum_version = version
    context.maximum_version = version
    try:
        # Inside the try: an unrecognized cipher name must be an error result, not a crash.
        if ciphers:
            context.set_ciphers(ciphers)
        with socket.create_connection((host, port), timeout=SOCKET_TIMEOUT) as sock:
            with context.wrap_socket(sock) as tls:
                cipher = tls.cipher()
                return {
                    "ok": True,
                    "protocol": tls.version(),
                    "cipher": cipher[0] if cipher else None,
                }
    except (OSError, ssl.SSLError) as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:400]}


def check(host: str, port: int, tls13_suites: List[str], tls12_ciphers: Optional[str]) -> Dict[str, Any]:
    tls13 = _handshake(host, port, ssl.TLSVersion.TLSv1_3, None)
    if tls13["ok"] and tls13.get("cipher") not in tls13_suites:
        # The TLS 1.3 client's offered suites come from OPENSSL_CONF, so a suite
        # outside the rendered set means that conf did not take effect. The TLS 1.2
        # offer is set programmatically (set_ciphers) and cannot drift this way.
        tls13 = dict(tls13, ok=False, error=f"negotiated {tls13.get('cipher')} outside the rendered Ciphersuites")
    result: Dict[str, Any] = {"tls13": tls13, "tls12": None}
    if tls12_ciphers:
        result["tls12"] = _handshake(host, port, ssl.TLSVersion.TLSv1_2, tls12_ciphers)
    return result


def main(argv: List[str]) -> int:
    if len(argv) != 4:
        sys.stderr.write("usage: self-check <host> <port> <tls13 suites> <tls12 ciphers|->\n")
        return 2
    host, port, tls13, tls12 = argv
    try:
        port_num = int(port)
    except ValueError:
        sys.stderr.write(f"self-check: port is not a number: {port[:40]!r}\n")
        return 2
    result = check(host, port_num, tls13.split(":"), None if tls12 == "-" else tls12)
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()
    return 0
