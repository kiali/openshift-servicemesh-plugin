import type { ClusterMeshStatus } from '../types/multiClusterMesh';

/**
 * Label carried by the operator Deployment of both distributions that provide
 * the sailoperator.io API: productized OSSM is built from the sail-operator
 * codebase and keeps upstream's component label. One label value covers both
 * distributions and every install method (OLM, Helm, source), unlike CSV
 * names, which embed versions, or deployment names, which differ per
 * distribution.
 */
export const operatorDeploymentLabel = 'app.kubernetes.io/component=sail-operator';

export type OperatorStatus = 'installed' | 'missing' | 'unknown';

/**
 * Per-cluster operator status derived from ACM Search; null when Search data
 * is unavailable. The map holds the `default` namespace roster plus any
 * cluster with an operator Deployment row, so a cluster absent from it is
 * Unknown, not Missing.
 */
export type OperatorStatusByCluster = Map<string, OperatorStatus> | null;

export function getOperatorStatus(statusByCluster: OperatorStatusByCluster, clusterName: string): OperatorStatus {
  if (!statusByCluster) return 'unknown';
  return statusByCluster.get(clusterName) ?? 'unknown';
}

export interface OperatorSummary {
  installed: number;
  missingClusters: string[];
  unknownClusters: string[];
}

/** Aggregates operator presence over a mesh's clusters for the mesh list column. */
export function summarizeOperatorStatus(
  clusterStatuses: ClusterMeshStatus[],
  statusByCluster: OperatorStatusByCluster
): OperatorSummary {
  const missingClusters: string[] = [];
  const unknownClusters: string[] = [];
  let installed = 0;
  for (const cs of clusterStatuses) {
    const status = getOperatorStatus(statusByCluster, cs.clusterName);
    if (status === 'installed') installed++;
    else if (status === 'missing') missingClusters.push(cs.clusterName);
    else unknownClusters.push(cs.clusterName);
  }
  return { installed, missingClusters, unknownClusters };
}
