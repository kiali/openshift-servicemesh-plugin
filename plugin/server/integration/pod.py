"""Podman pod harness: a fake OpenShift API container plus the OSSMC image under test.

Both containers share the pod's network namespace, so OSSMC reaches the fake API on
127.0.0.1:6443 and the TLS client (openssl s_client, run inside the fake API
container) reaches OSSMC on 127.0.0.1:9443. Nothing is added to the OSSMC image.
"""

from __future__ import annotations

import json
import os
import random
import re
import shutil
import subprocess
import tempfile
import time
from typing import Dict, List, Optional, Sequence

from tests.helpers import Certs

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN_DIR = os.path.dirname(SERVER_DIR)
INTEGRATION_DIR = os.path.join(SERVER_DIR, "integration")


def _base_image() -> str:
    """The final-stage base image of the production Dockerfile, where its digest is pinned."""
    with open(os.path.join(PLUGIN_DIR, "Dockerfile")) as f:
        froms = [line.split()[1] for line in f if line.startswith("FROM")]
    return froms[-1]


BASE_IMAGE = os.environ.get("OSSMC_TLS_PROFILE_TEST_IMAGE") or _base_image()
HELPER = "/usr/local/bin/ossmc-tls-profile"
SERVING_NAME = "ossmconsole.test"
SA_MOUNT = "/var/run/secrets/kubernetes.io/serviceaccount"

FRONT_CONF = """
pid /tmp/front.pid;
error_log /dev/stderr;
events {{}}
http {{
  access_log off;
  client_body_temp_path /tmp/front-body;
  proxy_temp_path /tmp/front-proxy;
  fastcgi_temp_path /tmp/front-fastcgi;
  uwsgi_temp_path /tmp/front-uwsgi;
  scgi_temp_path /tmp/front-scgi;
  server {{
    listen 127.0.0.1:6443 ssl;
    ssl_certificate /work/{cert}.crt;
    ssl_certificate_key /work/{cert}.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ecdh_curve {groups};
    location / {{
      proxy_pass http://127.0.0.1:6080;
      proxy_buffering off;
      proxy_read_timeout 600s;
    }}
  }}
}}
"""


def podman(
    *args: str, check: bool = True, timeout: float = 120, input: Optional[str] = None
) -> subprocess.CompletedProcess:
    return subprocess.run(["podman", *args], capture_output=True, text=True, check=check, timeout=timeout, input=input)


def nginx_conf_from_manifest(path: str) -> str:
    """Extract the nginx.conf literal block from a manifest's nginx-conf ConfigMap."""
    with open(path) as f:
        lines = f.read().splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip() == "nginx.conf: |")
    indent = len(lines[start]) - len(lines[start].lstrip()) + 2
    out = []
    for line in lines[start + 1 :]:
        if line.strip() and len(line) - len(line.lstrip()) < indent:
            break
        out.append(line[indent:])
    return "\n".join(out).rstrip() + "\n"


