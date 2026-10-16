import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeshDetailPage, { ClusterStatusSection } from '../MeshDetailPage';
import { useParams } from 'react-router-dom-v5-compat';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { makeMesh, makeCluster } from '../../__fixtures__/testFactories';
import type { K8sCondition } from '../../types/common';
import type { ManagedCluster } from '../../types/managedCluster';
import type { SelectionState } from '../../hooks/useMeshPlacement';

// TrustStatusCard has its own test file; stub it here to avoid consuming
// useK8sWatchResource mock slots meant for the mesh watch.
rstest.mock('../TrustStatusCard', () => ({
  TrustStatusCard: () => <div data-testid="trust-status-card" />
}));

rstest.mock('../../hooks/useMultiClusterMeshes', () => ({
  useMultiClusterMeshes: () => [[], true, null]
}));
rstest.mock('../../hooks/useMeshPlacement', () => ({
  useMeshPlacement: () => ({
    decisionError: null,
    decisionLoaded: true,
    placement: null,
    placementError: null,
    placementLoaded: true,
    selectedNames: null,
    state: 'missing'
  })
}));
rstest.mock('../../hooks/useDiscoveredControlPlanes', () => ({
  useDiscoveredControlPlanes: () => ({ results: [], loaded: true, error: null })
}));
rstest.mock('../../hooks/useEnrichedControlPlanes', () => ({
  useEnrichedControlPlanes: () => [[], undefined, true, null]
}));
rstest.mock('../../hooks/useManagedClusters', () => ({
  useManagedClusters: () => [
    [
      {
        metadata: { name: 'cluster-a' },
        status: { conditions: [{ type: 'ManagedClusterConditionAvailable', status: 'True' }] }
      },
      {
        metadata: { name: 'cluster-b' },
        status: { conditions: [{ type: 'ManagedClusterConditionAvailable', status: 'False' }] }
      },
      {
        metadata: { name: 'cluster-c' },
        status: { conditions: [{ type: 'ManagedClusterConditionAvailable', status: 'Unknown' }] }
      }
    ],
    true,
    null
  ]
}));

const makeCondition = (
  type: string,
  status: 'True' | 'False' | 'Unknown',
  reason?: string,
  message?: string
): K8sCondition => ({ type, status, reason, message });

// ---------------------------------------------------------------------------
// MeshDetailPage — router shell
// ---------------------------------------------------------------------------

