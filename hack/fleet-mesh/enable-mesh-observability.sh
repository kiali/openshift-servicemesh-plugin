#!/usr/bin/env bash
#
# enable-mesh-observability.sh — Enable metrics collection and storage for one Istio mesh.
#
# WHY THIS EXISTS
#   Fleet-mesh and ACM multicluster demos install Istio (and optionally Kiali) but do not
#   wire up the metrics pipeline Kiali/OSSMC need for traffic graphs. The ossm-multicluster
#   tutorial covers that setup manually across several phases. This script automates those
#   steps for a single mesh in an *already running* environment — without modifying demo
#   install scripts or requiring a particular directory layout.
#
# WHAT IT DOES (per mesh, per cluster)
#   Phase A — Hub Observatorium (hub backend only): MinIO, MCO, hub metrics allowlist
#   Phase B — User Workload Monitoring on the target cluster
#   Phase C — Istio scraping: istiod ServiceMonitor, optional workload PodMonitors, allowlists
#   Phase D — Optional Kiali CR patch for external_services.prometheus (--kiali-cr-namespace)
#
#   MCM meshes spanning hub and spoke: run install once on *each* cluster that runs the
#   mesh control plane, with --metrics-backend hub and the same --istio-namespace. Kiali
#   (if used) typically lives on one cluster and queries hub Thanos via Observatorium.
#   Standalone / discovered meshes on one cluster: use --metrics-backend local only.
#
# WHAT IT DOES NOT INSTALL
#   Istio, Sail operator, Kiali operator, ACM, multicluster-mesh-addon, or sample apps.
#   Those must already exist. Omit --kiali-cr-namespace for metrics-only (no Kiali patch).
#
# SAFETY / IDEMPOTENCY
#   install, uninstall, and verify are idempotent with the same flags. Created resources
#   are labeled app.kubernetes.io/managed-by=enable-mesh-observability; uninstall removes
#   only labeled monitors, allowlists, and Kiali prometheus secrets/config it added.
#   Hub MCO/MinIO are left in place by default; pass --remove-hub-observability on
#   uninstall for lab teardown.
#
# DOCUMENTATION
#   See ENABLE-MESH-OBSERVABILITY.md in this directory for fleet-mesh quick starts,
#   flag reference, and troubleshooting.
#
# Usage:
#   hack/fleet-mesh/enable-mesh-observability.sh install [OPTIONS]
#   hack/fleet-mesh/enable-mesh-observability.sh uninstall [OPTIONS]
#   hack/fleet-mesh/enable-mesh-observability.sh verify [OPTIONS]
#
#   hack/fleet-mesh/enable-mesh-observability.sh --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MANAGED_BY="enable-mesh-observability"
PART_OF="mesh-observability"

CLUSTER_CTX=""
HUB_CTX=""
ISTIO_NAMESPACE=""
KIALI_CR_NAMESPACE=""
KIALI_DEPLOYMENT_NAMESPACE=""
KIALI_NAME="kiali"
METRICS_BACKEND=""
MESH_ID=""
APP_NAMESPACES=""
AMBIENT=false
ZTUNNEL_NAMESPACE="ztunnel"
MANAGED_CLUSTER_NAME=""
INSTALL_HUB_OBS="auto"
SKIP_UWM=false
OBS_NS="open-cluster-management-observability"
RETENTION_PERIOD="14d"
SCRAPE_INTERVAL="5m"
WAIT_FOR_METRICS=false
TIMEOUT=1200
DRY_RUN=false
RESTORE_KIALI_PROM=true
REMOVE_HUB_OBS=false

MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-minio}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-minio123}"

COMMAND=""
TMP_DIR=""
OBSERVATORIUM_URL=""

info()  { echo "[INFO]  $(date '+%H:%M:%S') $*" >&2; }
warn()  { echo "[WARN]  $(date '+%H:%M:%S') $*" >&2; }
error() { echo "[ERROR] $(date '+%H:%M:%S') $*" >&2; exit 1; }
die()   { error "$*"; }

oc_cluster() { command oc --context="${CLUSTER_CTX}" "$@"; }
oc_hub()     { command oc --context="${HUB_CTX}" "$@"; }

wait_for() {
  local desc="$1"
  shift
  local timeout="$1"
  shift
  local interval=15
  local elapsed=0

  info "Waiting for: ${desc} (timeout: ${timeout}s)"
  while true; do
    if eval "$@" &>/dev/null; then
      info "[ok] ${desc}"
      return 0
    fi
    elapsed=$((elapsed + interval))
    if [ "${elapsed}" -ge "${timeout}" ]; then
      die "TIMEOUT after ${timeout}s waiting for: ${desc}"
    fi
    echo "  ...still waiting (${elapsed}s elapsed)"
    sleep "${interval}"
  done
}

run_or_dry() {
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] $*"
    return 0
  fi
  "$@"
}

