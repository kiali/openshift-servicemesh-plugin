#!/usr/bin/env bash
#
# Automates the multi-cluster Fleet Service Mesh demo from DEMO-SETUP-MULTICLUSTER.md.
#
# Usage:
#   hack/fleet-mesh/setup-demo-multicluster.sh [options] install|uninstall
#
# Options:
#   --context-hub <ctx>           Hub kubeconfig context (default: my-hub)
#   --context-spoke <ctx>         Spoke kubeconfig context (default: my-spoke)
#   --spoke-name <name>           ACM ManagedCluster name (default: my-spoke)
#   --install-kiali <targets>     hub, spoke, both, or none (default: spoke; install only)
#   --install-ossmc <targets>     hub, spoke, both, or none (default: both; install only)
#   --install-mesh-hello <bool>   Deploy mesh-hello + secure-mcm metrics on hub/spoke (default: true; install only)
#   --manage-acm-install <bool>   true: install/remove ACM on hub; false: assume ACM exists (default: true)
#   --acm-channel <channel>       ACM operator channel (default: latest packagemanifest)
#   --kiali-repo <path>           Path to kiali server repo
#   --mesh-addon-repo <path>      Path to multicluster-mesh-addon repo
#   --plugin-repo <path>          Path to openshift-servicemesh-plugin repo
#
# Notes:
#   - operator-create (kiali Makefile) runs operator-delete first on each target cluster.
#   - --install-kiali / --install-ossmc / --install-mesh-hello only affect install; uninstall always removes Kiali, OSSMC, mesh-hello, and mesh observability.
#   - Pass the same --manage-acm-install value on install and uninstall for a full round-trip.
#   - Spoke import/deregistration is always managed; only hub ACM install/removal is gated.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HUB_CTX="${HUB_CTX:-my-hub}"
SPOKE_CTX="${SPOKE_CTX:-my-spoke}"
SPOKE_NAME="${SPOKE_NAME:-my-spoke}"
INSTALL_KIALI="${INSTALL_KIALI:-spoke}"
INSTALL_OSSMC="${INSTALL_OSSMC:-both}"
INSTALL_MESH_HELLO=true
MANAGE_ACM_INSTALL=true
ACM_CHANNEL=""
PLUGIN_REPO="${PLUGIN_REPO:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
KIALI_REPO="${KIALI_REPO:-}"
MESH_ADDON_REPO="${MESH_ADDON_REPO:-}"

RECONCILE_TIMEOUT="${RECONCILE_TIMEOUT:-300}"
ACM_TIMEOUT="${ACM_TIMEOUT:-1800}"
TMP_DIR="/tmp/setup-demo-multicluster-$$"

CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.20.2}"
CERT_MANAGER_URL="https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"

BACKEND_NAMESPACE="${BACKEND_NAMESPACE:-multicluster-mesh-system}"
BACKEND_IMAGE_NAME="${BACKEND_IMAGE_NAME:-multicluster-mesh-addon}"
BACKEND_IMAGE_TAG="${BACKEND_IMAGE_TAG:-dev}"
KIALI_NAMESPACE="${KIALI_NAMESPACE:-secure-ns}"

COMMAND=""

info()  { echo "[INFO]  $(date '+%H:%M:%S') $*"; }
warn()  { echo "[WARN]  $(date '+%H:%M:%S') $*" >&2; }
error() { echo "[ERROR] $(date '+%H:%M:%S') $*" >&2; exit 1; }
die()   { error "$*"; }

oc_for_ctx() {
  local ctx=$1
  shift
  command oc --context="${ctx}" "$@"
}

oc_hub()   { oc_for_ctx "${HUB_CTX}" "$@"; }
oc_spoke() { oc_for_ctx "${SPOKE_CTX}" "$@"; }

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
      info "OK: ${desc}"
      return 0
    fi
    elapsed=$((elapsed + interval))
    if [ "${elapsed}" -ge "${timeout}" ]; then
      error "TIMEOUT after ${timeout}s waiting for: ${desc}"
    fi
    echo "  ...still waiting (${elapsed}s elapsed)"
    sleep "${interval}"
  done
}

delete_subscriptions_matching() {
  local oc_fn=$1
  local label=$2
  local pattern=$3
  local ns name

  while read -r ns name; do
    [ -z "${name}" ] && continue
    info "Removing subscription ${name} in ${ns} on ${label}"
    "${oc_fn}" delete subscription "${name}" -n "${ns}" --timeout=120s 2>/dev/null || true
  done < <("${oc_fn}" get subscription -A --no-headers 2>/dev/null | grep -iE "${pattern}" | awk '{print $1, $2}' || true)
}

delete_csvs_matching() {
  local oc_fn=$1
  local label=$2
  local pattern=$3
  local timeout=${4:-300}
  local elapsed=0
  local ns name count

  while [ "${elapsed}" -lt "${timeout}" ]; do
    count=$("${oc_fn}" get csv -A --no-headers 2>/dev/null | grep -ciE "${pattern}" || echo 0)
    count=${count//[^0-9]/}
    [ -z "${count}" ] && count=0
    if [ "${count}" -eq 0 ]; then
      info "[ok] No CSVs matching '${pattern}' on ${label}"
      return 0
    fi
    while read -r ns name; do
      [ -z "${name}" ] && continue
      info "Removing CSV ${name} in ${ns} on ${label}"
      "${oc_fn}" delete csv "${name}" -n "${ns}" --timeout=120s 2>/dev/null || true
    done < <("${oc_fn}" get csv -A --no-headers 2>/dev/null | grep -iE "${pattern}" | awk '{print $1, $2}' || true)
    sleep 5
    elapsed=$((elapsed + 5))
  done
  warn "${label}: CSVs matching '${pattern}' still present after ${timeout}s"
}

delete_crds_matching() {
  local oc_fn=$1
  local label=$2
  local pattern=$3
  local timeout=${4:-300}
  local elapsed=0
  local crd crds remaining

  while [ "${elapsed}" -lt "${timeout}" ]; do
    crds=$("${oc_fn}" get crd -o name 2>/dev/null | grep -E "${pattern}" || true)
    if [ -z "${crds}" ]; then
      info "[ok] No CRDs matching '${pattern}' on ${label}"
      return 0
    fi
    while read -r crd; do
      [ -z "${crd}" ] && continue
      "${oc_fn}" patch "${crd}" -p '{"metadata":{"finalizers":[]}}' --type=merge 2>/dev/null || true
      "${oc_fn}" delete "${crd}" --timeout=60s 2>/dev/null || true
    done <<< "${crds}"
    sleep 5
    elapsed=$((elapsed + 5))
  done
  remaining=$("${oc_fn}" get crd -o name 2>/dev/null | grep -E "${pattern}" | wc -l | tr -d ' ' || echo 0)
  if [ "${remaining}" -gt 0 ]; then
    warn "${label}: ${remaining} CRD(s) matching '${pattern}' still present after ${timeout}s"
  fi
}

verify_operator_cleanup() {
  local oc_fn=$1
  local label=$2
  local csv_pattern=$3
  local crd_pattern=$4

  if "${oc_fn}" get csv -A 2>/dev/null | grep -qiE "${csv_pattern}"; then
    warn "${label}: CSVs still present:"
    "${oc_fn}" get csv -A 2>/dev/null | grep -iE "${csv_pattern}" || true
  fi
  if "${oc_fn}" get crd 2>/dev/null | grep -qE "${crd_pattern}"; then
    warn "${label}: CRDs still present:"
    "${oc_fn}" get crd 2>/dev/null | grep -E "${crd_pattern}" || true
  fi
}

resolve_repos() {
  if [ -z "${KIALI_REPO}" ]; then
    local candidate
    for candidate in \
      "${PLUGIN_REPO}/../kiali" \
      "${HOME}/source/kiali"; do
      if [ -f "${candidate}/Makefile" ]; then
        KIALI_REPO="${candidate}"
        break
      fi
    done
  fi

  if [ -z "${MESH_ADDON_REPO}" ]; then
    local candidate
    for candidate in \
      "${PLUGIN_REPO}/../multicluster-mesh-addon" \
      "${PLUGIN_REPO}/../../stolostron/multicluster-mesh-addon" \
      "${HOME}/source/stolostron/multicluster-mesh-addon"; do
      if [ -f "${candidate}/chart/Chart.yaml" ]; then
        MESH_ADDON_REPO="${candidate}"
        break
      fi
    done
  fi
}

validate_install_targets() {
  local setting=$1
  case "${setting}" in
    none|hub|spoke|both) ;;
    *) error "Invalid target '${setting}'. Use hub, spoke, both, or none." ;;
  esac
}

