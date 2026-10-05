import type { K8sCondition } from '../types/common';

export type StatusColor = 'green' | 'red' | 'orange' | 'grey';

export function isConditionStale(condition: K8sCondition | undefined, generation: number | undefined): boolean {
  return (
    generation !== undefined && condition?.observedGeneration !== undefined && condition.observedGeneration < generation
  );
}

// Maps K8s condition reason codes to user-friendly English strings (also the i18n keys).
const friendlyReasons: Record<string, string> = {
  ClustersNotReady: 'Clusters Not Ready',
  InstallationPending: 'Installing',
  MissingProductClaim: 'Missing Product Claim',
  NamespaceConflict: 'Namespace Conflict',
  OperatorConfigConflict: 'Operator Config Conflict',
  PlacementNotFound: 'Placement Not Found',
  NoClustersSelected: 'No Clusters Selected',
  ReconcileError: 'Reconcile Error'
};

/** Explicit keys let the locale extractor see reason labels while unknown backend reasons remain readable. */
export function translateStatusLabel(label: string, t: (key: string) => string): string {
  switch (label) {
    case 'Clusters Not Ready':
      return t('Clusters Not Ready');
    case 'Installing':
      return t('Installing');
    case 'Missing Product Claim':
      return t('Missing Product Claim');
    case 'Namespace Conflict':
      return t('Namespace Conflict');
    case 'Operator Config Conflict':
      return t('Operator Config Conflict');
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
