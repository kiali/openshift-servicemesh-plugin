#!/usr/bin/env bash
#
# Creates (or tears down) demo resources for the Fleet Service Mesh console plugin.
#
# When a MultiClusterMesh CR is created, the backend controller automatically:
#   - Creates the control plane namespace (auto-derived and reported in
#     status.controlPlaneNamespace, with network label) via ManifestWork
#   - Mints per-cluster intermediate CA certificates and distributes cacerts secrets
#     (only when spec.security.trust.certManager.issuerRef is configured)
#   - Creates ManagedServiceAccount tokens and distributes remote secrets for
#     cross-cluster endpoint discovery
#
# The controller does NOT install the mesh operator (a prerequisite installed
# by this script via an OLM subscription), and does NOT create Istio CRs,
# IstioCNI, east-west gateways, or RBAC resources. Those must be created
# manually or via GitOps after the operator is installed. See the note after
# install_meshes for details.
#
# Usage:
#   hack/fleet-mesh/setup-demo.sh install     # create all demo resources
#   hack/fleet-mesh/setup-demo.sh uninstall   # remove all demo resources
#
# Prerequisites (checked automatically on install):
#   - ACM 2.17 installed and MultiClusterHub in Running phase
#   - Backend controller deployed in multicluster-mesh-system
#   - oc logged in with cluster-admin privileges
#
# What this creates:
#   Infrastructure:
#     cert-manager            - installed if not already present (idempotent)
#     demo-cluster-set        - ManagedClusterSet containing local-cluster
#     {secure,unsecure}-demo-placement - one Placement and ManagedClusterSetBinding in each MCM namespace
#     cert-manager trust chain - self-signed root CA Issuer in secure-mcm-ns
#
#   MCMs (controller creates the derived CP namespace, distributes cacerts):
#     secure-mcm    - mesh with trust enabled, in secure-mcm-ns
#     unsecure-mcm  - mesh without trust, in unsecure-mcm-ns
#     Control plane namespaces are auto-derived (istio-system-<mesh>-<hash>) and
#     reported in each mesh's status.controlPlaneNamespace.
#
#   Standalone Istio CRs (created manually, not managed by any MCM):
#     discovered-standalone -> istio-discovered -> "discovered" in the UI

set -uo pipefail

RECONCILE_TIMEOUT="${RECONCILE_TIMEOUT:-300}"

die() { echo "ERROR: $*" >&2; exit 1; }

preflight() {
  echo "=== Checking prerequisites ==="

  if ! oc whoami &>/dev/null; then
    die "Not logged in to a cluster. Run 'oc login' first."
  fi
  echo "  [ok] Logged in as $(oc whoami) on $(oc whoami --show-server)"

  local ok=true

  local mch_phase
  mch_phase=$(oc get multiclusterhub -A -o jsonpath='{.items[0].status.phase}' 2>/dev/null || true)
  if [ "$mch_phase" = "Running" ]; then
    echo "  [ok] ACM MultiClusterHub is Running"
  else
    echo "  [FAIL] ACM is not installed or not ready (MultiClusterHub phase: ${mch_phase:-not found})"
    echo "         See hack/fleet-mesh/DEV-INSTALL.md for ACM setup instructions"
    ok=false
  fi

  local backend_available
  backend_available=$(oc get deployment multicluster-mesh-controller \
    -n multicluster-mesh-system \
    -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  if [ "${backend_available:-0}" -ge 1 ]; then
    echo "  [ok] Backend controller is running"
  else
    echo "  [FAIL] Backend controller is not deployed or not ready"
    echo "         See hack/fleet-mesh/DEV-INSTALL.md for backend controller build/deploy instructions"
    ok=false
  fi

  if [ "$ok" = false ]; then
    die "Prerequisites not met. Fix the issues above and re-run."
  fi
  echo ""
}

CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.20.2}"
CERT_MANAGER_URL="https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"

