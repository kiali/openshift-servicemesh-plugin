import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useParams } from 'react-router-dom-v5-compat';

import MeshDetailPage from '../MeshDetailPage';
import { useMeshControlPlanes } from '../../hooks/useMeshControlPlanes';
import { makeCluster, makeEnrichedCP, makeMesh } from '../../__fixtures__/testFactories';
import type { Placement } from '../../types/placement';

rstest.mock('../../hooks/useMultiClusterMeshes', () => ({ useMultiClusterMeshes: () => [[], true, null] }));
rstest.mock('../../hooks/useManagedClusterMap', () => ({ useManagedClusterMap: () => [new Map(), true, null] }));
rstest.mock('../../hooks/useDiscoveredKialis', () => ({
  useDiscoveredKialis: () => ({ kialis: [], ossmcs: [], loaded: true })
}));
rstest.mock('../../hooks/useMeshControlPlanes', { mock: true });
rstest.mock('../TrustStatusCard', () => ({ TrustStatusCard: () => <div data-testid="trust-status-card" /> }));

beforeEach(() => {
  rstest.mocked(useParams).mockReturnValue({ ns: 'mesh-system', name: 'test-mesh' });
  rstest.mocked(useMeshControlPlanes).mockReturnValue([[], true, null]);
});

afterEach(() => rstest.resetAllMocks());

const placement: Placement = {
  metadata: { namespace: 'mesh-system', name: 'global-placement' },
  status: { numberOfSelectedClusters: 1, conditions: [{ type: 'PlacementSatisfied', status: 'True' }] }
};

describe('managed detail selection watches', () => {
  it.each(['Placement', 'PlacementDecision'])('keeps operational cards when %s access is denied', kind => {
    const mesh = makeMesh({ status: { clusterStatus: [makeCluster('hub')] } });
    rstest.mocked(useMeshControlPlanes).mockReturnValue([
      [
        makeEnrichedCP({
          metadata: { name: 'observed-control-plane' },
          clusterName: 'hub',
          managedBy: { name: 'test-mesh', namespace: 'mesh-system' }
        })
      ],
      true,
      null
    ]);
    rstest.mocked(useK8sWatchResource).mockImplementation(resource => {
      if (resource?.groupVersionKind?.kind === 'MultiClusterMesh') return [mesh, true, null];
      if (resource?.groupVersionKind?.kind === kind) return [undefined, false, { code: 403 }];
      return resource?.isList ? [[], true, null] : [placement, true, null];
    });
    render(<MeshDetailPage />);
    expect(screen.getByText('Selection access denied')).toBeInTheDocument();
    expect(screen.getByText('Sync Status Unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('hub')).toHaveLength(2);
    expect(screen.getByTestId('trust-status-card')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'observed-control-plane' })).toBeInTheDocument();
    expect(useMeshControlPlanes).toHaveBeenLastCalledWith(['hub'], []);
  });

  it('resets selection when the mesh switches Placement, while keeping only status clusters in control plane discovery', () => {
    let mesh = makeMesh({ status: { clusterStatus: [makeCluster('hub')] } });
    let newPlacementLoaded = false;
    rstest.mocked(useK8sWatchResource).mockImplementation(resource => {
      if (resource?.groupVersionKind?.kind === 'MultiClusterMesh') return [mesh, true, null];
      const name = resource?.name ?? resource?.selector?.matchLabels?.['cluster.open-cluster-management.io/placement'];
      if (name === 'new-placement' && !newPlacementLoaded) return [undefined, false, null];
      if (resource?.isList)
        return [
          [{ status: { decisions: [{ clusterName: name === 'new-placement' ? 'new-selected' : 'old-selected' }] } }],
          true,
          null
        ];
      return [{ ...placement, metadata: { ...placement.metadata, name } }, true, null];
    });
    const { rerender } = render(<MeshDetailPage />);
    expect(screen.getByText('old-selected')).toBeInTheDocument();
    expect(screen.getByText('Pending Deployment')).toBeInTheDocument();
    expect(useMeshControlPlanes).toHaveBeenLastCalledWith(['hub'], []);

    mesh = { ...mesh, spec: { ...mesh.spec, placementRef: { name: 'new-placement' } } };
    rerender(<MeshDetailPage />);
    expect(screen.queryByText('old-selected')).not.toBeInTheDocument();
    expect(screen.getByText('Loading selection')).toBeInTheDocument();
    expect(screen.getByText('Sync Status Unavailable')).toBeInTheDocument();

    newPlacementLoaded = true;
    rerender(<MeshDetailPage />);
    expect(screen.getByText('new-selected')).toBeInTheDocument();
    expect(screen.queryByText('old-selected')).not.toBeInTheDocument();
    expect(useMeshControlPlanes).toHaveBeenLastCalledWith(['hub'], []);
  });
});
