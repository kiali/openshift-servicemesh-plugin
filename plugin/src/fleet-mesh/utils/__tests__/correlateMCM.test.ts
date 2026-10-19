import { buildMcmIndex, lookupMcm } from '../correlateMCM';
import type { MultiClusterMesh } from '../../types/multiClusterMesh';

const makeMCM = (
  name: string,
  namespace: string,
  cpNamespace: string | undefined,
  clusters: string[]
): MultiClusterMesh => ({
  apiVersion: 'mesh.open-cluster-management.io/v1alpha1',
  kind: 'MultiClusterMesh',
  metadata: { name, namespace },
  spec: {
    placementRef: { name: 'global-placement' }
  },
  status: {
    controlPlaneNamespace: cpNamespace,
    clusterStatus: clusters.map(c => ({ clusterName: c }))
  }
});

describe('buildMcmIndex', () => {
  it('builds an index keyed by clusterName/namespace', () => {
    const mcms = [makeMCM('mesh-a', 'ns-a', 'istio-system-mesh-a-1234567890', ['cluster-1', 'cluster-2'])];
    const index = buildMcmIndex(mcms);
    expect(index.size).toBe(2);
    expect(index.get('cluster-1/istio-system-mesh-a-1234567890')).toEqual({ name: 'mesh-a', namespace: 'ns-a' });
    expect(index.get('cluster-2/istio-system-mesh-a-1234567890')).toEqual({ name: 'mesh-a', namespace: 'ns-a' });
  });

  it('skips MCMs that have not reported status.controlPlaneNamespace', () => {
    // The controller writes clusterStatus and controlPlaneNamespace in the same
    // status update, so this cannot happen in practice; the index stays defensive.
    const mcms = [makeMCM('mesh-b', 'ns-b', undefined, ['cluster-x'])];
    expect(buildMcmIndex(mcms).size).toBe(0);
  });

  it('uses the reported status.controlPlaneNamespace when set', () => {
    const mcms = [makeMCM('mesh-c', 'ns-c', 'custom-ns', ['cluster-y'])];
    const index = buildMcmIndex(mcms);
    expect(index.get('cluster-y/custom-ns')).toEqual({ name: 'mesh-c', namespace: 'ns-c' });
    expect(index.get('cluster-y/istio-system')).toBeUndefined();
  });

  it('handles multiple MCMs with different clusters', () => {
    const mcms = [
      makeMCM('mesh-1', 'ns-1', 'istio-system-mesh-1-1111111111', ['cluster-a']),
      makeMCM('mesh-2', 'ns-2', 'istio-prod', ['cluster-b', 'cluster-c'])
    ];
    const index = buildMcmIndex(mcms);
    expect(index.size).toBe(3);
    expect(index.get('cluster-a/istio-system-mesh-1-1111111111')?.name).toBe('mesh-1');
    expect(index.get('cluster-b/istio-prod')?.name).toBe('mesh-2');
    expect(index.get('cluster-c/istio-prod')?.name).toBe('mesh-2');
  });

  it('returns empty map for empty MCMs array', () => {
    expect(buildMcmIndex([]).size).toBe(0);
  });

  it('correlates overlapping meshes independently by control plane namespace', () => {
    const first = makeMCM('mesh', 'team-a', 'cp-a', ['shared-cluster']);
    const second = makeMCM('mesh', 'team-b', 'cp-b', ['shared-cluster']);
    const index = buildMcmIndex([first, second]);
    expect(lookupMcm(index, 'shared-cluster', 'cp-a')).toEqual({ name: 'mesh', namespace: 'team-a' });
    expect(lookupMcm(index, 'shared-cluster', 'cp-b')).toEqual({ name: 'mesh', namespace: 'team-b' });
    expect(lookupMcm(index, 'selected-only-cluster', 'cp-a')).toBeUndefined();
  });

  it('handles MCM with empty clusterStatus', () => {
    const mcms = [makeMCM('mesh-empty', 'ns', 'istio-system', [])];
    expect(buildMcmIndex(mcms).size).toBe(0);
  });

  it('handles MCM with undefined status', () => {
    const mcm: MultiClusterMesh = {
      apiVersion: 'mesh.open-cluster-management.io/v1alpha1',
      kind: 'MultiClusterMesh',
      metadata: { name: 'no-status', namespace: 'ns' },
      spec: { placementRef: { name: 'global-placement' } }
    };
    expect(buildMcmIndex([mcm]).size).toBe(0);
  });
});

describe('buildMcmIndex — collision handling', () => {
  it('logs error and last MCM wins when different MCMs claim the same cluster+namespace', () => {
    const errorSpy = rstest.spyOn(console, 'error').mockImplementation(() => {});
    const mcms = [
      makeMCM('mesh-first', 'ns-1', 'istio-system', ['cluster-a']),
      makeMCM('mesh-second', 'ns-2', 'istio-system', ['cluster-a'])
    ];
    const index = buildMcmIndex(mcms);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('cluster-a/istio-system'));
    expect(index.get('cluster-a/istio-system')).toEqual({ name: 'mesh-second', namespace: 'ns-2' });
    errorSpy.mockRestore();
  });
});

describe('lookupMcm', () => {
  const mcms = [
    makeMCM('mesh-a', 'ns-a', 'istio-system', ['cluster-1']),
    makeMCM('mesh-b', 'ns-b', 'istio-staging', ['cluster-2'])
  ];
  const index = buildMcmIndex(mcms);

  it('finds the managing MCM by cluster and namespace', () => {
    expect(lookupMcm(index, 'cluster-1', 'istio-system')).toEqual({ name: 'mesh-a', namespace: 'ns-a' });
    expect(lookupMcm(index, 'cluster-2', 'istio-staging')).toEqual({ name: 'mesh-b', namespace: 'ns-b' });
  });

  it('returns undefined when cluster is not in any MCM', () => {
    expect(lookupMcm(index, 'unknown-cluster', 'istio-system')).toBeUndefined();
  });

  it('returns undefined when namespace does not match', () => {
    expect(lookupMcm(index, 'cluster-1', 'wrong-ns')).toBeUndefined();
  });

  it('returns undefined when namespace is not reported', () => {
    expect(lookupMcm(index, 'cluster-1', undefined)).toBeUndefined();
  });
});
