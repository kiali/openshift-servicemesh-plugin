"""The fetch child: one GET of APIServer/cluster, one JSON envelope on stdout.

Runs as a short-lived child of the supervisor, which enforces the wall-clock
deadline by killing this process group; the socket timeout and body cap here
are only defense in depth. The CA bundle and token are read fresh on every
run, so rotation needs no handling. The token never leaves this process.
"""

from __future__ import annotations

import http.client
import json
import os
import ssl
import sys
from typing import Any, Dict, Optional

from . import paths

API_PATH = "/apis/config.openshift.io/v1/apiservers/cluster"
BODY_CAP = 1024 * 1024
SOCKET_TIMEOUT = 5.0
DETAIL_CAP = 512


def _failure(kind: str, detail: str, status: Optional[int] = None) -> Dict[str, Any]:
    return {"ok": False, "kind": kind, "status": status, "detail": detail[:DETAIL_CAP]}


def _read_required(path: str, what: str) -> bytes:
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError as exc:
        raise _IOFailure(f"cannot read the ServiceAccount {what} at {path}: {exc.strerror or exc}") from None
    if not data.strip():
        raise _IOFailure(f"the ServiceAccount {what} at {path} is empty")
    return data


class _IOFailure(Exception):
    pass


def _status_message(body: bytes) -> str:
    try:
        obj = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return ""
    if isinstance(obj, dict) and isinstance(obj.get("message"), str):
        return obj["message"]
    return ""


def fetch(
    host: Optional[str],
    port: Optional[str],
    *,
    token_path: str = paths.SA_TOKEN,
    ca_path: str = paths.SA_CA,
    timeout: float = SOCKET_TIMEOUT,
    body_cap: int = BODY_CAP,
) -> Dict[str, Any]:
    if not host or not port:
        return _failure("config", "KUBERNETES_SERVICE_HOST and KUBERNETES_SERVICE_PORT must both be set")
    try:
        port_num = int(port)
    except ValueError:
        return _failure("config", f"KUBERNETES_SERVICE_PORT is not a number: {port[:40]!r}")
    if not 1 <= port_num <= 65535:
        return _failure("config", f"KUBERNETES_SERVICE_PORT is out of range (1-65535): {port[:40]!r}")

    try:
        _read_required(ca_path, "CA bundle")
        token = _read_required(token_path, "token").decode("utf-8", "strict").strip()
    except _IOFailure as exc:
        return _failure("io", str(exc))
    except UnicodeDecodeError:
        return _failure("io", f"the ServiceAccount token at {token_path} is not valid UTF-8")

    try:
        # cafile loads only this bundle, never the system roots.
        context = ssl.create_default_context(cafile=ca_path)
    except (ssl.SSLError, OSError) as exc:
        return _failure("io", f"cannot load the ServiceAccount CA bundle at {ca_path}: {exc}")
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED

    conn = http.client.HTTPSConnection(host, port_num, timeout=timeout, context=context)
    try:
        conn.request(
            "GET",
            API_PATH,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        resp = conn.getresponse()
        # One byte past the cap, so an oversize body is detectable from the length
        # alone without trusting Content-Length.
        body = resp.read(body_cap + 1)
        status = resp.status
        # Bytes still owed by Content-Length after a short read: the peer closed early.
        truncated = bool(resp.length) and len(body) <= body_cap
    except ssl.CertificateError as exc:
        # CertificateError is an alias of SSLCertVerificationError, a subclass of SSLError,
        # so this clause must stay above the SSLError one to keep its distinct message.
        return _failure("tls", f"API server certificate rejected: {exc}")
    except ssl.SSLError as exc:
        return _failure("tls", f"TLS failure talking to the API server: {exc}")
    except http.client.HTTPException as exc:
        return _failure("http", f"malformed or truncated HTTP response: {type(exc).__name__}: {exc}")
    except OSError as exc:
        return _failure("connect", f"cannot read from the API server: {type(exc).__name__}: {exc}")
    finally:
        conn.close()

    if truncated:
        return _failure("http", "truncated HTTP response body", status)
    if len(body) > body_cap:
        return _failure("io", f"API response body exceeds {body_cap} bytes", status)
    if status != 200:
        message = _status_message(body)
        detail = f"API server returned HTTP {status}"
        if message:
            detail += f": {message}"
        return _failure("http", detail, status)

    try:
        obj = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        return _failure("json", f"malformed APIServer JSON: {exc}", status)
    if not isinstance(obj, dict) or obj.get("kind") != "APIServer":
        return _failure("json", "response is not an APIServer object", status)
    spec = obj.get("spec")
    if spec is None:
        spec = {}
    if not isinstance(spec, dict):
        return _failure("json", "APIServer spec is not an object", status)
    profile = spec.get("tlsSecurityProfile")
    return {"ok": True, "status": status, "profile": profile, "present": profile is not None}


def main(token_path: str = paths.SA_TOKEN, ca_path: str = paths.SA_CA) -> int:
    envelope = fetch(
        os.environ.get("KUBERNETES_SERVICE_HOST"),
        os.environ.get("KUBERNETES_SERVICE_PORT"),
        token_path=token_path,
        ca_path=ca_path,
    )
    sys.stdout.write(json.dumps(envelope))
    sys.stdout.flush()
    return 0
