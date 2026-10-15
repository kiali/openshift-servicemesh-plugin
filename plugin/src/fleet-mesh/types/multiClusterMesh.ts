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
  placementRef: { name: string };
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
  // Auto-derived by the controller: istio-system-{meshName}-{SHA-256 prefix over "namespace/name"}
  controlPlaneNamespace?: string;
}

export interface MultiClusterMesh extends K8sResourceCommon {
  spec: MultiClusterMeshSpec;
  status?: MultiClusterMeshStatus;
}
