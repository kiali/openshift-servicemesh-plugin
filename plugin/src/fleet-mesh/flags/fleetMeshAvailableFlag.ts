import { probeWithRetry } from '../../openshift/utils/probeWithRetry';

// Checks whether the MultiClusterMesh API group is registered on the hub cluster.
// The perspective is hidden unless the mesh controller and ACM are both present.
// Retries on transient network errors so a brief API server blip at Console
// startup does not permanently hide the perspective.
export default (setFlag: (flag: string, value: boolean) => void): void => {
  probeWithRetry('/api/kubernetes/apis/mesh.open-cluster-management.io', 'FLEET_MESH_AVAILABLE', setFlag);
};
