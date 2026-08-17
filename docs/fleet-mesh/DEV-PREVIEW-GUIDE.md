# OSSMC Fleet Service Mesh Dev Preview

## Summary

**Developer Preview.** The OSSMC Fleet Service Mesh perspective (along with the Multi Cluster Mesh Add-on) is released as a dev preview and is to be considered unsupported. Do not use this preview in production.

This document has two sections:

- [Installation Guide](#installation-guide) — how to enable the Fleet Service Mesh perspective in the OpenShift Console on an ACM hub (install the Kiali Operator, then create an OSSMConsole CR with tech preview enabled).
- [User Guide](#user-guide) — what that perspective gives you after install: a fleet inventory of meshes and control planes, their status, and links to Kiali or OSSMC when those are available.

## Installation Guide

This guide enables the **Fleet Service Mesh** perspective in the OpenShift Console on an Advanced Cluster Management (ACM) hub. After install, see the [User Guide](#user-guide).

### What you are installing

This guide installs only the OpenShift Service Mesh Console (OSSMC) by installing the Kiali Operator and creating an OSSMConsole CR. OSSMC provides the **Fleet Service Mesh** perspective.

It assumes the Multi Cluster Mesh Add-on controller is already installed on the ACM hub. The add-on reconciles `MultiClusterMesh` resources and installs mesh plumbing on managed clusters; those steps are not covered here.

A Kiali server is **not** required for Fleet Service Mesh. You can connect a Kiali instance later if you want per-mesh observability (traffic graph, metrics, and similar pages).

### Prerequisites

- An OpenShift cluster that is an **ACM hub** (a `MultiClusterHub` is running). The perspective is registered only on the hub, not on spoke clusters.
- Cluster-admin access to that hub.
- The Multi Cluster Mesh Add-on controller already installed on the hub.

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
   The CR status reports errors if the plugin failed to deploy.
2. Wait a minute or two for the OpenShift Console to load the plugin. If the Console was already open, it shows a toast titled **Web console update is available** with: "There has been an update to the web console. Ensure any changes have been saved and refresh your browser to access the latest version."
3. **Refresh the browser** (or use **Refresh web console** on that toast) so the Console reloads with the plugin enabled. After refresh, **Fleet Service Mesh** and its nav items can take about 10–15 seconds to appear ([openshift/console#16922](https://github.com/openshift/console/issues/16922)).

### 4. Confirm Fleet Service Mesh is visible

In the OpenShift Console perspective switcher (the menu that lists things like **Administrator**, **Core platform**, **Fleet management,** and perhaps others), you should see **Fleet Service Mesh**.

Open it. The sidebar should show **Overview**, **Meshes**, and **Control Planes**.

If the perspective is missing, confirm:

- You are on the ACM hub Console, not a spoke.
- `spec.internal.techPreview` is `true` on the OSSMConsole CR.
- You refreshed the browser after the plugin became ready.
- Your user can list `multiclusterhubs` on the hub (the plugin probes that API to know if it is on a hub).

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

Deleting the OSSMConsole CR removes the plugin. It does not remove ACM, the Multi Cluster Mesh Add-on, or any `MultiClusterMesh` / Istio resources.

You are now free to uninstall the Kiali Operator if you so choose. Do this via the OpenShift Console's operator management UI page.

## User Guide

This guide covers the **Fleet Service Mesh** perspective in the OpenShift Console on an ACM hub. For install steps, see the [Installation Guide](#installation-guide).

### What this perspective is

**Fleet Service Mesh** is a hub-wide inventory of Istio meshes and control planes across the ACM fleet. It answers:

- Which meshes exist, and which are managed by the Multi Cluster Mesh Add-on and which are standalone meshes that OSSMC can discover?
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
| **Managed**    | A `MultiClusterMesh` resource on the hub. The add-on installs the service mesh operator on the cluster set, and can distribute trust and discovery secrets.                      |
| **Discovered** | Istio control planes that share a mesh ID (from the Istio CR) but are **not** owned by a `MultiClusterMesh`. Includes single **standalone** control planes that have no mesh ID. |

Columns include mesh ID, name, ACM cluster set (managed meshes), cluster count, whether trust is configured (managed only), and status.

Open a row to see that mesh's details:

- **Managed mesh** — Cluster set, control-plane namespace, cert-manager issuer, OSSM operator settings, per-cluster operator status, control planes in that mesh, trust distribution, and conditions.
- **Discovered mesh** — Clusters and control planes that share that mesh ID, availability, and conditions.

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

The Multi Cluster Mesh Add-on (backend for **managed** meshes) handles plumbing: operator install on member clusters, optional trust via cert-manager, and discovery token exchange.

You still create Istio CRs (and typically Istio CNI and east-west gateways) on each cluster, often with GitOps. Fleet Service Mesh shows the result; it does not create those CRs for you.

### Related Console pages (Administrator/Core platform perspective)

With the same `spec.internal.techPreview: true` setting enabled, the left-hand **Service Mesh** menu can also list **Istios** and **Kialis** on the *local* cluster. That is single-cluster inventory. **Fleet Service Mesh** is the fleet view across ACM managed clusters.
