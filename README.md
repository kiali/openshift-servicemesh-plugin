# OpenShift Service Mesh Console (OSSM Console)

:information_source: There is a [Users Guide](https://kiali.io/docs/ossmc/users-guide/)

The OpenShift Service Mesh Console is a Webpack Plugin that integrates Kiali into the OpenShift Console. The official title of the project is "OpenShift Service Mesh Console" but you may see this abbreviated in documentation and code as "OSSMC", "ossmconsole", or "OSSM Console".

The main component is a plugin based on OpenShift Console [Dynamic plugin-ins](https://docs.openshift.com/container-platform/4.13/web_console/dynamic-plugin/overview-dynamic-plugin.html) framework. Installing and enabling the plugin will add OpenShift Service Mesh support into the OpenShift Console. The new "Service Mesh" menu item and tabs allow you to interact with your mesh via the Kiali user interface. Note that OSSMC may also work with upstream Istio installed (as opposed to OpenShift Service Mesh).

The main installation mechanism is the Kiali Operator.

## Platform Setup

These are the things you need before developers can start working with the OpenShift Service Mesh Console:

1. OpenShift cluster with OpenShift ServiceMesh or Istio installed.
2. Kiali Server deployed in the cluster
3. `oc` client available in the path
4. `podman` or `docker` client available in the path
5. [NodeJS](https://nodejs.org) (>= 24) with [corepack](https://nodejs.org/api/corepack.html) enabled (`corepack enable`). The exact Yarn version is pinned in `plugin/package.json` via the `packageManager` field.

## Quickly Deploy the Latest OSSM Console Image

To very quickly get the latest OSSMC plugin deployed in your cluster (e.g. without needing to build/push the operator and its catalog source and index image), run the following.

1. Log into your OpenShift cluster with `oc login`
2. Run `make deploy-plugin enable-plugin` to deploy the `latest` plugin published on quay.io and then enable the plugin

The manifest runs the image's TLS profile helper (see [Cluster TLS Security Profile](#cluster-tls-security-profile)), so the image must contain it.

You can undeploy/disable the plugin using `make undeploy-plugin`.

## How to Run the Plugin for Local Development

> :warning: For this local dev environment to work, you _must_ deploy the Kiali Server with `auth.strategy` set to `anonymous`.

### How the plugin proxy works

The OpenShift Console has a built-in plugin proxy (`BRIDGE_PLUGIN_PROXY`) that forwards API requests from the browser to the Kiali backend server-side. This means the browser only communicates with the console (same origin), avoiding CORS issues entirely. The `KIALI_URL` environment variable configures where the proxy sends requests. If omitted, it defaults to `http://localhost:20001`.

### Preparing your local dev environment using `make`

The `make prepare-dev-env` target installs dependencies, copies the plugin config, and prints the commands to start the plugin and console with the correct `KIALI_URL`.

Set `KIALI_URL` to either a URL or the literal value `route` to auto-discover it from the Kiali OpenShift Route (requires the operator or helm chart deployment):

```sh
make prepare-dev-env -e KIALI_URL=route
```

Or specify the URL directly:

```sh
make prepare-dev-env -e KIALI_URL=https://<your-kiali-server-host>
```

### Preparing your local dev environment manually

Alternatively, you can perform the same steps manually (this is what `make prepare-dev-env` does under the hood):

> **Note:** Yarn is managed via [corepack](https://nodejs.org/api/corepack.html). Run `corepack enable` once before using `yarn`. The exact Yarn version is pinned in `plugin/package.json` via the `packageManager` field.

```sh
cd plugin
yarn install

# Copy the plugin-config.json file into the "dist" folder to emulate the ConfigMap in a local environment
cp plugin-config.json dist

# If necessary, change the settings in the config file
# vi dist/plugin-config.json
```

### Run The Plugin and OpenShift Console Locally

Once your dev environment is prepared, run the plugin and the OpenShift Console in separate command line windows:

In one command line window, start the plugin:

```sh
cd plugin
yarn run start
```

The plugin will be accessible at http://localhost:9001

In a second command line window, start the OpenShift Console:

```sh
cd plugin
KIALI_URL=https://<your-kiali-server-host> yarn run start-console
```

The `KIALI_URL` environment variable tells `start-console.sh` where to proxy API requests. If omitted, it defaults to `http://localhost:20001`. The OpenShift Console will be accessible at http://localhost:9000

### Running with Mock Server (No Kiali Backend Required)

For frontend development without a real Kiali backend, you can use the mock server. This allows you to develop and test the UI without deploying Kiali Server in your cluster.

> :warning: You still need access to an OpenShift cluster (local or remote) to run the OpenShift Console, which loads the OSSMC plugin. The mock server only replaces the Kiali backend API — you must be logged in via `oc login` to your cluster.

This is useful for:
- UI development and testing without Kiali Server deployed
- Testing specific mock scenarios
- Faster development iteration

**Setup:**

Run in three separate terminals:

```sh
# Terminal 1: Start the mock server
cd plugin
yarn mock-server

# Terminal 2: Start the plugin
cd plugin
yarn start

# Terminal 3: Start the OpenShift Console (point KIALI_URL to the mock server)
cd plugin
KIALI_URL=http://localhost:3001 yarn start-console
```

Open http://localhost:9000

The mock server provides simulated API responses using handlers defined in `src/kiali/mocks/handlers/`.

**Configuration:**

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MOCK_SERVER_PORT` | `3001` | Port for the mock server |
| `REACT_APP_MOCK_SCENARIO` | `healthy` | Mock scenario to use |

Example with custom port and scenario:
```sh
MOCK_SERVER_PORT=4000 REACT_APP_MOCK_SCENARIO=unhealthy yarn mock-server
```

Remember to update `KIALI_URL` when starting the console if you change the mock server port.

Available scenarios are defined in `src/kiali/mocks/scenarios.ts`.

### Testing Locally Distributed Tracing integration

For testing the distributed tracing integration locally, assign to distributedTracingPluginConfig in the getDistributedTracingPluginManifestPromise in the KialiController the following data:

```json
  distributedTracingPluginConfig = {
    "name": "distributed-tracing-console-plugin",
    "version": "0.0.1",
    "displayName": "Distributed Tracing Plugin",
    "description": "This plugin adds a distributed tracing UI to the Openshift console.",
    "dependencies": {
      "@console/pluginAPI": "*"
    },
    "extensions": [
      {
        "type": "console.page/route",
        "properties": {
          "exact": false,
          "path": "/observe/traces",
          "component": {
            "$codeRef": "TracingUI"
          }
        }
      },
      {
        "type": "console.navigation/href",
        "properties": {
          "id": "distributed-tracing",
          "name": "Traces",
          "href": "/observe/traces",
          "perspective": "admin",
          "section": "observe"
        }
      }
    ]
  }
```

That will help to validate if the logic and the URL are right, but in the localhost plugin it won't load the distributed tracing plugin page.

### Testing Locally Netobserv integration

For testing the Netobserv integration locally, assign to netobservPluginConfig in the getNetobservPluginManifestPromise in the KialiController.go, the following data:

```json
  netobservPluginConfig = {
    "name": "network-observability-console-plugin",
    "version": "0.0.1",
    "displayName": "Network Observability Plugin",
    "description": "This plugin adds a network observability UI to the OpenShift console.",
    "dependencies": {
      "@console/pluginAPI": "*"
    },
    "extensions": [
      {
        "type": "console.page/route",
        "properties": {
           "exact": false,
           "path": "/observe/network-traffic",
            "component": {
              "$codeRef": "NetworkTrafficUI"
            }
          }
      },
      {
        "type": "console.navigation/href",
        "properties": {
          "id": "network-observability",
          "name": "Network Traffic",
          "href": "/observe/network-traffic",
          "perspective": "admin",
           "section": "observe"
        }
      }
    ]
  };
```

That will help to validate if the logic and the URL are right, but in the localhost plugin it won't load the Network Observability plugin page.

## Operator

The OpenShift Service Mesh Console will be installed by end users using the Kiali Operator.

### How To Deploy A Dev Build of OSSM Console Using The Operator

Sometimes you want to test a locally built image of the OSSM Console plugin when installed via the Kiali Operator. Follow these steps to do this.

1. Make sure your Kiali dev environment is fully set up. This means you must have the [kiali/kiali repo](https://github.com/kiali/kiali), the [kiali/kiali-operator repo](https://github.com/kiali/kiali-operator), and the [kiali/helm-charts repo](https://github.com/kiali/helm-charts) cloned on your local machine. See the [kiali/kiali README](https://github.com/kiali/kiali/blob/master/README.adoc#developer-setup) for more details.
2. Log into your OpenShift cluster with `oc login`
3. Log into your OpenShift image registry. You can find the command to do this in the output of `make cluster-status`
4. Create a dev build of the OSSMC plugin and push that image into your cluster via `make clean-plugin cluster-push`
5. Change your current working directory to your local kiali/kiali repo.
6. If you do not already have the Kiali Operator and a Kiali Server installed, do so now via `make build build-ui cluster-push operator-create kiali-create`
7. Install your dev build of the OSSMC plugin via `make ossmconsole-create`

Give the Kiali Operator time to process the OSSMConsole CR and time for the OpenShift Console UI to load the plugin (it could take a minute or two). Eventually, the plugin will be fully deployed and ready to use.

## Cluster TLS Security Profile

OSSMC serves its plugin assets with nginx on port 9443. nginx follows the OpenShift cluster TLS security profile
(`spec.tlsSecurityProfile` of `APIServer/cluster`), as the Kiali server does. A small Python helper in the image,
`/usr/local/bin/ossmc-tls-profile` (sources in `plugin/server/`), reads the profile, renders an nginx include and
supervises nginx. It needs no Kiali server, so OSSMC-lite gets the feature too. The Kiali operator only installs the
permissions and wiring; it has no TLS logic of its own.

### Profile source and RBAC

The helper reads only `GET /apis/config.openshift.io/v1/apiservers/cluster`, using the pod's ServiceAccount token
and the mounted Kubernetes CA bundle. The CA bundle is the only trust source, and certificate and hostname checks are
always on. Both installation paths create:

- ServiceAccount `ossmconsole-service-account` in the OSSMC namespace;
- ClusterRole `ossmconsole-tls`, granting only `get` on `config.openshift.io` `apiservers` with `resourceNames: [cluster]`;
- ClusterRoleBinding `ossmconsole-tls`, binding that role to that ServiceAccount.

No `list`, `watch` or write access is needed. The helper follows the cluster profile whatever `tlsAdherence` says,
like Kiali, and it has no override or second source of TLS settings.

### Image and installation contract

- The image keeps its default `CMD /usr/libexec/s2i/run`, which starts nginx with whatever static configuration is
  mounted. Installation templates opt in to profile support with all four of these:
  - the container command `["/usr/local/bin/ossmc-tls-profile"]`;
  - the ServiceAccount and RBAC above;
  - `include /tmp/ossmc/tls.conf;` inside the `server` block of the `nginx-conf` ConfigMap, with no `ssl_protocols`,
    `ssl_ciphers` or `ssl_ecdh_curve` of its own;
  - the readiness probe `exec: ["/usr/local/bin/ossmc-tls-profile", "probe"]` (`periodSeconds: 5`,
    `timeoutSeconds: 3`). There is deliberately no liveness probe, so a healthy nginx is never killed just because the
    API server is unreachable.
- **Updating only the image does not enable the feature.** Older templates that don't set the command keep starting
  nginx with their static configuration. The reverse pairing, new templates on an image without the helper, fails at
  container start with a missing executable. Publish a helper-enabled image before shipping templates that use it.
- The helper has one strict behavior: on errors it never falls back to the old static configuration.
- The helper writes only under `/tmp/ossmc/` (`tls.conf`, `state`, and the OpenSSL configs used by its child
  processes), never under the static-asset directory.

### Read cadence and propagation

The first read happens immediately. Until a valid policy has been applied, the helper waits 1 s after each read,
doubling up to 30 s, so a fresh install recovers quickly while its RBAC propagates. After that it waits a fixed 30 s
after each read finishes. Every read runs in a short-lived child process with a 30 s wall-clock deadline, so a slow or
stalled API server can never block the supervisor.

A profile change therefore reaches new connections within about **60 s**: up to a 30 s wait plus a read of up to 30 s,
plus a few seconds to apply. The helper applies a changed policy by validating it with `nginx -T`, stopping the running
nginx gracefully and starting a new one inside the same container. Clients see a brief listener interruption. Neither
the pod nor the container restarts. Policies are compared by their effective content, so unrelated APIServer changes
cause no restart.

### Startup, read errors and invalid profiles

| Situation | Behavior |
|---|---|
| No valid profile read yet (API down, 403, 404, bad JSON) | nginx is not started; the pod stays unready and retries with backoff |
| Read errors after a valid policy was applied | The last policy keeps serving; each failed poll logs an error |
| A profile that can't be applied (`Old`, TLS < 1.2, unknown type, cipher selectors, nothing usable) | nginx is stopped and the pod goes unready until a valid profile is read. Later read errors leave it stopped |
| Transient evaluation failure (an `openssl` probe or `nginx -T` timeout) | Nothing changes; the next poll retries |
| The mounted `nginx.conf` lacks `include /tmp/ossmc/tls.conf;` | The helper exits non-zero before starting nginx, and the pod shows CrashLoopBackOff with a message naming the missing include |
| nginx exits unexpectedly, or never accepts connections within 10 s of starting | The helper exits non-zero and the kubelet restarts the container, which reads the profile again |
| SIGTERM (or SIGQUIT, the base image's stop signal) | nginx is stopped gracefully; worst case under 10 s |

A successful read with no `tlsSecurityProfile` means Intermediate. Read errors never mean Intermediate.

For a 403 the helper logs the ServiceAccount and ClusterRole names to check. If a pod started before its `nginx-conf`
ConfigMap was updated, delete the pod. Whether a restarted container (same pod) sees the updated ConfigMap through its
`subPath` mount has not been verified on a cluster yet. Both installation paths apply the ConfigMaps before the
Deployment, and the operator restarts the pod when `nginx-conf` changes.

### How profiles are rendered

- **Protocols:** Intermediate and Custom `VersionTLS12` (or an empty `minTLSVersion`) render TLS 1.2 and 1.3. Modern
  and Custom `VersionTLS13` render TLS 1.3 only. `Old`, TLS 1.0 and TLS 1.1 are rejected on purpose: OSSMC doesn't
  support TLS versions below 1.2, and such a profile stops OSSMC rather than leaving it on a policy the cluster no
  longer asks for.
- **TLS 1.3 suites:** always `ssl_conf_command Ciphersuites` with `TLS_AES_128_GCM_SHA256`,
  `TLS_AES_256_GCM_SHA384` and `TLS_CHACHA20_POLY1305_SHA256`, minus any the runtime lacks (CHACHA20 is expected to
  drop under FIPS). `TLS_AES_128_CCM_SHA256`, which the RHEL default crypto policy would otherwise enable, is never
  rendered.
- **TLS 1.2 ciphers** (only under a TLS 1.2 minimum):
  - Each name must be an individual suite. OpenSSL or IANA names are accepted, and the OpenSSL name is rendered.
  - Cipher-string selectors such as `HIGH`, `DEFAULT` or `aNULL` make the profile invalid, even when mixed with
    usable suites.
  - DHE suites are dropped, because no `ssl_dhparam` is configured. Unknown or runtime-unavailable names are skipped
    with a warning.
  - An empty Custom list uses the Intermediate TLS 1.2 suites.
  - A list containing only TLS 1.3 names gives a TLS 1.3-only server.
  - A list with nothing usable is invalid.
  - `ssl_ciphers` is always rendered when TLS 1.2 is on, so nginx's and the system policy's defaults never apply.
- **Under a TLS 1.3 minimum** the profile's cipher list is ignored entirely, as in Kiali.
- **Groups:**
  - Preset and explicit Custom groups are rendered in order as `ssl_ecdh_curve`, without `?` prefixes.
  - Under FIPS (`/proc/sys/crypto/fips_enabled` = 1), `X25519MLKEM768` is removed. Groups the runtime doesn't
    implement are also removed.
  - An explicit list that ends up empty is invalid.
  - A Custom profile with `groups` omitted renders no `ssl_ecdh_curve`, so nginx follows the RHEL system crypto policy,
    including under FIPS.
  - Removing these groups does not by itself prove FIPS compliance; that needs testing on a FIPS cluster.
- **Intentional divergence from Kiali:** a TLS 1.2 list containing only suites that OpenSSL knows but the active
  provider filters out is invalid in OSSMC. For example, only `ECDHE-*-CHACHA20-POLY1305` under FIPS. Kiali accepts
  such a list and fails at handshake time.

### API client TLS groups

The API server enforces the cluster profile's groups, and a Custom profile may allow only hybrid post-quantum groups.
For example, `groups: [X25519MLKEM768]` with `minTLSVersion: VersionTLS13`. The default Python client doesn't offer
hybrid groups, so the read child runs with a generated `OPENSSL_CONF` that offers every OpenShift TLS group the
runtime implements: `X25519MLKEM768, X25519, secp256r1, secp384r1, SecP256r1MLKEM768, SecP384r1MLKEM1024,
secp521r1`, without `X25519MLKEM768` under FIPS. Only `Groups` changes; the rest of the system crypto policy still
applies.

Limit: an API server that accepts only a group the local OpenSSL doesn't implement, such as `X25519MLKEM768` on a FIPS
host, can't be read. The helper logs a TLS failure that names the client groups, and keeps the last valid policy if
one was applied. Most other FIPS clients would also fail against such an API server.

### Certificate rotation, self-check and diagnostics

- **Serving certificate rotation:** the helper checks the serving certificate (`/var/serving-cert`) once per poll
  cycle. When the certificate and key change and load as a valid pair, it restarts nginx with them. While a rotation is
  half-written, it keeps the running nginx. A failed `nginx -T` during a certificate-only update never stops a healthy
  nginx; it is retried on the next pass.
- **Self-check:** after every nginx start, the helper runs a loopback TLS self-check that offers exactly the policy's
  TLS 1.3 suites and groups.
  - A failed TLS 1.3 handshake keeps the pod **unready** while nginx keeps running, and is retried every cycle. Real
    clients would fail the same way.
  - A failed TLS 1.2 handshake is only a **warning**. It usually means the TLS 1.2 ciphers don't match the
    certificate's key type, for example ECDSA-only suites with the service CA's RSA certificate.
- **Logs:** single-line `ossmc-tls-profile: level=... msg=...` records on stderr.
  - `msg="policy applied"` shows the effective protocols, suites and groups.
  - `msg="cannot read the cluster TLS profile"` carries `kind` (`tls`, `connect`, `http`, `json`, `io`, `config` or
    `child`) and a `hint` for 403/404.
  - `msg="invalid cluster TLS profile"` explains why a profile was rejected.
  - Tokens, keys and API responses are never logged.

### Bumping the OpenShift TLS profile revision

`plugin/server/ossmc_tls_profile/profiles.py` embeds a pinned copy of the OpenShift presets and `TLSGroup` enum. Its
`OPENSHIFT_API_REVISION` matches the `github.com/openshift/api` version the Kiali server pins. To bump it:

1. Open `config/v1/types_tlssecurityprofile.go` at the new revision.
2. Compare its `TLSProfiles` map (ciphers, groups, `MinTLSVersion` of Old/Intermediate/Modern) and the `TLSGroup` enum
   with `profiles.py`, line by line.
3. Update `profiles.py` (including the `OPENSHIFT_API_REVISION` constant and the source-URL comment above it), the golden test in
   `plugin/server/tests/test_profiles.py` and the client group order in `clientconf.py` if the enum changed.
4. Run `make test-ossmc-tls-profile`.

### Developing and testing the helper

The helper is standard-library-only Python 3.9 code. See `plugin/server/` and the "TLS profile helper" section of
`AGENTS.md`.

```bash
make lint-ossmc-tls-profile              # needs ruff at the version pinned in make/Makefile.plugin.mk
make test-ossmc-tls-profile              # unit tests inside the Dockerfile's base image (authoritative)
make test-ossmc-tls-profile-host         # the same unit tests with the host python3, for fast iteration
make build-plugin-image test-ossmc-tls-profile-container   # integration tier: fake API + the built image in a podman pod
```

The integration tests are described — including how to run a single test and how to add
new ones — in `plugin/server/integration/README.md`.

To refresh the recorded `openssl` outputs that the unit tests replay (for example after
the base image changes), run `make record-ossmc-tls-probes`.

## Releasing OpenShift Service Mesh Console

To build and release the plugin, you can run this command either manually or inside a CI workflow.

```sh
make -e CONTAINER_VERSION=v0.1.0 build-plugin-image push-plugin-image
```

Or for a multi-arch container:

```sh
make -e CONTAINER_VERSION=v0.1.0 build-push-plugin-multi-arch
```

If you want to release a "latest" image, set `CONTAINER_VERSION` to "latest".

Once complete, the image will be pushed to quay.io in this repository: https://quay.io/repository/kiali/ossmconsole?tab=tags

## AI-Assisted Development Tooling

The [kiali/ai-tools](https://github.com/kiali/ai-tools) repository contains shared Cursor rules and AI configuration used across Kiali repositories. To use them, clone the repo alongside the other Kiali repositories and create a symlink:

```sh
cd $OSSMC_SOURCES
git clone https://github.com/kiali/ai-tools.git
ln -s $OSSMC_SOURCES/ai-tools/cursor/.cursor/rules openshift-servicemesh-plugin/.cursor/rules
```

This makes the shared Cursor rules (`.mdc` files) available in the OSSMC workspace. The symlink is gitignored — each developer sets it up locally.

### Code Reviewer Plugin

The project includes configuration for an AI-powered code review pipeline under `.cursor/code-reviewer/` and `.claude/code-reviewer/`. The pipeline runs three parallel review phases — adversarial (bugs, security, architecture), style (convention enforcement against the project's style guide), and testing (coverage gaps, test quality) — then consolidates findings into a single report with structured IDs and a verdict.

For Cursor users, the review pipeline is activated by typing `/code-reviewer:review` once the `ai-tools` symlink above is in place.

For Claude Code users, the code-reviewer plugin must be installed separately from [openshift-service-mesh/ci-utils](https://github.com/openshift-service-mesh/ci-utils/tree/main/plugins/code-reviewer). Once installed, run `/code-reviewer:review` to review your branch changes.