usage() {
  cat <<'USAGE'
Enable metrics collection and storage for one Istio mesh (optional Kiali visualization).

Usage:
  enable-mesh-observability.sh install|uninstall|verify [OPTIONS]

Required:
  --cluster-context CTX       Cluster where the Istio control plane lives
  --istio-namespace NS        Istio control plane namespace
  --metrics-backend MODE      hub (ACM Thanos) or local (UWM only)

Required when --metrics-backend hub:
  --hub-context CTX           ACM hub cluster context

Optional — Kiali (phase D; omit for metrics-only):
  --kiali-cr-namespace NS     Namespace of the Kiali CR to patch
  --kiali-name NAME           Kiali CR name (default: kiali)

Other options:
  --mesh-id ID                mesh_id PodMonitor label (auto-detect from Istio CR if omitted)
  --app-namespaces LIST       Comma-separated workload namespaces for PodMonitors
  --ambient                   Create ztunnel PodMonitor in --ztunnel-namespace
  --ztunnel-namespace NS      ZTunnel namespace (default: ztunnel)
  --managed-cluster-name NAME ACM ManagedCluster name (default: cluster context name)
  --install-hub-observability auto|always|never  Install MCO on hub if missing (default: auto)
  --skip-uwm                  Skip UWM enablement
  --observability-namespace NS Hub observability namespace (default: open-cluster-management-observability)
  --retention-period DUR      Kiali thanos_proxy retention (default: 14d)
  --scrape-interval DUR       Kiali thanos_proxy scrape interval (default: 5m)
  --wait-for-metrics          Block until istio_* metrics appear in backend
  --timeout SECS              Wait timeout (default: 1200)
  --dry-run                   Print actions without applying
  --restore-kiali-prometheus  true|false on uninstall (default: true)
  --remove-hub-observability  Also remove hub MCO/MinIO on uninstall (lab only)
  -h, --help                  Show this help

Examples:
  # MCM secure-mcm: hub (metrics scrape + mesh-hello workloads)
  enable-mesh-observability.sh install \
    --hub-context my-hub --cluster-context my-hub \
    --istio-namespace secure-ns --metrics-backend hub \
    --app-namespaces secure-mcm-testapp \
    --managed-cluster-name local-cluster

  # MCM secure-mcm: spoke (mesh-hello + Kiali queries hub Observatorium)
  enable-mesh-observability.sh install \
    --hub-context my-hub --cluster-context my-spoke \
    --istio-namespace secure-ns --kiali-cr-namespace kiali-operator \
    --metrics-backend hub --app-namespaces secure-mcm-testapp \
    --managed-cluster-name my-spoke

  # Discovered mesh on spoke (local UWM only)
  enable-mesh-observability.sh install \
    --cluster-context my-spoke \
    --istio-namespace discovered-spoke-ns \
    --metrics-backend local
USAGE
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "${1}" in
      install|uninstall|verify)
        COMMAND="${1}"
        shift
        ;;
      --cluster-context) CLUSTER_CTX="${2:?'--cluster-context requires a value'}"; shift 2 ;;
      --hub-context) HUB_CTX="${2:?'--hub-context requires a value'}"; shift 2 ;;
      --istio-namespace) ISTIO_NAMESPACE="${2:?'--istio-namespace requires a value'}"; shift 2 ;;
      --kiali-cr-namespace) KIALI_CR_NAMESPACE="${2:?'--kiali-cr-namespace requires a value'}"; shift 2 ;;
      --kiali-name) KIALI_NAME="${2:?'--kiali-name requires a value'}"; shift 2 ;;
      --metrics-backend) METRICS_BACKEND="${2:?'--metrics-backend requires a value'}"; shift 2 ;;
      --mesh-id) MESH_ID="${2:?'--mesh-id requires a value'}"; shift 2 ;;
      --app-namespaces) APP_NAMESPACES="${2:?'--app-namespaces requires a value'}"; shift 2 ;;
      --ambient) AMBIENT=true; shift ;;
      --ztunnel-namespace) ZTUNNEL_NAMESPACE="${2:?'--ztunnel-namespace requires a value'}"; shift 2 ;;
      --managed-cluster-name) MANAGED_CLUSTER_NAME="${2:?'--managed-cluster-name requires a value'}"; shift 2 ;;
      --install-hub-observability) INSTALL_HUB_OBS="${2:?'--install-hub-observability requires a value'}"; shift 2 ;;
      --skip-uwm) SKIP_UWM=true; shift ;;
      --observability-namespace) OBS_NS="${2:?'--observability-namespace requires a value'}"; shift 2 ;;
      --retention-period) RETENTION_PERIOD="${2:?'--retention-period requires a value'}"; shift 2 ;;
      --scrape-interval) SCRAPE_INTERVAL="${2:?'--scrape-interval requires a value'}"; shift 2 ;;
      --wait-for-metrics) WAIT_FOR_METRICS=true; shift ;;
      --timeout) TIMEOUT="${2:?'--timeout requires a value'}"; shift 2 ;;
      --dry-run) DRY_RUN=true; shift ;;
      --restore-kiali-prometheus)
        case "${2:-}" in
          true|false) RESTORE_KIALI_PROM="${2}"; shift 2 ;;
          *) RESTORE_KIALI_PROM=true; shift ;;
        esac
        ;;
      --remove-hub-observability) REMOVE_HUB_OBS=true; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: ${1}. Run with --help for usage." ;;
    esac
  done

  [ -n "${COMMAND}" ] || die "Missing command: install, uninstall, or verify"
  [ -n "${CLUSTER_CTX}" ] || die "Missing required option: --cluster-context"
  [ -n "${ISTIO_NAMESPACE}" ] || die "Missing required option: --istio-namespace"
  [ -n "${METRICS_BACKEND}" ] || die "Missing required option: --metrics-backend"

  case "${METRICS_BACKEND}" in
    hub|local) ;;
    *) die "--metrics-backend must be hub or local, got: ${METRICS_BACKEND}" ;;
  esac

  if [ "${METRICS_BACKEND}" = hub ]; then
    [ -n "${HUB_CTX}" ] || die "--hub-context is required when --metrics-backend hub"
  fi

  case "${INSTALL_HUB_OBS}" in
    auto|always|never) ;;
    *) die "--install-hub-observability must be auto, always, or never" ;;
  esac

  if [ -z "${MANAGED_CLUSTER_NAME}" ]; then
    MANAGED_CLUSTER_NAME="${CLUSTER_CTX}"
  fi
}

label_block() {
  cat <<EOF
    app.kubernetes.io/managed-by: ${MANAGED_BY}
    app.kubernetes.io/part-of: ${PART_OF}
EOF
}

verify_tools() {
  for tool in oc jq openssl; do
    command -v "${tool}" >/dev/null 2>&1 || die "Required tool not found: ${tool}"
  done
}

verify_context() {
  local ctx=$1
  local label=$2
  command oc --context="${ctx}" whoami >/dev/null 2>&1 \
    || die "Cannot reach ${label} context '${ctx}'. Run oc login."
}

mco_is_ready() {
  [ "$(oc_hub get mco observability -n "${OBS_NS}" \
    -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)" = "True" ]
}

detect_mesh_id() {
  if [ -n "${MESH_ID}" ]; then
    return 0
  fi
  # Sail/Istio CRs are cluster-scoped; filter by spec.namespace (control plane namespace).
  MESH_ID=$(oc_cluster get istio -n "${ISTIO_NAMESPACE}" -o json 2>/dev/null | \
    jq -r --arg ns "${ISTIO_NAMESPACE}" \
    '.items[] | select(.spec.namespace == $ns) | .spec.values.global.meshID' | head -1)
  if [ -z "${MESH_ID}" ]; then
    warn "Could not auto-detect meshID from Istio CR; PodMonitors will omit mesh_id label"
  else
    info "Auto-detected meshID: ${MESH_ID}"
  fi
}

