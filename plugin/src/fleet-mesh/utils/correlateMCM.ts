import type { MultiClusterMesh } from '../types/multiClusterMesh';

export interface McmInfo {
  name: string;
  namespace: string;
}

// Correlation determines whether an Istio control plane is managed by a
// MultiClusterMesh. A MultiClusterMesh declares intent to manage Istio on a
// set of clusters; the controller creates the actual Istio CRs. We match a
// discovered Istio CR back to its managing MCM by checking two things:
//   1. The cluster running this control plane appears in the MCM's status.clusterStatus[]
//   2. The control plane namespace (Istio.spec.namespace) matches the MCM's
//      status.controlPlaneNamespace (auto-derived by the controller)
// If both match, the control plane is considered managed by that MCM.
// Note: this is a best-effort correlation — an independently created Istio CR
// that happens to be on the same cluster+namespace as an MCM will also match.

/**
 * Builds a lookup index from MultiClusterMesh objects for O(1) correlation.
 * Key: "clusterName/controlPlaneNamespace" -> MCM identity.
 * Callers should memoize the result (e.g. via useMemo keyed on the MCMs array)
 * to avoid rebuilding the index on every render.
 */
export function buildMcmIndex(mcms: MultiClusterMesh[]): Map<string, McmInfo> {
  const map = new Map<string, McmInfo>();
  for (const mcm of mcms) {
    // The controller writes clusterStatus and controlPlaneNamespace in the same
    // status update; an MCM reporting clusters without a namespace is not a
    // realistic state, and correlating it would be guesswork.
    const cpNs = mcm.status?.controlPlaneNamespace;
    if (!cpNs) continue;
    for (const cs of mcm.status?.clusterStatus ?? []) {
      const key = `${cs.clusterName}/${cpNs}`;
      if (map.has(key)) {
        // eslint-disable-next-line no-console -- collision is silent in UI; error log aids production diagnosis
        console.error(
          `MCM index collision: [${key}] claimed by both [${map.get(key)!.name}] and [${mcm.metadata?.name}]`
        );
      }
      map.set(key, {
        name: mcm.metadata?.name ?? '',
        namespace: mcm.metadata?.namespace ?? ''
      });
    }
  }
  return map;
}

/** Looks up a control plane's managing MCM from a pre-built index. */
export function lookupMcm(
  index: Map<string, McmInfo>,
  clusterName: string,
  controlPlaneNamespace: string | undefined
): McmInfo | undefined {
  // Control planes are only correlated once their namespace is known (post-enrichment);
  // correlating without it would match arbitrary MCMs on the same cluster.
  if (!controlPlaneNamespace) return undefined;
  return index.get(`${clusterName}/${controlPlaneNamespace}`);
}