describe('MeshDetailPage', () => {
  afterEach(() => rstest.clearAllMocks());

  describe('invalid URL (missing params)', () => {
    it('shows Not Found when ns and name are absent', () => {
      rstest.mocked(useParams).mockReturnValue({});
      render(<MeshDetailPage />);
      expect(screen.getByText('Not Found')).toBeInTheDocument();
      expect(
        screen.getByText('Invalid mesh URL. Expected /fleet-mesh/meshes/managed/:namespace/:name.')
      ).toBeInTheDocument();
    });
  });

  describe('MeshDetailContent states', () => {
    beforeEach(() => {
      rstest.mocked(useParams).mockReturnValue({ ns: 'mesh-system', name: 'test-mesh' });
    });

    it('shows a spinner while loading', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([null, false, null]);
      render(<MeshDetailPage />);
      expect(screen.getByLabelText('Loading mesh details')).toBeInTheDocument();
    });

    it('shows the error message when the watch fails', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([null, true, new Error('watch exploded')]);
      render(<MeshDetailPage />);
      expect(screen.getByText('Error loading mesh')).toBeInTheDocument();
      expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
    });

    it('shows mesh not found when loaded but mesh is null', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([null, true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('Mesh not found')).toBeInTheDocument();
      expect(
        screen.getByText('MultiClusterMesh "test-mesh" was not found in namespace "mesh-system".')
      ).toBeInTheDocument();
    });

    it('renders the breadcrumb and mesh name heading when loaded', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeMesh(), true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByRole('link', { name: 'Meshes' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'test-mesh' })).toBeInTheDocument();
    });

    it('shows Managed in breadcrumb', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeMesh(), true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('Managed')).toBeInTheDocument();
    });

    it('links the Placement reference to the ACM Placement overview', () => {
      rstest
        .mocked(useK8sWatchResource)
        .mockReturnValue([makeMesh({ spec: { placementRef: { name: 'my-placement' } } }), true, null]);
      render(<MeshDetailPage />);
      expect(screen.getAllByRole('link', { name: 'my-placement' })[0]).toHaveAttribute(
        'href',
        '/multicloud/infrastructure/clusters/placements/details/mesh-system/my-placement/overview'
      );
    });

    it('shows the derived control plane namespace reported in status', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeMesh(), true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('istio-system-test-mesh-abcdef1234')).toBeInTheDocument();
    });

    it('shows Not yet reconciled when controlPlaneNamespace is not reported', () => {
      const mesh = makeMesh({ status: {} });
      rstest.mocked(useK8sWatchResource).mockReturnValue([mesh, true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('Not yet reconciled')).toBeInTheDocument();
    });

    it('shows the reported control plane namespace when set', () => {
      const mesh = makeMesh({ status: { controlPlaneNamespace: 'custom-ns' } });
      rstest.mocked(useK8sWatchResource).mockReturnValue([mesh, true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('custom-ns')).toBeInTheDocument();
    });

    it('shows Not configured for issuer when none is set', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeMesh(), true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });

    it('shows the issuer name and kind when set', () => {
      const mesh = makeMesh({
        spec: {
          placementRef: { name: 'global-placement' },
          security: { trust: { certManager: { issuerRef: { name: 'root-ca', kind: 'ClusterIssuer' } } } }
        }
      });
      rstest.mocked(useK8sWatchResource).mockReturnValue([mesh, true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('root-ca (ClusterIssuer)')).toBeInTheDocument();
    });

    it('defaults Issuer kind when kind is not specified', () => {
      const mesh = makeMesh({
        spec: {
          placementRef: { name: 'global-placement' },
          security: { trust: { certManager: { issuerRef: { name: 'my-issuer' } } } }
        }
      });
      rstest.mocked(useK8sWatchResource).mockReturnValue([mesh, true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('my-issuer (Issuer)')).toBeInTheDocument();
    });

    it('hides the Conditions table when there are no conditions', () => {
      rstest.mocked(useK8sWatchResource).mockReturnValue([makeMesh(), true, null]);
      render(<MeshDetailPage />);
      expect(screen.queryByText('Conditions')).not.toBeInTheDocument();
    });

    it('shows the Conditions table when conditions are present', () => {
      const mesh = makeMesh({
        status: { conditions: [makeCondition('Ready', 'True', 'AllClustersReady', 'All good')] }
      });
      rstest.mocked(useK8sWatchResource).mockReturnValue([mesh, true, null]);
      render(<MeshDetailPage />);
      expect(screen.getByText('Conditions')).toBeInTheDocument();
      // "Ready" also appears in the MeshStatus header label — use the unique reason/message to pin the table row
      expect(screen.getByText('AllClustersReady')).toBeInTheDocument();
      expect(screen.getByText('All good')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ClusterStatusSection — imported directly, no hooks
// ---------------------------------------------------------------------------

describe('ClusterStatusSection', () => {
  it('shows empty state when there are no clusters and no conflict', () => {
    render(<ClusterStatusSection clusterStatuses={[]} />);
    expect(screen.getByText('No clusters are part of this mesh yet.')).toBeInTheDocument();
  });

  it('distinguishes a settled empty Placement from unavailable selection', () => {
    render(<ClusterStatusSection clusterStatuses={[]} selectedNames={[]} selectionState="ready" />);
    expect(screen.getByText('The Placement currently selects no clusters.')).toBeInTheDocument();
  });

  it.each(['forbidden', 'error', 'loading', 'waiting', 'updating'] as SelectionState[])(
    'does not infer an empty selection when selection is %s',
    selectionState => {
      render(<ClusterStatusSection clusterStatuses={[]} selectedNames={null} selectionState={selectionState} />);
      expect(
        screen.getByText(
          selectionState === 'forbidden' || selectionState === 'error'
            ? 'Selection details are unavailable. Mesh cluster status remains available when reported.'
            : 'Waiting for Placement decisions and mesh reconciliation.'
        )
      ).toBeInTheDocument();
      expect(screen.queryByText(/The Placement has not selected/)).not.toBeInTheDocument();
    }
  );

  it('uses the current Placement result even before the MCM notices it was created', () => {
    render(<ClusterStatusSection clusterStatuses={[]} selectedNames={[]} selectionState="ready" />);
    expect(screen.getByText('The Placement currently selects no clusters.')).toBeInTheDocument();
  });

  it.each(['PlacementMisconfigured', 'PlacementSatisfied'])(
    'explains %s instead of presenting it as a valid empty selection',
    type => {
      render(
        <ClusterStatusSection
          clusterStatuses={[]}
          selectedNames={[]}
          selectionState="ready"
          placementProblem={makeCondition(
            type,
            type === 'PlacementSatisfied' ? 'False' : 'True',
            'NoEligibleClusters',
            'No eligible clusters in the bound sets'
          )}
        />
      );
      expect(screen.getByText('No eligible clusters in the bound sets')).toBeInTheDocument();
      expect(screen.queryByText('The Placement currently selects no clusters.')).not.toBeInTheDocument();
    }
  );

  it('renders all cluster rows and the count in the card title', () => {
    const clusters = [makeCluster('cluster-a', 'True'), makeCluster('cluster-b', 'False', 'ReconcileError')];
    render(<ClusterStatusSection clusterStatuses={clusters} />);
    expect(screen.getByText('Clusters (2)')).toBeInTheDocument();
    expect(screen.getByText('cluster-a')).toBeInTheDocument();
    expect(screen.getByText('cluster-b')).toBeInTheDocument();
  });

  it('shows Placement and MCM synchronization without implying trust distribution', () => {
    render(
      <ClusterStatusSection
        clusterStatuses={[makeCluster('hub', 'True'), makeCluster('leaving', 'False')]}
        selectedNames={['hub', 'joining']}
        selectionState="ready"
      />
    );
    expect(screen.getByText('Clusters (3)')).toBeInTheDocument();
    expect(screen.getByText('Sync Status')).toBeInTheDocument();
    expect(screen.getByText('In Sync')).toBeInTheDocument();
    expect(screen.getByText('Pending Deployment')).toBeInTheDocument();
    expect(screen.getByText('Pending Removal')).toBeInTheDocument();
    expect(screen.getByText('In Sync (1)')).toBeInTheDocument();
    expect(screen.getByText('Pending Deployment (1)')).toBeInTheDocument();
    expect(screen.getByText('Pending Removal (1)')).toBeInTheDocument();
  });

  it('explains every Sync Status value in the header tooltip', async () => {
    render(
      <ClusterStatusSection clusterStatuses={[makeCluster('hub')]} selectedNames={['hub']} selectionState="ready" />
    );
    fireEvent.mouseEnter(screen.getByText('Sync Status'));
    expect(
      await screen.findByText(
        'Shows whether the Placement selection and MultiClusterMesh status agree for this cluster.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('both report the cluster as deployed.')).toBeInTheDocument();
    expect(screen.getByText('selected by Placement, not yet reported as deployed.')).toBeInTheDocument();
    expect(screen.getByText('no longer selected, but still reported as deployed.')).toBeInTheDocument();
    expect(screen.getByText('current Placement selection cannot be determined.')).toBeInTheDocument();
  });

  it.each([
    {
      clusterStatuses: [makeCluster('hub')],
      label: 'In Sync',
      selectedNames: ['hub'],
      tooltip: 'The Placement selects this cluster, and MultiClusterMesh status reports that it is deployed there.'
    },
    {
      clusterStatuses: [],
      label: 'Pending Deployment',
      selectedNames: ['joining'],
      tooltip: 'The Placement selects this cluster, but MultiClusterMesh status does not yet report it as deployed.'
    },
    {
      clusterStatuses: [makeCluster('leaving')],
      label: 'Pending Removal',
      selectedNames: [],
      tooltip: 'MultiClusterMesh status still reports this cluster as deployed, but the Placement no longer selects it.'
    },
    {
      clusterStatuses: [makeCluster('hub')],
      label: 'Sync Status Unavailable',
      selectedNames: null,
      tooltip:
        'The current Placement selection cannot be determined because it is loading, changing, unavailable, or inaccessible.'
    }
  ])('explains $label with a tooltip', async ({ clusterStatuses, label, selectedNames, tooltip }) => {
    render(
      <ClusterStatusSection clusterStatuses={clusterStatuses} selectedNames={selectedNames} selectionState="ready" />
    );
    fireEvent.mouseEnter(screen.getByText(label));
    expect(await screen.findByText(tooltip)).toBeInTheDocument();
  });

  it('shows correct summary counts', () => {
    render(
      <ClusterStatusSection
        clusterStatuses={[makeCluster('cluster-a', 'True'), makeCluster('cluster-b', 'False')]}
        selectedNames={['cluster-a', 'cluster-c']}
        selectionState="ready"
      />
    );
    expect(screen.getByText('In Sync (1)')).toBeInTheDocument();
    expect(screen.getByText('Pending Deployment (1)')).toBeInTheDocument();
    expect(screen.getByText('Pending Removal (1)')).toBeInTheDocument();
  });

  it('links cluster names to ACM cluster detail pages', () => {
    render(<ClusterStatusSection clusterStatuses={[makeCluster('cluster-a', 'True')]} />);
    expect(screen.getByRole('link', { name: 'cluster-a' })).toHaveAttribute(
      'href',
      '/multicloud/infrastructure/clusters/details/cluster-a/cluster-a/overview'
    );
  });

  describe('filter toggles', () => {
    const renderMemberships = (): void => {
      render(
        <ClusterStatusSection
          clusterStatuses={[makeCluster('in-sync-cluster', 'True'), makeCluster('leaving-cluster', 'False')]}
          selectedNames={['in-sync-cluster', 'joining-cluster']}
          selectionState="ready"
        />
      );
    };

    it('filters to only In Sync clusters', async () => {
      const user = userEvent.setup();
      renderMemberships();
      await user.click(screen.getByText('In Sync (1)'));
      expect(screen.getByText('in-sync-cluster')).toBeInTheDocument();
      expect(screen.queryByText('joining-cluster')).not.toBeInTheDocument();
      expect(screen.queryByText('leaving-cluster')).not.toBeInTheDocument();
    });

    it('filters to only Pending Deployment clusters', async () => {
      const user = userEvent.setup();
      renderMemberships();
      await user.click(screen.getByText('Pending Deployment (1)'));
      expect(screen.getByText('joining-cluster')).toBeInTheDocument();
      expect(screen.queryByText('in-sync-cluster')).not.toBeInTheDocument();
      expect(screen.queryByText('leaving-cluster')).not.toBeInTheDocument();
    });

    it('filters to only Pending Removal clusters', async () => {
      const user = userEvent.setup();
      renderMemberships();
      await user.click(screen.getByText('Pending Removal (1)'));
      expect(screen.getByText('leaving-cluster')).toBeInTheDocument();
      expect(screen.queryByText('in-sync-cluster')).not.toBeInTheDocument();
      expect(screen.queryByText('joining-cluster')).not.toBeInTheDocument();
    });

    it('returns to all clusters when All is clicked after a filter', async () => {
      const user = userEvent.setup();
      renderMemberships();
      await user.click(screen.getByText('In Sync (1)'));
      await user.click(screen.getByText('All (3)'));
      expect(screen.getByText('in-sync-cluster')).toBeInTheDocument();
      expect(screen.getByText('joining-cluster')).toBeInTheDocument();
      expect(screen.getByText('leaving-cluster')).toBeInTheDocument();
    });
  });

  describe('search', () => {
    const clusters = [makeCluster('alpha-cluster', 'True'), makeCluster('beta-cluster', 'False')];

    beforeEach(() => {
      rstest.useFakeTimers();
    });
    afterEach(() => {
      rstest.useRealTimers();
    });

    it('shows only matching clusters when searching', () => {
      render(<ClusterStatusSection clusterStatuses={clusters} />);
      fireEvent.change(screen.getByPlaceholderText('Filter by cluster name'), { target: { value: 'alpha' } });
      act(() => {
        rstest.advanceTimersByTime(200);
      });
      expect(screen.getByText('alpha-cluster')).toBeInTheDocument();
      expect(screen.queryByText('beta-cluster')).not.toBeInTheDocument();
    });

    it('shows no-match row when search has no results', () => {
      render(<ClusterStatusSection clusterStatuses={clusters} />);
      fireEvent.change(screen.getByPlaceholderText('Filter by cluster name'), { target: { value: 'zzznomatch' } });
      act(() => {
        rstest.advanceTimersByTime(200);
      });
      expect(screen.getByText('No clusters match the current filter.')).toBeInTheDocument();
    });
  });

  describe('cluster availability status', () => {
    it('shows Available, Unavailable, and Unreachable labels from ManagedCluster data', () => {
      const clusters = [
        makeCluster('cluster-a', 'True'),
        makeCluster('cluster-b', 'False'),
        makeCluster('cluster-c', 'Unknown')
      ];
      const managedClusterMap = new Map<string, ManagedCluster>([
        [
          'cluster-a',
          {
            metadata: { name: 'cluster-a' },
            status: { conditions: [{ type: 'ManagedClusterConditionAvailable', status: 'True' }] }
          }
        ],
        [
          'cluster-b',
          {
            metadata: { name: 'cluster-b' },
            status: { conditions: [{ type: 'ManagedClusterConditionAvailable', status: 'False' }] }
          }
        ],
        [
          'cluster-c',
          {
            metadata: { name: 'cluster-c' },
            status: { conditions: [{ type: 'ManagedClusterConditionAvailable', status: 'Unknown' }] }
          }
        ]
      ]);
      render(<ClusterStatusSection clusterStatuses={clusters} managedClusterMap={managedClusterMap} />);
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Unreachable')).toBeInTheDocument();
    });

    it('shows Unreachable when cluster is not in ManagedCluster map', () => {
      const clusters = [makeCluster('missing-cluster', 'True')];
      const managedClusterMap = new Map<string, ManagedCluster>();
      render(<ClusterStatusSection clusterStatuses={clusters} managedClusterMap={managedClusterMap} />);
      expect(screen.getByText('Unreachable')).toBeInTheDocument();
    });
  });
});
