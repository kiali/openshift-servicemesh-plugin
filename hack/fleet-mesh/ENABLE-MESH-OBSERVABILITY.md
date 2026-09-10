# Enable Mesh Observability

Post-configure an **existing** OpenShift/Istio environment so **one mesh** collects, stores, and (optionally) visualizes metrics in Kiali/OSSMC.

Script: [`enable-mesh-observability.sh`](enable-mesh-observability.sh)

This automates the metrics portions of the [ossm-multicluster tutorial](https://kiali.io/docs/tutorials/ossm-multicluster/) for arbitrary control plane namespaces. It does **not** install Istio, Kiali, ACM, or the multicluster-mesh-addon.

## Purpose

| Phase | What it configures |
|-------|-------------------|
| A | Hub ACM Observatorium (MCO + MinIO) — `hub` backend only |
| B | User Workload Monitoring (UWM) on the target cluster |
| C | Istio metrics scraping (ServiceMonitor/PodMonitor) |
| D | ACM MCOA edge recording rules and `/federate` configuration — `hub` backend only |
| E | Kiali CR `external_services.prometheus` — **only when `--kiali-cr-namespace` is set** |

**Kiali is optional.** Omit `--kiali-cr-namespace` to configure metrics collection and storage only (e.g. unsecure meshes, discovered meshes without Kiali). Re-run later with `--kiali-cr-namespace` to add visualization.

## Prerequisites

- An OpenShift release supported by the installed ACM version
- An Istio control plane (Istio CR) in `--istio-namespace`
- `oc`, `jq`, and `openssl` on your PATH
- Cluster-admin on the target cluster (and hub, for `hub` backend)

**Hub backend (`--metrics-backend hub`):**

- ACM hub with the target cluster imported as a `ManagedCluster`
- ACM multicluster observability with MCOA support; MCOA supplies its own
  managed-cluster metrics component and does not require the full Cluster
  Observability Operator
- A Kiali source checkout containing `hack/configure-acm-mcoa.sh`. The default
  helper path assumes a sibling `kiali` checkout; otherwise pass an explicit
  `--mcoa-helper` path
- ~30GB disk on the hub for Thanos storage (if MCO is not already installed)

**Kiali visualization (`--kiali-cr-namespace`):**

- Kiali operator and Kiali CR already installed (`setup-demo-multicluster.sh` stores the CR in `kiali-operator`; the deployment runs in `secure-ns`)

## Quick start

The names below are examples only. Set independent values for your kubeconfig
contexts and ACM managed-cluster name; they do not need to match:

```bash
HUB_CONTEXT="<hub-kubecontext>"
SPOKE_CONTEXT="<spoke-kubecontext>"
SPOKE_NAME="<acm-managed-cluster-name>"
```

### Fleet-mesh demo topology

After [`setup-demo-multicluster.sh install`](setup-demo-multicluster.sh), the demo has:

| CP namespace | Mesh type | Clusters | Shared `meshID` | Metrics backend |
|--------------|-----------|----------|-----------------|-----------------|
| `secure-ns` | MCM `secure-mcm` | hub (`local-cluster`) + spoke (`${SPOKE_NAME}`) | `secure-mcm-ns-secure-mcm` | **hub** Observatorium |
| `unsecure-ns` | MCM `unsecure-mcm` | hub + spoke | `unsecure-mcm-ns-unsecure-mcm` | **hub** Observatorium |
| `discovered-hub-ns` | Standalone (no MCM) | hub only | `discovered-hub-id` | **local** UWM |
| `discovered-spoke-ns` | Standalone (no MCM) | spoke only | `discovered-spoke-id` | **local** UWM |

**Hub aggregated metrics for an MCM mesh:** MCOA federates selected metrics from each cluster's UWM and remote-writes them to hub Thanos. You must run this script **once per cluster** that runs that mesh's control plane (hub and spoke), all with `--metrics-backend hub` and the same `--istio-namespace`. The first `hub` install also creates hub MCO/Observatorium (phase A). After you run install with `--kiali-cr-namespace` on a cluster that has a Kiali CR, that Kiali queries the hub Observatorium endpoint and can see metrics from every selected cluster.

**Discovered meshes** are single cluster meshes in the demo setup. In cases like this, use `--metrics-backend local` on the cluster where the mesh control plane lives.

**Application workloads:** Use `--app-namespaces` on **each** cluster where mesh-hello runs. The default demo deploys `secure-mcm-testapp` on **both** hub and spoke, so pass `--app-namespaces secure-mcm-testapp` on hub and spoke installs.

### 1. MCM `secure-mcm` — hub + spoke → hub Observatorium (with Kiali on spoke)

Requires a Kiali CR on the spoke (`kiali` in `kiali-operator`; deployment in `secure-ns` — the default [`setup-demo-multicluster.sh install`](setup-demo-multicluster.sh) uses `--install-kiali spoke`). The demo script runs these steps automatically when `--install-mesh-hello true` (default). To run manually (e.g. after `--install-mesh-hello false`):

```bash
# Hub side (local-cluster): scrape istiod + mesh-hello; install MCO if needed
./hack/fleet-mesh/enable-mesh-observability.sh install \
  --hub-context "${HUB_CONTEXT}" \
  --cluster-context "${HUB_CONTEXT}" \
  --istio-namespace secure-ns \
  --metrics-backend hub \
  --app-namespaces secure-mcm-testapp \
  --managed-cluster-name local-cluster

# Spoke side: scrape istiod + mesh-hello; point Kiali at hub Observatorium
./hack/fleet-mesh/enable-mesh-observability.sh install \
  --hub-context "${HUB_CONTEXT}" \
  --cluster-context "${SPOKE_CONTEXT}" \
  --istio-namespace secure-ns \
  --kiali-cr-namespace kiali-operator \
  --metrics-backend hub \
  --app-namespaces secure-mcm-testapp \
  --managed-cluster-name "${SPOKE_NAME}"
```

Kiali on the spoke reads hub Thanos via Observatorium, so graphs can include metrics from **both** clusters once traffic exists and ACM has forwarded samples (~5–10 minutes).

### 2. MCM `unsecure-mcm` — hub + spoke → hub Observatorium (metrics only, no Kiali)

Same pattern: run on **each** cluster. No Kiali is installed for `unsecure-ns` in the default demo (omit `--kiali-cr-namespace`). Add `--app-namespaces` only if you deploy workloads there.

```bash
./hack/fleet-mesh/enable-mesh-observability.sh install \
  --hub-context "${HUB_CONTEXT}" \
  --cluster-context "${HUB_CONTEXT}" \
  --istio-namespace unsecure-ns \
  --metrics-backend hub \
  --managed-cluster-name local-cluster

./hack/fleet-mesh/enable-mesh-observability.sh install \
  --hub-context "${HUB_CONTEXT}" \
  --cluster-context "${SPOKE_CONTEXT}" \
  --istio-namespace unsecure-ns \
  --metrics-backend hub \
  --managed-cluster-name "${SPOKE_NAME}"
```

### 3. Discovered mesh on spoke — local UWM only (not hub)

`discovered-spoke-ns` is a standalone Istio CR on the spoke, **not** part of an MCM. Metrics stay in that cluster's UWM; do not use `--hub-context` or `hub` backend.

```bash
./hack/fleet-mesh/enable-mesh-observability.sh install \
  --cluster-context "${SPOKE_CONTEXT}" \
  --istio-namespace discovered-spoke-ns \
  --metrics-backend local
```

### 4. Discovered mesh on hub — local UWM only (optional)

```bash
./hack/fleet-mesh/enable-mesh-observability.sh install \
  --cluster-context "${HUB_CONTEXT}" \
  --istio-namespace discovered-hub-ns \
  --metrics-backend local
```

### Add Kiali later (discovered spoke example)

Install Kiali, then re-run with `--kiali-cr-namespace` (namespace of the Kiali CR, not the deployment) and **`local`** backend:

```bash
./hack/fleet-mesh/enable-mesh-observability.sh install \
  --cluster-context "${SPOKE_CONTEXT}" \
  --istio-namespace discovered-spoke-ns \
  --kiali-cr-namespace kiali-operator \
  --metrics-backend local
```

## Usage

```bash
./hack/fleet-mesh/enable-mesh-observability.sh install [OPTIONS]
./hack/fleet-mesh/enable-mesh-observability.sh uninstall [OPTIONS]
./hack/fleet-mesh/enable-mesh-observability.sh verify [OPTIONS]
```

Run `./hack/fleet-mesh/enable-mesh-observability.sh --help` for the full flag list.

### Required flags

| Flag | Description |
|------|-------------|
| `--cluster-context` | Cluster where the Istio control plane lives |
| `--istio-namespace` | Istio control plane namespace |
| `--metrics-backend` | `hub` (ACM Thanos) or `local` (UWM only) |
| `--hub-context` | Required when `--metrics-backend hub` |

### Optional — Kiali

| Flag | Default | Description |
|------|---------|-------------|
| `--kiali-cr-namespace` | *(omit)* | Namespace of the Kiali CR to patch; omit for metrics-only |
| `--kiali-name` | `kiali` | Kiali CR name |

### Other useful flags

| Flag | Description |
|------|-------------|
| `--app-namespaces` | Comma-separated workload namespaces for sidecar or waypoint PodMonitors, MCOA recording rules, and platform CPU/memory federation; waypoint namespaces must be listed explicitly |
| `--mesh-id` | PodMonitor `mesh_id` label (auto-detected from Istio CR if omitted) |
| `--ambient` | Also scrape ztunnel and include its namespace in MCOA; pass `--ztunnel-namespace` when it is not the default `ztunnel` |
| `--managed-cluster-name` | ACM ManagedCluster name (default: `--cluster-context` value) |
| `--collection-mode` | `mcoa` or `legacy` |
| `--mcoa-helper` | Path to Kiali's `hack/configure-acm-mcoa.sh` |
| `--mcoa-placement-name` | Select the MCOA placement; required when more than one exists |
| `--mcoa-placement-namespace` | Namespace of the selected MCOA placement |
| `--configure-mcoa` | `auto` configures only on the hub invocation; use `always` or `never` to override |
| `--mcoa-with-dashboards` | Also federate the optional Istio dashboard metric tier |
| `--remove-mcoa-federation` | On uninstall, remove this invocation's MCOA namespace set |
| `--install-hub-observability` | `auto` \| `always` \| `never` — install MCO if missing |
| `--skip-uwm` | Assume UWM already enabled |
| `--observability-namespace` | `open-cluster-management-observability` — hub namespace for ACM observability resources |
| `--retention-period` | `365d` — Kiali `thanos_proxy.retention_period` and, when this script creates the MCO, its retention; must match the actual MCO retention configuration |
| `--scrape-interval` | `5m` — Kiali `thanos_proxy.scrape_interval`; must match the effective MCOA federation interval |
| `--wait-for-metrics` | Block until `istio_*` metrics appear (10+ min possible) |
| `--dry-run` | Print actions without applying |
| `--remove-hub-observability` | On uninstall, also remove hub MCO/MinIO (lab only) |
| `--restore-kiali-prometheus` | `true` \| `false` on uninstall (default: `true`) |

## Backend comparison

| | `hub` | `local` |
|---|-------|---------|
| **Storage** | UWM on cluster → MCOA Prometheus Agent → hub Thanos | UWM Prometheus only |
| **Kiali queries** | Hub Observatorium API (mTLS + `thanos_proxy`) | In-cluster UWM URL |
| **Requires** | ACM hub + managed cluster | Target cluster only |
| **Use when** | MCM meshes spanning ACM managed clusters (run per cluster) | Standalone / discovered CP on one cluster |

### ACM MCOA metrics flow

The default `--collection-mode mcoa` uses UWM as the edge Prometheus. The
script asks Kiali's `configure-acm-mcoa.sh` helper to create hub-side source
resources. With one placement it is selected automatically; with multiple
placements you must use `--mcoa-placement-name` and, when needed,
`--mcoa-placement-namespace`. By default (`--configure-mcoa auto`) only the
invocation whose cluster context equals the hub context performs this hub-side
step. This avoids repeating it from every spoke invocation.

When it creates or reuses the hub `MultiClusterObservability` resource, the
script enables its platform and user-workload metrics capabilities required by
MCOA. The default retention is `365d`, which matches ACM's retention default;
override `--retention-period` only when the actual MCO retention differs.

ACM propagates one recording rule into every target namespace: the Istio
control-plane namespace, each `--app-namespaces` entry, and the optional
`--ztunnel-namespace`. The propagated rules carry the OpenShift
`leaf-prometheus` label so UWM evaluates them.

Every target namespace must exist on every managed cluster selected by the MCOA
placement. If the mesh uses different namespace layouts across clusters, use
separate placements and source resource sets rather than applying one target
list to all clusters.

The edge rules aggregate raw per-proxy `istio_*` series as
`workload:istio_*`. The MCOA user-workload collector then scrapes UWM's
`/federate` endpoint, selects the Kiali core metric tier, changes
`workload:istio_*` back to `istio_*`, and remote-writes the result to hub
Observatorium/Thanos. Namespace-specific platform federation jobs collect the
container CPU and memory series used by Kiali's control-plane overview. Their
stable per-namespace names allow separate mesh setup runs to coexist. Kiali
always queries the hub backend.

Kubeconfig context names are local aliases. `--hub-context` and
`--cluster-context` never need to equal `--managed-cluster-name`; MCOA targets
clusters through its configured placements.

Use `--collection-mode legacy` only to exercise the older ACM collector and
ConfigMap allowlist path.

## What gets created

Resources are labeled `app.kubernetes.io/managed-by: enable-mesh-observability`.

Prometheus auth secrets and ServiceAccounts are created in the Kiali **deployment** namespace (`spec.deployment.namespace` on the CR, e.g. `secure-ns` in the fleet-mesh demo).

| Resource | Namespace | When |
|----------|-----------|------|
| MinIO and MCO | `open-cluster-management-observability` | `hub` backend, MCO not Ready |
| MCOA `ScrapeConfig` and source `PrometheusRule` objects | `open-cluster-management-observability` | `hub` backend with default `mcoa` mode |
| Propagated recording rules | Every MCOA target namespace (`--istio-namespace`, `--app-namespaces`, and optional `--ztunnel-namespace`) | Selected managed clusters |
| `cluster-monitoring-config` patch | `openshift-monitoring` | UWM enablement |
| `ServiceMonitor/istiod-monitor` | `--istio-namespace` | Always |
| `PodMonitor/istio-proxies-monitor-<ns>` | each `--app-namespaces` entry | When specified |
| `PodMonitor/ztunnel-monitor` | `--ztunnel-namespace` | `--ambient` |
| Legacy `ConfigMap/observability-metrics-custom-allowlist` | scraped namespaces | Only with `--collection-mode legacy` |
| `Secret/acm-observability-certs`, `ConfigMap/kiali-cabundle` | Kiali deployment namespace | Kiali + `hub` backend |
| `Secret/prometheus-user-workload-token` | Kiali deployment namespace | Kiali + `local` backend |
| Kiali CR patch (`external_services.prometheus`) | `--kiali-cr-namespace` | When `--kiali-cr-namespace` set |

## Idempotency

**`install`** and **`uninstall`** are safe to run repeatedly with the same flags.

- Second `install`: logs `[ok] … already configured` and exits 0
- Second `uninstall` on a clean cluster: logs `[ok] … not found, skipping` and exits 0
- `install` → `uninstall` → `install` restores cluster-local configuration;
  MCOA is retained unless `--remove-mcoa-federation` is supplied

### Uninstall removes

- Labeled ServiceMonitors, PodMonitors, and legacy namespace allowlists
- Kiali prometheus config (when `--kiali-cr-namespace` was used and `--restore-kiali-prometheus true`)
- Labeled Kiali cert/token secrets (in the Kiali deployment namespace)
- This invocation's MCOA scrape jobs and recording rules when
  `--remove-mcoa-federation` is supplied

### Uninstall does **not** remove (by default)

- Hub MCO, MinIO, and MCOA resources (shared infrastructure)
- UWM / `cluster-monitoring-config` (cluster-wide)

Use `--remove-hub-observability` on uninstall for lab teardown of hub MCO/MinIO.
Use `--remove-mcoa-federation` only when no other setup relies on the same
placement, rule namespace, and platform namespace set.

## Validation

For MCM meshes (`secure-ns`, `unsecure-ns`), validate **both** clusters after running install on hub and spoke.

```bash
# Hub cluster metrics path
./hack/fleet-mesh/enable-mesh-observability.sh verify \
  --cluster-context "${HUB_CONTEXT}" \
  --istio-namespace secure-ns \
  --metrics-backend hub \
  --hub-context "${HUB_CONTEXT}" \
  --managed-cluster-name local-cluster

# Spoke cluster + Kiali
./hack/fleet-mesh/enable-mesh-observability.sh verify \
  --cluster-context "${SPOKE_CONTEXT}" \
  --istio-namespace secure-ns \
  --kiali-cr-namespace kiali-operator \
  --metrics-backend hub \
  --hub-context "${HUB_CONTEXT}" \
  --managed-cluster-name "${SPOKE_NAME}" \
  --wait-for-metrics
```

**With Kiali/OSSMC:** open the mesh overview traffic graph after metrics warm-up (see [Generate traffic](#generate-traffic-for-kiali-graphs) below).

**Without Kiali:** query the backend directly:

```bash
# Hub Thanos (hub backend)
oc --context="${HUB_CONTEXT}" get --raw \
  "/api/v1/namespaces/open-cluster-management-observability/services/http:observability-thanos-query-frontend:9090/proxy/api/v1/label/__name__/values" \
  | jq -r '.data[]' | grep '^istio_'
```

### Generate traffic for Kiali graphs

Metrics pipelines scrape **request counters** (`istio_requests_total`, etc.). An idle app produces little or no graph data — you need active HTTP traffic through the mesh sidecars.

In the fleet-mesh demo, [mesh-hello](deploy-mesh-hello.sh) deploys into `secure-mcm-testapp` (when installed via [`setup-demo-multicluster.sh`](setup-demo-multicluster.sh)). Each cluster gets an OpenShift Route; the frontend page **auto-refreshes every 10 seconds** and calls the backend, which is enough to generate metrics if you leave a tab open.

Look up the Route URL on each cluster where the app runs:

```bash
oc --context="${HUB_CONTEXT}" get route mesh-hello-secure-mcm \
  -n secure-mcm-testapp -o jsonpath='http://{.spec.host}{"\n"}'

oc --context="${SPOKE_CONTEXT}" get route mesh-hello-secure-mcm \
  -n secure-mcm-testapp -o jsonpath='http://{.spec.host}{"\n"}'
```

Open the URL in a browser and leave it open for several minutes. Or generate traffic from the CLI:

```bash
# Replace URL with output from the command above
while true; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://mesh-hello-secure-mcm-secure-mcm-testapp.apps.example.com/
  sleep 2
done
```

For `secure-mcm`, generate traffic on **hub and spoke** if you installed mesh-hello on both. Then open Kiali, select namespace **`secure-mcm-testapp`**, and allow **5–10 minutes** for samples to reach hub Thanos (see [Timing](#timing) below).

## Timing

| Step | Typical latency |
|------|-----------------|
| UWM scrape | 30 seconds |
| MCOA federation and remote write | ~5 minutes |
| Kiali/OSSMC graphs | 5–10 minutes after new traffic |
| `--wait-for-metrics` | Up to `--timeout` (default 1200s) |

See [Generate traffic for Kiali graphs](#generate-traffic-for-kiali-graphs) above before expecting graphs to populate.

## Troubleshooting

### No metrics in Kiali graph

1. Confirm monitors exist on **each** cluster in the mesh:

   ```bash
   oc --context="${HUB_CONTEXT}" get servicemonitor -n secure-ns
   oc --context="${HUB_CONTEXT}" get podmonitor -n secure-mcm-testapp
   oc --context="${SPOKE_CONTEXT}" get servicemonitor -n secure-ns
   oc --context="${SPOKE_CONTEXT}" get podmonitor -n secure-mcm-testapp
   ```

   (`secure-mcm-testapp` runs on hub and spoke in the default demo; each cluster needs its own PodMonitor from `--app-namespaces`.)

2. Confirm UWM is running on **each** cluster:

   ```bash
   oc --context="${HUB_CONTEXT}" get pods -n openshift-user-workload-monitoring
   oc --context="${SPOKE_CONTEXT}" get pods -n openshift-user-workload-monitoring
   ```

3. For the `hub` backend, confirm the MCOA agents on **each** managed cluster:

   ```bash
   oc --context="${HUB_CONTEXT}" get pods -n open-cluster-management-agent-addon
   oc --context="${SPOKE_CONTEXT}" get pods -n open-cluster-management-agent-addon
   ```

4. Wait at least 10 minutes after traffic starts (ACM collection interval is ~5m).

5. Kiali graphs use `rate(...[5m])`. Hub Thanos may show raw `istio_requests_total` while `rate()` is still empty until ACM forwards **two** counter changes within the window. Verify both:

   ```bash
   # Raw counters (should be > 0 after traffic)
   oc --context="${HUB_CONTEXT}" get --raw \
     "/api/v1/namespaces/open-cluster-management-observability/services/http:observability-thanos-query-frontend:9090/proxy/api/v1/query?query=sum(istio_requests_total%7Bnamespace%3D%22secure-mcm-testapp%22%7D)" \
     | jq '.data.result[0].value[1]'

   # Rate window Kiali uses (may be empty for several ACM cycles)
   oc --context="${HUB_CONTEXT}" get --raw \
     "/api/v1/namespaces/open-cluster-management-observability/services/http:observability-thanos-query-frontend:9090/proxy/api/v1/query?query=sum(rate(istio_requests_total%7Bnamespace%3D%22secure-mcm-testapp%22%7D%5B5m%5D))" \
     | jq '.data.result'
   ```

   Keep mesh-hello traffic running (browser tab or `while true; do curl -s -o /dev/null "http://<route>/"; sleep 2; done`) until the rate query returns a non-empty result.

6. Confirm Kiali CR has `external_services.prometheus.url`:

   ```bash
   oc --context="${SPOKE_CONTEXT}" get kiali kiali -n kiali-operator \
     -o jsonpath='{.spec.external_services.prometheus}' | jq .
   ```

### Hub backend fails preflight

- Verify the cluster is imported as a `ManagedCluster` on the hub: `oc --context="${HUB_CONTEXT}" get managedcluster "${SPOKE_NAME}"`.
- Use `--managed-cluster-name` when the ACM name differs from the kubeconfig context name. Hub self-registration is always `local-cluster`.

### MCO install fails on small clusters

- Pre-install MCO manually or use a larger hub cluster
- Pass `--install-hub-observability never` to require existing MCO

### ServiceMonitor in non-`istio-system` namespace

This script places the istiod ServiceMonitor in `--istio-namespace` (e.g. `secure-ns` for fleet-mesh). That is intentional — fleet-mesh does not use `istio-system`.

## Relation to ossm-multicluster tutorial

| Tutorial guide | This script |
|----------------|-------------|
| Phase 1 — Hub MCO | Phase A (`--metrics-backend hub`) |
| Phase 3.1 — UWM | Phase B |
| Phase 3 — ServiceMonitor/PodMonitor | Phase C |
| ACM MCOA federation | Phase D (`--collection-mode mcoa`) |
| Phase 4 — Kiali prometheus | Phase E (`--kiali-cr-namespace`) |

See also: [ossm-acm-hub-spoke](https://kiali.io/docs/tutorials/ossm-multicluster/ossm-acm-hub-spoke/) for background architecture.
