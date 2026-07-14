import type { K8sCondition } from './common';
import type { EnrichedControlPlane } from './istio';
import type { MultiClusterMesh } from './multiClusterMesh';

export interface FleetMeshItem {
  clusterCount: number;
  clusterSet?: string;
  conditions?: K8sCondition[];
  controlPlanes?: EnrichedControlPlane[];
  detailLink: string;
  kind: 'managed' | 'discovered';
  mcm?: MultiClusterMesh;
  mcmNamespace?: string;
  meshID?: string;
  meshIDConflict?: boolean;
  metadata: {
    creationTimestamp?: string;
    name: string;
  };
  statusRank: number;
  trustIssuer?: string;
}