validate_kiali_cr() {
  if [ -z "${KIALI_CR_NAMESPACE}" ]; then
    KIALI_DEPLOYMENT_NAMESPACE=""
    return 0
  fi

  if ! oc_cluster get kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" >/dev/null 2>&1; then
    if [ "${COMMAND}" = uninstall ]; then
      warn "Kiali CR '${KIALI_NAME}' not found in '${KIALI_CR_NAMESPACE}'; skipping Kiali restore"
      KIALI_DEPLOYMENT_NAMESPACE=""
      return 0
    fi
    die "Kiali CR '${KIALI_NAME}' not found in namespace '${KIALI_CR_NAMESPACE}'. Install Kiali first or omit --kiali-cr-namespace for metrics-only."
  fi

  KIALI_DEPLOYMENT_NAMESPACE=$(oc_cluster get kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" \
    -o jsonpath='{.spec.deployment.namespace}' 2>/dev/null || true)
  if [ -z "${KIALI_DEPLOYMENT_NAMESPACE}" ]; then
    KIALI_DEPLOYMENT_NAMESPACE="${KIALI_CR_NAMESPACE}"
    warn "Kiali CR has no spec.deployment.namespace; using CR namespace ${KIALI_CR_NAMESPACE} for secrets"
  else
    info "Kiali deployment namespace: ${KIALI_DEPLOYMENT_NAMESPACE} (CR in ${KIALI_CR_NAMESPACE})"
  fi
}

preflight() {
  info "=== Preflight checks ==="
  verify_tools
  verify_context "${CLUSTER_CTX}" cluster
  if [ "${METRICS_BACKEND}" = hub ]; then
    verify_context "${HUB_CTX}" hub
    oc_hub get managedcluster "${MANAGED_CLUSTER_NAME}" >/dev/null 2>&1 \
      || die "ManagedCluster '${MANAGED_CLUSTER_NAME}' not found on hub. Hub backend requires ACM import."
  fi

  local istio_count
  istio_count=$(oc_cluster get istio -n "${ISTIO_NAMESPACE}" --no-headers 2>/dev/null | wc -l)
  [ "${istio_count}" -ge 1 ] || die "No Istio CR found in namespace '${ISTIO_NAMESPACE}'"

  validate_kiali_cr

  detect_mesh_id

  if [ "${METRICS_BACKEND}" = hub ] && [ "${COMMAND}" != uninstall ]; then
    warn "Hub observability (MCO/Thanos) requires substantial disk (~30GB). Ensure the hub cluster has capacity."
  fi
}

# ---------------------------------------------------------------------------
# Phase A — Hub Observatorium
# ---------------------------------------------------------------------------

apply_hub_allowlist() {
  local existing
  existing=$(oc_hub get configmap observability-metrics-custom-allowlist -n "${OBS_NS}" \
    -o jsonpath='{.data.uwl_metrics_list\.yaml}' 2>/dev/null || true)
  if echo "${existing}" | grep -q "istio_requests_total"; then
    info "[ok] Hub metrics allowlist already configured"
    return 0
  fi

  info "Creating hub Istio metrics allowlist in ${OBS_NS}"
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would create hub metrics allowlist ConfigMap"
    return 0
  fi

  oc_hub apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: observability-metrics-custom-allowlist
  namespace: ${OBS_NS}
data:
  uwl_metrics_list.yaml: |
    names:
    - istio_requests_total
    - istio_request_bytes_bucket
    - istio_request_bytes_count
    - istio_request_bytes_sum
    - istio_request_duration_milliseconds_bucket
    - istio_request_duration_milliseconds_count
    - istio_request_duration_milliseconds_sum
    - istio_request_messages_total
    - istio_response_bytes_bucket
    - istio_response_bytes_count
    - istio_response_bytes_sum
    - istio_response_messages_total
    - istio_tcp_connections_closed_total
    - istio_tcp_connections_opened_total
    - istio_tcp_received_bytes_total
    - istio_tcp_sent_bytes_total
    - workload_manager_active_proxy_count
    - istio_build
    - pilot_proxy_convergence_time_sum
    - pilot_proxy_convergence_time_count
    - pilot_services
    - pilot_xds
    - pilot_xds_pushes
    - envoy_cluster_upstream_cx_active
    - envoy_cluster_upstream_rq_total
    - envoy_listener_downstream_cx_active
    - envoy_listener_http_downstream_rq
    - envoy_server_memory_allocated
    - envoy_server_memory_heap_size
    - envoy_server_uptime
    - container_cpu_usage_seconds_total
    - container_memory_working_set_bytes
    - process_cpu_seconds_total
    - process_resident_memory_bytes
EOF
}

install_hub_observability() {
  if mco_is_ready; then
    info "[ok] Hub observability (MCO) already Ready"
    apply_hub_allowlist
    return 0
  fi

  case "${INSTALL_HUB_OBS}" in
    never)
      die "MultiClusterObservability not Ready and --install-hub-observability never. Install MCO on hub first."
      ;;
    auto|always)
      info "=== Installing hub observability (MinIO + MCO) ==="
      ;;
  esac

  run_or_dry oc_hub create namespace "${OBS_NS}" --dry-run=client -o yaml | run_or_dry oc_hub apply -f -

  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would install MinIO, thanos-object-storage, MCO, and hub allowlist"
    return 0
  fi

  if ! oc_hub get deployment minio -n "${OBS_NS}" >/dev/null 2>&1; then
    oc_hub apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: minio
  namespace: ${OBS_NS}
  labels:
$(label_block)
spec:
  replicas: 1
  selector:
    matchLabels:
      app: minio
  template:
    metadata:
      labels:
        app: minio
$(label_block)
    spec:
      containers:
      - name: minio
        image: quay.io/minio/minio:latest
        args:
        - server
        - /data
        - --console-address
        - ":9001"
        env:
        - name: MINIO_ROOT_USER
          value: "${MINIO_ACCESS_KEY}"
        - name: MINIO_ROOT_PASSWORD
          value: "${MINIO_SECRET_KEY}"
        ports:
        - containerPort: 9000
          name: api
        - containerPort: 9001
          name: console
        volumeMounts:
        - name: data
          mountPath: /data
        readinessProbe:
          httpGet:
            path: /minio/health/ready
            port: 9000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /minio/health/live
            port: 9000
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: minio
  namespace: ${OBS_NS}
spec:
  ports:
  - port: 9000
    name: api
    targetPort: 9000
  - port: 9001
    name: console
    targetPort: 9001
  selector:
    app: minio
EOF
    wait_for "MinIO ready" "${TIMEOUT}" \
      "oc_hub rollout status deployment/minio -n ${OBS_NS} --timeout=10s"
    local minio_pod
    minio_pod=$(oc_hub get pods -n "${OBS_NS}" -l app=minio -o jsonpath='{.items[0].metadata.name}')
    oc_hub exec -n "${OBS_NS}" "${minio_pod}" -- mkdir -p /data/thanos 2>/dev/null || true
  else
    info "[ok] MinIO deployment already exists"
  fi

  if ! oc_hub get secret thanos-object-storage -n "${OBS_NS}" >/dev/null 2>&1; then
    oc_hub apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: thanos-object-storage
  namespace: ${OBS_NS}
