import type { ClusterMeshStatus } from '../types/multiClusterMesh';
import type { K8sCondition } from '../types/common';
import type { Placement, PlacementDecision } from '../types/placement';
import { isConditionStale } from './statusUtils';

export function getPlacementProblem(placement: Placement | null): K8sCondition | undefined {
  const conditions = placement?.status?.conditions?.filter(c => !isConditionStale(c, placement?.metadata?.generation));
  return (
    conditions?.find(c => c.type === 'PlacementMisconfigured' && c.status === 'True') ??
    conditions?.find(c => c.type === 'PlacementSatisfied' && c.status === 'False')
  );
}

export type Membership = 'selectedAndMesh' | 'selectedOnly' | 'meshOnly' | 'selectionUnavailable';

export interface MembershipRow {
  clusterName: string;
  clusterStatus?: ClusterMeshStatus;
  membership: Membership;
}

export interface DecisionSelection {
  rawCount: number;
  selectedNames: string[];
  valid: boolean;
}

export function aggregateDecisions(decisions: PlacementDecision[]): DecisionSelection {
  const names = new Set<string>();
  let rawCount = 0;
  let valid = true;
  for (const decision of decisions) {
    for (const entry of decision.status?.decisions ?? []) {
      rawCount++;
      const name = entry.clusterName?.trim();
      if (!name || names.has(name)) valid = false;
      if (name) names.add(name);
    }
  }
  return { rawCount, selectedNames: [...names].sort(), valid };
}

export function operatorInstalledCount(clusterStatuses: ClusterMeshStatus[]): number {
  return clusterStatuses.filter(cs =>
    cs.conditions?.some(condition => condition.type === 'OperatorInstalled' && condition.status === 'True')
  ).length;
}

export function buildMembershipRows(
  selectedNames: string[] | null,
  clusterStatuses: ClusterMeshStatus[]
): MembershipRow[] {
  const meshByName = new Map(clusterStatuses.map(cs => [cs.clusterName, cs]));
  const selected = selectedNames === null ? null : new Set(selectedNames);
  const allNames = new Set([...meshByName.keys(), ...(selectedNames ?? [])]);
  return [...allNames].sort().map(clusterName => {
    const clusterStatus = meshByName.get(clusterName);
    const membership: Membership =
      selected === null
        ? 'selectionUnavailable'
        : selected.has(clusterName)
          ? clusterStatus
            ? 'selectedAndMesh'
            : 'selectedOnly'
          : 'meshOnly';
    return { clusterName, clusterStatus, membership };
  });
}
