"""PID-1 supervisor: poll the cluster TLS profile, apply it to nginx, keep nginx alive.

Supervisor holds the decision logic and talks to the outside world only
through a platform object; RealPlatform implements it with bounded children
(spawn.run_bounded) and the managed nginx process group. Tests drive
Supervisor with a fake platform and a fake clock.

Outcome classes for every evaluation:

- valid: continue the application sequence;
- definitively invalid (a resolver rule, or nginx -T completing with a
  non-zero exit): stop nginx, clear readiness, keep polling;
- transient (capability probe failure, nginx -T runner failure): change
  nothing, cache nothing, retry next cycle.

A certificate-only update never stops a healthy nginx.

The main loop is one cycle() per poll interval: read the profile from the API
server, evaluate it, then housekeep (certificate rotation, pending self-check
retries, orphan reaping). Exit code 0 means a clean shutdown (SIGTERM/SIGQUIT);
any other exit tells the kubelet to restart the container, which is the recovery
path for every state the supervisor cannot fix from inside.
"""

from __future__ import annotations

import hashlib
import json
import os
import socket
import ssl
import traceback
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import clientconf, log, paths, resolve
from .capabilities import (
    PROBE_DEADLINE,
    PROBE_STDERR_CAP,
    PROBE_STDOUT_CAP,
    CapabilityError,
    OpenSSLCapabilities,
)
from .resolve import InvalidProfile, Policy
from .spawn import EventLoop, ManagedGroup, RunResult, Shutdown, child_env, run_bounded, sweep_orphans

try:
    from ._version import COMMIT, VERSION
except ImportError:  # plain source checkout: _version.py is written only by image builds
    VERSION = "dev"
    COMMIT = "unknown"

FETCH_STDOUT_CAP = 2 * 1024 * 1024
FETCH_STDERR_CAP = 64 * 1024
NGINX_T_STDOUT_CAP = 1024 * 1024
NGINX_T_STDERR_CAP = 64 * 1024
SELFCHECK_STDOUT_CAP = 64 * 1024
SELFCHECK_STDERR_CAP = 16 * 1024


class FatalExit(Exception):
    """Stop nginx and exit non-zero so the kubelet restarts the container."""


class NginxDied(FatalExit):
    pass


@dataclass
class Settings:
    """Internal knobs. Tests override them; production uses the defaults.

    These are deliberately not exposed as environment variables or CLI flags.
    """

    state_dir: str = paths.STATE_DIR
    helper_argv: Sequence[str] = (paths.HELPER,)
    nginx: str = paths.NGINX
    nginx_conf: str = paths.NGINX_CONF
    nginx_argv: Sequence[str] = (paths.S2I_RUN,)
    openssl: str = paths.OPENSSL
    system_openssl_cnf: str = paths.SYSTEM_OPENSSL_CNF
    fips_path: str = paths.FIPS_ENABLED
    serving_cert: str = paths.SERVING_CERT
    serving_key: str = paths.SERVING_KEY
    listen_host: str = paths.LISTEN_HOST
    listen_port: int = paths.LISTEN_PORT
    proc: str = "/proc"
    read_interval: float = 30.0
    read_deadline: float = 30.0
    backoff_initial: float = 1.0
    backoff_max: float = 30.0
    nginx_t_deadline: float = 10.0
    selfcheck_deadline: float = 10.0
    listener_wait: float = 10.0
    stop_quit_wait: float = 5.0
    stop_term_wait: float = 2.0
    stop_total: float = 10.0

    @property
    def tls_conf(self) -> str:
        return os.path.join(self.state_dir, "tls.conf")

    @property
    def state_file(self) -> str:
        return os.path.join(self.state_dir, "state")

    @property
    def client_conf(self) -> str:
        return os.path.join(self.state_dir, "openssl-client.cnf")

    @property
    def selfcheck_conf(self) -> str:
        return os.path.join(self.state_dir, "openssl-selfcheck.cnf")


@dataclass
class FetchOutcome:
    ok: bool
    profile: Any = None
    present: bool = False
    kind: str = ""
    status: Optional[int] = None
    detail: str = ""


@dataclass
class ValidateOutcome:
    # "ok", "invalid" (nginx -T completed with a non-zero exit) or "transient"
    kind: str
    dump: str = ""
    detail: str = ""