cluster_selected() {
  local cluster=$1
  local setting=$2
  case "${setting}" in
    none) return 1 ;;
    both) return 0 ;;
    hub)  [ "${cluster}" = "hub" ] ;;
    spoke) [ "${cluster}" = "spoke" ] ;;
  esac
}

needs_kiali_or_ossmc_on() {
  local cluster=$1
  cluster_selected "${cluster}" "${INSTALL_KIALI}" || \
    cluster_selected "${cluster}" "${INSTALL_OSSMC}"
}

usage() {
  cat <<'USAGE'
Automates the multi-cluster Fleet Service Mesh demo (DEMO-SETUP-MULTICLUSTER.md).

Usage: setup-demo-multicluster.sh [options] install|uninstall

Options:
  --context-hub <ctx>           Hub kubeconfig context (default: my-hub)
  --context-spoke <ctx>         Spoke kubeconfig context (default: my-spoke)
  --spoke-name <name>           ACM ManagedCluster name (default: my-spoke)
  --install-kiali <targets>     hub, spoke, both, or none (default: spoke; install only)
  --install-ossmc <targets>     hub, spoke, both, or none (default: both; install only)
  --install-mesh-hello <bool>   Deploy mesh-hello and secure-mcm metrics on hub/spoke (default: true; install only)
  --manage-acm-install <bool>   true: install/remove ACM on hub; false: assume ACM exists (default: true)
  --acm-channel <channel>       ACM operator channel (default: latest)
  --kiali-repo <path>           Path to kiali server repo
  --mesh-addon-repo <path>      Path to multicluster-mesh-addon repo
  --plugin-repo <path>          Path to openshift-servicemesh-plugin repo
  -h, --help                    Show this help

Commands:
  install     Create all demo resources
  uninstall   Remove demo resources (reverse order)
USAGE
  exit 0
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "${1}" in
      --context-hub) HUB_CTX="${2:?'--context-hub requires a value'}"; shift 2 ;;
      --context-spoke) SPOKE_CTX="${2:?'--context-spoke requires a value'}"; shift 2 ;;
      --spoke-name) SPOKE_NAME="${2:?'--spoke-name requires a value'}"; shift 2 ;;
      --install-kiali) INSTALL_KIALI="${2:?'--install-kiali requires a value'}"; shift 2 ;;
      --install-ossmc) INSTALL_OSSMC="${2:?'--install-ossmc requires a value'}"; shift 2 ;;
      --install-mesh-hello)
        case "${2,,}" in
          true|false) INSTALL_MESH_HELLO="${2,,}"; shift 2 ;;
          *) error "--install-mesh-hello requires true or false" ;;
        esac
        ;;
      --manage-acm-install)
        case "${2,,}" in
          true|false) MANAGE_ACM_INSTALL="${2,,}"; shift 2 ;;
          *) error "--manage-acm-install requires true or false" ;;
        esac
        ;;
      --acm-channel) ACM_CHANNEL="${2:?'--acm-channel requires a value'}"; shift 2 ;;
      --kiali-repo) KIALI_REPO="${2:?'--kiali-repo requires a value'}"; shift 2 ;;
      --mesh-addon-repo) MESH_ADDON_REPO="${2:?'--mesh-addon-repo requires a value'}"; shift 2 ;;
      --plugin-repo) PLUGIN_REPO="${2:?'--plugin-repo requires a value'}"; shift 2 ;;
      -h|--help) usage ;;
      install|uninstall) COMMAND="${1}"; shift ;;
      *) error "Unknown option: ${1}. Run with --help for usage." ;;
    esac
  done

  [ -n "${COMMAND}" ] || error "No command specified. Use 'install' or 'uninstall'."

  validate_install_targets "${INSTALL_KIALI}"
  validate_install_targets "${INSTALL_OSSMC}"
}

verify_tools() {
  local tool
  for tool in oc podman jq make helm go node envsubst; do
    command -v "${tool}" &>/dev/null || error "Required command not found: ${tool}"
  done
}

verify_context() {
  local ctx=$1
  local label=$2
  oc_for_ctx "${ctx}" whoami --show-server &>/dev/null || \
    error "Cannot reach ${label} cluster (context: ${ctx}). Run 'oc login' first."
  info "${label}: logged in as $(oc_for_ctx "${ctx}" whoami) on $(oc_for_ctx "${ctx}" whoami --show-server)"
}

demo_already_installed() {
  oc_hub get multiclustermesh secure-mcm -n secure-mcm-ns &>/dev/null && \
    oc_hub get multiclustermesh unsecure-mcm -n unsecure-mcm-ns &>/dev/null
}