install_cert_manager() {
  local cm_available
  cm_available=$(oc get deployment cert-manager -n cert-manager \
    -o jsonpath='{.status.availableReplicas}' 2>/dev/null || true)
  if [ "${cm_available:-0}" -ge 1 ]; then
    echo "  cert-manager already installed, skipping."
    return
  fi

  echo "=== Installing cert-manager ${CERT_MANAGER_VERSION} ==="
  oc apply -f "${CERT_MANAGER_URL}" || die "Failed to install cert-manager"
  oc rollout status deployment/cert-manager -n cert-manager --timeout=120s \
    || die "cert-manager did not become ready"
  oc rollout status deployment/cert-manager-cainjector -n cert-manager --timeout=120s \
    || die "cert-manager-cainjector did not become ready"
  oc rollout status deployment/cert-manager-webhook -n cert-manager --timeout=120s \
    || die "cert-manager-webhook did not become ready"

  echo "  Waiting for cert-manager webhook TLS to be provisioned..."
  local elapsed=0
  until oc apply --dry-run=server -f - <<'PROBE' &>/dev/null 2>&1
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: webhook-probe
  namespace: cert-manager
spec:
  selfSigned: {}
PROBE
  do
    if [ "$elapsed" -ge 180 ]; then
      die "cert-manager webhook not ready after 180s"
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo "  [ok] cert-manager installed"
}

uninstall_cert_manager() {
  if ! oc get namespace cert-manager &>/dev/null; then
    echo "  cert-manager not installed, skipping."
    return
  fi

  echo "=== Removing cert-manager ==="
  oc delete -f "${CERT_MANAGER_URL}" --ignore-not-found 2>/dev/null || true
  oc delete namespace cert-manager --ignore-not-found 2>/dev/null || true
  echo "  [ok] cert-manager removed"
}