@dataclass
class SelfCheckOutcome:
    tls13_ok: bool
    tls12_ok: Optional[bool] = None
    detail: Dict[str, Any] = field(default_factory=dict)


def _tail(data: bytes, limit: int = 400) -> str:
    text = data.decode("utf-8", "replace").strip()
    return text[-limit:]


class Supervisor:
    def __init__(self, settings: Settings, platform: Any):
        self.s = settings
        self.p = platform
        self.ready = False
        self.generation = 0
        self.applied_policy: Optional[Policy] = None
        self.applied_cert_hash: Optional[str] = None
        self.desired_invalid: Optional[str] = None
        self.ever_applied = False
        self.selfcheck_pending = False
        self.client_groups: Optional[Tuple[str, ...]] = None
        self.contract_error: Optional[str] = None
        self.backoff = settings.backoff_initial
        self._last_messages: Optional[Tuple[Any, ...]] = None

    # ----- lifecycle -----

    def run(self) -> int:
        """Run until shutdown or a fatal error; the exit code drives the kubelet."""
        log.info("starting", version=VERSION, commit=COMMIT)
        try:
            self.prepare()
            while True:
                self.cycle()
        except Shutdown:
            log.info("termination requested; stopping nginx")
            self._final_stop()
            return 0
        except FatalExit as exc:
            log.error(str(exc))
            self._final_stop()
            return 1
        except Exception:
            log.error("unexpected error", traceback=traceback.format_exc())
            self._final_stop()
            return 1

    def prepare(self) -> None:
        os.makedirs(self.s.state_dir, mode=0o700, exist_ok=True)
        os.chmod(self.s.state_dir, 0o700)
        for name in (
            "state",
            "tls.conf",
            "tls.conf.new",
            "tls.conf.prev",
            "openssl-client.cnf",
            "openssl-selfcheck.cnf",
        ):
            try:
                os.remove(os.path.join(self.s.state_dir, name))
            except FileNotFoundError:
                pass
        self._set_ready(False)
        self.contract_error = self.p.contract_error()
        if self.contract_error:
            log.error(
                "OpenSSL configuration contract broken; every API read will fail until the image is fixed",
                detail=self.contract_error,
            )

    def cycle(self) -> None:
        """One read, one housekeeping pass, then the wait before the next read.

        The wait anchors at fetch completion, so time spent applying (an nginx
        restart) is not added on top of the interval.
        """
        finished = self.read()
        self.housekeeping()
        self.p.sleep_until(finished + self.next_wait())

    def next_wait(self) -> float:
        """Seconds to sleep after this cycle: backoff until the first apply, then the interval."""
        if self.ever_applied:
            # Once serving, read failures on a running nginx keep the normal cadence:
            # nginx serves the last good policy either way, so retrying fast gains nothing.
            return self.s.read_interval
        wait = self.backoff
        self.backoff = min(self.backoff * 2, self.s.backoff_max)
        return wait

    def _final_stop(self) -> None:
        try:
            if self.p.nginx_running() and not self.p.stop_nginx():
                log.error("nginx process group did not exit; leaving cleanup to container teardown")
        finally:
            self.applied_policy = None
            try:
                self._set_ready(False)
            except OSError:
                pass

    # ----- reading and evaluating -----

    def read(self) -> float:
        if self.contract_error:
            log.error(
                "cannot read the cluster TLS profile: OpenSSL configuration contract broken",
                detail=self.contract_error,
                state=self._state_text(),
            )
            return self.p.now()
        if self.client_groups is None:
            # Picked once per process: the groups depend only on what the runtime
            # implements and on FIPS mode, and FIPS mode is fixed at boot (a kernel
            # sysctl), so it cannot change under a running supervisor.
            try:
                groups = clientconf.client_groups(self.p.capabilities, self.p.fips())
            except CapabilityError as exc:
                log.error(
                    "cannot read the cluster TLS profile: client TLS groups could not be determined",
                    detail=str(exc),
                    state=self._state_text(),
                )
                return self.p.now()
            clientconf.write_private(self.s.client_conf, clientconf.render_client(groups, self.s.system_openssl_cnf))
            self.client_groups = groups
            log.info("API client TLS groups configured", groups=":".join(groups))
        outcome = self.p.fetch()
        finished = self.p.now()
        if not outcome.ok:
            self._log_read_failure(outcome)
            return finished
        self.evaluate(outcome.profile)
        return finished

    def _state_text(self) -> str:
        if self.applied_policy is not None:
            return "keeping the current policy and nginx running"
        if self.desired_invalid is not None:
            return "nginx stays stopped because the last profile read was invalid"
        return "nginx not started; OSSMC is not ready"

    def _log_read_failure(self, outcome: FetchOutcome) -> None:
        fields: Dict[str, Any] = {"kind": outcome.kind, "detail": outcome.detail, "state": self._state_text()}
        if outcome.status is not None:
            fields["status"] = outcome.status
        if outcome.status == 403:
            fields["hint"] = (
                f"ServiceAccount {paths.SERVICE_ACCOUNT_NAME} needs get on config.openshift.io apiservers/cluster "
                f"through ClusterRole {paths.CLUSTER_ROLE_NAME} and its ClusterRoleBinding"
            )
        elif outcome.status == 404:
            fields["hint"] = "APIServer/cluster was not found; OSSMC requires OpenShift"
        elif outcome.kind == "tls" and self.client_groups:
            fields["client_groups"] = ":".join(self.client_groups)
        log.error("cannot read the cluster TLS profile", **fields)

    def evaluate(self, profile: Any) -> None:
        messages: List[Tuple[str, str, Dict[str, Any]]] = []

        def warn(msg: str, **f: Any) -> None:
            messages.append(("warning", msg, f))

        def info(msg: str, **f: Any) -> None:
            messages.append(("info", msg, f))

        try:
            policy = resolve.resolve(profile, self.p.capabilities, self.p.fips(), warn, info)
        except InvalidProfile as exc:
            self._emit(messages, force=True)
            self.handle_invalid(str(exc))
            return
        except CapabilityError as exc:
            log.error(
                "cannot evaluate the cluster TLS profile right now; will retry",
                detail=str(exc),
                state=self._state_text(),
            )
            return
        self._emit(messages, key=policy)
        if self.desired_invalid is None and policy == self.applied_policy:
            # Same policy as the one nginx is serving, and the last read was not
            # invalid: nothing to do. After an invalid read the guard must NOT hold
            # even for this same policy, because handle_invalid stopped nginx and it
            # has to be started again.
            return
        self.desired_invalid = None
        self.apply(policy)

    def _emit(self, messages: List[Tuple[str, str, Dict[str, Any]]], key: Any = None, force: bool = False) -> None:
        """Log resolver messages once per distinct outcome rather than on every poll."""
        fingerprint = (key, tuple((lvl, msg, tuple(sorted(f.items()))) for lvl, msg, f in messages))
        if not force and fingerprint == self._last_messages:
            return
        self._last_messages = None if force else fingerprint
        for level, msg, fields in messages:
            log.log(level, msg, **fields)

    # ----- applying -----

    def apply(self, policy: Policy, cert_only: bool = False) -> None:
        """Swap in the rendered include, validate it with nginx -T, restart nginx.

        cert_only marks a serving-certificate rotation under an unchanged policy.
        Its promise is that a failure here never stops a healthy nginx: every path
        that applies to it restores readiness and retries on a later pass instead.
        """
        prev_ready = self.ready
        conf = self.s.tls_conf
        new, prev = conf + ".new", conf + ".prev"
        # Publish the new include (new -> conf, the old one -> prev) so nginx -T
        # validates exactly what a restarted nginx would load.
        with open(new, "w") as f:
            f.write(resolve.render(policy))
        # Unready for the whole swap: nginx either restarts or keeps serving the old
        # policy, but the probe must not vouch for a policy mid-transition.
        self._set_ready(False)
        had_prev = os.path.exists(conf)
        if had_prev:
            os.replace(conf, prev)
        else:
            self._remove(prev)
        os.replace(new, conf)

        result = self.p.validate()
        if result.kind != "ok":
            # Roll the include back so the on-disk conf matches the running nginx.
            if had_prev:
                os.replace(prev, conf)
            else:
                self._remove(conf)
            if cert_only:
                log.error(
                    "nginx -T failed while applying a rotated serving certificate; keeping the running "
                    "nginx and retrying next pass",
                    outcome=result.kind,
                    detail=result.detail,
                )
                self._set_ready(prev_ready)
                return
            if result.kind == "invalid":
                self.handle_invalid(f"nginx rejected the rendered configuration: {result.detail}")
                return
            log.error(
                "cannot validate the nginx configuration right now; will retry",
                detail=result.detail,
                state=self._state_text(),
            )
            # Transient (the nginx -T runner itself failed, not nginx): the new policy
            # stays desired but unapplied, and the next cycle retries because policy
            # still differs from applied_policy.
            if self.applied_policy is not None:
                self._set_ready(prev_ready)
            return

        header = f"# configuration file {conf}:"
        if header not in result.dump:
            # nginx -T expands includes into its dump; if ours is missing, the mounted
            # nginx.conf was never wired for the helper. Only a template fix plus a pod
            # restart helps, so exit and let the kubelet surface it.
            raise FatalExit(
                f"the mounted {self.s.nginx_conf} does not load {conf}; the nginx-conf ConfigMap must contain "
                f"'include {conf};' inside the server block (update the installation templates, then restart the pod)"
            )

        cert_hash, _ = self.p.cert_state()
        # Hashed before the stop/start pair so applied_cert_hash is the cert nginx
        # actually starts with; a rotation racing the restart is caught next pass.
        if self.p.nginx_running():
            self._stop_nginx()
        # Cleared before starting: if anything from here on fails, the supervisor
        # must not go on believing a policy is live.
        self.applied_policy = None
        self.p.start_nginx()
        self.generation += 1
        if not self.p.wait_listener():
            raise FatalExit(
                f"nginx did not accept connections on {self.s.listen_host}:{self.s.listen_port} "
                f"within {self.s.listener_wait:.0f}s"
            )
        self.applied_policy = policy
        self.applied_cert_hash = cert_hash
        self.ever_applied = True
        log.info(
            "nginx started", reason="certificate rotation" if cert_only else "policy change", generation=self.generation
        )
        self.run_selfcheck(policy)

    def run_selfcheck(self, policy: Policy) -> None:
        """Probe our own listener with a client that offers exactly the rendered policy.

        The self-check child runs with an OPENSSL_CONF whose Ciphersuites/Groups match
        the include, so a completed TLS 1.3 handshake proves nginx serves the policy.
        A failing TLS 1.2 handshake only degrades older clients (for example an
        ECDSA-only cipher list with an RSA serving cert) and warns; a failing TLS 1.3
        handshake means the listener is broken for everyone and blocks readiness,
        retried every pass until it passes.
        """
        clientconf.write_private(
            self.s.selfcheck_conf,
            clientconf.render_selfcheck(policy.tls13_suites, policy.groups, self.s.system_openssl_cnf),
        )
        outcome = self.p.self_check(policy)
        if outcome.tls12_ok is False:
            log.warning(
                "TLS 1.2 self-check failed; TLS 1.3 clients are unaffected (check the serving "
                "certificate key type against the TLS 1.2 ciphers)",
                result=json.dumps(outcome.detail),
            )
        if outcome.tls13_ok:
            self.selfcheck_pending = False
            self._set_ready(True)
            log.info("policy applied", policy=policy.summary(), generation=self.generation)
        else:
            self.selfcheck_pending = True
            self._set_ready(False)
            log.error(
                "TLS 1.3 self-check failed; nginx keeps running but OSSMC is not ready; retrying each pass",
                result=json.dumps(outcome.detail),
            )

    def handle_invalid(self, message: str) -> None:
        """Definitive verdict: stop serving rather than serve outside the cluster's policy."""
        self.desired_invalid = message
        stopped = False
        if self.p.nginx_running():
            self._stop_nginx()
            stopped = True
        self.applied_policy = None
        self.selfcheck_pending = False
        self._set_ready(False)
        log.error(
            "invalid cluster TLS profile; OSSMC stays stopped until a valid profile is observed",
            detail=message,
            nginx="stopped" if stopped else "not running",
        )

    def _stop_nginx(self) -> None:
        if not self.p.stop_nginx():
            raise FatalExit("could not stop the nginx process group within the cleanup bound")

    # ----- housekeeping -----

    def housekeeping(self) -> None:
        self.check_certificate()
        if self.applied_policy is not None and self.selfcheck_pending:
            self.run_selfcheck(self.applied_policy)
        self.p.sweep_orphans()

    def check_certificate(self) -> None:
        """Restart nginx on a rotated serving cert; never stop it on a broken one.

        nginx only reads the secret at startup, so a rotation needs a restart — but a
        cert that changed into an unusable state (the pair does not load) must leave
        the running nginx alone until the secret settles.
        """
        if self.applied_policy is None or self.desired_invalid is not None:
            return
        cert_hash, error = self.p.cert_state()
        if cert_hash == self.applied_cert_hash:
            return
        if error:
            log.warning("serving certificate changed but is not usable yet; keeping the running nginx", detail=error)
            return
        log.info("serving certificate changed; restarting nginx with it")
        self.apply(self.applied_policy, cert_only=True)

    # ----- state -----

    def _set_ready(self, ready: bool) -> None:
        """Atomically replace the state file so the readiness probe never reads a torn one."""
        self.ready = ready
        state = {"ready": ready, "pid": os.getpid(), "generation": self.generation}
        tmp = self.s.state_file + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, self.s.state_file)

    @staticmethod
    def _remove(path: str) -> None:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass


