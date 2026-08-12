# Multi-Cluster Demo Environment Setup

> **Quick start:** Log in to hub and spoke OpenShift clusters (`oc login` on both; rename contexts to `my-hub` / `my-spoke` if needed). With repos cloned, run [`hack/fleet-mesh/setup-demo-multicluster.sh install`](setup-demo-multicluster.sh) to automate this guide. By default (`--manage-acm-install true`) the script installs ACM on the hub if not already present; pass `--manage-acm-install false` if ACM is already running. Use `--install-kiali`, `--install-ossmc`, and `--install-mesh-hello true` for optional install-time components (uninstall always removes Kiali, OSSMC, and mesh-hello).
>
> ```bash
> # Greenfield hub (script installs ACM if needed)
> ./hack/fleet-mesh/setup-demo-multicluster.sh \
>   --context-hub my-hub --context-spoke my-spoke \
>   --kiali-repo /path/to/kiali \
>   --mesh-addon-repo /path/to/multicluster-mesh-addon \
>   install
>
> # Existing ACM hub — do not install or remove ACM
> ./hack/fleet-mesh/setup-demo-multicluster.sh --manage-acm-install false install
>
> # Hub Fleet UI with Kiali + OSSMC
> ./hack/fleet-mesh/setup-demo-multicluster.sh \
>   --install-kiali hub --install-ossmc hub install
>
> # Full teardown (removes ACM when --manage-acm-install true, the default)
> ./hack/fleet-mesh/setup-demo-multicluster.sh uninstall
>
> # Teardown demo only, leave ACM in place
> ./hack/fleet-mesh/setup-demo-multicluster.sh --manage-acm-install false uninstall
> ```

Instructions for setting up a 6-control-plane demo environment across two OpenShift clusters.
Refer to [DEV-INSTALL.md](DEV-INSTALL.md) for general guidance on managing a dev install.
If you only have a single CRC cluster, see [DEV-INSTALL.md](DEV-INSTALL.md) instead.

This guide targets a real two-cluster ACM environment with a hub (`my-hub` context) and
a spoke (`my-spoke` context). The hub auto-registers itself as `local-cluster`, giving
two managed clusters in total. All MCM meshes span both clusters; standalone "discovered"
Istio CRs are split across clusters to show the cross-cluster discovery story.

> **Note:** This guide covers the multicluster mesh demo — backend controller, mesh
> resources, and (in Prerequisites) the OSSMC ConsolePlugin for the Fleet Service Mesh
> UI. It does **not** install the Kiali server or Kiali operator. For optional Kiali
> server installation and other dev-environment setup details, see
> [DEV-INSTALL.md](DEV-INSTALL.md).

When MCM CRs are created, the controller automatically does the following on each
managed cluster:

1. Creates the control plane namespace (with `topology.istio.io/network` label) via ManifestWork
2. Installs the OSSM operator via OLM ManifestWork (shared across meshes on the same cluster)
3. Mints per-cluster intermediate CA certificates and distributes `cacerts` secrets (only when `spec.security.trust.certManager.issuerRef` is configured)
4. Creates `ManagedServiceAccount` tokens and distributes remote secrets for cross-cluster endpoint discovery

The controller does **not** create Istio CRs, IstioCNI, east-west gateways, or RBAC
resources. After the operator is installed, you must create those manually or via GitOps
on each cluster. See section 6 below.

## Resource Layout

| MCM CR         | MCM Namespace     | CP Namespace  | Trust | Clusters                |
| -------------- | ----------------- | ------------- | ----- | ----------------------- |
| `unsecure-mcm` | `unsecure-mcm-ns` | `unsecure-ns` | No    | local-cluster, my-spoke |
| `secure-mcm`   | `secure-mcm-ns`   | `secure-ns`   | Yes   | local-cluster, my-spoke |

The controller creates the control plane namespace on each cluster via ManifestWork.
Istio CRs, IstioCNI, and east-west gateways must be created manually by the user
(directly or via GitOps) in each cluster's control plane namespace after the operator
is installed.

The standalone "discovered" Istio CRs in section 6 have no MCM association and are
created manually, each on a different cluster.

### ManifestWorks created per cluster

The backend controller creates ManifestWorks in each managed cluster's namespace on the
hub. These instruct the OCM work agent on each spoke to apply the contained resources
locally. The controller owns these ManifestWorks and deletes them automatically when the
corresponding MCM CR is removed.