verify_mesh_clean() {
  local oc_fn=$1
  local label=$2

  if demo_already_installed; then
    info "[ok] Demo MCMs already present on hub; skipping mesh-clean check (${label})"
    return 0
  fi

  if "${oc_fn}" get csv --all-namespaces 2>/dev/null | grep -qi servicemesh; then
    error "${label}: servicemesh operator CSV already present. Clean cluster before install."
  fi
  if "${oc_fn}" get crd 2>/dev/null | grep -qE 'sailoperator|istio'; then
    error "${label}: OSSM/istio CRDs already present. Clean cluster before install."
  fi
  return 0
}

mch_phase() {
  oc_hub get mch multiclusterhub -n open-cluster-management \
    -o jsonpath='{.status.phase}' 2>/dev/null || true
}

verify_acm_running() {
  local phase
  phase="$(mch_phase)"
  if [ "${phase}" != "Running" ]; then
    error "ACM MultiClusterHub is not Running (phase: ${phase:-not found}). Install ACM or use --manage-acm-install true."
  fi
  wait_for "local-cluster available" 300 \
    "oc_hub get managedcluster local-cluster -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}' | grep -q 'ManagedClusterConditionAvailable=True'"
  info "[ok] ACM is Running and local-cluster is available"
}

wait_for_local_cluster() {
  wait_for "local-cluster available" 300 \
    "oc_hub get managedcluster local-cluster -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}' | grep -q 'ManagedClusterConditionAvailable=True'"
}

install_acm_hub() {
  local phase
  phase="$(mch_phase)"

  if [ "${phase}" = "Running" ]; then
    info "[ok] ACM already installed, skipping"
    wait_for_local_cluster
    return 0
  fi

  if [ -n "${phase}" ] && [ "${phase}" != "NotFound" ]; then
    info "MultiClusterHub phase is '${phase}', waiting for Running..."
    wait_for "MultiClusterHub Running" "${ACM_TIMEOUT}" \
      "[ \"\$(oc_hub get mch multiclusterhub -n open-cluster-management -o jsonpath='{.status.phase}')\" = 'Running' ]"
    wait_for_local_cluster
    return 0
  fi

  info "=== Installing ACM on hub ==="

  local channel="${ACM_CHANNEL}"
  if [ -z "${channel}" ]; then
    channel=$(oc_hub get packagemanifest advanced-cluster-management \
      -n openshift-marketplace \
      -o jsonpath='{.status.channels[*].name}' | \
      tr ' ' '\n' | sort -V | tail -1)
  fi
  info "Using ACM channel: ${channel}"

  oc_hub create namespace open-cluster-management 2>/dev/null || true

  oc_hub apply -f - <<'EOF'
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: open-cluster-management
  namespace: open-cluster-management
spec:
  targetNamespaces:
  - open-cluster-management
EOF

  oc_hub apply -f - <<EOF
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: acm-operator-subscription
  namespace: open-cluster-management
spec:
  sourceNamespace: openshift-marketplace
  source: redhat-operators
  channel: ${channel}
  installPlanApproval: Automatic
  name: advanced-cluster-management
EOF

  wait_for "MCH CRD established" "${ACM_TIMEOUT}" \
    "oc_hub get crd multiclusterhubs.operator.open-cluster-management.io"

  wait_for "MCH operator pod ready" "${ACM_TIMEOUT}" \
    "oc_hub wait pod -l name=multiclusterhub-operator -n open-cluster-management --for=condition=Ready --timeout=10s"

  oc_hub apply -f - <<'EOF'
apiVersion: operator.open-cluster-management.io/v1
kind: MultiClusterHub
metadata:
  name: multiclusterhub
  namespace: open-cluster-management
spec: {}
EOF

  wait_for "MultiClusterHub Running" "${ACM_TIMEOUT}" \
    "[ \"\$(oc_hub get mch multiclusterhub -n open-cluster-management -o jsonpath='{.status.phase}')\" = 'Running' ]"
  wait_for_local_cluster
  info "[ok] ACM installed"
}

ensure_cluster_image_registry() {
  local ctx=$1
  local cluster=$2

  if oc_for_ctx "${ctx}" get image.config.openshift.io/cluster \
    -o jsonpath='{.status.externalRegistryHostnames[0]}' 2>/dev/null | grep -q '.'; then
    return 0
  fi

  info "Patching image registry on ${cluster} to expose external route..."
  oc_for_ctx "${ctx}" patch configs.imageregistry.operator.openshift.io/cluster \
    --type merge -p '{"spec":{"defaultRoute":true}}'

  wait_for "external registry hostname on ${cluster}" 300 \
    "oc_for_ctx \"${ctx}\" get image.config.openshift.io/cluster -o jsonpath='{.status.externalRegistryHostnames[0]}' | grep -q ."
}

podman_login_cluster() {
  local ctx=$1
  local cluster=$2
  local registry

  ensure_cluster_image_registry "${ctx}" "${cluster}"

  registry=$(oc_for_ctx "${ctx}" get image.config.openshift.io/cluster \
    -o jsonpath='{.status.externalRegistryHostnames[0]}')
  [ -n "${registry}" ] || error "Cannot determine external registry hostname on ${cluster}"

  podman login --tls-verify=false \
    -u "$(oc_for_ctx "${ctx}" whoami | tr -d ':')" \
    -p "$(oc_for_ctx "${ctx}" whoami -t)" \
    "${registry}"
  info "[ok] Logged into image registry on ${cluster} (${registry})"
}

ensure_image_registry() {
  info "=== Ensuring hub image registry is exposed ==="
  if oc_hub get image.config.openshift.io/cluster \
    -o jsonpath='{.status.externalRegistryHostnames[0]}' 2>/dev/null | grep -q '.'; then
    info "[ok] Image registry external route already available"
    return 0
  fi

  ensure_cluster_image_registry "${HUB_CTX}" hub
  info "[ok] Image registry external route available"
}

spoke_is_joined() {
  oc_hub get managedcluster "${SPOKE_NAME}" -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}' 2>/dev/null | \
    grep -q 'ManagedClusterJoined=True' && \
  oc_hub get managedcluster "${SPOKE_NAME}" -o jsonpath='{range .status.conditions[*]}{.type}={.status} {end}' 2>/dev/null | \
    grep -q 'ManagedClusterConditionAvailable=True'
}