def _parse_fetch(result: RunResult) -> FetchOutcome:
    """Decode the fetch child's envelope.

    Exit code 0 means "the child ran and produced a verdict", not "the read
    succeeded": failure verdicts travel inside the envelope, and only a broken
    child surfaces here as a non-zero exit or unparseable output.
    """
    if not result.completed or result.returncode != 0:
        detail = f"fetch child {result.describe()}"
        if result.stderr:
            detail += f": {_tail(result.stderr)}"
        return FetchOutcome(False, kind="child", detail=detail)
    try:
        env = json.loads(result.stdout.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return FetchOutcome(False, kind="child", detail="fetch child printed no valid JSON envelope")
    if not isinstance(env, dict) or not isinstance(env.get("ok"), bool):
        return FetchOutcome(False, kind="child", detail="fetch child printed an unexpected envelope")
    if env["ok"]:
        if "profile" not in env or not isinstance(env.get("present"), bool):
            return FetchOutcome(False, kind="child", detail="fetch child envelope lacks profile/present")
        return FetchOutcome(True, profile=env["profile"], present=env["present"], status=env.get("status"))
    status = env.get("status")
    return FetchOutcome(
        False,
        kind=str(env.get("kind", "unknown")),
        status=status if isinstance(status, int) else None,
        detail=str(env.get("detail", ""))[:600],
    )


class RealPlatform:
    def __init__(self, settings: Settings, loop: EventLoop):
        self.s = settings
        self.loop = loop
        self.nginx: Optional[ManagedGroup] = None
        self._stopping = False
        self.capabilities = OpenSSLCapabilities(self._run_probe, settings.openssl)
        loop.watchers.append(self._watch_nginx)

    def _watch_nginx(self) -> None:
        """Runs from loop.check() on every wakeup; an nginx crash becomes a container restart."""
        if self.nginx is not None and not self._stopping and self.nginx.master_exited:
            raise NginxDied(
                f"nginx exited unexpectedly ({self.nginx.describe_exit()}); exiting so the container restarts"
            )

    def now(self) -> float:
        return self.loop.clock()

    def sleep_until(self, deadline: float) -> None:
        self.loop.sleep_until(deadline)

    def fips(self) -> bool:
        return clientconf.read_fips(self.s.fips_path)

    def contract_error(self) -> Optional[str]:
        return clientconf.check_contract(self.s.system_openssl_cnf)

    def _run_probe(self, argv: List[str]) -> RunResult:
        return run_bounded(
            self.loop,
            argv,
            env=child_env(),
            deadline=PROBE_DEADLINE,
            stdout_cap=PROBE_STDOUT_CAP,
            stderr_cap=PROBE_STDERR_CAP,
        )

    def fetch(self) -> FetchOutcome:
        result = run_bounded(
            self.loop,
            list(self.s.helper_argv) + ["fetch"],
            env=child_env(OPENSSL_CONF=self.s.client_conf),
            deadline=self.s.read_deadline,
            stdout_cap=FETCH_STDOUT_CAP,
            stderr_cap=FETCH_STDERR_CAP,
        )
        return _parse_fetch(result)

    def validate(self) -> ValidateOutcome:
        result = run_bounded(
            self.loop,
            [self.s.nginx, "-T", "-c", self.s.nginx_conf],
            env=child_env(),
            deadline=self.s.nginx_t_deadline,
            stdout_cap=NGINX_T_STDOUT_CAP,
            stderr_cap=NGINX_T_STDERR_CAP,
        )
        if not result.completed:
            return ValidateOutcome("transient", detail=f"nginx -T {result.describe()}")
        if result.returncode != 0:
            return ValidateOutcome("invalid", detail=_tail(result.stderr))
        return ValidateOutcome("ok", dump=result.stdout.decode("utf-8", "replace"))

    def nginx_running(self) -> bool:
        return self.nginx is not None

    def start_nginx(self) -> None:
        argv = list(self.s.nginx_argv)
        self.nginx = ManagedGroup.start(argv[0], argv, child_env())

    def stop_nginx(self) -> bool:
        if self.nginx is None:
            return True
        # _stopping keeps the watcher from treating our own shutdown as a crash.
        self._stopping = True
        try:
            done = self.nginx.stop(self.loop, self.s.stop_quit_wait, self.s.stop_term_wait, self.s.stop_total)
        finally:
            self._stopping = False
        if done:
            self.nginx = None
        return done

    def wait_listener(self) -> bool:
        end = self.loop.clock() + self.s.listener_wait
        while True:
            self.loop.check()
            try:
                with socket.create_connection((self.s.listen_host, self.s.listen_port), timeout=0.5):
                    return True
            except OSError:
                pass
            if self.loop.clock() >= end:
                return False
            self.loop.wait([], 0.1)

    def self_check(self, policy: Policy) -> SelfCheckOutcome:
        argv = list(self.s.helper_argv) + [
            "self-check",
            self.s.listen_host,
            str(self.s.listen_port),
            ":".join(policy.tls13_suites),
            ":".join(policy.tls12_ciphers) or "-",
        ]
        result = run_bounded(
            self.loop,
            argv,
            env=child_env(OPENSSL_CONF=self.s.selfcheck_conf),
            deadline=self.s.selfcheck_deadline,
            stdout_cap=SELFCHECK_STDOUT_CAP,
            stderr_cap=SELFCHECK_STDERR_CAP,
        )
        if not result.completed or result.returncode != 0:
            return SelfCheckOutcome(
                False, detail={"error": f"self-check child {result.describe()}", "stderr": _tail(result.stderr, 200)}
            )
        try:
            data = json.loads(result.stdout.decode("utf-8"))
            tls13 = data["tls13"]
            tls12 = data.get("tls12")
            return SelfCheckOutcome(
                tls13_ok=bool(tls13.get("ok")),
                tls12_ok=None if tls12 is None else bool(tls12.get("ok")),
                detail=data,
            )
        except (ValueError, UnicodeDecodeError, KeyError, TypeError, AttributeError):
            return SelfCheckOutcome(False, detail={"error": "self-check child printed an unexpected result"})

    def cert_state(self) -> Tuple[Optional[str], Optional[str]]:
        """Return (SHA-256 of the cert/key pair, error if the pair does not load)."""
        # load_cert_chain pre-validates the pair so a broken secret never restarts
        # nginx into a crash loop.
        try:
            with open(self.s.serving_cert, "rb") as f:
                crt = f.read()
            with open(self.s.serving_key, "rb") as f:
                key = f.read()
        except OSError as exc:
            return None, f"cannot read the serving certificate: {exc.strerror or exc}"
        digest = hashlib.sha256()
        for part in (crt, key):
            digest.update(hashlib.sha256(part).digest())
        try:
            ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER).load_cert_chain(self.s.serving_cert, self.s.serving_key)
        except (ssl.SSLError, OSError) as exc:
            return digest.hexdigest(), f"certificate and key do not load as a pair: {exc}"
        return digest.hexdigest(), None

    def sweep_orphans(self) -> None:
        # Only the nginx group is tracked: bounded children are fully reaped by
        # run_bounded, so any zombie left behind is by definition a stray.
        tracked = [self.nginx.pgid] if self.nginx is not None else []
        reaped = sweep_orphans(tracked, self.s.proc)
        if reaped:
            log.info("reaped stray orphan processes", pids=",".join(map(str, reaped)))


def main_supervise(**overrides: Any) -> int:
    """Run the supervisor. Keyword overrides are for tests only (see Settings)."""
    settings = Settings(**overrides)
    loop = EventLoop()
    loop.install()
    try:
        platform = RealPlatform(settings, loop)
        return Supervisor(settings, platform).run()
    finally:
        loop.uninstall()