type: Opaque
stringData:
  thanos.yaml: |
    type: s3
    config:
      bucket: thanos
      endpoint: minio.${OBS_NS}.svc:9000
      insecure: true
      access_key: ${MINIO_ACCESS_KEY}
      secret_key: ${MINIO_SECRET_KEY}
EOF
  else
    info "[ok] thanos-object-storage secret already exists"
  fi

  if ! oc_hub get mco observability -n "${OBS_NS}" >/dev/null 2>&1; then
    oc_hub apply -f - <<EOF
apiVersion: observability.open-cluster-management.io/v1beta2
kind: MultiClusterObservability
metadata:
  name: observability
spec:
  observabilityAddonSpec: {}
  storageConfig:
    metricObjectStorage:
      name: thanos-object-storage
      key: thanos.yaml
    alertmanagerStorageSize: 1Gi
    compactStorageSize: 10Gi
    receiveStorageSize: 10Gi
    ruleStorageSize: 1Gi
    storeStorageSize: 10Gi
  advanced:
    retentionConfig:
      retentionResolution1h: ${RETENTION_PERIOD}
      retentionResolution5m: ${RETENTION_PERIOD}
      retentionResolutionRaw: ${RETENTION_PERIOD}
    alertmanager:
      replicas: 1
      resources:
        requests:
          cpu: 20m
          memory: 64Mi
    compact:
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
    grafana:
      replicas: 1
      resources:
        requests:
          cpu: 20m
          memory: 64Mi
    observatoriumAPI:
      replicas: 1
      resources:
        requests:
          cpu: 20m
          memory: 64Mi
    query:
      replicas: 1
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
    queryFrontend:
      replicas: 1
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
    queryFrontendMemcached:
      replicas: 1
      resources:
        requests:
          cpu: 20m
          memory: 64Mi
    rbacQueryProxy:
      replicas: 1
      resources:
        requests:
          cpu: 20m
          memory: 64Mi
    receive:
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
    rule:
      replicas: 1
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
    store:
      replicas: 1
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
    storeMemcached:
      replicas: 1
      resources:
        requests:
          cpu: 20m
          memory: 64Mi
EOF
  else
    info "[ok] MultiClusterObservability CR already exists"
  fi

  wait_for "MultiClusterObservability Ready" "${TIMEOUT}" "mco_is_ready"
  wait_for "observatorium-api route" "${TIMEOUT}" \
    "oc_hub get route observatorium-api -n ${OBS_NS} >/dev/null 2>&1"

  apply_hub_allowlist
}

phase_a_hub() {
  [ "${METRICS_BACKEND}" = hub ] || return 0
  install_hub_observability
}

# ---------------------------------------------------------------------------
# Phase B — UWM
# ---------------------------------------------------------------------------

uwm_is_ready() {
  oc_cluster get statefulset prometheus-user-workload \
    -n openshift-user-workload-monitoring >/dev/null 2>&1 && \
  oc_cluster wait pod -l app.kubernetes.io/name=prometheus \
    -n openshift-user-workload-monitoring --for=condition=Ready --timeout=10s >/dev/null 2>&1
}

enable_uwm() {
  if [ "${SKIP_UWM}" = true ]; then
    info "[skip] UWM enablement (--skip-uwm)"
    return 0
  fi

  if uwm_is_ready; then
    info "[ok] User Workload Monitoring already enabled and Ready"
    return 0
  fi

  info "=== Enabling User Workload Monitoring ==="

  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would enable UWM via cluster-monitoring-config"
    return 0
  fi

  if ! oc_cluster get configmap cluster-monitoring-config -n openshift-monitoring >/dev/null 2>&1; then
    oc_cluster apply -f - <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: cluster-monitoring-config
  namespace: openshift-monitoring
data:
  config.yaml: |
    enableUserWorkload: true
EOF
  else
    local existing
    existing=$(oc_cluster get configmap cluster-monitoring-config -n openshift-monitoring \
      -o jsonpath='{.data.config\.yaml}' 2>/dev/null || true)
    if echo "${existing}" | grep -q "enableUserWorkload: true"; then
      info "[ok] enableUserWorkload already true in cluster-monitoring-config"
    else
      oc_cluster patch configmap cluster-monitoring-config -n openshift-monitoring --type merge \
        -p '{"data":{"config.yaml":"enableUserWorkload: true\n"}}'
    fi
  fi

  wait_for "UWM prometheus Ready" "${TIMEOUT}" "uwm_is_ready"
}

phase_b_uwm() {
  enable_uwm
}

# ---------------------------------------------------------------------------
# Phase C — Istio scraping
# ---------------------------------------------------------------------------

allowlist_metric_names() {
  cat <<'EOF'
    names:
    - istio_requests_total
    - istio_request_bytes_bucket
    - istio_request_bytes_count
    - istio_request_bytes_sum
    - istio_request_duration_milliseconds_bucket
    - istio_request_duration_milliseconds_count
    - istio_request_duration_milliseconds_sum
    - istio_request_messages_total
    - istio_response_bytes_bucket
    - istio_response_bytes_count
    - istio_response_bytes_sum
    - istio_response_messages_total
    - istio_tcp_connections_closed_total
    - istio_tcp_connections_opened_total
    - istio_tcp_received_bytes_total
    - istio_tcp_sent_bytes_total
    - workload_manager_active_proxy_count
    - istio_build
    - pilot_proxy_convergence_time_sum
    - pilot_proxy_convergence_time_count
    - pilot_services
    - pilot_xds
    - pilot_xds_pushes
    - envoy_cluster_upstream_cx_active
    - envoy_cluster_upstream_rq_total
    - envoy_listener_downstream_cx_active
    - envoy_listener_http_downstream_rq
    - envoy_server_memory_allocated
    - envoy_server_memory_heap_size
    - envoy_server_uptime
    - container_cpu_usage_seconds_total
    - container_memory_working_set_bytes
    - process_cpu_seconds_total
    - process_resident_memory_bytes
EOF
}