class Pod:
    def __init__(self, image: str):
        self.image = image
        self.name = f"ossmc-it-{random.randrange(1 << 30):x}"
        self.work = tempfile.mkdtemp(prefix="ossmc-it-")
        os.chmod(self.work, 0o755)
        # Arbitrary non-root UIDs, kept inside a default 65536-wide rootless subuid range.
        self.uid = random.randrange(10000, 60000)
        self.ossmc: Optional[str] = None
        self.ca = Certs(self.work, "ca")
        self.other_ca = Certs(self.work, "otherca")
        self.ca.issue("api")
        self.other_ca.issue("api-untrusted")
        self.ca.issue("serving-a", sans=(f"DNS:{SERVING_NAME}", "IP:127.0.0.1"))
        self.ca.issue("serving-b", sans=(f"DNS:{SERVING_NAME}", "IP:127.0.0.1"))
        for d in ("sa", "serving"):
            os.makedirs(os.path.join(self.work, d), mode=0o755)
        shutil.copyfile(self.ca.ca_crt, os.path.join(self.work, "sa", "ca.crt"))
        with open(os.path.join(self.work, "sa", "token"), "w") as f:
            f.write("integration-test-token")
        self.install_serving("serving-a")
        shutil.copyfile(os.path.join(INTEGRATION_DIR, "fake_api.py"), os.path.join(self.work, "fake_api.py"))
        self._chmod_all()
        self.write_front(groups="X25519MLKEM768:X25519:secp256r1:secp384r1")
        podman("pod", "create", "--name", self.name)
        self.api = f"{self.name}-api"
        podman(
            "run",
            "-d",
            "--name",
            self.api,
            "--pod",
            self.name,
            "--user",
            f"{self.uid + 1}:0",
            "--cap-drop=ALL",
            "-v",
            f"{self.work}:/work:z",
            BASE_IMAGE,
            "sh",
            "-c",
            "python3 -I /work/fake_api.py & exec nginx -c /work/front.conf -g 'daemon off;'",
        )
        self.wait_api()

    def _chmod_all(self) -> None:
        for root, dirs, files in os.walk(self.work):
            for d in dirs:
                os.chmod(os.path.join(root, d), 0o755)
            for f in files:
                os.chmod(os.path.join(root, f), 0o644)

    # ----- fake API -----

    def write_front(self, groups: str, cert: str = "api") -> None:
        with open(os.path.join(self.work, "front.conf"), "w") as f:
            f.write(FRONT_CONF.format(groups=groups, cert=cert))
        os.chmod(os.path.join(self.work, "front.conf"), 0o644)

    def reload_front(self, groups: str, cert: str = "api") -> None:
        self.write_front(groups, cert)
        podman("exec", self.api, "nginx", "-c", "/work/front.conf", "-s", "reload")
        time.sleep(1.0)

    def wait_api(self) -> None:
        end = time.monotonic() + 30
        while time.monotonic() < end:
            if (
                podman(
                    "exec", self.api, "curl", "-s", "-o", "/dev/null", "http://127.0.0.1:6080/x", check=False
                ).returncode
                == 0
            ):
                return
            time.sleep(0.2)
        raise AssertionError(f"fake API did not start: {self.logs(self.api)}")

    def set_api(self, **state: object) -> None:
        podman(
            "exec",
            "-i",
            self.api,
            "curl",
            "-s",
            "-X",
            "POST",
            "--data-binary",
            "@-",
            "http://127.0.0.1:6080/control",
            input=json.dumps(state),
        )

    def set_profile(self, profile: object, present: bool = True) -> None:
        self.set_api(status=200, profile=profile, present=present, mode="ok")

    # ----- OSSMC container -----

    def install_serving(self, name: str) -> None:
        for ext in ("crt", "key"):
            src = os.path.join(self.work, f"{name}.{ext}")
            dst = os.path.join(self.work, "serving", f"tls.{ext}")
            shutil.copyfile(src, dst + ".tmp")
            os.chmod(dst + ".tmp", 0o644)
            os.replace(dst + ".tmp", dst)

    def start_ossmc(
        self,
        command: Optional[Sequence[str]] = (HELPER,),
        nginx_conf_manifest: str = os.path.join(PLUGIN_DIR, "manifest.yaml"),
        nginx_conf_text: Optional[str] = None,
        with_sa: bool = True,
    ) -> str:
        conf = os.path.join(self.work, "nginx.conf")
        with open(conf, "w") as f:
            f.write(nginx_conf_text or nginx_conf_from_manifest(nginx_conf_manifest))
        os.chmod(conf, 0o644)
        self.ossmc = f"{self.name}-ossmc"
        args = [
            "run",
            "-d",
            "--name",
            self.ossmc,
            "--pod",
            self.name,
            "--user",
            f"{self.uid}:0",
            "--cap-drop=ALL",
            "--security-opt",
            "no-new-privileges",
            "-e",
            "KUBERNETES_SERVICE_HOST=127.0.0.1",
            "-e",
            "KUBERNETES_SERVICE_PORT=6443",
            "-v",
            f"{os.path.join(self.work, 'serving')}:/var/serving-cert:ro,z",
            "-v",
            f"{conf}:/etc/nginx/nginx.conf:ro,z",
        ]
        if with_sa:
            args += ["-v", f"{os.path.join(self.work, 'sa')}:{SA_MOUNT}:ro,z"]
        if command is not None:
            args += ["--entrypoint", json.dumps(list(command[:1])), self.image, *command[1:]]
        else:
            args += [self.image]
        podman(*args)
        return self.ossmc

    def short_interval_command(self, interval: float = 2.0, deadline: float = 4.0) -> List[str]:
        """The image's helper, with shortened poll interval and read deadline (internal test hooks)."""
        code = (
            f"import sys; sys.path.insert(0, {HELPER!r}); "
            "from ossmc_tls_profile.supervisor import main_supervise; "
            f"sys.exit(main_supervise(read_interval={interval}, read_deadline={deadline}, backoff_max={interval}))"
        )
        return ["/usr/bin/python3", "-I", "-c", code]

    def logs(self, container: Optional[str] = None) -> str:
        res = podman("logs", container or self.ossmc, check=False)
        return res.stdout + res.stderr

    def wait_log(self, pattern: str, count: int = 1, timeout: float = 40) -> str:
        regex = re.compile(pattern)
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            text = self.logs()
            if len(regex.findall(text)) >= count:
                return text
            if not self.running():
                break
            time.sleep(0.25)
        raise AssertionError(f"log pattern {pattern!r} x{count} not seen:\n{self.logs()[-6000:]}")

    def running(self) -> bool:
        res = podman("inspect", "-f", "{{.State.Running}}", self.ossmc, check=False)
        return res.stdout.strip() == "true"

    def exit_code(self, timeout: float = 40) -> int:
        end = time.monotonic() + timeout
        while self.running() and time.monotonic() < end:
            time.sleep(0.25)
        return int(podman("inspect", "-f", "{{.State.ExitCode}}", self.ossmc).stdout.strip())

    def inspect(self, fmt: str) -> str:
        return podman("inspect", "-f", fmt, self.ossmc).stdout.strip()

    def probe(self) -> int:
        return podman("exec", self.ossmc, HELPER, "probe", check=False).returncode

    def wait_ready(self, ready: bool = True, timeout: float = 40) -> None:
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if (self.probe() == 0) == ready:
                return
            time.sleep(0.25)
        raise AssertionError(f"probe ready={ready} not reached:\n{self.logs()[-6000:]}")

    def processes(self) -> List[Dict[str, str]]:
        """pid, ppid, pgid, state and cmdline of every process in the OSSMC container, read from /proc."""
        script = (
            "import os, json\n"
            "out = []\n"
            "for p in os.listdir('/proc'):\n"
            "    if not p.isdigit():\n        continue\n"
            "    try:\n"
            "        stat = open(f'/proc/{p}/stat').read()\n"
            "        cmd = open(f'/proc/{p}/cmdline', 'rb').read().replace(b'\\0', b' ').decode().strip()\n"
            "    except OSError:\n        continue\n"
            "    f = stat.rsplit(')', 1)[1].split()\n"
            "    out.append({'pid': p, 'state': f[0], 'ppid': f[1], 'pgid': f[2], 'cmd': cmd})\n"
            "print(json.dumps(out))\n"
        )
        res = podman("exec", self.ossmc, "/usr/bin/python3", "-I", "-c", script)
        return [
            p for p in json.loads(res.stdout) if "/proc" not in p["cmd"] and "python3 -I -c import os" not in p["cmd"]
        ]

    def nginx_pids(self) -> List[str]:
        return [p["pid"] for p in self.processes() if p["cmd"].startswith("nginx")]

    def s_client(
        self,
        *args: str,
        request: bool = True,
        servername: str = SERVING_NAME,
        ca: str = "/work/ca.crt",
        port: int = 9443,
    ) -> Dict[str, Optional[str]]:
        """A fresh, verified openssl s_client connection from inside the pod."""
        cmd = [
            "openssl",
            "s_client",
            "-connect",
            f"127.0.0.1:{port}",
            "-servername",
            servername,
            "-verify_hostname",
            servername,
            "-CAfile",
            ca,
            "-verify_return_error",
            "-no_ticket",
            *args,
        ]
        req = "GET /plugin-manifest.json HTTP/1.1\r\nHost: ossmconsole\r\nConnection: close\r\n\r\n" if request else ""
        # Without a request, stdin EOF ends the session right after the handshake.
        eof = " -ign_eof" if request else ""
        script = f"printf '%s' {shell_quote(req)} | timeout 15 {' '.join(shell_quote(a) for a in cmd)}{eof} 2>&1"
        res = podman("exec", self.api, "sh", "-c", script, check=False)
        return parse_s_client(res.stdout)

    def cleanup(self) -> None:
        podman("pod", "rm", "-f", "-t", "0", self.name, check=False)
        shutil.rmtree(self.work, True)


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def parse_s_client(out: str) -> Dict[str, Optional[str]]:
    def find(pattern: str) -> Optional[str]:
        m = re.search(pattern, out)
        return m.group(1) if m else None

    protocol, cipher = None, None
    m = re.search(r"New, (TLSv1\.\d|\(NONE\)), Cipher is (\S+)", out)
    if m:
        protocol, cipher = m.group(1), m.group(2)
    if cipher == "(NONE)":
        protocol = cipher = None
    group = find(r"Negotiated TLS1\.3 group: (\S+)")
    temp_key = find(r"(?:Server|Peer) Temp Key: ([^\n]+)")
    if group is None and temp_key:
        # "ECDH, secp384r1, 384 bits" or "X25519, 253 bits"
        parts = [p.strip() for p in temp_key.split(",")]
        group = parts[1] if parts[0] == "ECDH" and len(parts) > 1 else parts[0]
    return {
        "protocol": protocol,
        "cipher": cipher,
        "group": group,
        "verify": find(r"Verify return code: (\d+)"),
        "http": find(r"HTTP/1\.[01] (\d{3})"),
        "raw": out,
    }
