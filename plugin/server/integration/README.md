# TLS profile helper integration tests

These tests exercise the **locally built OSSMC plugin image** end to end: the real
container entrypoint (the TLS profile helper supervising nginx) is started in a podman
pod next to a fake OpenShift API, and its behavior is observed the way a cluster would
observe it — readiness probes, logs, `/proc`, and live `openssl s_client` handshakes.
Nothing is injected into the image under test.

The unit suites (`make test-ossmc-tls-profile`, `test-ossmc-tls-profile-host`) test the
helper's source code; this suite tests the packaged artifact. Run it after changing
`plugin/Dockerfile`, the nginx.conf ConfigMap in `plugin/manifest.yaml`, or the helper's
supervisor/entrypoint/TLS-serving behavior.

## Running

```bash
# Full suite (from the repo root): builds the image, then runs the tests against it.
make build-plugin-image test-ossmc-tls-profile-container

# A single test (from plugin/server):
OSSMC_IMAGE=quay.io/kiali/ossmconsole:dev \
  python3 -I -B -m unittest discover -s integration -t . -k test_modern -v
```

`OSSMC_IMAGE` names the image under test and is never pulled — it must exist locally
(`make build-plugin-image` builds and tags it). Without it the whole suite **skips
silently**; if everything reports `skipped=N`, that is why. Requires podman, openssl and
python3 >= 3.9 on the host.

## Layout

| File | Role |
|---|---|
| `test_container.py` | The suite. `ContainerTestCase` is the base class; test classes group scenarios (policy negotiation, lifecycle, failure modes, hybrid groups, slow API, filesystem, compatibility). |
| `pod.py` | The harness. `Pod` builds and drives the two-container pod; `BASE_IMAGE` (the fake API container's base) comes from the plugin Dockerfile, overridable via `OSSMC_TLS_PROFILE_TEST_IMAGE`. |
| `fake_api.py` | Runs inside the fake API container: a small HTTP server behind an nginx TLS front end, serving `/apis/config.openshift.io/v1/apiservers/cluster`. |
| `fixtures/manifest-pre-change.yaml` | The previous manifest template, used by `CompatibilityTest` to prove a new image still works with an old template (the upgrade path). |

## How a test works

`ContainerTestCase.setUp` checks the image exists locally, creates a `Pod`, and
registers cleanup. A `Pod` is two containers sharing one network namespace:

- **fake API container** — built from the base image; nginx terminates TLS on
  127.0.0.1:6443 and proxies to `fake_api.py` on 6080. Its state is switched at runtime
  with `pod.set_api(status=..., profile=..., present=..., mode=...)` (POST /control):
  `status` sets the HTTP status (e.g. 403), `present` toggles the
  `tlsSecurityProfile` field, and `mode` `"trickle"` serves the response one byte at a
  time to test read deadlines.
- **OSSMC container** — the image under test, run with its real entrypoint, the
  nginx.conf extracted from `plugin/manifest.yaml`, a throwaway CA and serving certs,
  and (by default) a fake service-account mount. `with_sa=False` removes it to test
  behavior without API credentials.

Observation happens from outside: `pod.probe()` (the readiness probe subcommand),
`pod.logs()`, `pod.processes()` (via `/proc`), and `pod.s_client(...)` — a fresh,
verified `openssl s_client` handshake from the API container against OSSMC on
127.0.0.1:9443, returning the negotiated protocol, cipher, group, verify result and
HTTP status.

`ContainerTestCase` adds assertions on top:

- `assertAccepted(*s_client_args)` — handshake succeeds, cert verifies, HTTP 200
- `assertRejected(*s_client_args, control=...)` — handshake fails; with `control`, a
  positive control first proves the same client succeeds against a permissive server,
  so a rejection cannot be blamed on the client
- `assertNoListener()` — nothing is serving and the probe reports unready
- `start(profile=..., **kwargs)` — set the API profile, then start OSSMC

## Adding a test

1. Subclass `ContainerTestCase` (add it to an existing class when it fits one).
2. Drive the scenario with the harness: `self.start(profile=...)` or
   `self.pod.start_ossmc(...)`, mutate the world with `self.pod.set_api(...)` /
   `set_profile(...)` / `reload_front(...)`, and assert with `assertAccepted` /
   `assertRejected` / `self.pod.wait_log(...)` / `wait_ready(...)`.
3. New failure shapes belong in the fakes (a control-file mode, a `/control` state), not
   in the image under test — the point of the suite is that the image is treated as
   opaque.

For supervisor-level scenarios that need the helper's internal test hooks (shortened
poll interval or read deadline), use `pod.short_interval_command()` as the container
command. For template compatibility, pass `nginx_conf_manifest=` pointing at a fixture
manifest.

## Rules

- Python 3.9, standard library only (same constraints as the helper itself); tests may
  use `subprocess`. Lint with `make lint-ossmc-tls-profile`.
- `tests.helpers` (the unit-suite helpers, e.g. `Certs`) may be imported; both packages
  are rooted at `plugin/server`.
- Keep the image under test opaque: no `podman cp`, no extra volumes beyond certs, conf
  and the service-account mount the real deployment has.