| ManifestWork                          | Created by            | Per-mesh?                 |
| ------------------------------------- | --------------------- | ------------------------- |
| `multicluster-mesh-operator`          | First MCM reconcile   | No (shared across meshes) |
| `multicluster-mesh-cp-ns-{namespace}` | Each MCM              | Yes                       |
| `multicluster-mesh-cacerts`           | MCM with trust config | Yes                       |

## Prerequisites

### Required tools

- `oc` CLI installed and available in PATH
- `podman` installed
- `jq` installed
- `make` installed
- `helm` installed
- Go toolchain
- Node.js `^20.19.0 || >=22.12.0`

### Required cluster state

You need two OpenShift clusters with kubeconfig contexts named `my-hub` and `my-spoke`.

**Hub cluster with ACM:** Follow [DEV-INSTALL.md — Step 1](DEV-INSTALL.md#1-get-an-openshift-cluster-with-acm)
to set up the hub with ACM. ACM auto-registers the hub as `local-cluster`.

If need be, rename the kube context to `my-hub` after logging in; that's the name the rest of this guide uses:

```bash
oc config rename-context "$(oc config current-context)" my-hub
```

**Spoke cluster — import into ACM:** Log in to the second OpenShift cluster, rename its
context to `my-spoke` if need be, then import it into ACM from the hub using the
auto-import-secret method (ACM installs the klusterlet on the spoke automatically):

```bash
# On the spoke cluster
oc config rename-context "$(oc config current-context)" my-spoke

# From the hub, create the ManagedCluster resource (also creates the namespace)
oc --context=my-hub apply -f - <<'EOF'
apiVersion: cluster.open-cluster-management.io/v1
kind: ManagedCluster
metadata:
  name: my-spoke
  labels:
    cloud: auto-detect
    vendor: auto-detect
spec:
  hubAcceptsClient: true
  leaseDurationSeconds: 60
EOF

# Create a KlusterletAddonConfig so ACM installs its addons (search, policy, etc.)
oc --context=my-hub apply -f - <<'EOF'
apiVersion: agent.open-cluster-management.io/v1
kind: KlusterletAddonConfig
metadata:
  name: my-spoke
  namespace: my-spoke
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

# Extract the spoke's kubeconfig into a standalone file
oc config view --context=my-spoke --minify --flatten > /tmp/spoke-kubeconfig.yaml

# Create the auto-import-secret on the hub — ACM uses this to install the
# klusterlet agent on the spoke, then deletes the secret automatically
oc --context=my-hub create secret generic auto-import-secret \
  -n my-spoke \
  --from-file=kubeconfig=/tmp/spoke-kubeconfig.yaml
rm -f /tmp/spoke-kubeconfig.yaml

# Wait for the spoke to join (may take 2-3 minutes)
oc --context=my-hub wait managedcluster my-spoke \
  --for=condition=ManagedClusterJoined --timeout=300s
oc --context=my-hub wait managedcluster my-spoke \
  --for=condition=ManagedClusterConditionAvailable --timeout=300s
```

Verify both clusters are ready:

```bash
oc --context=my-hub get mch multiclusterhub -n open-cluster-management \
  -o jsonpath='{.status.phase}'
# Should output: Running

oc --context=my-hub get managedclusters
# Should show local-cluster and my-spoke as JOINED=True, AVAILABLE=True
```

### Image registry

The hub cluster's OpenShift image registry must be exposed for backend image builds:

```bash
oc --context=my-hub get image.config.openshift.io/cluster \
  -o jsonpath='{.status.externalRegistryHostnames[0]}'
```

If the output is empty, the registry is not exposed. To expose it:

```bash
oc --context=my-hub patch configs.imageregistry.operator.openshift.io/cluster \
  --type merge -p '{"spec":{"defaultRoute":true}}'
```

### cert-manager

Required on the hub for trust distribution. Check if deployed:

```bash
oc --context=my-hub get deployment cert-manager -n cert-manager
```

If not installed, deploy it:

```bash
oc --context=my-hub apply \
  -f https://github.com/cert-manager/cert-manager/releases/download/v1.20.2/cert-manager.yaml
oc --context=my-hub rollout status deployment/cert-manager \
  -n cert-manager --timeout=120s
oc --context=my-hub rollout status deployment/cert-manager-webhook \
  -n cert-manager --timeout=120s
```

### Backend controller

The multicluster-mesh-addon controller runs on the hub. Check if deployed:

```bash
oc --context=my-hub get deployment multicluster-mesh-controller \
  -n multicluster-mesh-system
```

If not installed, build and deploy it:

```bash
cd <multicluster-mesh-addon-repo>

REGISTRY=$(oc --context=my-hub get image.config.openshift.io/cluster \
  -o jsonpath='{.status.externalRegistryHostnames[0]}')
INTERNAL_REGISTRY=image-registry.openshift-image-registry.svc:5000
BACKEND_NAMESPACE=multicluster-mesh-system
BACKEND_IMAGE_NAME=multicluster-mesh-addon
BACKEND_IMAGE_TAG=dev

# Login to the OpenShift image registry
podman login --tls-verify=false \
  -u $(oc --context=my-hub whoami | tr -d ':') \
  -p $(oc --context=my-hub whoami -t) \
  ${REGISTRY}

# Create the controller namespace
oc --context=my-hub create namespace ${BACKEND_NAMESPACE} \
  --dry-run=client -o yaml | oc --context=my-hub apply -f -

# Build and push the controller image
make images IMG=${REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}
podman push --tls-verify=false \
  ${REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}

# Deploy via Helm
helm upgrade --install ${BACKEND_IMAGE_NAME} chart/ \
  --kube-context=my-hub \
  --create-namespace \
  --namespace ${BACKEND_NAMESPACE} \
  --set image.repository=${INTERNAL_REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME} \
  --set image.tag=${BACKEND_IMAGE_TAG} \
  --wait --timeout 180s

# Verify
oc --context=my-hub rollout status deployment/multicluster-mesh-controller \
  -n ${BACKEND_NAMESPACE} --timeout=120s
```

### Frontend ConsolePlugin

The Fleet Service Mesh perspective is part of the OSSMC ConsolePlugin
(`ossmconsole`). Check if deployed:

```bash
oc --context=my-hub get consoleplugin ossmconsole
```

If not installed, build and deploy it:

```bash
cd <openshift-servicemesh-plugin-repo>

# Login to the OpenShift image registry (required before pushing)
REGISTRY=$(oc --context=my-hub get image.config.openshift.io/cluster -o jsonpath='{.status.externalRegistryHostnames[0]}')
podman login --tls-verify=false \
  -u $(oc --context=my-hub whoami | tr -d ':') \
  -p $(oc --context=my-hub whoami -t) \
  ${REGISTRY}

# The Makefile has no --context flag of its own; it always operates against
# whatever your current oc/kubeconfig context is, so switch to the hub first.
oc config use-context my-hub
make cluster-deploy
```

> **Tip:** For iterative frontend development (live-reload with `make start`
> and a local Console via `make start-console`), see the "Frontend development"
> section in [DEV-INSTALL.md](DEV-INSTALL.md).

#### Tech preview gate (Fleet Service Mesh + OSSMC-Lite)

Fleet Service Mesh and OSSMC-Lite are an unsupported tech preview, off by default in production
— see [DEV-INSTALL.md — Tech preview gate](DEV-INSTALL.md#3a-tech-preview-gate) for the full
explanation of the `spec.internal.techPreview` field. For this demo:

- `make cluster-deploy` above already embeds `internal.techPreview: true` in the manifest it
  applies, so the Fleet Service Mesh perspective works immediately on whichever cluster you run
  it against — no extra step needed.
- `setup-demo-multicluster.sh --install-ossmc <hub|spoke|both>` uses `make ossmconsole-create`
  per selected cluster, which also already sets `techPreview: true` in its dev CR template — no
  extra step needed there either.
- If OSSMC was installed some other way on a cluster (hand-applied CR, existing install you
  don't want to recreate), enable it manually **on each cluster** that needs it — enabling it on
  the hub has no effect on the spoke, and vice versa:

  ```bash
  oc --context=my-hub patch ossmconsole ossmconsole -n ossmconsole --type=merge \
    -p '{"spec":{"internal":{"techPreview":true}}}'
  oc --context=my-spoke patch ossmconsole ossmconsole -n ossmconsole --type=merge \
    -p '{"spec":{"internal":{"techPreview":true}}}'
  ```

### Clean state

The following must NOT be present on either cluster:

- No OSSM operator (no CSV, no subscription, no `sailoperator.io` or `istio.io` CRDs)
- No existing MultiClusterMesh CRs
- No existing Istio CRs
- No ManagedClusterSet bound for mesh use

Verify the clean state on both clusters:

```bash
# Hub
oc --context=my-hub get csv --all-namespaces | grep -i servicemesh
# Should return nothing

oc --context=my-hub get crd | grep -E 'sailoperator|istio'
# Should return nothing

oc --context=my-hub get multiclustermesh --all-namespaces
# Should return "No resources found"

# Spoke
oc --context=my-spoke get csv --all-namespaces | grep -i servicemesh
# Should return nothing

oc --context=my-spoke get crd | grep -E 'sailoperator|istio'
# Should return nothing
```

---

## 1. Create a ManagedClusterSet

```bash
oc --context=my-hub apply -f - <<'EOF'
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: demo-cluster-set
EOF

oc --context=my-hub label managedcluster local-cluster \
  cluster.open-cluster-management.io/clusterset=demo-cluster-set --overwrite

oc --context=my-hub label managedcluster my-spoke \
  cluster.open-cluster-management.io/clusterset=demo-cluster-set --overwrite
```

## 2. Create MCM namespaces

Only MCM namespaces need to be created manually on the hub. Control plane namespaces
are created automatically by the controller via ManifestWork on each cluster.

```bash
oc --context=my-hub create namespace unsecure-mcm-ns
oc --context=my-hub create namespace secure-mcm-ns
```

## 3. Deploy cert-manager Issuer chain

The `secure-mcm` MCM uses cert-manager for trust distribution. The controller creates
Certificates in the MCM's namespace, so the Issuer must live there too.

```bash
oc --context=my-hub apply -n secure-mcm-ns -f - <<'EOF'
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
EOF
```

Wait for the root CA certificate to become Ready:

```bash
oc --context=my-hub wait certificate mesh-root-ca -n secure-mcm-ns \
  --for=condition=Ready --timeout=60s
```

## 4. Create MCM CRs

The controller installs the OSSM operator via ManifestWork, which requires the klusterlet
work agent on each cluster to have OLM permissions. By default, the klusterlet work agent
does not receive OLM permissions on either `local-cluster` or imported spoke clusters.
This step grants the necessary permissions via an OCM aggregate ClusterRole.

Check each cluster's permissions:

```bash
# Check hub's local-cluster
oc --context=my-hub auth can-i create operatorgroups.operators.coreos.com \
  --as=system:serviceaccount:open-cluster-management-agent:klusterlet-work-sa

# Check spoke
oc --context=my-spoke auth can-i create operatorgroups.operators.coreos.com \
  --as=system:serviceaccount:open-cluster-management-agent:klusterlet-work-sa
```

If either cluster outputs `no`, apply the aggregate ClusterRole on that cluster. The
klusterlet work agent uses an aggregating ClusterRole that automatically merges any
ClusterRole labeled `open-cluster-management.io/aggregate-to-work: "true"` — no
ClusterRoleBinding is needed. Skip a cluster if it already outputs `yes`.

```bash
# Hub (skip if hub already outputs "yes")
oc --context=my-hub apply -f - <<'EOF'
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

# Spoke (skip if spoke already outputs "yes")
oc --context=my-spoke apply -f - <<'EOF'
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
```

Now create both MultiClusterMesh CRs. The controller will reconcile them and perform the
following automatically on both `local-cluster` and `my-spoke`:

1. Create the control plane namespace with the cluster's network identity label
2. Install the OSSM operator via OLM ManifestWork (shared across meshes on the same cluster)
3. Distribute `cacerts` secrets (for `secure-mcm` — requires cert-manager trust chain)
4. Create `ManagedServiceAccount` tokens and distribute remote secrets for cross-cluster
  endpoint discovery

```bash
oc --context=my-hub apply -f - <<'EOF'
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

oc --context=my-hub apply -f - <<'EOF'
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
```

After MCM Status is `Ready=True`, proceed to section 6 to create Istio CRs manually. Check MCM status with:

```bash
oc --context=my-hub get multiclustermesh -A -o custom-columns='NAME:.metadata.name,NAMESPACE:.metadata.namespace,READY:.status.conditions[?(@.type=="Ready")].status'
```

## 5. Monitor reconciliation progress

```bash
# Wait for the operator ManifestWork on both clusters
oc --context=my-hub wait manifestwork multicluster-mesh-operator -n local-cluster \
  --for=condition=Applied --timeout=180s
oc --context=my-hub wait manifestwork multicluster-mesh-operator -n my-spoke \
  --for=condition=Applied --timeout=180s

# Wait for the OSSM operator CSV on the hub
until oc --context=my-hub get csv -n openshift-operators 2>/dev/null \
  | grep -q servicemeshoperator3; do
  echo "Waiting for OSSM operator CSV on hub..."
  sleep 10
done

CSV_HUB=$(oc --context=my-hub get csv -n openshift-operators -o name \
  | grep servicemeshoperator3)
oc --context=my-hub wait ${CSV_HUB} -n openshift-operators \
  --for=jsonpath='{.status.phase}'=Succeeded --timeout=300s

# Wait for the OSSM operator CSV on the spoke
until oc --context=my-spoke get csv -n openshift-operators 2>/dev/null \
  | grep -q servicemeshoperator3; do
  echo "Waiting for OSSM operator CSV on spoke..."
  sleep 10
done

CSV_SPOKE=$(oc --context=my-spoke get csv -n openshift-operators -o name \
  | grep servicemeshoperator3)
oc --context=my-spoke wait ${CSV_SPOKE} -n openshift-operators \
  --for=jsonpath='{.status.phase}'=Succeeded --timeout=300s

# Watch per-cluster OperatorInstalled condition
oc --context=my-hub get multiclustermesh unsecure-mcm -n unsecure-mcm-ns \
  -o jsonpath='{.status.clusterStatus}' | jq .
oc --context=my-hub get multiclustermesh secure-mcm -n secure-mcm-ns \
  -o jsonpath='{.status.clusterStatus}' | jq .
```

## 6. Create IstioCNI and Istio CRs on each cluster

The controller installs the operator and creates the control plane namespace, but does
**not** create Istio CRs or IstioCNI. After the operator's CSV reaches `Succeeded`,
create IstioCNI (required for OpenShift) and then an Istio CR in each control plane
namespace on each cluster.

### IstioCNI (required on both clusters before any Istio CR can become Ready)

```bash
oc --context=my-hub create namespace istio-cni --dry-run=client -o yaml \
  | oc --context=my-hub apply -f -
oc --context=my-hub apply -f - <<'EOF'
apiVersion: sailoperator.io/v1
kind: IstioCNI
metadata:
  name: default
spec:
  namespace: istio-cni
EOF

oc --context=my-spoke create namespace istio-cni --dry-run=client -o yaml \
  | oc --context=my-spoke apply -f -
oc --context=my-spoke apply -f - <<'EOF'
apiVersion: sailoperator.io/v1
kind: IstioCNI
metadata:
  name: default
spec:
  namespace: istio-cni
EOF

# Wait for IstioCNI on both clusters
oc --context=my-hub wait istiocni default \
  --for=condition=Reconciled --timeout=120s
oc --context=my-spoke wait istiocni default \
  --for=condition=Reconciled --timeout=120s
```

### Istio CRs

Each MCM requires an Istio CR on every cluster in the mesh. The Istio CR tells the OSSM
operator to deploy an `istiod` control plane in the specified namespace. The `values`
section configures multi-cluster settings: `meshID` ties the control plane to its MCM,
`network` identifies the cluster's network for split-horizon DNS, and `clusterName`
enables cross-cluster endpoint discovery.

> **Note:** In a future release, the backend controller will create and manage these Istio
> CRs automatically based on the MCM spec. For now, they must be created manually.

**Hub cluster — unsecure mesh:**

```bash
oc --context=my-hub apply -f - <<'EOF'
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
```

**Spoke cluster — unsecure mesh:**

```bash
oc --context=my-spoke apply -f - <<'EOF'
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
        clusterName: my-spoke
      network: my-spoke
EOF
```

**Hub cluster — secure mesh:**

```bash
oc --context=my-hub apply -f - <<'EOF'
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
```

**Spoke cluster — secure mesh:**

```bash
oc --context=my-spoke apply -f - <<'EOF'
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
        clusterName: my-spoke
      network: my-spoke
EOF
```

> **Note:** If you need east-west gateways for cross-cluster service discovery, create
> them manually after istiod is running. The OCM-native way to fan out Istio configuration
> consistently across clusters is a `ManifestWorkReplicaSet` referencing a `Placement`
> that targets the same ClusterSet — this creates a per-cluster `ManifestWork` for each
> cluster the Placement selects.

## 7. Create standalone Istio CRs

These "Bring Your Own" Istio CRs are independent control planes not associated with any MCM.
The frontend discovers them via ACM Search but does not consider them "managed". Each lives on a
different cluster to demonstrate cross-cluster discovery. The OSSM operator must already
be installed (the controller does this when reconciling the MCM CRs).

**On the hub:**

```bash
oc --context=my-hub create namespace discovered-hub-ns \
  --dry-run=client -o yaml | oc --context=my-hub apply -f -

oc --context=my-hub apply -f - <<'EOF'
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
```

**On the spoke:**

```bash
oc --context=my-spoke create namespace discovered-spoke-ns \
  --dry-run=client -o yaml | oc --context=my-spoke apply -f -

oc --context=my-spoke apply -f - <<'EOF'
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
        clusterName: my-spoke
      network: network2
EOF
```

## 8. Verification

```bash
# MCM CRs and their status
oc --context=my-hub get multiclustermesh --all-namespaces

# All Istio CRs on hub (2 manually-created MCM CRs + 1 standalone)
oc --context=my-hub get istios --all-namespaces

# All Istio CRs on spoke (2 manually-created MCM CRs + 1 standalone)
oc --context=my-spoke get istios --all-namespaces

# Control plane namespaces on hub (created by controller + manually created)
oc --context=my-hub get namespaces | grep -E 'unsecure|secure|discovered'

# Control plane namespaces on spoke (created by controller + manually created)
oc --context=my-spoke get namespaces | grep -E 'unsecure|secure|discovered'

# OSSM operator status on both clusters
oc --context=my-hub get csv -n openshift-operators | grep servicemesh
oc --context=my-spoke get csv -n openshift-operators | grep servicemesh

# ManifestWorks on both clusters
oc --context=my-hub get manifestwork -n local-cluster
oc --context=my-hub get manifestwork -n my-spoke

# Trust distribution (for secure-mcm)
oc --context=my-hub get certificates -n secure-mcm-ns
oc --context=my-hub get manifestwork -n local-cluster | grep cacerts
oc --context=my-hub get manifestwork -n my-spoke | grep cacerts

# Per-cluster conditions
oc --context=my-hub get multiclustermesh unsecure-mcm -n unsecure-mcm-ns \
  -o jsonpath='{.status.clusterStatus}' | jq .
oc --context=my-hub get multiclustermesh secure-mcm -n secure-mcm-ns \
  -o jsonpath='{.status.clusterStatus}' | jq .
```

Expected results:

- 2 MCMs both with `Ready=True`; per-cluster status shows `OperatorInstalled: True` on
both `local-cluster` and `my-spoke`
- Control plane namespaces (`unsecure-ns`, `secure-ns`) exist on both clusters (created
by controller) and are labeled with `topology.istio.io/network`
- OSSM operator CSV in `Succeeded` phase on both clusters
- 4 Istio CRs total (2 per cluster, created manually in section 6) plus 2 standalone
discovered CRs
- cert-manager `Certificate` resources in `secure-mcm-ns` with `Ready=True`
- `multicluster-mesh-cacerts` ManifestWork in both `local-cluster` and `my-spoke`
namespaces (for `secure-mcm`)

Note: The controller tracks only `OperatorInstalled` in the MCM status. Control plane
readiness (istiod), IstioCNI, and gateway health are visible in the Istio CRs you
created manually — check those directly on each cluster.

## 9. (Optional) Deploy the mesh-hello test application

Deploy a browser-accessible test app that shows cluster identity, cross-cluster
connectivity, and mTLS status. On a multi-cluster setup, the frontend and backend
pods run on the same cluster but communicate through the Istio mesh, demonstrating
sidecar injection and mTLS.

```bash
cd <openshift-servicemesh-plugin-repo>

# Deploy into the secure-mcm mesh (with trust — shows mTLS details)
hack/fleet-mesh/deploy-mesh-hello.sh -c my-hub -m secure-mcm -n secure-mcm-ns install
```

This creates a `secure-mcm-testapp` namespace with Istio sidecar injection,
deploys frontend and backend services, and prints a URL (OpenShift Route) you
can open in your browser (e.g. `http://mesh-hello-secure-mcm-secure-mcm-testapp.apps.hub.example.com/`).
The page auto-refreshes every 10 seconds.

To remove:

```bash
hack/fleet-mesh/deploy-mesh-hello.sh -m secure-mcm -n secure-mcm-ns uninstall
```

## Demo Tips

### Simulating a degraded cluster

To simulate a degraded state for a cluster (e.g. spoke goes unhealthy), you can delete
the operator ManifestWork on the target cluster. The controller will re-create it on the
next reconcile.

```bash
oc --context=my-hub delete manifestwork multicluster-mesh-operator -n my-spoke
```

Re-create by triggering a reconcile (e.g. annotate an MCM):

```bash
oc --context=my-hub annotate multiclustermesh unsecure-mcm -n unsecure-mcm-ns \
  reconcile-trigger="$(date +%s)" --overwrite
```

### Add a second Kiali server on the spoke

To see OSSMC-Lite be able to demote a Kiali server and promote a different Kiali server,
install a second Kiali CR on the spoke:

```bash
cd <kiali-server-repo>
oc config use-context my-spoke
make OPERATOR_INSTALL_KIALI_CR_NAMESPACE=discovered-spoke-ns \
     NAMESPACE=discovered-spoke-ns CLUSTER_WIDE_ACCESS=false \
     kiali-create
```

### Disable tech preview

Today the Fleet Service Mesh perspective and OSSMC-Lite is disabled by default. You must enable those features by setting `internal.techPreview: true` in the OSSMConsole CR. Likewise, if OSSMC has tech preview enabled but you want to disable it (for example, to see those features hidden), set `internal.techPreview: false`.

```bash
oc patch ossmconsole ossmconsole -n ossmconsole --type=merge -p '{"spec":{"internal":{"techPreview":false}}}'
```

Run this command to toggle that internal.techPreview boolean (if its `true`, this sets
it to `false`; if its `false`, this sets it to `true`):

```bash
oc patch ossmconsole ossmconsole -n ossmconsole --type=merge -p "$(oc get ossmconsole ossmconsole -n ossmconsole -o json | jq -c '{spec: {internal: {techPreview: ((.spec.internal.techPreview // false) | not)}}}')"
```

### Create test users

If you want to test with different users (as opposed to the `kubeadmin` user), there is a hack script [openshift-create-test-users.sh](https://github.com/kiali/kiali/blob/master/hack/openshift-create-test-users.sh) in the Kiali server repo that creates htpasswd users, OpenShift groups, and ClusterRoleBindings.

The examples below create two users on the spoke cluster (their passwords will be the same as their usernames):

- `bob` — bound to the existing `cluster-admin` ClusterRole (same effective access as `kubeadmin`)
- `mary` — bound to the script's default `kiali-test-user` ClusterRole (`get`/`list` on `namespaces`, `get` on `pods/log`)

```bash
cd <kiali-server-repo>

# Mary — default script permissions
./hack/openshift-create-test-users.sh \
  --context my-spoke \
  --user mary:mary:test-users

# Bob — cluster-admin (kubeadmin-equivalent)
./hack/openshift-create-test-users.sh \
  --context my-spoke \
  --role cluster-admin \
  --user bob:bob:test-users
```

OAuth pods roll out after the htpasswd secret is updated; allow ~30 seconds before logging in as the new users.

## Teardown

Reverse order of installation. Delete workloads first, then Istio resources, then MCMs
(which triggers controller cleanup of ManifestWorks), then infrastructure.

```bash
# 1. Remove the test app (skip if you never deployed it)
cd <openshift-servicemesh-plugin-repo>
hack/fleet-mesh/deploy-mesh-hello.sh -c my-hub -m unsecure-mcm -n unsecure-mcm-ns uninstall

# 2. Delete standalone Istio CRs (not managed by the controller)
oc --context=my-hub delete istio discovered-hub-istio --ignore-not-found
oc --context=my-spoke delete istio discovered-spoke-istio --ignore-not-found

# 3. Delete manually-created MCM-managed Istio CRs
oc --context=my-hub delete istio unsecure-cp --ignore-not-found
oc --context=my-hub delete istio secure-cp --ignore-not-found
oc --context=my-spoke delete istio unsecure-cp --ignore-not-found
oc --context=my-spoke delete istio secure-cp --ignore-not-found

# 4. Delete IstioCNI on both clusters
oc --context=my-hub delete istiocni default --ignore-not-found
oc --context=my-spoke delete istiocni default --ignore-not-found
oc --context=my-hub delete namespace istio-cni --ignore-not-found
oc --context=my-spoke delete namespace istio-cni --ignore-not-found

# 5. Delete MCM CRs (controller cleans up all ManifestWorks automatically)
oc --context=my-hub delete multiclustermesh unsecure-mcm -n unsecure-mcm-ns --ignore-not-found
oc --context=my-hub delete multiclustermesh secure-mcm -n secure-mcm-ns --ignore-not-found

# 6. Wait for controller-managed ManifestWorks to be cleaned up on both clusters
until [ "$(oc --context=my-hub get manifestwork -n local-cluster -o name 2>/dev/null \
  | grep multicluster-mesh | wc -l)" -eq 0 ] && \
  [ "$(oc --context=my-hub get manifestwork -n my-spoke -o name 2>/dev/null \
  | grep multicluster-mesh | wc -l)" -eq 0 ]; do
  echo "Waiting for ManifestWork cleanup..."
  sleep 5
done

# 7. Remove cert-manager trust chain and cert-manager
oc --context=my-hub delete certificate cacerts-local-cluster cacerts-my-spoke mesh-root-ca \
  -n secure-mcm-ns --ignore-not-found
oc --context=my-hub delete issuer mesh-root-ca -n secure-mcm-ns --ignore-not-found
helm uninstall cert-manager -n cert-manager --kube-context=my-hub 2>/dev/null || true
oc --context=my-hub delete namespace cert-manager --ignore-not-found

# 8. Remove cluster labels and ManagedClusterSet
oc --context=my-hub label managedcluster local-cluster \
  cluster.open-cluster-management.io/clusterset-
oc --context=my-hub label managedcluster my-spoke \
  cluster.open-cluster-management.io/clusterset-
oc --context=my-hub delete managedclusterset demo-cluster-set --ignore-not-found

# 9. Delete namespaces
oc --context=my-hub delete namespace unsecure-mcm-ns secure-mcm-ns \
  discovered-hub-ns unsecure-ns secure-ns --ignore-not-found
oc --context=my-spoke delete namespace discovered-spoke-ns \
  unsecure-ns secure-ns --ignore-not-found

# 10. Remove klusterlet OLM RBAC
oc --context=my-hub delete clusterrole klusterlet-work-olm --ignore-not-found
oc --context=my-spoke delete clusterrole klusterlet-work-olm --ignore-not-found

# 11. Remove the OSSM operator CSV and CRDs on both clusters
CSV_HUB=$(oc --context=my-hub get csv -n openshift-operators -o name 2>/dev/null \
  | grep servicemeshoperator3)
if [ -n "${CSV_HUB}" ]; then
  oc --context=my-hub delete ${CSV_HUB} -n openshift-operators
fi

CSV_SPOKE=$(oc --context=my-spoke get csv -n openshift-operators -o name 2>/dev/null \
  | grep servicemeshoperator3)
if [ -n "${CSV_SPOKE}" ]; then
  oc --context=my-spoke delete ${CSV_SPOKE} -n openshift-operators
fi

oc --context=my-hub get crd -o name \
  | grep -E 'sailoperator\.io|istio\.io' | xargs oc --context=my-hub delete --ignore-not-found 2>/dev/null
oc --context=my-spoke get crd -o name \
  | grep -E 'sailoperator\.io|istio\.io' | xargs oc --context=my-spoke delete --ignore-not-found 2>/dev/null

# 12. Remove the frontend ConsolePlugin
cd <openshift-servicemesh-plugin-repo>
make undeploy-plugin

# 13. Remove the backend controller
helm uninstall multicluster-mesh-addon -n multicluster-mesh-system --kube-context=my-hub 2>/dev/null || true
oc --context=my-hub delete namespace multicluster-mesh-system --ignore-not-found
```

