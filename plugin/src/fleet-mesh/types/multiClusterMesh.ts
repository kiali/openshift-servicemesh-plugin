import type { K8sGroupVersionKind, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import type { K8sCondition } from './common';

export const multiClusterMeshGroupVersionKind: K8sGroupVersionKind = {
  group: 'mesh.open-cluster-management.io',
  version: 'v1alpha1',
  kind: 'MultiClusterMesh'
};

export interface ClusterMeshStatus {
  clusterName: string;
  conditions?: K8sCondition[];
}

export interface MultiClusterMeshSpec {
  clusterSet: string;
  controlPlane?: {
    namespace?: string;
  };
  operator?: {
    channel?: string;
    installPlanApproval?: 'Automatic' | 'Manual';
    namespace?: string;
    source?: string;
    sourceNamespace?: string;
    startingCSV?: string;
  };
  security?: {
    discovery?: {
      tokenValidity?: string;
    };
    trust?: {
      certManager?: {
        issuerRef: { kind?: 'Issuer' | 'ClusterIssuer'; name: string };
      };
    };
  };
}

export interface MultiClusterMeshStatus {
  clusterStatus?: ClusterMeshStatus[];
  conditions?: K8sCondition[];
}

export interface MultiClusterMesh extends K8sResourceCommon {
  spec: MultiClusterMeshSpec;
  status?: MultiClusterMeshStatus;
}
