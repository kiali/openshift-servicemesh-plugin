import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { MultiClusterMesh } from '../types/multiClusterMesh';
import { multiClusterMeshGroupVersionKind } from '../types/multiClusterMesh';

/** Watches all MultiClusterMesh CRs across namespaces on the hub cluster. */
export function useMultiClusterMeshes(): [MultiClusterMesh[] | null, boolean, unknown] {
  return useK8sWatchResource<MultiClusterMesh[]>({
    groupVersionKind: multiClusterMeshGroupVersionKind,
    isList: true
  });
}
