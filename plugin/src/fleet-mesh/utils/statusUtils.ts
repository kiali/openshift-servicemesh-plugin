import type { K8sCondition } from '../types/common';

export type StatusColor = 'green' | 'red' | 'orange' | 'grey';

export function isConditionStale(condition: K8sCondition | undefined, generation: number | undefined): boolean {
  return (
    generation !== undefined && condition?.observedGeneration !== undefined && condition.observedGeneration < generation
  );
}

// Maps K8s condition reason codes to user-friendly English strings (also the i18n keys).
const friendlyReasons: Record<string, string> = {
  AllControlPlanesNotReady: 'All Control Planes Not Ready',
  CacertsPending: 'Trust Pending',
  ClustersNotReady: 'Clusters Not Ready',
  MissingProductClaim: 'Missing Product Claim',
  NoClustersSelected: 'No Clusters Selected',
  PlacementNotFound: 'Placement Not Found',
  ReconcileError: 'Reconcile Error'
};

/** Explicit keys let the locale extractor see reason labels while unknown backend reasons remain readable. */
export function translateStatusLabel(label: string, t: (key: string) => string): string {
  switch (label) {
    case 'All Control Planes Not Ready':
      return t('All Control Planes Not Ready');
    case 'Clusters Not Ready':
      return t('Clusters Not Ready');
    case 'Trust Pending':
      return t('Trust Pending');
    case 'Missing Product Claim':
      return t('Missing Product Claim');
    case 'Placement Not Found':
      return t('Placement Not Found');
    case 'No Clusters Selected':
      return t('No Clusters Selected');
    case 'Reconcile Error':
      return t('Reconcile Error');
    default:
      return t(label);
  }
}

export function deriveStatus(
  conditions?: K8sCondition[],
  conditionType?: string
): { color: StatusColor; label: string } {
  if (!conditions || conditions.length === 0) {
    return { label: 'Unknown', color: 'grey' };
  }

  const targetType = conditionType ?? 'Ready';
  const target = conditions.find(c => c.type === targetType);
  if (target) {
    if (target.status === 'True') {
      if (targetType === 'Ready') {
        const hasDegradedSecondary = conditions.some(c => c.type !== targetType && c.status === 'False');
        if (hasDegradedSecondary) {
          return { label: 'Degraded', color: 'orange' };
        }
      }
      return { label: targetType, color: 'green' };
    }
    if (target.status === 'Unknown') {
      return { label: 'Unknown', color: 'grey' };
    }
    const reason = target.reason ?? `Not ${targetType}`;
    return { label: friendlyReasons[reason] ?? reason, color: 'red' };
  }

  const degraded = conditions.find(c => c.status !== 'True');
  if (degraded) {
    return { label: degraded.reason ?? degraded.type, color: 'orange' };
  }

  return { label: 'Healthy', color: 'green' };
}

/** Returns a numeric rank for sorting: 0 (green/healthy) through 3 (red/degraded). */
export function getStatusRank(conditions?: K8sCondition[], conditionType?: string): number {
  const { color } = deriveStatus(conditions, conditionType);
  if (color === 'green') return 0;
  if (color === 'grey') return 1;
  if (color === 'orange') return 2;
  return 3;
}
