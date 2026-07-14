# Dev Install Guide — End-to-End on CRC

Complete instructions to go from zero to a working Fleet Service Mesh perspective and backend MultiCluster Mesh addon controller (aka "the backend controller" or "the controller") on a local CRC OpenShift cluster. If you have a two-cluster ACM environment, see [DEMO-SETUP-MULTICLUSTER.md](DEMO-SETUP-MULTICLUSTER.md) instead.

> **Quick start:** After completing steps 1-3 manually (ACM cluster, backend controller, frontend plugin), run [`hack/fleet-mesh/setup-demo.sh install`](setup-demo.sh) to automate steps 4-8: cert-manager, infrastructure, trust chain, RBAC, MCM creation, IstioCNI, Istio CRs, and the standalone discovered CR. The script is idempotent — re-running it on an already-configured cluster finishes successfully without changing anything. Steps 9-11 (verification, optional Kiali install, optional test app) are not covered by the script.

## Resource Layout

| MCM CR | MCM Namespace | CP Namespace | Trust |
|--------|---------------|--------------|-------|
| `secure-mcm` | `secure-mcm-ns` | `secure-ns` | Yes |
| `unsecure-mcm` | `unsecure-mcm-ns` | `unsecure-ns` | No |
| — (standalone) | — | `istio-discovered` | — |

When reconciling an MCM CR, the backend controller:
- Creates the control plane namespace (with `topology.istio.io/network` label) via ManifestWork
- Installs the Sail/OSSM operator via OLM ManifestWork (shared across meshes on the same cluster)
- Mints per-cluster intermediate CA certificates and distributes `cacerts` secrets (when trust is configured)
- Creates `ManagedServiceAccount` tokens and distributes remote secrets for cross-cluster endpoint discovery

The backend controller does **not** create Istio CRs, IstioCNI, or east-west gateways. After the operator is installed, those must be created manually or via GitOps on each cluster. The last row is a standalone "discovered" control plane with no MCM association, created manually (step 8).

## Prerequisites

