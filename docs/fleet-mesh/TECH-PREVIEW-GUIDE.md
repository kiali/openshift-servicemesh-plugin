# OSSMC Fleet Service Mesh Tech Preview

## Summary

**Technology Preview.** The OSSMC Fleet Service Mesh perspective is released as a tech preview. Technology Preview features provide early access to upcoming product innovations, enabling you to test functionality and provide feedback during the development process. However, these features are not fully supported, may not be functionally complete, and are not intended for production use.

Managed meshes in this technical preview require the Placement-capable OSSM Multicluster Mesh Add-on and its updated `MultiClusterMesh` CRD. The older Developer Preview 1 add-on uses `spec.clusterSet` and does not support the managed-mesh example below. Discovered meshes remain available without the add-on.

This document has two sections:

- [Installation Guide](#installation-guide) — how to enable the Fleet Service Mesh perspective in the OpenShift Console on an ACM hub (install the Kiali Operator, then create an OSSMConsole CR with tech preview enabled).
- [User Guide](#user-guide) — what that perspective gives you after install: a fleet inventory of meshes and control planes, their status, and links to Kiali or OSSMC when those are available.

## Installation Guide

This guide enables the **Fleet Service Mesh** perspective in the OpenShift Console on an Advanced Cluster Management (ACM) hub. After install, see the [User Guide](#user-guide).

### What you are installing

This guide installs only the OpenShift Service Mesh Console (OSSMC) by installing the Kiali Operator and creating an OSSMConsole CR. OSSMC provides the **Fleet Service Mesh** perspective.

The Multicluster Mesh Add-on controller is **not** required. If the add-on is installed on the ACM hub, the Fleet view also shows add-on managed meshes (`MultiClusterMesh` resources). Without it, the Fleet view shows only discovered and standalone meshes. Installing the add-on is not covered here.

A Kiali server is **not** required for Fleet Service Mesh. You can connect a Kiali instance later if you want per-mesh observability (traffic graph, metrics, and similar pages).

### Prerequisites

- An OpenShift cluster that is an **ACM hub** (a `MultiClusterHub` is running). The perspective is registered only on the hub, not on spoke clusters.
- Cluster-admin access to that hub.

### 1. Install the Kiali Operator

Install the Kiali Operator from OperatorHub on the **ACM hub**.

1. In the OpenShift Console, go to **Operators** → **OperatorHub**.
2. Search for **Kiali Operator**.
3. Install from the Red Hat catalog.
4. Accept the defaults and wait until the operator reports **Succeeded**.

### 2. Create an OSSMConsole CR with tech preview enabled

The operator watches the `OSSMConsole` custom resource. Creating one installs the Console plugin. **You must set** `spec.internal.techPreview` **to** `true`. Without that field, Fleet Service Mesh stays hidden.

You can create the CR from the Console or with `oc`. Use either method.

#### From the OpenShift Console

1. Open the Kiali Operator details page.
2. Create an **OpenShift Service Mesh Console** instance.
3. In the YAML view (not only the form defaults), set:

```yaml
spec:
  version: default
  internal:
    techPreview: true
```

4. Create the resource.

#### With `oc`

```bash
oc apply -f - <<'EOM'
apiVersion: kiali.io/v1alpha1
kind: OSSMConsole
metadata:
  name: ossmconsole
  namespace: openshift-operators
spec:
  version: default
  internal:
    techPreview: true
EOM
```

The operator deploys plugin resources in the same namespace as the CR. `openshift-operators` is typical; any namespace you choose is fine.

> **Note:** If an `OSSMConsole` already exists without the techPreview setting set to true, you can patch it using a command like this (confirm the name and namespace for your CR):
>
> ```bash
> oc patch ossmconsole ossmconsole -n openshift-operators --type=merge \
>   -p '{"spec":{"internal":{"techPreview":true}}}'
> ```

### 3. Wait for the plugin, then refresh the Console

1. Confirm the CR is ready:

```bash
 oc get ossmconsole -A
 oc get consoleplugin ossmconsole
```

The CR status reports errors if the plugin failed to deploy. 2. Wait a minute or two for the OpenShift Console to load the plugin. If the Console was already open, it shows a toast titled **Web console update is available** with: "There has been an update to the web console. Ensure any changes have been saved and refresh your browser to access the latest version." 3. **Refresh the browser** (or use **Refresh web console** on that toast) so the Console reloads with the plugin enabled. After refresh, **Fleet Service Mesh** and its nav items can take about 10–15 seconds to appear ([openshift/console#16922](https://github.com/openshift/console/issues/16922)).

### 4. Confirm Fleet Service Mesh is visible

In the OpenShift Console perspective switcher (the menu that lists things like **Administrator**, **Core platform**, **Fleet management,** and perhaps others), you should see **Fleet Service Mesh**.

Open it. The sidebar should show **Overview**, **Meshes**, and **Control Planes**.

If the perspective is missing, confirm:

- You are on the ACM hub Console, not a spoke.
- `spec.internal.techPreview` is `true` on the OSSMConsole CR.
- You refreshed the browser after the plugin became ready.
- Your user can list `multiclusterhubs` on the hub (the plugin probes that API to know if it is on a hub).

### Optional: create a managed mesh with a Placement

This example requires the OSSM-ACM add-on already installed on the ACM hub. Run these commands on the **hub**. ACM normally registers the hub as `local-cluster`; check `oc get managedcluster local-cluster` first. The ClusterSet is cluster scoped. Its member cluster has the ACM clusterset label. The binding, Placement, and MCM all live in `tech-preview-mesh-ns`.

Create the ManagedClusterSet and Placement:

```bash
oc apply -f - <<'EOF'
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSet
metadata:
  name: tech-preview-cluster-set
EOF

oc label managedcluster local-cluster \
  cluster.open-cluster-management.io/clusterset=tech-preview-cluster-set --overwrite

oc create namespace tech-preview-mesh-ns --dry-run=client -o yaml | oc apply -f -

oc apply -f - <<'EOF'
apiVersion: cluster.open-cluster-management.io/v1beta2
kind: ManagedClusterSetBinding
metadata:
  name: tech-preview-cluster-set
  namespace: tech-preview-mesh-ns
spec:
  clusterSet: tech-preview-cluster-set
---
apiVersion: cluster.open-cluster-management.io/v1beta1
kind: Placement
metadata:
  name: tech-preview-placement
  namespace: tech-preview-mesh-ns
spec:
  clusterSets:
  - tech-preview-cluster-set
EOF

oc wait managedclustersetbinding/tech-preview-cluster-set -n tech-preview-mesh-ns \
  --for=condition=Bound --timeout=120s
oc get placement tech-preview-placement -n tech-preview-mesh-ns -o yaml
oc get placementdecision -n tech-preview-mesh-ns \
  -l cluster.open-cluster-management.io/placement=tech-preview-placement -o yaml
```

Wait for `status.numberOfSelectedClusters: 1` and a generated PlacementDecision naming `local-cluster`. ACM creates the decisions; do not create a PlacementDecision or a policy `PlacementBinding` for this MCM. If selection is empty, check the ManagedCluster's clusterset label, the Binding's `Bound` condition, and Placement conditions in `tech-preview-mesh-ns`.

Create the MultiClusterMesh (aka MCM) custom resource:

```bash
oc apply -f - <<'EOF'
apiVersion: mesh.open-cluster-management.io/v1alpha1
kind: MultiClusterMesh
metadata:
  name: tech-preview-mesh
  namespace: tech-preview-mesh-ns
spec:
  placementRef:
    name: tech-preview-placement
  controlPlane:
    namespace: tech-preview-cp
EOF

oc get multiclustermesh tech-preview-mesh -n tech-preview-mesh-ns -o yaml
```

The add-on installs mesh plumbing for selected clusters. Its `Ready=True` condition currently confirms the operator-installation milestone; create Istio CRs separately and check their readiness. To remove this example, delete the MCM and wait for its cleanup, then delete the Placement and Binding in `tech-preview-mesh-ns`, and the namespace. Before deleting the ClusterSet, remove its label from `local-cluster`:

```bash
oc label managedcluster local-cluster cluster.open-cluster-management.io/clusterset-
oc delete managedclusterset tech-preview-cluster-set
```

### Uninstall OSSMC

Delete the OSSMConsole CR **before** uninstalling the Kiali Operator:

```bash
oc delete ossmconsole ossmconsole -n openshift-operators
```

Or, in the OpenShift Console, open the Kiali Operator details page, select the **OpenShift Service Mesh Console** tab, and choose **Delete** from the instance kebab menu.

If you remove the operator first, the CR can get stuck. Clear the finalizer only if that happens:

```bash
oc patch ossmconsole ossmconsole -n openshift-operators \
  -p '{"metadata":{"finalizers": []}}' --type=merge
```

Deleting the OSSMConsole CR removes the plugin. It does not remove ACM, the Multicluster Mesh Add-on, or any `MultiClusterMesh` / Istio resources.

You are now free to uninstall the Kiali Operator if you so choose. Do this via the OpenShift Console's operator management UI page.

## User Guide

This guide covers the **Fleet Service Mesh** perspective in the OpenShift Console on an ACM hub. For install steps, see the [Installation Guide](#installation-guide).

### What this perspective is

**Fleet Service Mesh** is a hub-wide inventory of Istio meshes and control planes across the ACM fleet. It answers:

- Which meshes exist, and which are managed by the Multicluster Mesh Add-on and which are standalone meshes that OSSMC can discover?
- Which Istio control planes run on which clusters, and are they ready?
- Where can I open Kiali or OSSMC for a given control plane, if those are installed?

It does **not** replace Kiali. There is no traffic graph, workload list, or tracing here. Those stay in Kiali or in the cluster's own OSSMC.

You do not need a Kiali server connected to OSSMC on the hub for this perspective to work.

### Open the perspective

1. Log in to the **ACM hub** OpenShift Console.
2. Open the perspective switcher (top of the navigation) and choose **Fleet Service Mesh**.

The sidebar has three pages: **Overview**, **Meshes**, and **Control Planes**.

If you do not see the perspective, tech preview is not enabled or you are not on the hub Console. See the [Installation Guide](#installation-guide).

### Overview

Landing page for fleet health.

- **Meshes** — Count of meshes and a status breakdown (ready / not ready / degraded / unknown). **View all** opens the Meshes page.
- **Control Planes** — Same idea for every Istio control plane for every mesh the hub can see. **View all** opens the Control Planes page.
- **Recent Issues** — The newest failing conditions from meshes and control planes, with links to the matching detail page.

### Meshes

A table of every mesh the hub knows about.

| Type           | Meaning                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Managed**    | A `MultiClusterMesh` resource on the hub. Its same-namespace Placement selects clusters from ClusterSets bound to that namespace; the add-on installs the operator and can distribute trust and discovery secrets. |
| **Discovered** | Istio control planes that share a mesh ID (from the Istio CR) but are **not** owned by a `MultiClusterMesh`. Includes single **standalone** control planes that have no mesh ID. |

Columns include mesh ID, name, MCM namespace and Placement (managed meshes), cluster count, whether trust is configured (managed only), and status. The Clusters number counts entries in MCM status for managed meshes; for discovered meshes it counts distinct clusters with observed Istio control planes. It is not a Placement selected-cluster count.

Managed mesh status in the list and Overview comes from the MultiClusterMesh conditions, so an add-on reconciliation failure remains visible even when its Istio control planes are healthy. Discovered mesh status comes from the observed Istio conditions. Check the Control Planes view for Istio readiness separately from the managed mesh's operator-installation status.

Open a row to see that mesh's details:

- **Managed mesh** — Placement selection status and selected/mesh/operator-installed counts, membership transitions, control-plane namespace, cert-manager issuer, OSSM operator settings, per-cluster operator status, control planes, trust distribution, and conditions. Placement and PlacementDecisions may update before MCM status converges.
- **Discovered mesh** — Clusters and control planes that share that mesh ID, availability, and conditions.

The managed mesh detail page treats cluster selection as unknown until it can verify that the Placement and its decisions are current. Selection remains unknown while the Placement data is loading, your user cannot read it, its status reflects an older policy revision, or the number of decision entries does not match the Placement's selected-cluster count. During that time, the page still shows existing mesh status, control-plane information, and trust information. It shows an empty selection only when current selection data confirms that no clusters are selected; an older MCM selection error does not override the current Placement result. When `placementRef` changes, the page loads the newly referenced Placement in the MCM namespace and warns until MCM status catches up.

A **Mesh ID Conflict** warning means the same mesh ID is used by a managed mesh and by independently discovered control planes. That usually means overlapping configuration; fix it on the Istio or `MultiClusterMesh` side.

Lists only include resources your user is allowed to read.

### Control Planes

A table of Istio CRs across managed clusters.

Each row is one control plane: mesh ID, type (**Managed**, **Discovered**, or **Standalone**), name, cluster, namespace, version, **Observe** links, created time, and status.

- **Managed** — Correlated to a `MultiClusterMesh` on the hub.
- **Discovered** — Has a mesh ID but is not owned by a `MultiClusterMesh`.
- **Standalone** — No mesh ID; treated as its own one-cluster mesh.

The **Observe** column links to Kiali and/or OSSMC when those exist for that control plane's cluster and namespace. If neither is installed there, the cell is empty.

Open a row for that control-plane's details: Istio spec summary (mesh ID, network, cluster name), conditions, and the same observability links.

### Observability links

Where the UI shows **Kiali** or **OSSMC** / **Console**:

- **Kiali** opens the standalone Kiali UI for that instance (external route).
- **OSSMC** / **Console** opens the OSSMC UI on that cluster's OpenShift Console.

Those links appear only when the matching Kiali or OSSMConsole is installed and reachable for that control plane. Fleet Service Mesh itself does not install Kiali.

### What the add-on does versus what you still own

The Multicluster Mesh Add-on (backend for **managed** meshes) handles plumbing: operator install on member clusters, optional trust via cert-manager, and discovery token exchange.

You create and manage the ManagedClusterSet, assign clusters to it, and create a ManagedClusterSetBinding and Placement in **each MCM namespace**. A Placement can select a subset of bound ClusterSets using predicates, a desired cluster count, and other rules. ACM publishes PlacementDecisions; the add-on reads them through the MCM's `spec.placementRef.name`. A `PlacementBinding` is used by consumers such as ACM policies and is not needed for this mesh reference. Deleting an MCM does not delete its Placement or ClusterSet binding, which may be shared.

You still create Istio CRs (and typically Istio CNI and east-west gateways) on each cluster, often with GitOps. Fleet Service Mesh shows the result; it does not create those CRs for you.

### Related Console pages (Administrator/Core platform perspective)

With the same `spec.internal.techPreview: true` setting enabled, the left-hand **Service Mesh** menu can also list **Istios** and **Kialis** on the _local_ cluster. That is single-cluster inventory. **Fleet Service Mesh** is the fleet view across ACM managed clusters.
