import type { K8sCondition } from '../types/common';
import type { EnrichedControlPlane } from '../types/istio';
import { getStatusRank } from '../utils/statusUtils';

export function worstConditions(planes: EnrichedControlPlane[]): {
  conditions: K8sCondition[] | undefined;
  rank: number;
} {
  let worstRank = -1;
  let worst: K8sCondition[] | undefined;
  for (const cp of planes) {
    const rank = getStatusRank(cp.status?.conditions);
    if (rank > worstRank) {
      worstRank = rank;
      worst = cp.status?.conditions;
    }
  }
  return { conditions: worst, rank: worstRank === -1 ? 1 : worstRank };
}

/**
 * Merges a managed mesh's own conditions with the status of its member control
 * planes: a partial control plane outage degrades the mesh, and only a full
 * outage (every correlated control plane unhealthy) marks it not ready. Control
 * planes with unknown status never worsen the mesh, and a mesh with no
 * correlated planes keeps its MCM status unchanged.
 */
export function mergeManagedMeshStatus(
  mcmConditions: K8sCondition[] | undefined,
  planes: EnrichedControlPlane[]
): { conditions: K8sCondition[] | undefined; rank: number } {
  const mcmRank = getStatusRank(mcmConditions);
  // A red MCM cannot be worsened by control planes (red is the max rank), so
  // the plane list is not examined at all in that case.
  if (mcmRank === 3 || planes.length === 0) {
    return { conditions: mcmConditions, rank: mcmRank };
  }

  // Single pass with early exit: once both an unhealthy and a not-unhealthy
  // plane have been seen, the outcome is Degraded regardless of what remains,
  // so the rest of a large plane list is never examined. Only the all-unhealthy
  // and no-unhealthy outcomes require scanning the full list.
  let sawUnhealthy = false;
  let sawNotUnhealthy = false;
  for (const cp of planes) {
    if (getStatusRank(cp.status?.conditions) >= 2) {
      sawUnhealthy = true;
    } else {
      sawNotUnhealthy = true;
    }
    if (sawUnhealthy && sawNotUnhealthy) break;
  }

  let cpRank = 0;
  if (sawUnhealthy) {
    cpRank = sawNotUnhealthy ? 2 : 3;
  }

  if (cpRank <= mcmRank) {
    return { conditions: mcmConditions, rank: mcmRank };
  }

  if (cpRank === 3) {
    return {
      conditions: [
        {
          message: 'All control planes are not ready',
          reason: 'AllControlPlanesNotReady',
          status: 'False',
          type: 'Ready'
        }
      ],
      rank: 3
    };
  }
  return {
    conditions: [
      { status: 'True', type: 'Ready' },
      {
        message: 'Some control planes are not ready',
        reason: 'SomeControlPlanesNotReady',
        status: 'False',
        type: 'ControlPlanesHealthy'
      }
    ],
    rank: 2
  };
}
