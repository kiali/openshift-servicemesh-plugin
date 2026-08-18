import type { K8sGroupVersionKind, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import type { K8sCondition } from './common';

export const istioGVK: K8sGroupVersionKind = {
  group: 'sailoperator.io',
  kind: 'Istio',
  version: 'v1'
};

export interface LiteIstioResource extends K8sResourceCommon {
  spec?: {
    namespace?: string;
    profile?: string;
    updateStrategy?: { type?: string; updateWorkloads?: boolean };
    values?: { global?: { meshID?: string; network?: string } };
    version?: string;
  };
  status?: {
    activeRevisionName?: string;
    conditions?: K8sCondition[];
    observedGeneration?: number;
    state?: string;
  };
}
