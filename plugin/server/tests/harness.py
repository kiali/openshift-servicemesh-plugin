"""Fixture servers and a supervisor-process launcher for tests."""

from __future__ import annotations

import json
import os
import re
import socket
import ssl
import subprocess
import sys
import threading
import time
from typing import Dict, List, Optional

from tests.helpers import FIXTURES, SERVER_DIR

API_PATH = "/apis/config.openshift.io/v1/apiservers/cluster"


class HTTPSFixture:
    """A tiny HTTPS server on a loopback address, driven from the test thread.

    mode: "ok" (serve body with status), "slow-headers", "slow-body", "stall" (accept TCP, never
    complete TLS), "truncated" (Content-Length larger than the body).
    """

    def __init__(self, cert: str, key: str, host: str = "127.0.0.1", tls_groups: Optional[str] = None):
        self.host = host
        family = socket.AF_INET6 if ":" in host else socket.AF_INET
        self.sock = socket.socket(family, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind((host, 0))
        self.sock.listen(16)
        self.port = self.sock.getsockname()[1]
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.load_cert_chain(cert, key)
        self.mode = "ok"
        self.status = 200
        self.body = b"{}"
        self.trickle_interval = 0.5
        self.requests: List[Dict[str, str]] = []
        self._stop = False
        self._threads: List[threading.Thread] = []
        self._accept = threading.Thread(target=self._serve, daemon=True)
        self._accept.start()

    def set_cert(self, cert: str, key: str) -> None:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        self.context = ctx

    def close(self) -> None:
        self._stop = True
        try:
            self.sock.close()
        except OSError:
            pass

    def _serve(self) -> None:
        while not self._stop:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            t = threading.Thread(target=self._handle, args=(conn,), daemon=True)
            t.start()
            self._threads.append(t)

    def _trickle(self, tls: ssl.SSLSocket, data: bytes) -> None:
        for i in range(len(data)):
            if self._stop:
                return
            tls.sendall(data[i : i + 1])
            time.sleep(self.trickle_interval)

    def _handle(self, conn: socket.socket) -> None:
        mode = self.mode
        tls = None
        try:
            conn.settimeout(120)
            if mode == "stall":
                while not self._stop and conn.recv(4096):
                    pass
                return
            tls = self.context.wrap_socket(conn, server_side=True)
            request = b""
            while b"\r\n\r\n" not in request:
                chunk = tls.recv(4096)
                if not chunk:
                    return
                request += chunk
            lines = request.decode("latin-1").split("\r\n")
            method, path, _ = lines[0].split(" ", 2)
            headers = {k.lower(): v.strip() for k, _, v in (ln.partition(":") for ln in lines[1:] if ln)}
            self.requests.append({"method": method, "path": path, "authorization": headers.get("authorization", "")})
            body = self.body
            head = (
                f"HTTP/1.1 {self.status} X\r\nContent-Type: application/json\r\n"
                f"Content-Length: {len(body) + (1000 if mode == 'truncated' else 0)}\r\nConnection: close\r\n\r\n"
            ).encode()
            if mode == "slow-headers":
                self._trickle(tls, head + body)
            elif mode == "slow-body":
                tls.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n")
                self._trickle(tls, b" " * 100000)
            else:
                tls.sendall(head + body)
            try:
                tls.unwrap()
            except (OSError, ssl.SSLError):
                pass
        except (OSError, ssl.SSLError, ValueError):
            pass
        finally:
            for sock in (tls, conn):
                try:
                    if sock is not None:
                        sock.close()
                except OSError:
                    pass


def ipv6_available() -> bool:
    try:
        s = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        s.bind(("::1", 0))
        s.close()
        return True
    except OSError:
        return False


def fetch_child_argv(token: str, ca: str, control: Optional[str] = None) -> List[str]:
    """The helper as a child process, with the fetch subcommand reading test SA files.

    Every other subcommand goes through the normal dispatch. With control, each
    invocation appends the OPENSSL_CONF it saw to control/env-<subcommand>.
    """
    code = (
        f"import sys, os, json; sys.path.insert(0, {SERVER_DIR!r})\n"
        f"if {control!r} and sys.argv[1:2]:\n"
        f"    with open(os.path.join({control!r}, 'env-' + sys.argv[1]), 'a') as f:\n"
        "        f.write(json.dumps({'OPENSSL_CONF': os.environ.get('OPENSSL_CONF')}) + '\\n')\n"
        "if sys.argv[1:2] == ['fetch']:\n"
        "    from ossmc_tls_profile import apiclient\n"
        f"    sys.exit(apiclient.main(token_path={token!r}, ca_path={ca!r}))\n"
        "from ossmc_tls_profile.__main__ import main\n"
        "main()\n"
    )
    return [sys.executable, "-I", "-B", "-c", code]


def fixture_script(name: str) -> List[str]:
    return [sys.executable, "-I", "-B", os.path.join(FIXTURES, name)]


class SupervisorProcess:
    """Run the real supervisor (RealPlatform) as a separate process with test settings."""

    def __init__(self, workdir: str, settings: Dict, env: Optional[Dict[str, str]] = None):
        self.log_path = os.path.join(workdir, "supervisor.log")
        self.settings = settings
        code = (
            f"import json, sys; sys.path.insert(0, {SERVER_DIR!r})\n"
            "from ossmc_tls_profile.supervisor import main_supervise\n"
            "sys.exit(main_supervise(**json.loads(sys.argv[1])))\n"
        )
        self.log = open(self.log_path, "wb")
        self.proc = subprocess.Popen(
            [sys.executable, "-I", "-B", "-c", code, json.dumps(settings)],
            stdin=subprocess.DEVNULL,
            stdout=self.log,
            stderr=subprocess.STDOUT,
            env=env if env is not None else dict(os.environ),
        )

    def text(self) -> str:
        with open(self.log_path, "rb") as f:
            return f.read().decode("utf-8", "replace")

    def wait_log(self, pattern: str, timeout: float = 20.0, count: int = 1) -> str:
        end = time.monotonic() + timeout
        regex = re.compile(pattern)
        while time.monotonic() < end:
            text = self.text()
            if len(regex.findall(text)) >= count:
                return text
            if self.proc.poll() is not None:
                break
            time.sleep(0.05)
        raise AssertionError(f"log pattern {pattern!r} not seen (exit={self.proc.poll()}):\n{self.text()}")

    def state(self) -> Dict:
        with open(os.path.join(self.settings["state_dir"], "state")) as f:
            return json.load(f)

    def wait_ready(self, ready: bool = True, timeout: float = 20.0) -> None:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            try:
                if self.state().get("ready") is ready:
                    return
            except (OSError, ValueError):
                pass
            time.sleep(0.05)
        raise AssertionError(f"ready={ready} not reached:\n{self.text()}")

    def stop(self, timeout: float = 20.0) -> float:
        start = time.monotonic()
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        self.log.close()
        return time.monotonic() - start

    def wait_exit(self, timeout: float = 30.0) -> int:
        try:
            return self.proc.wait(timeout)
        finally:
            self.log.close()