wait_for_mesh_ready() {
  local name=$1
  local namespace=$2
  local timeout=$3

  echo "  Waiting for ${namespace}/${name} to be ready (timeout: ${timeout}s)..."
  # TrustDistributed only exists when trust is configured; show the Ready reason
  # instead for meshes like unsecure-mcm that have no trust.
  local trust_configured
  trust_configured=$(oc get multiclustermesh "${name}" -n "${namespace}" \
    -o jsonpath='{.spec.security.trust.certManager.issuerRef.name}' 2>/dev/null || true)
  local elapsed=0
  while true; do
    local ready
    ready=$(oc get multiclustermesh "$name" -n "$namespace" \
      -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
    if [ "$ready" = "True" ]; then
      echo "  [ok] ${name} is ready"
      return 0
    fi

    local detail
    if [ -n "$trust_configured" ]; then
      local trust
      trust=$(oc get multiclustermesh "$name" -n "$namespace" \
        -o jsonpath='{.status.clusterStatus[0].conditions[?(@.type=="TrustDistributed")].reason}' 2>/dev/null || true)
      detail="Trust=${trust:-pending}"
    else
      local ready_reason
      ready_reason=$(oc get multiclustermesh "$name" -n "$namespace" \
        -o jsonpath='{.status.conditions[?(@.type=="Ready")].reason}' 2>/dev/null || true)
      detail="Ready=${ready_reason:-pending}"
    fi
    echo "  ... ${detail} (${elapsed}s)"

    if [ "$elapsed" -ge "$timeout" ]; then
      echo "  [WARN] Timed out waiting for ${name} (may still be reconciling)"
      return 1
    fi
    sleep 15
    elapsed=$((elapsed + 15))
  done
}

install_infrastructure() {
  echo "=== Creating ManagedClusterSet ==="
  oc apply -f - <<'EOF' || die "Failed to create ManagedClusterSet"
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: demo-cluster-set
EOF

  oc label managedcluster local-cluster \
    cluster.open-cluster-management.io/clusterset=demo-cluster-set --overwrite \
    || die "Failed to label local-cluster"

  echo "=== Creating MCM namespaces ==="
  oc create namespace secure-mcm-ns --dry-run=client -o yaml | oc apply -f -
  oc create namespace unsecure-mcm-ns --dry-run=client -o yaml | oc apply -f -
}

install_placements() {
  echo "=== Creating ClusterSet bindings and Placements in both MCM namespaces ==="
  oc apply -f - <<'EOF' || die "Failed to create demo bindings and Placements"
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSetBinding
metadata:
  name: demo-cluster-set
  namespace: secure-mcm-ns
spec:
  clusterSet: demo-cluster-set
---
apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: secure-demo-placement
  namespace: secure-mcm-ns
spec:
  clusterSets:
  - demo-cluster-set
---
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSetBinding
metadata:
  name: demo-cluster-set
  namespace: unsecure-mcm-ns
spec:
  clusterSet: demo-cluster-set
---
apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: unsecure-demo-placement
  namespace: unsecure-mcm-ns
spec:
  clusterSets:
  - demo-cluster-set
EOF

  local namespace placement elapsed selected decided
  for namespace in secure-mcm-ns unsecure-mcm-ns; do
    placement="${namespace%-mcm-ns}-demo-placement"
    oc wait managedclustersetbinding/demo-cluster-set -n "$namespace" \
      --for=condition=Bound --timeout=120s || die "ClusterSet binding is not Bound in $namespace"
    elapsed=0
    while true; do
      selected=$(oc get placement "$placement" -n "$namespace" \
        -o jsonpath='{.status.numberOfSelectedClusters}' 2>/dev/null || true)
      decided=$(oc get placementdecision -n "$namespace" \
        -l cluster.open-cluster-management.io/placement="$placement" \
        -o jsonpath='{range .items[*].status.decisions[*]}{.clusterName}{"\n"}{end}' 2>/dev/null \
        | sed '/^$/d' | sort -u | paste -sd, -) || decided=''
      if [ "$selected" = 1 ] && [ "$decided" = local-cluster ]; then
        echo "  [ok] $namespace/$placement selected local-cluster"
        break
      fi
      if [ "$elapsed" -ge 120 ]; then
        oc describe placement "$placement" -n "$namespace" || true
        oc get placementdecision -n "$namespace" -l cluster.open-cluster-management.io/placement="$placement" -o yaml || true
        die "Placement in $namespace did not select local-cluster"
      fi
      sleep 5
      elapsed=$((elapsed + 5))
    done
  done
}

# cert-manager trust chain for MultiClusterMesh.
# Architecture:
#   Issuer (self-signed) --> Certificate (root CA) --> Issuer (CA-backed)
# The controller uses the CA-backed Issuer to mint per-cluster intermediate CAs,
# ensuring all clusters share a common trust root.
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

install_trust_chain() {
  echo "=== Deploying cert-manager trust chain in secure-mcm-ns ==="
  echo "$CERT_MANAGER_TRUST_CHAIN" | oc apply -n secure-mcm-ns -f - \
    || die "Failed to create cert-manager trust chain"

  oc wait certificate mesh-root-ca -n secure-mcm-ns --for=condition=Ready --timeout=60s \
    || die "Root CA certificate did not become ready"
}

install_meshes() {
  # The mesh operator is a prerequisite; the controller does not install it.
  # Install the OSSM operator via an OLM subscription.
  echo "=== Installing OSSM operator subscription ==="
  oc apply -f - <<'EOF'
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: servicemesh-operator3
  namespace: openshift-operators
spec:
  channel: stable
  name: servicemeshoperator3
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  installPlanApproval: Automatic
EOF

  echo "=== Creating secure-mcm (with trust) ==="
  oc apply -f - <<'EOF' || die "Failed to create secure-mcm"
apiVersion: mesh.open-cluster-management.io/v1alpha1
kind: MultiClusterMesh
metadata:
  name: secure-mcm
  namespace: secure-mcm-ns
spec:
  placementRef:
    name: secure-demo-placement
  security:
    trust:
      certManager:
        issuerRef:
          name: mesh-root-ca
EOF

  echo "=== Creating unsecure-mcm (no trust) ==="
  oc apply -f - <<'EOF' || die "Failed to create unsecure-mcm"
apiVersion: mesh.open-cluster-management.io/v1alpha1
kind: MultiClusterMesh
metadata:
  name: unsecure-mcm
  namespace: unsecure-mcm-ns
spec:
  placementRef:
    name: unsecure-demo-placement
EOF

  echo ""
  echo "=== Waiting for controller to reconcile ==="
  wait_for_mesh_ready "secure-mcm" "secure-mcm-ns" "$RECONCILE_TIMEOUT"
  wait_for_mesh_ready "unsecure-mcm" "unsecure-mcm-ns" "$RECONCILE_TIMEOUT"
}

install_discovered() {
  echo "=== Creating standalone discovered Istio CR ==="
  echo "  (OSSM operator subscription was created in install_meshes)"
  echo "  Waiting for OSSM operator CRD to be available..."

  local elapsed=0
  until oc get crd istios.sailoperator.io &>/dev/null; do
    if [ "$elapsed" -ge 300 ]; then
      die "Timed out waiting for Istio CRD (operator not installed yet?)"
    fi
    sleep 10
    elapsed=$((elapsed + 10))
  done

  echo "=== Creating IstioCNI (required before any Istio CR can become Ready) ==="
  oc create namespace istio-cni --dry-run=client -o yaml | oc apply -f -

  oc apply -f - <<'EOF' || die "Failed to create IstioCNI"
apiVersion: sailoperator.io/v1
kind: IstioCNI
metadata:
  name: default
spec:
  version: v1.30.1
  namespace: istio-cni
EOF

  echo "  Waiting for IstioCNI to be reconciled..."
  oc wait istiocni/default --for=condition=Ready --timeout=120s 2>/dev/null || \
    echo "  [WARN] IstioCNI not fully ready yet; proceeding (may still be reconciling)."

  oc create namespace istio-discovered --dry-run=client -o yaml | oc apply -f -

  oc apply -f - <<'EOF' || die "Failed to create discovered Istio CR"
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: discovered-standalone
spec:
  namespace: istio-discovered
  values:
    global:
      meshID: standalone-mesh
      multiCluster:
        clusterName: local-cluster
      network: network-standalone
EOF
  echo "  [ok] Standalone Istio CR created"

  echo "=== Creating MCM-managed Istio CRs ==="
  # The control plane namespaces are auto-derived by the controller and
  # reported in status.controlPlaneNamespace (the meshes are ready by now,
  # so the field is populated).
  local secure_cp_ns unsecure_cp_ns
  secure_cp_ns=$(oc get multiclustermesh secure-mcm -n secure-mcm-ns \
    -o jsonpath='{.status.controlPlaneNamespace}' 2>/dev/null || true)
  unsecure_cp_ns=$(oc get multiclustermesh unsecure-mcm -n unsecure-mcm-ns \
    -o jsonpath='{.status.controlPlaneNamespace}' 2>/dev/null || true)
  [ -n "$secure_cp_ns" ] || die "secure-mcm has not reported status.controlPlaneNamespace yet"
  [ -n "$unsecure_cp_ns" ] || die "unsecure-mcm has not reported status.controlPlaneNamespace yet"
  echo "  secure-mcm CP namespace:   $secure_cp_ns"
  echo "  unsecure-mcm CP namespace: $unsecure_cp_ns"

  oc apply -f - <<EOF || die "Failed to create secure-cp Istio CR"
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: secure-cp
spec:
  namespace: ${secure_cp_ns}
  values:
    global:
      meshID: secure-mcm-ns-secure-mcm
      multiCluster:
        clusterName: local-cluster
      network: local-cluster
EOF

  oc apply -f - <<EOF || die "Failed to create unsecure-cp Istio CR"
apiVersion: sailoperator.io/v1
kind: Istio
metadata:
  name: unsecure-cp
spec:
  namespace: ${unsecure_cp_ns}
  values:
    global:
      meshID: unsecure-mcm-ns-unsecure-mcm
      multiCluster:
        clusterName: local-cluster
      network: local-cluster
EOF
  echo "  [ok] MCM-managed Istio CRs created (secure-cp, unsecure-cp)"
}

# The addon distributes Istio remote discovery secrets through ManifestWorkReplicaSet,
# which requires the ManifestWorkReplicaSet feature gate on the hub's ClusterManager.
# Without it the ManifestWorkReplicaSet objects are created but never processed —
# remote secrets are silently not distributed.
enable_mwrs_feature_gate() {
  if oc get clustermanager cluster-manager \
      -o jsonpath='{.spec.workConfiguration.featureGates[?(@.feature=="ManifestWorkReplicaSet")].mode}' 2>/dev/null \
      | grep -q Enable; then
    echo "  [ok] ManifestWorkReplicaSet feature gate already enabled"
    return 0
  fi

  echo "=== Enabling ManifestWorkReplicaSet feature gate on ClusterManager ==="
  oc patch clustermanager cluster-manager --type=merge \
    -p '{"spec":{"workConfiguration":{"featureGates":[{"feature":"ManifestWorkReplicaSet","mode":"Enable"}]}}}' \
    || die "Failed to enable ManifestWorkReplicaSet feature gate"

  # The gate deploys the hub work controller that processes ManifestWorkReplicaSets.
  local elapsed=0
  until oc rollout status deployment/cluster-manager-work-controller \
      -n open-cluster-management-hub --timeout=10s &>/dev/null; do
    if [ "$elapsed" -ge 300 ]; then
      die "Timed out waiting for cluster-manager-work-controller deployment"
    fi
    echo "  Waiting for cluster-manager-work-controller..."
    sleep 10
    elapsed=$((elapsed + 10))
  done
  echo "  [ok] cluster-manager-work-controller is available"
}

install() {
  preflight
  enable_mwrs_feature_gate
  install_cert_manager
  install_infrastructure
  install_placements
  install_trust_chain
  install_meshes
  install_discovered

  echo ""
  echo "=== Verification ==="
  echo ""
  echo "MCMs:"
  oc get multiclustermesh -A
  echo "Placements:"
  oc get placement -n secure-mcm-ns
  oc get placement -n unsecure-mcm-ns
  echo ""
  echo "ManifestWorks:"
  oc get manifestwork -n local-cluster | grep multicluster-mesh
  echo ""
  echo "ManifestWorkReplicaSets (remote secret distribution):"
  oc get manifestworkreplicaset -A
  echo ""
  echo "Istio CRs:"
  oc get istios --ignore-not-found 2>/dev/null || true
  echo ""
  echo "IstioCNI:"
  oc get istiocni --ignore-not-found 2>/dev/null || true
  echo ""
  echo "Done."
  echo "  ACM Search may take 1-2 minutes to index the Istio CRs."
  echo "  Once Istio CRs reach Ready, sidecars will be injected in labeled namespaces."
}

uninstall() {
  echo "=== Removing Istio CRs ==="
  oc delete istio discovered-standalone --ignore-not-found 2>/dev/null || true
  oc delete istio secure-cp --ignore-not-found 2>/dev/null || true
  oc delete istio unsecure-cp --ignore-not-found 2>/dev/null || true

  echo "=== Removing IstioCNI ==="
  oc delete istiocni default --ignore-not-found 2>/dev/null || true
  oc delete namespace istio-cni --ignore-not-found 2>/dev/null || true

  echo "=== Removing MCMs (controller auto-cleans ManifestWorks) ==="
  oc delete multiclustermesh secure-mcm -n secure-mcm-ns --ignore-not-found 2>/dev/null || true
  oc delete multiclustermesh unsecure-mcm -n unsecure-mcm-ns --ignore-not-found 2>/dev/null || true

  echo "  Waiting for controller to clean up ManifestWorks..."
  local elapsed=0
  while oc get manifestwork -n local-cluster 2>/dev/null | grep -q multicluster-mesh; do
    if [ "$elapsed" -ge 60 ]; then
      echo "  [WARN] ManifestWorks still present after 60s, continuing cleanup"
      break
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done

  echo "=== Removing demo Placements and ClusterSet bindings ==="
  local namespace placement
  for namespace in secure-mcm-ns unsecure-mcm-ns; do
    placement="${namespace%-mcm-ns}-demo-placement"
    oc delete placement "$placement" -n "$namespace" --ignore-not-found 2>/dev/null || true
    oc delete managedclustersetbinding demo-cluster-set -n "$namespace" --ignore-not-found 2>/dev/null || true
  done

  echo "=== Removing cert-manager trust chain ==="
  echo "$CERT_MANAGER_TRUST_CHAIN" | oc delete -n secure-mcm-ns -f - --ignore-not-found 2>/dev/null || true

  echo "=== Removing namespaces ==="
  # Control plane namespaces are labeled with the mesh identity by the controller.
  local mesh_name
  for mesh_name in secure-mcm unsecure-mcm; do
    oc delete namespace -l "mesh.open-cluster-management.io/mesh-name=${mesh_name}" \
      --ignore-not-found 2>/dev/null || true
  done
  oc delete namespace secure-mcm-ns unsecure-mcm-ns istio-discovered --ignore-not-found 2>/dev/null || true

  echo "=== Removing ManagedClusterSet ==="
  oc label managedcluster local-cluster cluster.open-cluster-management.io/clusterset- 2>/dev/null || true
  oc delete managedclusterset demo-cluster-set --ignore-not-found 2>/dev/null || true

  echo "=== Removing OSSM/Istio CRDs (OLM does not auto-delete CRDs) ==="
  oc get crd -o name | grep -E 'sailoperator|istio' | xargs oc delete --ignore-not-found 2>/dev/null || true

  uninstall_cert_manager

  echo ""
  echo "Done. All demo resources removed."
}

case "${1:-}" in
  install)
    install
    ;;
  uninstall)
    uninstall
    ;;
  *)
    echo "Usage: $0 {install|uninstall}" >&2
    exit 1
    ;;
esac
