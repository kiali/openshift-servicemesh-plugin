import { render, screen } from '@testing-library/react';
import { useListPageFilter } from '@openshift-console/dynamic-plugin-sdk';
import ServiceMeshPage from '../ServiceMeshPage';
import { useFleetMeshItems } from '../../hooks/useFleetMeshItems';
import type { FleetMeshItem } from '../../types/fleetMesh';
import type { UseFleetMeshItemsResult } from '../../hooks/useFleetMeshItems';

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

  it('filters Placement names case-insensitively and excludes discovered meshes for nonempty input', () => {
    const items = [
      makeItem({ metadata: { name: 'east-mesh' }, placementName: 'east-placement' }),
      makeItem({ metadata: { name: 'west-mesh' }, placementName: 'west-placement' }),
      makeItem({ metadata: { name: 'discovered-mesh' }, kind: 'discovered', placementName: undefined })
    ];
    mockHook({ items });
    render(<ServiceMeshPage />);
    const filters = rstest.mocked(useListPageFilter).mock.calls.at(-1)?.[1];
    const placementFilter = filters?.find(filter => filter.type === 'placement');
    expect(placementFilter).toBeDefined();
    const matches = (selected: string[]): string[] =>
      items.filter(item => placementFilter!.filter({ selected }, item)).map(item => item.metadata.name);
    expect(matches(['EAST'])).toEqual(['east-mesh']);
    expect(matches(['west-placement'])).toEqual(['west-mesh']);
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
});
