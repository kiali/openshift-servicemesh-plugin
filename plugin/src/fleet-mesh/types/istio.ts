import type { K8sGroupVersionKind, K8sModel, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import type { K8sCondition } from './common';

export const istioGroupVersionKind: K8sGroupVersionKind = {
  group: 'sailoperator.io',
  kind: 'Istio',
  version: 'v1'
};

export const istioModel: K8sModel = {
  abbr: 'ISTIO',
  apiGroup: 'sailoperator.io',
  apiVersion: 'v1',
  kind: 'Istio',
  label: 'Istio',
  labelPlural: 'Istios',
  namespaced: false,
  plural: 'istios'
};

export interface IstioSpec {
  namespace: string;
  values?: {
    global?: {
      meshID?: string;
      multiCluster?: { clusterName?: string };
      network?: string;
    };
  };
  version?: string;
}

export interface IstioStatus {
  conditions?: K8sCondition[];
}

export interface Istio extends K8sResourceCommon {
  spec: IstioSpec;
  status?: IstioStatus;
}

export type FleetIstio = Istio & { cluster: string };

// useListPageFilter from the Console SDK accesses metadata.name for its
// built-in name filter, so EnrichedControlPlane must include metadata.
export interface EnrichedControlPlane {
  clusterName: string;
  controlPlaneNamespace?: string;
  managedBy?: { name: string; namespace: string };
  meshID?: string;
  metadata: {
    creationTimestamp?: string;
    labels?: Record<string, string>;
    name: string;
  };
  network?: string;
  status?: IstioStatus;
  version?: string;
}

export type CpCategory = 'ready' | 'notReady' | 'unknown';
export type CpFilterCategory = 'all' | CpCategory;

export function categorizeCp(cp: EnrichedControlPlane): CpCategory {
  const ready = cp.status?.conditions?.find(c => c.type === 'Ready');
  if (!ready) return 'unknown';
  if (ready.status === 'True') return 'ready';
  if (ready.status === 'Unknown') return 'unknown';
  return 'notReady';
}