- [crc](https://crc.dev) binary installed
- A [Red Hat pull secret](https://console.redhat.com/openshift/create/local)
- `oc` installed
- `podman` installed
- `jq` installed
- `make` installed
- `helm` installed
- Node.js `^20.19.0 || >=22.12.0`
- Go toolchain

## 1. Get an OpenShift cluster with ACM

You need an OpenShift cluster with ACM (Advanced Cluster Management) 2.16+ installed. The image registry must be exposed. How you get this is up to you — any method that produces a working ACM hub cluster will work.

One option is the [install-acm.sh](https://github.com/kiali/kiali/blob/master/hack/install-acm.sh) script in the Kiali repo, which automates a full CRC/OpenShift + ACM setup. Its `init-openshift` command depends on other scripts in the same repo, so you need the [kiali server repo](https://github.com/kiali/kiali) cloned locally. All commands below are run from that repo's directory:

```bash
# Start CRC with 12 CPUs, 100GB disk, exposed image registry
./hack/install-acm.sh --crc-pull-secret-file <path-to-your-pull-secret-file> init-openshift

# Install ACM 2.16+ (operator, MultiClusterHub, observability)
# ACM 2.16+ is required for the v1beta1 addon API used by the backend Helm chart.
./hack/install-acm.sh -c release-2.17 install-acm
```

This takes 15-20 minutes. It installs the ACM operator, creates a MultiClusterHub, sets up MinIO for metrics storage, and enables observability. It also auto-registers `local-cluster` as a managed cluster (the hub acts as its own spoke).

Regardless of how you set up your cluster, verify ACM is ready before proceeding:

```bash
oc get mch multiclusterhub -n open-cluster-management -o jsonpath='{.status.phase}'
# Should output: Running

oc get managedcluster local-cluster
# Should show local-cluster as available
```

## 2. Build and deploy the backend controller

The backend controller is deployed via Helm. We build the image, push it to the OpenShift internal registry, then use `helm upgrade --install` to deploy.

```bash
cd <multicluster-mesh-addon-repo>

# Ensure the image registry external route is exposed
if ! oc get image.config.openshift.io/cluster \
  -o jsonpath='{.status.externalRegistryHostnames[0]}' 2>/dev/null | grep -q '.'; then
  echo "Exposing image registry external route..."
  oc patch configs.imageregistry.operator.openshift.io/cluster --type merge \
    -p '{"spec":{"defaultRoute":true}}'
  echo "Waiting for external route to become available..."
  until oc get image.config.openshift.io/cluster \
    -o jsonpath='{.status.externalRegistryHostnames[0]}' 2>/dev/null | grep -q '.'; do
    sleep 5
  done
fi

REGISTRY=$(oc get image.config.openshift.io/cluster \
  -o jsonpath='{.status.externalRegistryHostnames[0]}')
INTERNAL_REGISTRY=image-registry.openshift-image-registry.svc:5000
BACKEND_NAMESPACE=multicluster-mesh-system
BACKEND_IMAGE_NAME=multicluster-mesh-addon
BACKEND_IMAGE_TAG=dev

# Login to the OpenShift image registry
podman login --tls-verify=false \
  -u $(oc whoami | tr -d ':') \
  -p $(oc whoami -t) \
  ${REGISTRY}

# Create the controller namespace if it doesn't exist (required before pushing to the internal registry)
oc create namespace ${BACKEND_NAMESPACE} --dry-run=client -o yaml | oc apply -f -

# Build and push the controller image
make images IMG=${REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}
podman push --tls-verify=false ${REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}

# Deploy the controller using Helm with the internal registry image
helm upgrade --install ${BACKEND_IMAGE_NAME} chart/ \
  --create-namespace \
  --namespace ${BACKEND_NAMESPACE} \
  --set image.repository=${INTERNAL_REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME} \
  --set image.tag=${BACKEND_IMAGE_TAG} \
  --wait --timeout 180s

# Apply the MCM CRD but only if you are upgrading an already existing install.
# Helm auto-applies CRDs on the first install but skips them on upgrade.
#
# oc apply -f chart/crds/mesh.open-cluster-management.io_multiclustermeshes.yaml

# Restart the controller to ensure it picks up the new image
# (required because the image tag "dev" doesn't change between rebuilds)
oc rollout restart deployment/multicluster-mesh-controller \
  -n ${BACKEND_NAMESPACE}
oc rollout status deployment/multicluster-mesh-controller \
  -n ${BACKEND_NAMESPACE} --timeout=120s
```

## 3. Build and deploy the frontend ConsolePlugin

The Fleet Service Mesh perspective is part of the OSSMC ConsolePlugin
(`ossmconsole`). Build and deploy it from the
[openshift-servicemesh-plugin](https://github.com/kiali/openshift-servicemesh-plugin) repo:

```bash
cd <openshift-servicemesh-plugin-repo>
make fleet-mesh-cluster-deploy
```

This builds the container image, pushes it to the OpenShift internal registry under the
`ossmconsole` namespace, applies the plugin manifest, and waits for the rollout to
complete. The image is pushed into the same namespace where the plugin pod runs, so
OpenShift automatically grants pull access without needing additional image pull secrets.

## 4. Install cert-manager

Required by the backend controller for trust distribution.

```bash
oc apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.20.2/cert-manager.yaml
oc rollout status deployment/cert-manager -n cert-manager --timeout=120s
oc rollout status deployment/cert-manager-webhook -n cert-manager --timeout=120s
```

## 5. Set up infrastructure

Create the ManagedClusterSet and MCM namespaces.

```bash
# Create a ManagedClusterSet and bind local-cluster to it
oc apply -f - <<'EOF'
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: demo-cluster-set
EOF

oc label managedcluster local-cluster \
  cluster.open-cluster-management.io/clusterset=demo-cluster-set --overwrite

# Create MCM namespaces
oc create namespace secure-mcm-ns
oc create namespace unsecure-mcm-ns
```

## 6. Set up the trust chain

Deploy a cert-manager trust chain in the secure mesh's namespace. This
establishes the root CA that the controller will use to mint per-cluster
intermediate certificates for mTLS.

```bash
oc apply -n secure-mcm-ns -f - <<'EOF'
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

# Wait for the root CA to be ready
oc wait certificate mesh-root-ca -n secure-mcm-ns --for=condition=Ready --timeout=60s
```

## 7. Create meshes

The backend controller installs the Sail operator via ManifestWork, which requires the klusterlet work agent to have OLM permissions. On production OpenShift clusters imported into ACM, the klusterlet receives `cluster-admin` during the import process and this step is unnecessary. On CRC/single-cluster setups where `local-cluster` is auto-registered as its own spoke, only scoped permissions are granted.

Check whether the permission is already present:

```bash
oc auth can-i create operatorgroups.operators.coreos.com \
  --as=system:serviceaccount:open-cluster-management-agent:klusterlet-work-sa
```

If it outputs `yes`, skip ahead to creating the MCMs below. If it outputs `no`, apply the following ClusterRole to extend the work agent's capabilities:

```bash
# The klusterlet work agent's permissions are controlled by an aggregating ClusterRole
# (open-cluster-management:klusterlet-work:aggregate) that automatically merges any
# ClusterRole labeled "open-cluster-management.io/aggregate-to-work: true".
# On real spoke clusters imported via the ACM console, the work SA gets cluster-admin
# and this is not needed. On local-cluster (hub acting as its own spoke), the
# auto-registration only grants the scoped "admin" role which covers Subscriptions
# but not OperatorGroups. This ClusterRole fills that gap — no ClusterRoleBinding is
# needed because the aggregate mechanism handles the binding automatically.
oc apply -f - <<'EOF'
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

Verify the permission is now in effect:

```bash
oc auth can-i create operatorgroups.operators.coreos.com \
  --as=system:serviceaccount:open-cluster-management-agent:klusterlet-work-sa
# Should output: yes
```

Create both MultiClusterMesh CRs. The controller will create the control plane
namespace and install the operator on `local-cluster`. It will also distribute
`cacerts` trust certificates for `secure-mcm`.

After `Ready=True`, proceed to step 7a to create Istio CRs manually.

```bash
# secure-mcm: mesh with trust enabled
oc apply -f - <<'EOF'
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

# unsecure-mcm: mesh without trust
oc apply -f - <<'EOF'
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
```

Monitor the controller's progress:

```bash
# Watch OperatorInstalled condition per cluster
oc get multiclustermesh secure-mcm -n secure-mcm-ns \
  -o jsonpath='{.status.clusterStatus}' | jq .
oc get multiclustermesh unsecure-mcm -n unsecure-mcm-ns \
  -o jsonpath='{.status.clusterStatus}' | jq .

# Check ManifestWorks created by the controller
oc get manifestwork -n local-cluster | grep multicluster-mesh
```

## 7a. Create IstioCNI and Istio CRs on each cluster

The controller installs the operator and creates the control plane namespace, but does
**not** create Istio CRs or IstioCNI. The Sail operator requires a cluster-wide `IstioCNI`
resource before any Istio control plane can start. After the operator's CSV reaches
`Succeeded`, create the IstioCNI singleton and then an Istio CR in each control plane
namespace.

```bash
# Wait for the Sail operator CSV
until oc get csv -n openshift-operators 2>/dev/null | grep -q servicemeshoperator3; do
  echo "Waiting for Sail operator CSV..."
  sleep 10
done

# Create the cluster-wide IstioCNI (required before any Istio CR will become Ready)
oc create namespace istio-cni --dry-run=client -o yaml | oc apply -f -

oc apply -f - <<'EOF'
apiVersion: sailoperator.io/v1
kind: IstioCNI
metadata:
  name: default
spec:
  version: v1.30.1
  namespace: istio-cni
EOF

# Wait for IstioCNI to be reconciled
echo "Waiting for IstioCNI to be ready..."
oc wait istiocni/default --for=condition=Ready --timeout=120s 2>/dev/null || \
  echo "IstioCNI not yet fully ready (may still be reconciling); proceeding with Istio CRs."

# Create Istio CR for secure-mcm
oc apply -f - <<'EOF'
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

# Create Istio CR for unsecure-mcm
oc apply -f - <<'EOF'
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

> **Note:** If you need east-west gateways for cross-cluster service discovery, create
> them after istiod is running. The OCM-native way to fan out Istio configuration
> consistently across clusters is a `ManifestWorkReplicaSet` referencing a `Placement`
> that targets the same ClusterSet — this creates a per-cluster `ManifestWork` for each
> cluster the Placement selects. This guide will not cover this topic.

## 8. (Optional) Create a standalone discovered Istio CR

The Control Planes page discovers all `Istio` CRs across managed clusters via
ACM Search — including ones not managed by any MultiClusterMesh. These appear
as "discovered" control planes in the UI.

```bash
# Create a standalone Istio CR not associated with any MCM
oc create namespace istio-discovered --dry-run=client -o yaml | oc apply -f -

oc apply -f - <<'EOF'
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

# Verify all Istio CRs (2 manually-created MCM CRs + 1 standalone discovered)
oc get istios --all-namespaces
```

The **Control Planes** page in the Fleet Service Mesh perspective polls ACM Search
every 30 seconds. After the search collector indexes the Istio CRs (typically
within 1-2 minutes), they will appear in the table.
```

## 9. Verify

1. Open the CRC console: `oc whoami --show-console`
2. Log in as a user with kubeadmin permissions
3. Click the perspective switcher (top-left dropdown)
4. Select **Fleet Service Mesh**
5. The **Overview** page should appear with donut charts for Meshes and Control Planes health
6. Click **Meshes** in the left nav — the table should show `secure-mcm` and `unsecure-mcm` with their statuses
7. Click a mesh to see per-cluster conditions: Operator (`OperatorInstalled`)
8. Click **Control Planes** in the left nav — it shows all Istio CRs (managed + discovered)

## 10. (Optional) Install Kiali server for OSSMC/Service Mesh perspective

If you want to test the OSSMC/Service Mesh perspective (the Kiali UI integration),
install a Kiali server using the kiali helm-charts repo. This does NOT require the
Kiali operator — it deploys the server directly via Helm.

**Prerequisites:** You need the [kiali/helm-charts](https://github.com/kiali/helm-charts)
repo cloned locally with the charts already built (`make build-helm-charts`).

```bash
cd <kiali-helm-charts-repo>

# Build the charts (if not already done)
make build-helm-charts

# Install the Kiali server into the istio-system namespace (or whichever
# namespace your Istio control plane uses). The auth strategy defaults to
# "openshift" on OCP which uses OAuth — no additional auth config needed.
helm install kiali-server _output/charts/kiali-server \
  --namespace istio-system \
  --set external_services.istio.root_namespace=istio-system

# Wait for the Kiali pod to be ready
oc rollout status deployment/kiali -n istio-system --timeout=120s

# Verify the route was created
oc get route kiali -n istio-system
```

Once Kiali is running, the `KIALI_AVAILABLE` flag handler in the OSSMC plugin will
detect it, and the **Service Mesh** nav section in the Core Platform (admin) perspective
will become functional.

To remove:

```bash
helm uninstall kiali-server --namespace istio-system
```

## 11. (Optional) Deploy the mesh-hello test application

Deploy a browser-accessible test app that shows cluster identity, cross-cluster
connectivity, and mTLS status:

```bash
cd <openshift-servicemesh-plugin-repo>

# Deploy into the secure-mcm mesh (with trust — shows mTLS details)
hack/fleet-mesh/deploy-mesh-hello.sh -m secure-mcm -n secure-mcm-ns install
```

The script creates a `secure-mcm-testapp` namespace with Istio sidecar injection,
deploys the frontend and backend, and prints a URL you can open in your browser
(e.g. `http://mesh-hello-secure-mcm-secure-mcm-testapp.apps-crc.testing/` on CRC).
The page auto-refreshes every 10 seconds showing the frontend's identity,
the backend's cross-cluster response, and mTLS certificate details.

To remove:

```bash
hack/fleet-mesh/deploy-mesh-hello.sh -m secure-mcm -n secure-mcm-ns uninstall
```

## Frontend Development

### Fast iteration (local webpack)

For day-to-day fleet-mesh UI work, run the plugin locally with webpack and a local
OpenShift Console bridge. All commands run from the
[openshift-servicemesh-plugin](https://github.com/kiali/openshift-servicemesh-plugin) repo.

**Prerequisites:** `oc login`, ACM and backend controller deployed on the cluster, Node.js `^20.19.0 || >=22.12.0`, `podman` or `docker`.

```bash
cd <openshift-servicemesh-plugin-repo>
make fleet-mesh-prepare-dev-env   # one-time, or after package.json changes
```

Run in **two terminals**:

```bash
# Terminal 1 — webpack dev server on localhost:9001 (combined OSSMC + fleet-mesh plugin)
make fleet-mesh-start

# Terminal 2 — local OpenShift Console on localhost:9000
make fleet-mesh-start-console
```

`fleet-mesh-start-console` automatically port-forwards the in-cluster ACM and MCE
console plugins (ports 9002 and 9003) so Fleet Management perspective and cross-plugin
links work. Port-forwards are stopped when you exit (Ctrl+C). Set
`LOAD_ACM_PLUGINS=false` to skip ACM/MCE if you do not need Fleet Management links.
Set `KIALI_URL=<url>` to also proxy the Kiali backend for the OSSMC/Service Mesh side.

Open http://localhost:9000 and switch to the **Fleet Service Mesh** perspective. After
editing source files, wait for webpack to rebuild and refresh the browser.

### Cluster deploy (production-like)

For production-like testing (nginx/TLS packaging, in-cluster ConsolePlugin):

```bash
cd <openshift-servicemesh-plugin-repo>
make fleet-mesh-cluster-deploy
```

## Backend Development

After modifying backend Go code, rebuild the image, push it to the cluster registry, update the CRD if it changed, and restart the controller:

```bash
cd <multicluster-mesh-addon-repo>

REGISTRY=$(oc get image.config.openshift.io/cluster \
  -o jsonpath='{.status.externalRegistryHostnames[0]}')
BACKEND_NAMESPACE=multicluster-mesh-system
BACKEND_IMAGE_NAME=multicluster-mesh-addon
BACKEND_IMAGE_TAG=dev

make images IMG=${REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}
podman push --tls-verify=false \
  ${REGISTRY}/${BACKEND_NAMESPACE}/${BACKEND_IMAGE_NAME}:${BACKEND_IMAGE_TAG}

# Update the CRD if types.go changed (Helm does not update CRDs on upgrade)
oc apply -f chart/crds/mesh.open-cluster-management.io_multiclustermeshes.yaml

oc rollout restart deployment/multicluster-mesh-controller \
  -n ${BACKEND_NAMESPACE}
oc rollout status deployment/multicluster-mesh-controller \
  -n ${BACKEND_NAMESPACE} --timeout=120s
```

## Teardown

To fully tear down everything (including items installed in steps 1-3, 10, 11):

```bash
cd <openshift-servicemesh-plugin-repo>

# Remove the test app (step 11) — skip if you never deployed it
hack/fleet-mesh/deploy-mesh-hello.sh -m secure-mcm -n secure-mcm-ns uninstall

# Remove Kiali server (step 10) — skip if you never installed it
helm uninstall kiali-server --namespace istio-system

# Remove all demo resources (steps 4-8): cert-manager, infrastructure, trust,
# RBAC, MCMs, IstioCNI, Istio CRs, standalone discovered CR
hack/fleet-mesh/setup-demo.sh uninstall

# Remove the frontend plugin (step 3)
make undeploy-plugin

# Remove the backend controller (step 2)
helm uninstall multicluster-mesh-addon -n multicluster-mesh-system
oc delete namespace multicluster-mesh-system --ignore-not-found

# Remove Sail/Istio CRDs left behind by OLM (operator removal does not auto-delete CRDs)
oc get crd -o name | grep -E 'sailoperator|istio' | xargs oc delete --ignore-not-found
```
