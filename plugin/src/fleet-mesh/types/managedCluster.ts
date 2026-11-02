import type { K8sGroupVersionKind, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import type { K8sCondition } from './common';

export const managedClusterGroupVersionKind: K8sGroupVersionKind = {
  group: 'cluster.open-cluster-management.io',
  kind: 'ManagedCluster',
  version: 'v1'
};

export interface ManagedClusterStatus {
  conditions?: K8sCondition[];
}

export interface ManagedCluster extends K8sResourceCommon {
  status?: ManagedClusterStatus;
}

export type ClusterAvailability = 'available' | 'unavailable' | 'unreachable';

export function getClusterAvailability(cluster: ManagedCluster | undefined): ClusterAvailability {
  const condition = cluster?.status?.conditions?.find(c => c.type === 'ManagedClusterConditionAvailable');
  if (!condition) return 'unreachable';
  if (condition.status === 'True') return 'available';
  if (condition.status === 'False') return 'unavailable';
  return 'unreachable';
}

export function availabilityColor(availability: ClusterAvailability): 'green' | 'red' | 'grey' {
  if (availability === 'available') return 'green';
  if (availability === 'unavailable') return 'red';
  return 'grey';
}

// A dynamic t(variable) call is invisible to the locale extractor; switching
// over literal keys keeps the availability labels extractable.
export function translateAvailabilityLabel(availability: ClusterAvailability, t: (key: string) => string): string {
  switch (availability) {
    case 'available':
      return t('Available');
    case 'unavailable':
      return t('Unavailable');
    default:
      return t('Unreachable');
  }
}