import_spoke() {
  if spoke_is_joined; then
    info "[ok] Spoke ${SPOKE_NAME} already joined and available, skipping import"
    return 0
  fi

  info "=== Importing spoke ${SPOKE_NAME} into ACM ==="
  mkdir -p "${TMP_DIR}"

  oc_hub apply -f - <<EOF
apiVersion: cluster.open-cluster-management.io/v1
kind: ManagedCluster
metadata:
  name: ${SPOKE_NAME}
  labels:
    cloud: auto-detect
    vendor: auto-detect
spec:
  hubAcceptsClient: true
  leaseDurationSeconds: 60
EOF

  oc config view --context="${SPOKE_CTX}" --minify --flatten \
    > "${TMP_DIR}/spoke-kubeconfig.yaml"

  oc_hub create secret generic auto-import-secret \
    -n "${SPOKE_NAME}" \
    --from-file=kubeconfig="${TMP_DIR}/spoke-kubeconfig.yaml" 2>/dev/null || \
    oc_hub create secret generic auto-import-secret \
      -n "${SPOKE_NAME}" \
      --from-file=kubeconfig="${TMP_DIR}/spoke-kubeconfig.yaml" --dry-run=client -o yaml | oc_hub apply -f -

  oc_hub apply -f - <<EOF
apiVersion: agent.open-cluster-management.io/v1
kind: KlusterletAddonConfig
metadata:
  name: ${SPOKE_NAME}
  namespace: ${SPOKE_NAME}
spec:
  applicationManager:
    enabled: true
  certPolicyController:
    enabled: true
  policyController:
    enabled: true
  searchCollector:
    enabled: true
EOF

  wait_for "spoke ${SPOKE_NAME} joined and available" 300 \
    "spoke_is_joined"

  rm -f "${TMP_DIR}/spoke-kubeconfig.yaml"
  info "[ok] Spoke ${SPOKE_NAME} imported"
}

