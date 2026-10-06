import type { K8sGroupVersionKind, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import type { K8sCondition } from './common';

export const placementGroupVersionKind: K8sGroupVersionKind = {
  group: 'cluster.open-cluster-management.io',
  kind: 'Placement',
  version: 'v1beta1'
};

export const placementDecisionGroupVersionKind: K8sGroupVersionKind = {
  group: 'cluster.open-cluster-management.io',
  kind: 'PlacementDecision',
  version: 'v1beta1'
};

export const managedClusterSetGroupVersionKind: K8sGroupVersionKind = {
  group: 'cluster.open-cluster-management.io',
  kind: 'ManagedClusterSet',
  version: 'v1beta2'
};

export interface Placement extends K8sResourceCommon {
  spec?: {
    clusterSets?: string[];
    decisionStrategy?: unknown;
    numberOfClusters?: number;
    predicates?: unknown[];
    prioritizerPolicy?: unknown;
    spreadPolicy?: unknown;
    tolerations?: unknown[];
  };
  status?: {
    conditions?: K8sCondition[];
    numberOfSelectedClusters?: number;
  };
}

export interface PlacementDecision extends K8sResourceCommon {
  status?: {
    decisions?: { clusterName: string; reason?: string; score?: number }[];
  };
}
