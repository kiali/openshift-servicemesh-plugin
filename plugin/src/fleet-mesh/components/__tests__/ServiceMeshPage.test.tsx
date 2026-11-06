import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { useListPageFilter } from '@openshift-console/dynamic-plugin-sdk';
import { useFleetSearchPoll } from '@stolostron/multicluster-sdk';
import ServiceMeshPage from '../ServiceMeshPage';
import { useFleetMeshItems } from '../../hooks/useFleetMeshItems';
import type { FleetMeshItem } from '../../types/fleetMesh';
import type { UseFleetMeshItemsResult } from '../../hooks/useFleetMeshItems';
import { makeMesh } from '../../__fixtures__/testFactories';
import type { MultiClusterMesh } from '../../types/multiClusterMesh';

rstest.mock('react-router', () => ({
  Link: ({ to, children }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useParams: rstest.fn(() => ({}))
}));

rstest.mock('../../hooks/useFleetMeshItems', { mock: true });

const makeItem = (overrides: Partial<FleetMeshItem> = {}): FleetMeshItem => ({
  metadata: { name: 'test-mesh' },
  kind: 'managed',
  detailLink: '/fleet-mesh/meshes/managed/mesh-system/test-mesh',
  clusterCount: 1,
  placementName: 'global-placement',
  placementNamespace: 'mesh-system',
  mcmNamespace: 'mesh-system',
  meshID: 'mesh-system-test-mesh',
  statusRank: 0,
  trustIssuer: undefined,
  conditions: [{ type: 'Ready', status: 'True' }],
  ...overrides
});

const defaultHookResult: UseFleetMeshItemsResult = {
  items: [],
  loaded: true,
  enrichmentError: null,
  mcms: [],
  mcmsLoaded: true,
  mcmsError: null,
  enrichedPlanes: [],
  enrichmentLoaded: true,
  searchLoaded: true,
  searchError: null
};

function mockHook(overrides: Partial<UseFleetMeshItemsResult> = {}): void {
  rstest.mocked(useFleetMeshItems).mockReturnValue({ ...defaultHookResult, ...overrides });
}

describe('ServiceMeshPage', () => {
  afterEach(() => {
    rstest.clearAllMocks();
  });

  it('shows empty state when no meshes exist and data is loaded', () => {
    mockHook();
    render(<ServiceMeshPage />);
    expect(screen.getByText('No managed or discovered meshes found.')).toBeInTheDocument();
  });

  it('shows an addon info banner and empty state when the OSSM-ACM addon is not installed', () => {
    mockHook({ mcmsError: new Error('Model does not exist') });
    render(<ServiceMeshPage />);
    expect(screen.getByText('OSSM-ACM addon is not installed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Managed meshes require the OSSM-ACM addon controller. Discovered meshes may still appear below.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'OSSM-ACM addon is not installed. Managed meshes are unavailable until the addon controller is installed.'
      )
    ).toBeInTheDocument();
  });

  it('shows loading state while data is not yet loaded', () => {
    mockHook({ loaded: false });
    render(<ServiceMeshPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it.each([{ code: 403 }, new Error('watch failed')])(
    'does not claim managed meshes are absent after %j',
    mcmsError => {
      mockHook({ mcmsLoaded: false, mcmsError });
      render(<ServiceMeshPage />);
      expect(screen.getByText('Managed meshes are unavailable. No discovered meshes found.')).toBeInTheDocument();
      expect(screen.queryByText('No managed or discovered meshes found.')).not.toBeInTheDocument();
    }
  );

  it('keeps discovered rows visible after a managed mesh read failure', () => {
    mockHook({
      mcmsLoaded: false,
      mcmsError: { code: 403 },
      items: [makeItem({ metadata: { name: 'discovered-mesh' }, kind: 'discovered', placementName: undefined })]
    });
    render(<ServiceMeshPage />);
    expect(screen.getByText('discovered-mesh')).toBeInTheDocument();
    expect(screen.queryByText('Managed meshes are unavailable. No discovered meshes found.')).not.toBeInTheDocument();
  });

  it('waits for Search before declaring discovery empty, then recovers from a Search error', () => {
    const unavailableManaged = { mcmsLoaded: false, mcmsError: { code: 403 }, enrichmentLoaded: true };
    mockHook({ ...unavailableManaged, searchLoaded: false });
    const { rerender } = render(<ServiceMeshPage />);
    expect(screen.getByLabelText('Loading discovered meshes')).toBeInTheDocument();
    expect(screen.queryByText(/No discovered meshes found/)).not.toBeInTheDocument();
    expect(screen.queryByText('No managed or discovered meshes found.')).not.toBeInTheDocument();

    mockHook({ ...unavailableManaged, searchLoaded: false, searchError: new Error('Search unavailable') });
    rerender(<ServiceMeshPage />);
    expect(screen.getByText('Discovered meshes are unavailable.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading discovered meshes')).not.toBeInTheDocument();
    expect(screen.queryByText(/No discovered meshes found/)).not.toBeInTheDocument();

    mockHook({ ...unavailableManaged, searchLoaded: true });
    rerender(<ServiceMeshPage />);
    expect(screen.getByText('Managed meshes are unavailable. No discovered meshes found.')).toBeInTheDocument();
    expect(screen.queryByText('Discovered meshes are unavailable.')).not.toBeInTheDocument();
  });

  it.each([
    { searchError: new Error('Search unavailable'), searchLoaded: true },
    { enrichmentError: new Error('Enrichment unavailable') }
  ])('does not report empty discovery after a discovery error: %j', failure => {
    mockHook({ ...failure, mcmsLoaded: false, mcmsError: { code: 403 } });
    render(<ServiceMeshPage />);
    expect(screen.getByText('Discovered meshes are unavailable.')).toBeInTheDocument();
    expect(screen.queryByText(/No discovered meshes found/)).not.toBeInTheDocument();
    expect(screen.queryByText('No managed or discovered meshes found.')).not.toBeInTheDocument();
  });

  it('keeps managed rows visible when Search fails', () => {
    mockHook({ items: [makeItem()], searchLoaded: false, searchError: new Error('Search unavailable') });
    render(<ServiceMeshPage />);
    expect(screen.getByText('test-mesh')).toBeInTheDocument();
    expect(screen.getByText('Unable to load control plane data. Some meshes may not be shown.')).toBeInTheDocument();
  });

  it('filters Mesh IDs case-insensitively for nonempty input', () => {
    const items = [
      makeItem({ metadata: { name: 'east-mesh' }, meshID: 'mesh-system-east-mesh' }),
      makeItem({ metadata: { name: 'west-mesh' }, meshID: 'mesh-system-west-mesh' }),
      makeItem({
        metadata: { name: 'discovered-mesh' },
        kind: 'discovered',
        meshID: 'discovered-id',
        placementName: undefined
      })
    ];
    mockHook({ items });
    render(<ServiceMeshPage />);
    const filters = rstest.mocked(useListPageFilter).mock.calls.at(-1)?.[1];
    const meshIDFilter = filters?.find(filter => filter.type === 'meshID');
    expect(meshIDFilter).toBeDefined();
    const matches = (selected: string[]): string[] =>
      items.filter(item => meshIDFilter!.filter({ selected }, item)).map(item => item.metadata.name);
    expect(matches(['EAST'])).toEqual(['east-mesh']);
    expect(matches(['discovered'])).toEqual(['discovered-mesh']);
    expect(matches(['missing'])).toEqual([]);
    expect(matches([''])).toEqual(['east-mesh', 'west-mesh', 'discovered-mesh']);
    expect(matches([])).toEqual(['east-mesh', 'west-mesh', 'discovered-mesh']);
  });

  it('renders managed mesh rows with Mesh ID links to detail page', () => {
    const items = [
      makeItem(),
      makeItem({
        metadata: { name: 'prod-mesh' },
        meshID: 'mesh-system-prod-mesh',
        detailLink: '/fleet-mesh/meshes/managed/mesh-system/prod-mesh'
      })
    ];
    mockHook({ items });
    render(<ServiceMeshPage />);
    expect(screen.getByText('test-mesh')).toBeInTheDocument();
    expect(screen.getByText('prod-mesh')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mesh-system-test-mesh' })).toHaveAttribute(
      'href',
      '/fleet-mesh/meshes/managed/mesh-system/test-mesh'
    );
    expect(screen.getByRole('link', { name: 'mesh-system-prod-mesh' })).toHaveAttribute(
      'href',
      '/fleet-mesh/meshes/managed/mesh-system/prod-mesh'
    );
  });

  it('links the managed Placement in the MCM namespace', () => {
    mockHook({ items: [makeItem({ placementName: 'east-placement', placementNamespace: 'mesh-system' })] });
    render(<ServiceMeshPage />);
    const placement = screen.getByText('east-placement');
    expect(placement).toHaveAttribute(
      'href',
      '/multicloud/infrastructure/clusters/placements/details/mesh-system/east-placement/overview'
    );
    expect(screen.getByText('mesh-system')).toBeInTheDocument();
  });

  it('renders discovered mesh rows with Mesh ID links to their detailLink', () => {
    const items = [
      makeItem({
        metadata: { name: 'discovered-mesh' },
        kind: 'discovered',
        meshID: 'discovered-id',
        detailLink: '/fleet-mesh/meshes/discovered/discovered-id',
        mcmNamespace: undefined,
        placementName: undefined,
        placementNamespace: undefined
      })
    ];
    mockHook({ items });
    render(<ServiceMeshPage />);
    const link = screen.getByRole('link', { name: 'discovered-id' });
    expect(link).toHaveAttribute('href', '/fleet-mesh/meshes/discovered/discovered-id');
  });

  it('shows Mesh ID column values for managed and discovered items', () => {
    const items = [
      makeItem({ metadata: { name: 'managed-mesh' }, meshID: 'managed-id' }),
      makeItem({
        metadata: { name: 'discovered-mesh' },
        kind: 'discovered',
        meshID: 'discovered-id',
        detailLink: '/fleet-mesh/meshes/discovered/discovered-id'
      })
    ];
    mockHook({ items });
    render(<ServiceMeshPage />);
    expect(screen.getByText('managed-id')).toBeInTheDocument();
    expect(screen.getByText('discovered-id')).toBeInTheDocument();
  });

  it('renders Type column with Managed for managed items and Discovered for discovered items', () => {
    const items = [
      makeItem({ metadata: { name: 'managed-mesh' }, meshID: 'managed-id' }),
      makeItem({
        metadata: { name: 'discovered-mesh' },
        kind: 'discovered',
        meshID: 'discovered-id',
        detailLink: '/fleet-mesh/meshes/discovered/discovered-id'
      })
    ];
    mockHook({ items });
    render(<ServiceMeshPage />);
    expect(screen.getByText('Managed')).toBeInTheDocument();
    expect(screen.getByText('Discovered')).toBeInTheDocument();
  });

  it('shows enrichment error banner when enrichmentError is set', () => {
    mockHook({ enrichmentError: new Error('search failed') });
    render(<ServiceMeshPage />);
    expect(screen.getByText('Unable to load control plane data. Some meshes may not be shown.')).toBeInTheDocument();
  });

  it('shows warning icon for managed item with meshIDConflict', () => {
    const items = [makeItem({ meshIDConflict: true })];
    mockHook({ items });
    render(<ServiceMeshPage />);
    expect(screen.getByText('Mesh ID Conflict')).toBeInTheDocument();
  });

  describe('Operator column', () => {
    /** Branches the SDK mock on the queried kind so both hook queries can be set at once. */
    const mockOperatorSearch = (
      deployments: { cluster: string; metadata: { name: string } }[] = [],
      roster: { cluster: string; metadata: { name: string } }[] = [],
      error?: Error
    ): void => {
      rstest
        .mocked(useFleetSearchPoll)
        .mockImplementation(((watchOptions?: { groupVersionKind?: { kind?: string } }) =>
          watchOptions?.groupVersionKind?.kind === 'Deployment'
            ? [deployments, true, error, rstest.fn()]
            : [roster, true, error, rstest.fn()]) as unknown as typeof useFleetSearchPoll);
    };

    const makeMcm = (clusterNames: string[]): MultiClusterMesh =>
      makeMesh({ status: { clusterStatus: clusterNames.map(clusterName => ({ clusterName })) } });

    // clearAllMocks does not reset implementations set with mockImplementation,
    // so restore the loading default after each test to avoid leakage.
    afterEach(() => {
      rstest.mocked(useFleetSearchPoll).mockReturnValue([undefined, false, undefined, rstest.fn()]);
    });

    it('shows an installed/total count label per managed mesh', () => {
      mockOperatorSearch(
        [{ cluster: 'cluster-a', metadata: { name: 'servicemesh-operator3' } }],
        [
          { cluster: 'cluster-a', metadata: { name: 'default' } },
          { cluster: 'cluster-b', metadata: { name: 'default' } }
        ]
      );
      mockHook({ items: [makeItem({ mcm: makeMcm(['cluster-a', 'cluster-b']) })] });
      render(<ServiceMeshPage />);
      expect(screen.getByText('1/2')).toBeInTheDocument();
    });

    it('shows a green-count label for every cluster when all have the operator', () => {
      mockOperatorSearch(
        [
          { cluster: 'cluster-a', metadata: { name: 'servicemesh-operator3' } },
          { cluster: 'cluster-b', metadata: { name: 'servicemesh-operator3' } }
        ],
        [
          { cluster: 'cluster-a', metadata: { name: 'default' } },
          { cluster: 'cluster-b', metadata: { name: 'default' } }
        ]
      );
      mockHook({ items: [makeItem({ mcm: makeMcm(['cluster-a', 'cluster-b']) })] });
      render(<ServiceMeshPage />);
      expect(screen.getByText('2/2')).toBeInTheDocument();
    });

    it('shows Unknown when search data is unavailable', () => {
      mockOperatorSearch([], [], new Error('search down'));
      mockHook({ items: [makeItem({ mcm: makeMcm(['cluster-a']) })] });
      render(<ServiceMeshPage />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
      expect(screen.queryByText('0/1')).not.toBeInTheDocument();
    });

    it('lets the unknown filter find rows showing Unknown during a search outage', () => {
      mockOperatorSearch([], [], new Error('search down'));
      const items = [makeItem({ mcm: makeMcm(['cluster-a']) })];
      mockHook({ items });
      render(<ServiceMeshPage />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
      const filters = rstest.mocked(useListPageFilter).mock.calls.at(-1)?.[1];
      const operatorFilter = filters?.find(filter => filter.type === 'operator');
      expect(operatorFilter!.filter({ selected: ['unknown'] }, items[0])).toBe(true);
    });

    it('keeps the confirmed count, grey, when a selected cluster is not visible to search', () => {
      mockOperatorSearch(
        [{ cluster: 'cluster-a', metadata: { name: 'servicemesh-operator3' } }],
        [{ cluster: 'cluster-a', metadata: { name: 'default' } }]
      );
      mockHook({ items: [makeItem({ mcm: makeMcm(['cluster-a', 'cluster-not-indexed']) })] });
      render(<ServiceMeshPage />);
      expect(screen.getByText('1/2')).toBeInTheDocument();
      expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    });

    it('shows Unknown without a count when no selected cluster is visible to search', () => {
      mockOperatorSearch(
        [{ cluster: 'cluster-a', metadata: { name: 'servicemesh-operator3' } }],
        [{ cluster: 'cluster-a', metadata: { name: 'default' } }]
      );
      mockHook({ items: [makeItem({ mcm: makeMcm(['cluster-not-indexed']) })] });
      render(<ServiceMeshPage />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
      expect(screen.queryByText('0/1')).not.toBeInTheDocument();
    });

    it('shows a dash for discovered meshes', () => {
      mockOperatorSearch(
        [{ cluster: 'cluster-a', metadata: { name: 'servicemesh-operator3' } }],
        [{ cluster: 'cluster-a', metadata: { name: 'default' } }]
      );
      mockHook({
        items: [makeItem({ metadata: { name: 'discovered-mesh' }, kind: 'discovered', placementName: undefined })]
      });
      render(<ServiceMeshPage />);
      expect(screen.queryByText('0/1')).not.toBeInTheDocument();
      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
      expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    });

    it('shows no operator labels while the status is loading', () => {
      mockHook({ items: [makeItem({ mcm: makeMcm(['cluster-a']) })] });
      render(<ServiceMeshPage />);
      expect(screen.queryByText('1/1')).not.toBeInTheDocument();
      expect(screen.queryByText('0/1')).not.toBeInTheDocument();
      expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    });

    it('filters rows by aggregated operator status', () => {
      mockOperatorSearch(
        [{ cluster: 'cluster-a', metadata: { name: 'servicemesh-operator3' } }],
        [
          { cluster: 'cluster-a', metadata: { name: 'default' } },
          { cluster: 'cluster-b', metadata: { name: 'default' } }
        ]
      );
      const items = [
        makeItem({ mcm: makeMcm(['cluster-a']) }),
        makeItem({ metadata: { name: 'broken-mesh' }, mcm: makeMcm(['cluster-a', 'cluster-b']) }),
        makeItem({ metadata: { name: 'discovered-mesh' }, kind: 'discovered', placementName: undefined })
      ];
      mockHook({ items });
      render(<ServiceMeshPage />);
      const filters = rstest.mocked(useListPageFilter).mock.calls.at(-1)?.[1];
      const operatorFilter = filters?.find(filter => filter.type === 'operator');
      expect(operatorFilter).toBeDefined();
      const matches = (selected: string[]): string[] =>
        items.filter(item => operatorFilter!.filter({ selected }, item)).map(item => item.metadata.name);
      expect(matches(['installed'])).toEqual(['test-mesh']);
      expect(matches(['missing'])).toEqual(['broken-mesh']);
      expect(matches(['unknown'])).toEqual([]);
      expect(matches([''])).toEqual(['test-mesh', 'broken-mesh', 'discovered-mesh']);
    });
  });
});