apply_namespace_allowlist() {
  local ns=$1
  local existing
  existing=$(oc_cluster get configmap observability-metrics-custom-allowlist -n "${ns}" \
    -o jsonpath='{.metadata.labels.app\.kubernetes\.io/managed-by}' 2>/dev/null || true)
  if [ "${existing}" = "${MANAGED_BY}" ]; then
    info "[ok] Namespace allowlist already managed in ${ns}"
    return 0
  fi
  if oc_cluster get configmap observability-metrics-custom-allowlist -n "${ns}" >/dev/null 2>&1; then
    local has_istio
    has_istio=$(oc_cluster get configmap observability-metrics-custom-allowlist -n "${ns}" \
      -o jsonpath='{.data.uwl_metrics_list\.yaml}' 2>/dev/null | grep -c istio_ || true)
    if [ "${has_istio}" -ge 1 ]; then
      info "[ok] Istio metrics allowlist already exists in ${ns} (not managed by this script; leaving in place)"
      return 0
    fi
  fi

  info "Creating namespace metrics allowlist in ${ns}"
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would create allowlist ConfigMap in ${ns}"
    return 0
  fi

  oc_cluster apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: observability-metrics-custom-allowlist
  namespace: ${ns}
  labels:
    app.kubernetes.io/managed-by: ${MANAGED_BY}
    app.kubernetes.io/part-of: ${PART_OF}
data:
  uwl_metrics_list.yaml: |
$(allowlist_metric_names)
EOF
}

install_istiod_monitor() {
  if oc_cluster get servicemonitor istiod-monitor -n "${ISTIO_NAMESPACE}" \
    -o jsonpath='{.metadata.labels.app\.kubernetes\.io/managed-by}' 2>/dev/null | grep -q "${MANAGED_BY}"; then
    info "[ok] istiod-monitor already managed in ${ISTIO_NAMESPACE}"
    return 0
  fi
  if oc_cluster get servicemonitor istiod-monitor -n "${ISTIO_NAMESPACE}" >/dev/null 2>&1; then
    info "[ok] istiod-monitor already exists in ${ISTIO_NAMESPACE} (not managed by this script; leaving in place)"
    apply_namespace_allowlist "${ISTIO_NAMESPACE}"
    return 0
  fi

  info "Creating istiod ServiceMonitor in ${ISTIO_NAMESPACE}"
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would create istiod-monitor"
    return 0
  fi

  oc_cluster apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: istiod-monitor
  namespace: ${ISTIO_NAMESPACE}
  labels:
    app.kubernetes.io/managed-by: ${MANAGED_BY}
    app.kubernetes.io/part-of: ${PART_OF}
spec:
  targetLabels:
  - app
  selector:
    matchLabels:
      istio: pilot
  endpoints:
  - port: http-monitoring
    interval: 30s
EOF
  apply_namespace_allowlist "${ISTIO_NAMESPACE}"
}

install_app_podmonitor() {
  local app_ns=$1
  local name="istio-proxies-monitor-${app_ns}"

  if oc_cluster get podmonitor "${name}" -n "${app_ns}" \
    -o jsonpath='{.metadata.labels.app\.kubernetes\.io/managed-by}' 2>/dev/null | grep -q "${MANAGED_BY}"; then
    info "[ok] ${name} already managed in ${app_ns}"
    return 0
  fi

  info "Creating sidecar PodMonitor ${name} in ${app_ns}"
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would create ${name}"
    return 0
  fi

  local mesh_id_line=""
  if [ -n "${MESH_ID}" ]; then
    mesh_id_line=$(cat <<EOF
    - action: replace
      replacement: "${MESH_ID}"
      targetLabel: mesh_id
EOF
)
  fi

  oc_cluster apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: ${name}
  namespace: ${app_ns}
  labels:
    app.kubernetes.io/managed-by: ${MANAGED_BY}
    app.kubernetes.io/part-of: ${PART_OF}
spec:
  selector:
    matchExpressions:
    - key: istio-prometheus-ignore
      operator: DoesNotExist
  podMetricsEndpoints:
  - path: /stats/prometheus
    interval: 30s
    relabelings:
    - action: keep
      sourceLabels: ["__meta_kubernetes_pod_container_name"]
      regex: "istio-proxy"
    - action: keep
      sourceLabels: ["__meta_kubernetes_pod_annotationpresent_prometheus_io_scrape"]
    - action: replace
      regex: (\d+);(([A-Fa-f0-9]{1,4}::?){1,7}[A-Fa-f0-9]{1,4})
      replacement: '[\$2]:\$1'
      sourceLabels: ["__meta_kubernetes_pod_annotation_prometheus_io_port","__meta_kubernetes_pod_ip"]
      targetLabel: "__address__"
    - action: replace
      regex: (\d+);((([0-9]+?)(\.|$)){4})
      replacement: '\$2:\$1'
      sourceLabels: ["__meta_kubernetes_pod_annotation_prometheus_io_port","__meta_kubernetes_pod_ip"]
      targetLabel: "__address__"
    - sourceLabels: ["__meta_kubernetes_namespace"]
      action: replace
      targetLabel: namespace
${mesh_id_line}
EOF
  apply_namespace_allowlist "${app_ns}"
}

install_ztunnel_monitor() {
  local name="ztunnel-monitor"

  if oc_cluster get podmonitor "${name}" -n "${ZTUNNEL_NAMESPACE}" \
    -o jsonpath='{.metadata.labels.app\.kubernetes\.io/managed-by}' 2>/dev/null | grep -q "${MANAGED_BY}"; then
    info "[ok] ${name} already managed in ${ZTUNNEL_NAMESPACE}"
    return 0
  fi

  info "Creating ztunnel PodMonitor in ${ZTUNNEL_NAMESPACE}"
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would create ${name}"
    return 0
  fi

  local mesh_id_line=""
  if [ -n "${MESH_ID}" ]; then
    mesh_id_line=$(cat <<EOF
    - action: replace
      replacement: "${MESH_ID}"
      targetLabel: mesh_id
EOF
)
  fi

  oc_cluster apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: ${name}
  namespace: ${ZTUNNEL_NAMESPACE}
  labels:
    app.kubernetes.io/managed-by: ${MANAGED_BY}
    app.kubernetes.io/part-of: ${PART_OF}
spec:
  selector:
    matchExpressions:
    - key: istio-prometheus-ignore
      operator: DoesNotExist
  podMetricsEndpoints:
  - path: /stats/prometheus
    interval: 30s
    relabelings:
    - action: keep
      sourceLabels: ["__meta_kubernetes_pod_container_name"]
      regex: "istio-proxy"
    - action: keep
      sourceLabels: ["__meta_kubernetes_pod_annotationpresent_prometheus_io_scrape"]
    - action: replace
      regex: (\d+);(([A-Fa-f0-9]{1,4}::?){1,7}[A-Fa-f0-9]{1,4})
      replacement: '[\$2]:\$1'
      sourceLabels: ["__meta_kubernetes_pod_annotation_prometheus_io_port","__meta_kubernetes_pod_ip"]
      targetLabel: "__address__"
    - action: replace
      regex: (\d+);((([0-9]+?)(\.|$)){4})
      replacement: '\$2:\$1'
      sourceLabels: ["__meta_kubernetes_pod_annotation_prometheus_io_port","__meta_kubernetes_pod_ip"]
      targetLabel: "__address__"
    - sourceLabels: ["__meta_kubernetes_namespace"]
      action: replace
      targetLabel: namespace
${mesh_id_line}
EOF
  apply_namespace_allowlist "${ZTUNNEL_NAMESPACE}"
}