install_cert_manager() {
  local cm_available
  cm_available=$(oc_hub get deployment cert-manager -n cert-manager \
    -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  if [ "${cm_available:-0}" -ge 1 ]; then
    info "[ok] cert-manager already installed, skipping"
    return 0
  fi

  info "=== Installing cert-manager ${CERT_MANAGER_VERSION} ==="
  oc_hub apply -f "${CERT_MANAGER_URL}" || die "Failed to install cert-manager"
  oc_hub rollout status deployment/cert-manager -n cert-manager --timeout=120s \
    || die "cert-manager did not become ready"
  oc_hub rollout status deployment/cert-manager-cainjector -n cert-manager --timeout=120s \
    || die "cert-manager-cainjector did not become ready"
  oc_hub rollout status deployment/cert-manager-webhook -n cert-manager --timeout=120s \
    || die "cert-manager-webhook did not become ready"

  info "Waiting for cert-manager webhook TLS to be provisioned..."
  local elapsed=0
  until oc_hub apply --dry-run=server -f - <<'PROBE' &>/dev/null 2>&1
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: webhook-probe
  namespace: cert-manager
spec:
  selfSigned: {}
PROBE
  do
    if [ "${elapsed}" -ge 180 ]; then
      die "cert-manager webhook not ready after 180s"
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  info "[ok] cert-manager installed"
}

install_backend_controller() {
  local backend_available
  backend_available=$(oc_hub get deployment multicluster-mesh-controller \
    -n "${BACKEND_NAMESPACE}" \
    -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  if [ "${backend_available:-0}" -ge 1 ]; then
    info "[ok] Backend controller already running, skipping build/deploy"
    return 0
  fi

  [ -n "${MESH_ADDON_REPO}" ] && [ -f "${MESH_ADDON_REPO}/chart/Chart.yaml" ] || \
    error "multicluster-mesh-addon repo not found. Pass --mesh-addon-repo."

  info "=== Building and deploying backend controller ==="

  local registry internal_registry
  registry=$(oc_hub get image.config.openshift.io/cluster \
    -o jsonpath='{.status.externalRegistryHostnames[0]}')
  internal_registry="image-registry.openshift-image-registry.svc:5000"

  podman login --tls-verify=false \
    -u "$(oc_hub whoami | tr -d ':')" \
    -p "$(oc_hub whoami -t)" \
    "${registry}"

  oc_hub create namespace "${BACKEND_NAMESPACE}" \
    --dry-run=client -o yaml | oc_hub apply -f -

  (
    cd "${MESH_ADDON_REPO}"
    make images "IMG=${registry}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}"
  )

  podman push --tls-verify=false \
    "${registry}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}"

  helm upgrade --install "${BACKEND_IMAGE_NAME}" "${MESH_ADDON_REPO}/chart/" \
    --kube-context="${HUB_CTX}" \
    --create-namespace \
    --namespace "${BACKEND_NAMESPACE}" \
    --set "image.repository=${internal_registry}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}" \
    --set "image.tag=${BACKEND_IMAGE_TAG}" \
    --wait --timeout 180s

  oc_hub rollout status deployment/multicluster-mesh-controller \
    -n "${BACKEND_NAMESPACE}" --timeout=120s
  info "[ok] Backend controller deployed"
}

install_kiali_ossmc_on_cluster() {
  local ctx=$1
  local cluster=$2

  if ! needs_kiali_or_ossmc_on "${cluster}"; then
    return 0
  fi

  [ -n "${KIALI_REPO}" ] && [ -f "${KIALI_REPO}/Makefile" ] || \
    error "kiali server repo not found. Pass --kiali-repo."

  info "=== Installing Kiali/OSSMC stack on ${cluster} (context: ${ctx}) ==="
  oc config use-context "${ctx}"
  podman_login_cluster "${ctx}" "${cluster}"

  if cluster_selected "${cluster}" "${INSTALL_OSSMC}"; then
    [ -d "${PLUGIN_REPO}" ] || error "plugin repo not found: ${PLUGIN_REPO}"
    (
      cd "${PLUGIN_REPO}"
      make cluster-push
    )
  fi

  if cluster_selected "${cluster}" "${INSTALL_KIALI}" || \
     cluster_selected "${cluster}" "${INSTALL_OSSMC}"; then
    (
      cd "${KIALI_REPO}"
      make HELM_CHARTS_REPO_PULL=false build-ui build cluster-push operator-create
    )
  fi

  if cluster_selected "${cluster}" "${INSTALL_KIALI}"; then
    (
      cd "${KIALI_REPO}"
      make "NAMESPACE=${KIALI_NAMESPACE}" kiali-create
    )
    wait_for "Kiali deployment on ${cluster}" 600 \
      "oc_for_ctx \"${ctx}\" rollout status deployment/kiali -n ${KIALI_NAMESPACE} --timeout=10s"
  fi

  if cluster_selected "${cluster}" "${INSTALL_OSSMC}"; then
    (
      cd "${KIALI_REPO}"
      make ossmconsole-create
    )
    wait_for "OSSMConsole deployment on ${cluster}" 600 \
      "oc_for_ctx \"${ctx}\" rollout status deployment/ossmconsole -n ossmconsole --timeout=10s"
  fi

  info "[ok] Kiali/OSSMC stack installed on ${cluster}"
}

install_kiali_ossmc() {
  if [ "${INSTALL_KIALI}" = "none" ] && [ "${INSTALL_OSSMC}" = "none" ]; then
    return 0
  fi

  resolve_repos
  if needs_kiali_or_ossmc_on hub; then
    install_kiali_ossmc_on_cluster "${HUB_CTX}" hub
  fi
  if needs_kiali_or_ossmc_on spoke; then
    install_kiali_ossmc_on_cluster "${SPOKE_CTX}" spoke
  fi
}

CERT_MANAGER_TRUST_CHAIN='
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: mesh-selfsigned-issuer
spec:
  selfSigned: {}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: mesh-root-ca
spec:
  isCA: true
  commonName: Mesh Root CA
  secretName: mesh-root-ca-secret
  duration: 87600h
  renewBefore: 720h
  privateKey:
    algorithm: ECDSA
    size: 256
  issuerRef:
    name: mesh-selfsigned-issuer
    kind: Issuer
    group: cert-manager.io
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: mesh-root-ca
spec:
  ca:
    secretName: mesh-root-ca-secret
'

install_infrastructure() {
  info "=== Creating ManagedClusterSet and MCM namespaces ==="
  oc_hub apply -f - <<'EOF'
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: demo-cluster-set
EOF

  oc_hub label managedcluster local-cluster \
    cluster.open-cluster-management.io/clusterset=demo-cluster-set --overwrite \
    || die "Failed to label local-cluster"

  oc_hub label managedcluster "${SPOKE_NAME}" \
    cluster.open-cluster-management.io/clusterset=demo-cluster-set --overwrite \
    || die "Failed to label ${SPOKE_NAME}"

  oc_hub create namespace unsecure-mcm-ns --dry-run=client -o yaml | oc_hub apply -f -
  oc_hub create namespace secure-mcm-ns --dry-run=client -o yaml | oc_hub apply -f -
}

install_trust_chain() {
  info "=== Deploying cert-manager trust chain in secure-mcm-ns ==="
  echo "${CERT_MANAGER_TRUST_CHAIN}" | oc_hub apply -n secure-mcm-ns -f - \
    || die "Failed to create cert-manager trust chain"

  oc_hub wait certificate mesh-root-ca -n secure-mcm-ns --for=condition=Ready --timeout=60s \
    || die "Root CA certificate did not become ready"
}

grant_klusterlet_olm_rbac() {
  local oc_fn=$1
  local label=$2

  if "${oc_fn}" auth can-i create operatorgroups.operators.coreos.com \
      --as=system:serviceaccount:open-cluster-management-agent:klusterlet-work-sa &>/dev/null; then
    info "[ok] klusterlet on ${label} already has OLM permissions"
    return 0
  fi

  info "=== Granting klusterlet OLM permissions on ${label} ==="
  "${oc_fn}" apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: klusterlet-work-olm
  labels:
    open-cluster-management.io/aggregate-to-work: "true"
rules:
  - apiGroups: ["operators.coreos.com"]
    resources: ["operatorgroups", "subscriptions", "catalogsources", "clusterserviceversions"]
    verbs: ["create", "get", "list", "update", "patch", "delete"]
EOF
}

install_mcm_crs() {
  grant_klusterlet_olm_rbac oc_hub hub
  grant_klusterlet_olm_rbac oc_spoke spoke

  info "=== Creating MultiClusterMesh CRs ==="
  oc_hub apply -f - <<'EOF'
apiVersion: mesh.open-cluster-management.io/v1alpha1
kind: MultiClusterMesh
metadata:
  name: unsecure-mcm
  namespace: unsecure-mcm-ns
spec:
  clusterSet: demo-cluster-set
  controlPlane:
    namespace: unsecure-ns
EOF

  oc_hub apply -f - <<'EOF'
apiVersion: mesh.open-cluster-management.io/v1alpha1
kind: MultiClusterMesh
metadata:
  name: secure-mcm
  namespace: secure-mcm-ns
spec:
  clusterSet: demo-cluster-set
  controlPlane:
    namespace: secure-ns
  security:
    trust:
      certManager:
        issuerRef:
          name: mesh-root-ca
EOF
}

wait_for_mesh_ready() {
  local name=$1
  local namespace=$2
  local timeout=$3

  info "Waiting for ${namespace}/${name} to be ready (timeout: ${timeout}s)..."
  local elapsed=0
  while true; do
    local ready
    ready=$(oc_hub get multiclustermesh "${name}" -n "${namespace}" \
      -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
    if [ "${ready}" = "True" ]; then
      info "[ok] ${name} is ready"
      return 0
    fi

    local op
    op=$(oc_hub get multiclustermesh "${name}" -n "${namespace}" \
      -o jsonpath='{.status.clusterStatus[0].conditions[?(@.type=="OperatorInstalled")].reason}' 2>/dev/null || true)
    echo "  ... Operator=${op:-pending} (${elapsed}s)"

    if [ "${elapsed}" -ge "${timeout}" ]; then
      warn "Timed out waiting for ${name} (may still be reconciling)"
      return 1
    fi
    sleep 15
    elapsed=$((elapsed + 15))
  done
}

wait_for_reconciliation() {
  info "=== Waiting for controller reconciliation ==="

  oc_hub wait manifestwork multicluster-mesh-operator -n local-cluster \
    --for=condition=Applied --timeout=180s
  oc_hub wait manifestwork multicluster-mesh-operator -n "${SPOKE_NAME}" \
    --for=condition=Applied --timeout=180s

  local oc_fn csv_name
  for oc_fn in oc_hub oc_spoke; do
    local elapsed=0
    until ${oc_fn} get csv -n openshift-operators 2>/dev/null | grep -q servicemeshoperator3; do
      if [ "${elapsed}" -ge 300 ]; then
        die "Timed out waiting for OSSM operator CSV on $(${oc_fn} config current-context 2>/dev/null || echo cluster)"
      fi
      info "Waiting for OSSM operator CSV..."
      sleep 10
      elapsed=$((elapsed + 10))
    done
    csv_name=$(${oc_fn} get csv -n openshift-operators -o name 2>/dev/null | grep servicemeshoperator3 | head -1 || true)
    ${oc_fn} wait "${csv_name}" -n openshift-operators \
      --for=jsonpath='{.status.phase}'=Succeeded --timeout=300s
  done

  wait_for_mesh_ready "unsecure-mcm" "unsecure-mcm-ns" "${RECONCILE_TIMEOUT}"
  wait_for_mesh_ready "secure-mcm" "secure-mcm-ns" "${RECONCILE_TIMEOUT}"
}

install_istio_cni() {
  local oc_fn=$1
  local label=$2

  info "=== Creating IstioCNI on ${label} ==="
  ${oc_fn} create namespace istio-cni --dry-run=client -o yaml | ${oc_fn} apply -f -
  ${oc_fn} apply -f - <<'EOF'
apiVersion: sailoperator.io/v1
kind: IstioCNI
metadata:
  name: default
spec:
  namespace: istio-cni
EOF

  ${oc_fn} wait istiocni default --for=condition=Reconciled --timeout=120s \
    || warn "IstioCNI on ${label} not fully reconciled yet"
}

install_mcm_istio_crs() {
  info "=== Creating MCM-managed Istio CRs on hub ==="
  oc_hub apply -f - <<'EOF'
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: unsecure-cp
spec:
  namespace: unsecure-ns
  values:
    global:
      meshID: unsecure-mcm-ns-unsecure-mcm
      multiCluster:
        clusterName: local-cluster
      network: local-cluster
EOF

  oc_hub apply -f - <<'EOF'
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: secure-cp
spec:
  namespace: secure-ns
  values:
    global:
      meshID: secure-mcm-ns-secure-mcm
      multiCluster:
        clusterName: local-cluster
      network: local-cluster
EOF

  info "=== Creating MCM-managed Istio CRs on spoke ==="
  oc_spoke apply -f - <<EOF
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: unsecure-cp
spec:
  namespace: unsecure-ns
  values:
    global:
      meshID: unsecure-mcm-ns-unsecure-mcm
      multiCluster:
        clusterName: ${SPOKE_NAME}
      network: ${SPOKE_NAME}
EOF

  oc_spoke apply -f - <<EOF
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: secure-cp
spec:
  namespace: secure-ns
  values:
    global:
      meshID: secure-mcm-ns-secure-mcm
      multiCluster:
        clusterName: ${SPOKE_NAME}
      network: ${SPOKE_NAME}
EOF
}

install_discovered_istio_crs() {
  info "=== Creating standalone discovered Istio CRs ==="

  oc_hub create namespace discovered-hub-ns --dry-run=client -o yaml | oc_hub apply -f -
  oc_hub apply -f - <<'EOF'
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: discovered-hub-istio
spec:
  namespace: discovered-hub-ns
  values:
    global:
      meshID: discovered-hub-id
      multiCluster:
        clusterName: local-cluster
      network: network1
EOF

  oc_spoke create namespace discovered-spoke-ns --dry-run=client -o yaml | oc_spoke apply -f -
  oc_spoke apply -f - <<EOF
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: discovered-spoke-istio
spec:
  namespace: discovered-spoke-ns
  values:
    global:
      meshID: discovered-spoke-id
      multiCluster:
        clusterName: ${SPOKE_NAME}
      network: network2
EOF
}

install_istio_resources() {
  install_istio_cni oc_hub hub
  install_istio_cni oc_spoke spoke
  install_mcm_istio_crs
  install_discovered_istio_crs
}

wait_for_secure_cp_istio() {
  local cp_ns
  cp_ns=$(oc_hub get multiclustermesh secure-mcm -n secure-mcm-ns \
    -o jsonpath='{.spec.controlPlane.namespace}' 2>/dev/null || true)
  cp_ns="${cp_ns:-secure-ns}"

  # mesh-hello sidecars need a signing istiod; Istio CRs are created just before verify_install.
  for oc_fn in oc_hub oc_spoke; do
    wait_for "secure-cp Istio control plane healthy on $(${oc_fn} config current-context 2>/dev/null || echo cluster)" 600 \
      "test \"\$(${oc_fn} get istio secure-cp -n ${cp_ns} -o jsonpath='{.status.state}' 2>/dev/null)\" = Healthy && \
       test \"\$(${oc_fn} get istio secure-cp -n ${cp_ns} -o jsonpath='{.status.conditions[?(@.type==\"Ready\")].status}' 2>/dev/null)\" = True"
  done
}

install_mesh_hello() {
  if [ "${INSTALL_MESH_HELLO}" != true ]; then
    return 0
  fi

  wait_for_secure_cp_istio

  info "=== Deploying mesh-hello test application on hub (${HUB_CTX}) ==="
  "${SCRIPT_DIR}/deploy-mesh-hello.sh" \
    -c "${HUB_CTX}" -m secure-mcm -n secure-mcm-ns install

  info "=== Deploying mesh-hello test application on spoke (${SPOKE_CTX}) ==="
  "${SCRIPT_DIR}/deploy-mesh-hello.sh" \
    -c "${SPOKE_CTX}" --mcm-context "${HUB_CTX}" \
    -m secure-mcm -n secure-mcm-ns install
}

install_mesh_observability() {
  if [ "${INSTALL_MESH_HELLO}" != true ]; then
    return 0
  fi

  local obs_script="${SCRIPT_DIR}/enable-mesh-observability.sh"
  [ -f "${obs_script}" ] || error "enable-mesh-observability.sh not found: ${obs_script}"

  info "=== Enabling secure-mcm metrics on hub (${HUB_CTX}) ==="
  "${obs_script}" install \
    --hub-context "${HUB_CTX}" \
    --cluster-context "${HUB_CTX}" \
    --istio-namespace "${KIALI_NAMESPACE}" \
    --metrics-backend hub \
    --app-namespaces secure-mcm-testapp \
    --managed-cluster-name local-cluster

  local kiali_cr_args=()
  if cluster_selected spoke "${INSTALL_KIALI}"; then
    kiali_cr_args=(--kiali-cr-namespace kiali-operator)
  fi

  info "=== Enabling secure-mcm metrics on spoke (${SPOKE_CTX}) ==="
  "${obs_script}" install \
    --hub-context "${HUB_CTX}" \
    --cluster-context "${SPOKE_CTX}" \
    --istio-namespace "${KIALI_NAMESPACE}" \
    "${kiali_cr_args[@]}" \
    --metrics-backend hub \
    --app-namespaces secure-mcm-testapp \
    --managed-cluster-name "${SPOKE_NAME}"
}

uninstall_mesh_observability() {
  local obs_script="${SCRIPT_DIR}/enable-mesh-observability.sh"
  [ -f "${obs_script}" ] || return 0

  info "=== Removing secure-mcm observability from spoke (${SPOKE_CTX}) ==="
  "${obs_script}" uninstall \
    --hub-context "${HUB_CTX}" \
    --cluster-context "${SPOKE_CTX}" \
    --istio-namespace "${KIALI_NAMESPACE}" \
    --kiali-cr-namespace kiali-operator \
    --metrics-backend hub \
    --app-namespaces secure-mcm-testapp \
    --managed-cluster-name "${SPOKE_NAME}" 2>/dev/null || true

  info "=== Removing secure-mcm observability from hub (${HUB_CTX}) ==="
  "${obs_script}" uninstall \
    --hub-context "${HUB_CTX}" \
    --cluster-context "${HUB_CTX}" \
    --istio-namespace "${KIALI_NAMESPACE}" \
    --metrics-backend hub \
    --app-namespaces secure-mcm-testapp \
    --managed-cluster-name local-cluster 2>/dev/null || true
}

verify_install() {
  info "=== Verification ==="
  echo ""
  echo "MCMs:"
  oc_hub get multiclustermesh --all-namespaces
  echo ""
  echo "Istio CRs on hub:"
  oc_hub get istios --all-namespaces 2>/dev/null || true
  echo ""
  echo "Istio CRs on spoke:"
  oc_spoke get istios --all-namespaces 2>/dev/null || true
  echo ""
  echo "ManifestWorks on local-cluster:"
  oc_hub get manifestwork -n local-cluster 2>/dev/null | grep multicluster-mesh || true
  echo ""
  echo "ManifestWorks on ${SPOKE_NAME}:"
  oc_hub get manifestwork -n "${SPOKE_NAME}" 2>/dev/null | grep multicluster-mesh || true
  echo ""
  echo "OSSM operator on hub:"
  oc_hub get csv -n openshift-operators 2>/dev/null | grep servicemesh || true
  echo ""
  echo "OSSM operator on spoke:"
  oc_spoke get csv -n openshift-operators 2>/dev/null | grep servicemesh || true
  echo ""
  echo "secure-mcm clusterStatus:"
  oc_hub get multiclustermesh secure-mcm -n secure-mcm-ns \
    -o jsonpath='{.status.clusterStatus}' 2>/dev/null | jq . || true
  echo ""
  info "Done."
  info "ACM Search may take 1-2 minutes to index Istio CRs."
}

print_console_urls() {
  local hub_console spoke_console
  hub_console=$(oc_hub whoami --show-console 2>/dev/null || true)
  spoke_console=$(oc_spoke whoami --show-console 2>/dev/null || true)

  echo ""
  info "OpenShift Console URLs:"
  info "  Hub (${HUB_CTX}):     ${hub_console:-unavailable}"
  info "  Spoke (${SPOKE_CTX}): ${spoke_console:-unavailable}"
}

preflight_install() {
  info "=== Preflight checks ==="
  verify_tools
  verify_context "${HUB_CTX}" hub
  verify_context "${SPOKE_CTX}" spoke
  verify_mesh_clean oc_hub hub
  verify_mesh_clean oc_spoke spoke

  if [ "${MANAGE_ACM_INSTALL}" = "false" ]; then
    verify_acm_running
  fi
  return 0
}

do_install() {
  preflight_install
  resolve_repos

  if [ "${MANAGE_ACM_INSTALL}" = "true" ]; then
    install_acm_hub
  else
    verify_acm_running
  fi

  ensure_image_registry
  import_spoke
  install_cert_manager
  install_backend_controller
  install_infrastructure
  install_trust_chain
  install_mcm_crs
  wait_for_reconciliation
  install_kiali_ossmc
  install_istio_resources
  verify_install
  install_mesh_hello
  install_mesh_observability
  print_console_urls
}

uninstall_mesh_hello() {
  info "=== Removing mesh-hello test application from hub and spoke ==="
  "${SCRIPT_DIR}/deploy-mesh-hello.sh" \
    -c "${HUB_CTX}" -m secure-mcm -n secure-mcm-ns uninstall 2>/dev/null || true
  "${SCRIPT_DIR}/deploy-mesh-hello.sh" \
    -c "${SPOKE_CTX}" --mcm-context "${HUB_CTX}" \
    -m secure-mcm -n secure-mcm-ns uninstall 2>/dev/null || true
}

uninstall_istio_resources() {
  info "=== Removing Istio CRs ==="
  oc_hub delete istio discovered-hub-istio --ignore-not-found 2>/dev/null || true
  oc_spoke delete istio discovered-spoke-istio --ignore-not-found 2>/dev/null || true
  oc_hub delete istio unsecure-cp secure-cp --ignore-not-found 2>/dev/null || true
  oc_spoke delete istio unsecure-cp secure-cp --ignore-not-found 2>/dev/null || true

  info "=== Removing IstioCNI ==="
  oc_hub delete istiocni default --ignore-not-found 2>/dev/null || true
  oc_spoke delete istiocni default --ignore-not-found 2>/dev/null || true
  oc_hub delete namespace istio-cni --ignore-not-found 2>/dev/null || true
  oc_spoke delete namespace istio-cni --ignore-not-found 2>/dev/null || true
}

uninstall_mcms() {
  info "=== Removing MCM CRs ==="
  oc_hub delete multiclustermesh unsecure-mcm -n unsecure-mcm-ns --ignore-not-found 2>/dev/null || true
  oc_hub delete multiclustermesh secure-mcm -n secure-mcm-ns --ignore-not-found 2>/dev/null || true

  info "Waiting for ManifestWork cleanup..."
  local elapsed=0
  while true; do
    local hub_count spoke_count
    hub_count=$(oc_hub get manifestwork -n local-cluster -o name 2>/dev/null | grep multicluster-mesh | wc -l | tr -d ' ') || hub_count=0
    spoke_count=$(oc_hub get manifestwork -n "${SPOKE_NAME}" -o name 2>/dev/null | grep multicluster-mesh | wc -l | tr -d ' ') || spoke_count=0
    if [ "${hub_count}" -eq 0 ] && [ "${spoke_count}" -eq 0 ]; then
      break
    fi
    if [ "${elapsed}" -ge 120 ]; then
      warn "ManifestWorks still present after 120s, continuing cleanup"
      break
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
}

uninstall_cert_manager_stack() {
  info "=== Removing cert-manager trust chain ==="
  echo "${CERT_MANAGER_TRUST_CHAIN}" | oc_hub delete -n secure-mcm-ns -f - --ignore-not-found 2>/dev/null || true
  oc_hub delete certificate cacerts-local-cluster cacerts-"${SPOKE_NAME}" mesh-root-ca \
    -n secure-mcm-ns --ignore-not-found 2>/dev/null || true
  oc_hub delete issuer mesh-root-ca -n secure-mcm-ns --ignore-not-found 2>/dev/null || true

  if oc_hub get namespace cert-manager &>/dev/null; then
    info "=== Removing cert-manager ==="
    oc_hub delete -f "${CERT_MANAGER_URL}" --ignore-not-found 2>/dev/null || true
    oc_hub delete namespace cert-manager --ignore-not-found 2>/dev/null || true
  fi
}

uninstall_infrastructure() {
  info "=== Removing cluster labels and namespaces ==="
  oc_hub label managedcluster local-cluster \
    cluster.open-cluster-management.io/clusterset- 2>/dev/null || true
  oc_hub label managedcluster "${SPOKE_NAME}" \
    cluster.open-cluster-management.io/clusterset- 2>/dev/null || true
  oc_hub delete managedclusterset demo-cluster-set --ignore-not-found 2>/dev/null || true

  oc_hub delete namespace unsecure-mcm-ns secure-mcm-ns discovered-hub-ns \
    unsecure-ns secure-ns --ignore-not-found 2>/dev/null || true
  oc_spoke delete namespace discovered-spoke-ns unsecure-ns secure-ns \
    --ignore-not-found 2>/dev/null || true
}

uninstall_klusterlet_olm_rbac() {
  info "=== Removing klusterlet OLM RBAC ==="
  oc_hub delete clusterrole klusterlet-work-olm --ignore-not-found 2>/dev/null || true
  oc_spoke delete clusterrole klusterlet-work-olm --ignore-not-found 2>/dev/null || true
}

uninstall_sail_crds() {
  info "=== Removing OSSM operator CSVs and CRDs ==="

  delete_subscriptions_matching oc_hub hub 'servicemesh'
  delete_csvs_matching oc_hub hub 'servicemesh' 300
  delete_crds_matching oc_hub hub 'sailoperator\.io|\.istio\.io' 300

  delete_subscriptions_matching oc_spoke spoke 'servicemesh'
  delete_csvs_matching oc_spoke spoke 'servicemesh' 300
  delete_crds_matching oc_spoke spoke 'sailoperator\.io|\.istio\.io' 300
}

uninstall_kiali_ossmc_on_cluster() {
  local ctx=$1
  local cluster=$2

  resolve_repos
  [ -n "${KIALI_REPO}" ] && [ -f "${KIALI_REPO}/Makefile" ] || {
    warn "kiali repo not found; skipping operator removal on ${cluster}"
    return 0
  }

  info "=== Removing Kiali operator stack on ${cluster} ==="
  oc config use-context "${ctx}"
  (
    cd "${KIALI_REPO}"
    make operator-delete
  ) 2>/dev/null || true
}

uninstall_kiali_ossmc() {
  uninstall_kiali_ossmc_on_cluster "${HUB_CTX}" hub
  uninstall_kiali_ossmc_on_cluster "${SPOKE_CTX}" spoke
}

uninstall_backend() {
  info "=== Removing backend controller ==="
  helm uninstall "${BACKEND_IMAGE_NAME}" -n "${BACKEND_NAMESPACE}" \
    --kube-context="${HUB_CTX}" 2>/dev/null || true
  oc_hub delete namespace "${BACKEND_NAMESPACE}" --ignore-not-found 2>/dev/null || true
  delete_crds_matching oc_hub hub 'mesh\.open-cluster-management\.io' 120
}

deregister_spoke() {
  info "=== Removing spoke ${SPOKE_NAME} from ACM ==="
  oc_hub delete managedcluster "${SPOKE_NAME}" --ignore-not-found --timeout=300s 2>/dev/null || true
  oc_hub delete namespace "${SPOKE_NAME}" --ignore-not-found 2>/dev/null || true
}

uninstall_acm_spoke() {
  if [ "${MANAGE_ACM_INSTALL}" != "true" ]; then
    return 0
  fi

  info "=== Removing ACM klusterlet CSVs and CRDs from spoke ==="
  delete_subscriptions_matching oc_spoke spoke \
    'open-cluster-management|cluster-manager|multiclusterhub|klusterlet|advanced-cluster-management'
  delete_csvs_matching oc_spoke spoke \
    'open-cluster-management|cluster-manager|multiclusterhub|klusterlet|advanced-cluster-management' 300
  delete_crds_matching oc_spoke spoke '\.open-cluster-management\.io' 300
}

uninstall_acm_hub() {
  if [ "${MANAGE_ACM_INSTALL}" != "true" ]; then
    info "[ok] ACM left in place (--manage-acm-install false)"
    return 0
  fi

  info "=== Removing ACM from hub ==="
  oc_hub delete mch multiclusterhub -n open-cluster-management --ignore-not-found --timeout=600s 2>/dev/null || true
  oc_hub delete subscription acm-operator-subscription -n open-cluster-management --ignore-not-found 2>/dev/null || true

  local csv
  csv=$(oc_hub get csv -n open-cluster-management -o name 2>/dev/null | grep advanced-cluster-management | head -1 || true)
  if [ -n "${csv}" ]; then
    oc_hub delete "${csv}" -n open-cluster-management --ignore-not-found 2>/dev/null || true
  fi

  oc_hub delete operatorgroup open-cluster-management -n open-cluster-management --ignore-not-found 2>/dev/null || true
  oc_hub delete namespace open-cluster-management --ignore-not-found --timeout=600s 2>/dev/null || true

  delete_subscriptions_matching oc_hub hub \
    'advanced-cluster-management|open-cluster-management|cluster-manager|multiclusterhub|klusterlet'
  delete_csvs_matching oc_hub hub \
    'advanced-cluster-management|open-cluster-management|cluster-manager|multiclusterhub|klusterlet|submariner|volsync' 600
  delete_crds_matching oc_hub hub '\.open-cluster-management\.io' 600

  info "[ok] ACM removed from hub"
}

do_uninstall() {
  set +e
  info "=== Uninstalling multi-cluster demo resources ==="
  info "Hub context: ${HUB_CTX}"
  info "Spoke context: ${SPOKE_CTX}"
  info "manage-acm-install: ${MANAGE_ACM_INSTALL}"

  uninstall_mesh_observability
  uninstall_mesh_hello

  uninstall_istio_resources
  uninstall_mcms
  uninstall_cert_manager_stack
  uninstall_infrastructure
  uninstall_klusterlet_olm_rbac
  uninstall_sail_crds
  uninstall_kiali_ossmc
  uninstall_backend
  deregister_spoke
  uninstall_acm_spoke
  uninstall_acm_hub

  info "=== Verifying CSV and CRD cleanup ==="
  verify_operator_cleanup oc_hub hub 'servicemesh' 'sailoperator\.io|\.istio\.io|mesh\.open-cluster-management\.io'
  verify_operator_cleanup oc_spoke spoke \
    'servicemesh|open-cluster-management|cluster-manager|multiclusterhub|klusterlet|advanced-cluster-management' \
    'sailoperator\.io|\.istio\.io|\.open-cluster-management\.io'
  if [ "${MANAGE_ACM_INSTALL}" = "true" ]; then
    verify_operator_cleanup oc_hub hub \
      'advanced-cluster-management|open-cluster-management|cluster-manager|multiclusterhub|klusterlet|submariner|volsync' \
      '\.open-cluster-management\.io'
  fi

  info "Done. Demo resources removed."
  print_console_urls
}

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

parse_args "$@"

info "Hub context:        ${HUB_CTX}"
info "Spoke context:      ${SPOKE_CTX}"
info "Spoke name:         ${SPOKE_NAME}"
info "install-kiali:      ${INSTALL_KIALI}"
info "install-ossmc:      ${INSTALL_OSSMC}"
info "manage-acm-install: ${MANAGE_ACM_INSTALL}"
info "install-mesh-hello: ${INSTALL_MESH_HELLO}"

case "${COMMAND}" in
  install) do_install ;;
  uninstall) do_uninstall ;;
esac
