import { render, screen } from '@testing-library/react';
import { PlacementSummaryCard } from '../PlacementSummaryCard';
import type { MeshPlacementResult } from '../../hooks/useMeshPlacement';
import { makeCluster } from '../../__fixtures__/testFactories';

const readyResult: MeshPlacementResult = {
  decisionError: null,
  decisionLoaded: true,
  placement: {
    apiVersion: 'cluster.open-cluster-management.io/v1beta1',
    kind: 'Placement',
    metadata: { name: 'demo-placement', namespace: 'mesh-ns' },
    spec: { clusterSets: ['demo-cluster-set'], numberOfClusters: 2 },
    status: { conditions: [{ type: 'PlacementSatisfied', status: 'True' }], numberOfSelectedClusters: 2 }
  },
  placementError: null,
  placementLoaded: true,
  selectedNames: ['hub', 'spoke'],
  state: 'ready'
};

describe('PlacementSummaryCard', () => {
  it.each(
    [
      [
        { requiredClusterSelector: { labelSelector: { matchLabels: { env: 'dev' } } } },
        { requiredClusterSelector: { labelSelector: { matchLabels: { env: 'prod' } } } }
      ],
      [
        {
          requiredClusterSelector: {
            labelSelector: {
              matchLabels: { env: 'dev' },
              matchExpressions: [{ key: 'region', operator: 'In', values: ['east'] }]
            },
            claimSelector: { matchExpressions: [{ key: 'platform', operator: 'In', values: ['OpenShift'] }] },
            celSelector: { celExpressions: ['managedCluster.metadata.name.startsWith("east")'] }
          }
        }
      ]
    ].map(predicates => ({ predicates }))
  )('discloses predicates without flattening or partially interpreting them: %j', ({ predicates }) => {
    render(
      <PlacementSummaryCard
        clusterStatuses={[]}
        namespace="mesh-ns"
        placementName="demo-placement"
        result={{ ...readyResult, placement: { ...readyResult.placement!, spec: { predicates } } }}
        sharedMeshCount={1}
      />
    );
    expect(screen.getByText('All eligible clusters · Predicates configured; view Placement YAML')).toBeInTheDocument();
    expect(screen.queryByText(/env=dev/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'demo-placement' })).toHaveAttribute(
      'href',
      '/multicloud/infrastructure/clusters/placements/details/mesh-ns/demo-placement/overview'
    );
  });

  it('shows selected, mesh, and installed counts separately without ClusterSets', () => {
    render(
      <PlacementSummaryCard
        clusterStatuses={[makeCluster('hub', 'True'), makeCluster('leaving', 'False')]}
        namespace="mesh-ns"
        placementName="demo-placement"
        result={readyResult}
        sharedMeshCount={1}
      />
    );
    const placement = screen.getByRole('link', { name: 'demo-placement' });
    expect(placement).toHaveAttribute(
      'href',
      '/multicloud/infrastructure/clusters/placements/details/mesh-ns/demo-placement/overview'
    );
    expect(screen.queryByText('ClusterSets')).not.toBeInTheDocument();
    expect(screen.queryByText('demo-cluster-set')).not.toBeInTheDocument();
    expect(document.querySelector('[data-test="placement-selected-count"]')).toHaveTextContent('2');
    expect(document.querySelector('[data-test="placement-mesh-count"]')).toHaveTextContent('2');
    expect(document.querySelector('[data-test="placement-operator-installed-count"]')).toHaveTextContent('1');
    expect(screen.getByText('Target clusters: 2')).toBeInTheDocument();
  });

  it('does not report a forbidden decision watch as an empty selection', () => {
    render(
      <PlacementSummaryCard
        clusterStatuses={[]}
        namespace="mesh-ns"
        placementName="demo-placement"
        result={{ ...readyResult, decisionError: { code: 403 }, selectedNames: null, state: 'forbidden' }}
        sharedMeshCount={1}
      />
    );
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Selection access denied')).toBeInTheDocument();
  });

  it('surfaces a missing binding and warns when another mesh shares the Placement', () => {
    const placement = {
      ...readyResult.placement!,
      status: {
        conditions: [
          {
            type: 'PlacementMisconfigured',
            status: 'True' as const,
            reason: 'NoManagedClusterSetBindings',
            message: 'No cluster set bindings found'
          }
        ],
        numberOfSelectedClusters: 0
      }
    };
    render(
      <PlacementSummaryCard
        clusterStatuses={[]}
        namespace="mesh-ns"
        placementName="demo-placement"
        result={{ ...readyResult, placement, selectedNames: [], state: 'ready' }}
        sharedMeshCount={2}
      />
    );
    expect(screen.getByText('Placement misconfigured')).toBeInTheDocument();
    expect(
      screen.getByText('Create a ManagedClusterSetBinding for the required ClusterSet in this mesh namespace.')
    ).toBeInTheDocument();
    expect(screen.getByText('This Placement is shared by 2 meshes.')).toBeInTheDocument();
  });

  it('shows access failure as the selection status even when the Placement is unsatisfied', () => {
    const placement = {
      ...readyResult.placement!,
      status: {
        numberOfSelectedClusters: 0,
        conditions: [{ type: 'PlacementSatisfied', status: 'False' as const, message: 'No eligible clusters' }]
      }
    };
    render(
      <PlacementSummaryCard
        clusterStatuses={[makeCluster('hub')]}
        namespace="mesh-ns"
        placementName="demo-placement"
        result={{ ...readyResult, placement, decisionError: { code: 403 }, selectedNames: null, state: 'forbidden' }}
        sharedMeshCount={1}
      />
    );
    expect(screen.getByText('Selection access denied')).toBeInTheDocument();
    expect(screen.getByText('No eligible clusters')).toBeInTheDocument();
    expect(document.querySelector('[data-test="placement-mesh-count"]')).toHaveTextContent('1');
  });

  it('does not show an old Placement problem after a policy update', () => {
    const placement = {
      ...readyResult.placement!,
      metadata: { name: 'demo-placement', namespace: 'mesh-ns', generation: 2 },
      status: {
        numberOfSelectedClusters: 0,
        conditions: [
          {
            type: 'PlacementMisconfigured',
            status: 'True' as const,
            observedGeneration: 1,
            message: 'Old binding error'
          }
        ]
      }
    };
    render(
      <PlacementSummaryCard
        clusterStatuses={[]}
        namespace="mesh-ns"
        placementName="demo-placement"
        result={{ ...readyResult, placement, selectedNames: null, state: 'updating' }}
        sharedMeshCount={1}
      />
    );
    expect(screen.getByText('Updating decisions')).toBeInTheDocument();
    expect(screen.queryByText('Old binding error')).not.toBeInTheDocument();
    expect(screen.queryByText('Placement misconfigured')).not.toBeInTheDocument();
  });

  it('marks old MCM conditions without discarding current selection', () => {
    render(
      <PlacementSummaryCard
        clusterStatuses={[]}
        namespace="mesh-ns"
        placementName="demo-placement"
        meshGeneration={2}
        meshConditions={[{ type: 'Ready', status: 'False', reason: 'PlacementNotFound', observedGeneration: 1 }]}
        result={readyResult}
        sharedMeshCount={1}
      />
    );
    expect(screen.getByText('Mesh status is updating for the latest Placement reference.')).toBeInTheDocument();
    expect(document.querySelector('[data-test="placement-selected-count"]')).toHaveTextContent('2');
  });
});