phase_c_scraping() {
  info "=== Configuring Istio metrics scraping ==="
  install_istiod_monitor

  if [ -n "${APP_NAMESPACES}" ]; then
    local ns
    IFS=',' read -ra _app_ns_list <<< "${APP_NAMESPACES}"
    for ns in "${_app_ns_list[@]}"; do
      ns="${ns// /}"
      [ -n "${ns}" ] || continue
      install_app_podmonitor "${ns}"
    done
  fi

  if [ "${AMBIENT}" = true ]; then
    install_ztunnel_monitor
  fi
}

# ---------------------------------------------------------------------------
# Phase D — Kiali prometheus (optional)
# ---------------------------------------------------------------------------

resource_has_our_label() {
  local kind=$1
  local name=$2
  local ns=$3
  [ "$(oc_cluster get "${kind}" "${name}" -n "${ns}" \
    -o jsonpath='{.metadata.labels.app\.kubernetes\.io/managed-by}' 2>/dev/null || true)" = "${MANAGED_BY}" ]
}

setup_kiali_hub_certs() {
  local observatorium_url
  observatorium_url=$(oc_hub get route observatorium-api -n "${OBS_NS}" \
    -o jsonpath='https://{.spec.host}/api/metrics/v1/default')
  info "Observatorium URL: ${observatorium_url}"

  mkdir -p "${TMP_DIR}"
  oc_hub get secret observability-grafana-certs -n "${OBS_NS}" \
    -o jsonpath='{.data.tls\.crt}' | base64 -d > "${TMP_DIR}/obs-tls.crt"
  oc_hub get secret observability-grafana-certs -n "${OBS_NS}" \
    -o jsonpath='{.data.tls\.key}' | base64 -d > "${TMP_DIR}/obs-tls.key"

  local host issuer
  host=$(oc_hub get route observatorium-api -n "${OBS_NS}" -o jsonpath='{.spec.host}')
  issuer=$(echo | openssl s_client -connect "${host}:443" -servername "${host}" -showcerts 2>/dev/null \
    | openssl x509 -noout -issuer 2>/dev/null || true)

  if echo "${issuer}" | grep -q "observability-server-ca-certificate"; then
    oc_hub get secret observability-server-ca-certs -n "${OBS_NS}" \
      -o jsonpath='{.data.ca\.crt}' | base64 -d > "${TMP_DIR}/obs-server-ca.crt"
  else
    oc_hub get secret observability-client-ca-certs -n "${OBS_NS}" \
      -o jsonpath='{.data.ca\.crt}' | base64 -d > "${TMP_DIR}/obs-server-ca.crt"
  fi

  if resource_has_our_label secret acm-observability-certs "${KIALI_DEPLOYMENT_NAMESPACE}"; then
    info "[ok] acm-observability-certs already managed in ${KIALI_DEPLOYMENT_NAMESPACE}"
  else
    oc_cluster create secret generic acm-observability-certs \
      -n "${KIALI_DEPLOYMENT_NAMESPACE}" \
      --from-file=tls.crt="${TMP_DIR}/obs-tls.crt" \
      --from-file=tls.key="${TMP_DIR}/obs-tls.key" \
      --dry-run=client -o yaml | \
      oc_cluster label -f - \
        app.kubernetes.io/managed-by="${MANAGED_BY}" \
        app.kubernetes.io/part-of="${PART_OF}" --local -o yaml | \
      oc_cluster apply -f - >/dev/null
  fi

  if resource_has_our_label configmap kiali-cabundle "${KIALI_DEPLOYMENT_NAMESPACE}"; then
    info "[ok] kiali-cabundle already managed in ${KIALI_DEPLOYMENT_NAMESPACE}"
  else
    oc_cluster create configmap kiali-cabundle \
      -n "${KIALI_DEPLOYMENT_NAMESPACE}" \
      --from-file=additional-ca-bundle.pem="${TMP_DIR}/obs-server-ca.crt" \
      --dry-run=client -o yaml | \
      oc_cluster label -f - \
        app.kubernetes.io/managed-by="${MANAGED_BY}" \
        app.kubernetes.io/part-of="${PART_OF}" --local -o yaml | \
      oc_cluster apply -f - >/dev/null
  fi

  OBSERVATORIUM_URL="${observatorium_url}"
}

ensure_uwm_token_secret() {
  local sa_name="kiali-prometheus-query"
  if ! oc_cluster get sa "${sa_name}" -n "${KIALI_DEPLOYMENT_NAMESPACE}" >/dev/null 2>&1; then
    oc_cluster apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${sa_name}
  namespace: ${KIALI_DEPLOYMENT_NAMESPACE}
  labels:
    app.kubernetes.io/managed-by: ${MANAGED_BY}
    app.kubernetes.io/part-of: ${PART_OF}
EOF
    oc_cluster adm policy add-cluster-role-to-user cluster-monitoring-view \
      "system:serviceaccount:${KIALI_DEPLOYMENT_NAMESPACE}:${sa_name}" 2>/dev/null || true
  fi

  if resource_has_our_label secret prometheus-user-workload-token "${KIALI_DEPLOYMENT_NAMESPACE}"; then
    info "[ok] prometheus-user-workload-token already managed"
    return 0
  fi

  local token
  token=$(oc_cluster create token "${sa_name}" -n "${KIALI_DEPLOYMENT_NAMESPACE}" --duration=8760h 2>/dev/null || true)
  [ -n "${token}" ] || die "Failed to create token for ${sa_name}"

  oc_cluster create secret generic prometheus-user-workload-token \
    -n "${KIALI_DEPLOYMENT_NAMESPACE}" \
    --from-literal=token="${token}" \
    --dry-run=client -o yaml | \
    oc_cluster label -f - \
      app.kubernetes.io/managed-by="${MANAGED_BY}" \
      app.kubernetes.io/part-of="${PART_OF}" --local -o yaml | \
    oc_cluster apply -f -
}

kiali_prometheus_configured() {
  [ -n "${KIALI_CR_NAMESPACE}" ] || return 1
  local url
  url=$(oc_cluster get kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" \
    -o jsonpath='{.spec.external_services.prometheus.url}' 2>/dev/null || true)
  [ -n "${url}" ]
}

patch_kiali_hub() {
  local observatorium_url=$1
  if kiali_prometheus_configured; then
    local current
    current=$(oc_cluster get kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" \
      -o jsonpath='{.spec.external_services.prometheus.url}' 2>/dev/null || true)
    if [ "${current}" = "${observatorium_url}" ]; then
      info "[ok] Kiali CR already configured for hub Observatorium"
      return 0
    fi
  fi

  info "Patching Kiali CR for hub Observatorium backend"
  oc_cluster patch kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" --type merge -p "$(cat <<EOF
{
  "spec": {
    "external_services": {
      "prometheus": {
        "url": "${observatorium_url}",
        "auth": {
          "type": "none",
          "cert_file": "secret:acm-observability-certs:tls.crt",
          "key_file": "secret:acm-observability-certs:tls.key",
          "use_kiali_token": false
        },
        "thanos_proxy": {
          "enabled": true,
          "retention_period": "${RETENTION_PERIOD}",
          "scrape_interval": "${SCRAPE_INTERVAL}"
        }
      }
    }
  }
}
EOF
)"
  wait_for "Kiali CR reconciled" "${TIMEOUT}" \
    "[ \"\$(oc_cluster get kiali ${KIALI_NAME} -n ${KIALI_CR_NAMESPACE} -o jsonpath='{.status.conditions[?(@.type==\"Successful\")].status}' 2>/dev/null)\" = 'True' ]"
}

patch_kiali_local() {
  local prom_url="https://prometheus-user-workload.openshift-user-workload-monitoring.svc:9091/api/v1/query"
  if kiali_prometheus_configured; then
    local current
    current=$(oc_cluster get kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" \
      -o jsonpath='{.spec.external_services.prometheus.url}' 2>/dev/null || true)
    if [ "${current}" = "${prom_url}" ]; then
      info "[ok] Kiali CR already configured for local UWM"
      return 0
    fi
  fi

  ensure_uwm_token_secret

  info "Patching Kiali CR for local UWM backend"
  oc_cluster patch kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" --type merge -p "$(cat <<EOF
{
  "spec": {
    "external_services": {
      "prometheus": {
        "url": "${prom_url}",
        "auth": {
          "type": "bearer",
          "token": "secret:prometheus-user-workload-token:token"
        },
        "thanos_proxy": {
          "enabled": false
        }
      }
    }
  }
}
EOF
)"
  wait_for "Kiali CR reconciled" "${TIMEOUT}" \
    "[ \"\$(oc_cluster get kiali ${KIALI_NAME} -n ${KIALI_CR_NAMESPACE} -o jsonpath='{.status.conditions[?(@.type==\"Successful\")].status}' 2>/dev/null)\" = 'True' ]"
}

phase_d_kiali() {
  if [ -z "${KIALI_CR_NAMESPACE}" ]; then
    info "[ok] Metrics collection configured; no Kiali CR to patch (omit --kiali-cr-namespace)"
    return 0
  fi

  info "=== Configuring Kiali prometheus backend ==="
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would patch Kiali CR ${KIALI_NAME} in ${KIALI_CR_NAMESPACE}"
    return 0
  fi

  if [ "${METRICS_BACKEND}" = hub ]; then
    setup_kiali_hub_certs
    patch_kiali_hub "${OBSERVATORIUM_URL}"
  else
    patch_kiali_local
  fi
}

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

query_hub_metrics() {
  oc_hub get --raw \
    "/api/v1/namespaces/${OBS_NS}/services/http:observability-thanos-query-frontend:9090/proxy/api/v1/label/__name__/values" \
    2>/dev/null | jq -r '.data[]?' 2>/dev/null | grep -q '^istio_'
}

query_local_metrics() {
  oc_cluster exec -n openshift-user-workload-monitoring \
    statefulset/prometheus-user-workload -c prometheus -- \
    wget -qO- 'http://localhost:9090/api/v1/label/__name__/values' 2>/dev/null \
    | jq -r '.data[]?' 2>/dev/null | grep -q '^istio_'
}

do_verify() {
  info "=== Verification ==="
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Skipping cluster verification (no resources applied)"
    return 0
  fi
  local failed=0

  if [ "${SKIP_UWM}" != true ]; then
    if uwm_is_ready; then
      info "[ok] UWM prometheus Ready"
    else
      warn "UWM prometheus not Ready"
      failed=1
    fi
  fi

  if oc_cluster get servicemonitor istiod-monitor -n "${ISTIO_NAMESPACE}" >/dev/null 2>&1; then
    info "[ok] istiod-monitor exists in ${ISTIO_NAMESPACE}"
  else
    warn "istiod-monitor missing in ${ISTIO_NAMESPACE}"
    failed=1
  fi

  if [ "${METRICS_BACKEND}" = hub ]; then
    if mco_is_ready; then
      info "[ok] Hub MCO Ready"
    else
      warn "Hub MCO not Ready"
      failed=1
    fi
  fi

  if [ -n "${KIALI_CR_NAMESPACE}" ]; then
    if kiali_prometheus_configured; then
      info "[ok] Kiali CR has prometheus.url configured"
    else
      warn "Kiali CR missing prometheus.url"
      failed=1
    fi
  fi

  if [ "${WAIT_FOR_METRICS}" = true ]; then
    info "Waiting for istio_* metrics in backend (may take 10+ minutes)..."
    if [ "${METRICS_BACKEND}" = hub ]; then
      wait_for "istio metrics in hub Thanos" "${TIMEOUT}" query_hub_metrics
    else
      wait_for "istio metrics in local UWM" "${TIMEOUT}" query_local_metrics
    fi
  else
    if [ "${METRICS_BACKEND}" = hub ] && query_hub_metrics; then
      info "[ok] istio_* metrics found in hub Thanos"
    elif [ "${METRICS_BACKEND}" = local ] && query_local_metrics; then
      info "[ok] istio_* metrics found in local UWM"
    else
      info "istio_* metrics not yet visible (normal before traffic + warm-up). Use --wait-for-metrics to block."
    fi
  fi

  if [ "${failed}" -ne 0 ]; then
    die "Verification failed"
  fi

  info "Metrics warm-up: allow 5-10 minutes after mesh traffic before Kiali/OSSMC graphs populate."
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------

delete_if_managed() {
  local kind=$1
  local name=$2
  local ns=$3

  if ! oc_cluster get "${kind}" "${name}" -n "${ns}" >/dev/null 2>&1; then
    info "[ok] ${kind}/${name} not found in ${ns}, skipping"
    return 0
  fi
  if ! resource_has_our_label "${kind}" "${name}" "${ns}"; then
    info "[ok] ${kind}/${name} in ${ns} not managed by this script, skipping"
    return 0
  fi
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would delete ${kind}/${name} in ${ns}"
    return 0
  fi
  oc_cluster delete "${kind}" "${name}" -n "${ns}" --ignore-not-found
  info "Deleted ${kind}/${name} in ${ns}"
}

restore_kiali_prometheus() {
  if [ -z "${KIALI_CR_NAMESPACE}" ] || [ -z "${KIALI_DEPLOYMENT_NAMESPACE}" ]; then
    return 0
  fi
  if [ "${RESTORE_KIALI_PROM}" != true ]; then
    info "[skip] Leaving Kiali prometheus config (--restore-kiali-prometheus false)"
    return 0
  fi
  if ! oc_cluster get kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" >/dev/null 2>&1; then
    info "[ok] Kiali CR not found, skipping prometheus restore"
    return 0
  fi
  if ! kiali_prometheus_configured; then
    info "[ok] Kiali CR has no prometheus.url, skipping restore"
    return 0
  fi

  info "Removing prometheus configuration from Kiali CR"
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would remove spec.external_services.prometheus from Kiali CR"
    return 0
  fi
  oc_cluster patch kiali "${KIALI_NAME}" -n "${KIALI_CR_NAMESPACE}" --type json \
    -p='[{"op": "remove", "path": "/spec/external_services/prometheus"}]' 2>/dev/null || \
    info "[ok] prometheus block already removed from Kiali CR"
  wait_for "Kiali CR reconciled after prometheus restore" "${TIMEOUT}" \
    "[ \"\$(oc_cluster get kiali ${KIALI_NAME} -n ${KIALI_CR_NAMESPACE} -o jsonpath='{.status.conditions[?(@.type==\"Successful\")].status}' 2>/dev/null)\" = 'True' ]"
  wait_for "Kiali deployment dropped observability cert mounts" 300 \
    "! oc_cluster get deploy kiali -n ${KIALI_DEPLOYMENT_NAMESPACE} -o json 2>/dev/null | jq -e '.spec.template.spec.volumes[]? | select(.secret.secretName==\"acm-observability-certs\")' >/dev/null"
  wait_for "Kiali deployment ready after prometheus restore" 300 \
    "oc_cluster rollout status deployment/kiali -n ${KIALI_DEPLOYMENT_NAMESPACE} --timeout=10s >/dev/null 2>&1"
}

uninstall_kiali_secrets() {
  if [ -z "${KIALI_DEPLOYMENT_NAMESPACE}" ]; then
    return 0
  fi
  delete_if_managed secret acm-observability-certs "${KIALI_DEPLOYMENT_NAMESPACE}"
  delete_if_managed configmap kiali-cabundle "${KIALI_DEPLOYMENT_NAMESPACE}"
  delete_if_managed secret prometheus-user-workload-token "${KIALI_DEPLOYMENT_NAMESPACE}"
  delete_if_managed sa kiali-prometheus-query "${KIALI_DEPLOYMENT_NAMESPACE}"
}

uninstall_monitors_and_allowlists() {
  delete_if_managed servicemonitor istiod-monitor "${ISTIO_NAMESPACE}"
  delete_if_managed configmap observability-metrics-custom-allowlist "${ISTIO_NAMESPACE}"

  if [ -n "${APP_NAMESPACES}" ]; then
    local ns
    IFS=',' read -ra _app_ns_list <<< "${APP_NAMESPACES}"
    for ns in "${_app_ns_list[@]}"; do
      ns="${ns// /}"
      [ -n "${ns}" ] || continue
      delete_if_managed podmonitor "istio-proxies-monitor-${ns}" "${ns}"
      delete_if_managed configmap observability-metrics-custom-allowlist "${ns}"
    done
  fi

  if [ "${AMBIENT}" = true ]; then
    delete_if_managed podmonitor ztunnel-monitor "${ZTUNNEL_NAMESPACE}"
    delete_if_managed configmap observability-metrics-custom-allowlist "${ZTUNNEL_NAMESPACE}"
  fi
}

remove_hub_observability() {
  if [ "${REMOVE_HUB_OBS}" != true ]; then
    return 0
  fi
  if [ "${METRICS_BACKEND}" != hub ]; then
    return 0
  fi

  info "=== Removing hub observability (lab teardown) ==="
  if [ "${DRY_RUN}" = true ]; then
    info "[dry-run] Would remove MCO, MinIO, and observability namespace"
    return 0
  fi

  if oc_hub get mco observability -n "${OBS_NS}" >/dev/null 2>&1; then
    oc_hub delete mco observability --ignore-not-found
    wait_for "MCO deleted" 300 "! oc_hub get mco observability -n ${OBS_NS} >/dev/null 2>&1"
  else
    info "[ok] MCO not found, skipping"
  fi

  oc_hub delete deployment minio -n "${OBS_NS}" --ignore-not-found 2>/dev/null || true
  oc_hub delete service minio -n "${OBS_NS}" --ignore-not-found 2>/dev/null || true
  oc_hub delete secret thanos-object-storage -n "${OBS_NS}" --ignore-not-found 2>/dev/null || true
  info "[ok] Hub observability components removed"
}

do_uninstall() {
  info "=== Uninstalling mesh observability resources ==="

  restore_kiali_prometheus
  uninstall_kiali_secrets
  uninstall_monitors_and_allowlists
  remove_hub_observability

  info "[ok] Uninstall complete"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

do_install() {
  preflight
  TMP_DIR=$(mktemp -d "/tmp/enable-mesh-observability-XXXXXX")
  trap 'rm -rf "${TMP_DIR}"' EXIT

  phase_a_hub
  phase_b_uwm
  phase_c_scraping
  phase_d_kiali
  do_verify

  info "=== Install complete ==="
}

main() {
  parse_args "$@"

  case "${COMMAND}" in
    install) do_install ;;
    uninstall)
      preflight
      do_uninstall
      ;;
    verify)
      preflight
      do_verify
      ;;
    *) die "Unknown command: ${COMMAND}" ;;
  esac
}

main "$@"
