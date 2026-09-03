import { render, screen, waitFor, within } from '@testing-library/react';
import ControlPlanesPage from '../ControlPlanesPage';
import { useFleetSearchPoll } from '@stolostron/multicluster-sdk';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useEnrichedControlPlanes } from '../../hooks/useEnrichedControlPlanes';
import { useDiscoveredKialis } from '../../hooks/useDiscoveredKialis';
import { makeSearchResult, makeEnrichedCP } from '../../__fixtures__/testFactories';
import type { DiscoveredKiali } from '../../types/kiali';

rstest.mock('../../hooks/useEnrichedControlPlanes', { mock: true });
rstest.mock('../../hooks/useDiscoveredKialis', { mock: true });

afterEach(() => rstest.clearAllMocks());

beforeEach(() => {
  rstest.mocked(useK8sWatchResource).mockReturnValue([[], true, null]);
  rstest.mocked(useEnrichedControlPlanes).mockReturnValue([[], false, false, null]);
  rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [], loaded: true, ossmcs: [] });
});

describe('ControlPlanesPage', () => {
  it('shows loading state while search is pending', () => {
    rstest.mocked(useFleetSearchPoll).mockReturnValue([undefined, false, undefined, rstest.fn()]);
    render(<ControlPlanesPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows empty state when no control planes are discovered', () => {
    rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, undefined, rstest.fn()]);
    render(<ControlPlanesPage />);
    expect(screen.getByText('No control planes discovered across the fleet.')).toBeInTheDocument();
  });

  it('shows error state when search fails', () => {
    rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, new Error('search failed'), rstest.fn()]);
    render(<ControlPlanesPage />);
    expect(screen.getByTestId('load-error')).toBeInTheDocument();
  });

  it('renders control plane rows when search returns results', async () => {
    const results = [makeSearchResult('cluster-a', 'default'), makeSearchResult('cluster-b', 'default')];
    const enriched = [makeEnrichedCP(), makeEnrichedCP({ clusterName: 'cluster-b' })];
    rstest.mocked(useFleetSearchPoll).mockReturnValue([results, true, undefined, rstest.fn()]);
    rstest.mocked(useEnrichedControlPlanes).mockReturnValue([enriched, true, true, null]);
    render(<ControlPlanesPage />);
    await waitFor(() => {
      expect(screen.getByText('cluster-a')).toBeInTheDocument();
      expect(screen.getByText('cluster-b')).toBeInTheDocument();
    });
  });

  it('links cluster names to ACM cluster detail pages', async () => {
    const results = [makeSearchResult('cluster-a', 'default')];
    const enriched = [makeEnrichedCP()];
    rstest.mocked(useFleetSearchPoll).mockReturnValue([results, true, undefined, rstest.fn()]);
    rstest.mocked(useEnrichedControlPlanes).mockReturnValue([enriched, true, true, null]);
    render(<ControlPlanesPage />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'cluster-a' })).toHaveAttribute(
        'href',
        '/multicloud/infrastructure/clusters/details/cluster-a/cluster-a/overview'
      );
    });
  });

  it('links CR names to control plane detail pages', async () => {
    const results = [makeSearchResult('cluster-a', 'myistio')];
    const enriched = [makeEnrichedCP({ metadata: { name: 'myistio' } })];
    rstest.mocked(useFleetSearchPoll).mockReturnValue([results, true, undefined, rstest.fn()]);
    rstest.mocked(useEnrichedControlPlanes).mockReturnValue([enriched, true, true, null]);
    render(<ControlPlanesPage />);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'myistio' })).toHaveAttribute(
        'href',
        '/fleet-mesh/control-planes/standalone/cluster-a/myistio'
      );
    });
  });

  it('shows dash for enrichment columns before enrichment completes', async () => {
    const results = [makeSearchResult('cluster-a', 'default')];
    const enriched = [makeEnrichedCP()];
    rstest.mocked(useFleetSearchPoll).mockReturnValue([results, true, undefined, rstest.fn()]);
    rstest.mocked(useEnrichedControlPlanes).mockReturnValue([enriched, true, false, null]);
    render(<ControlPlanesPage />);
    await waitFor(() => {
      const nameLink = screen.getByRole('link', { name: 'default' });
      const row = nameLink.closest('tr') as HTMLTableRowElement;
      expect(within(row).getAllByText('-').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Mesh ID column', () => {
    it('shows dash with no link for standalone CPs', async () => {
      const results = [makeSearchResult('cluster-a', 'default')];
      const enriched = [makeEnrichedCP()];
      rstest.mocked(useFleetSearchPoll).mockReturnValue([results, true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([enriched, true, true, null]);
      render(<ControlPlanesPage />);
      await waitFor(() => {
        const nameLink = screen.getByRole('link', { name: 'default' });
        const row = nameLink.closest('tr') as HTMLTableRowElement;
        const meshIdCell = within(row).getAllByRole('cell')[2];
        expect(meshIdCell).toHaveTextContent('-');
        expect(within(meshIdCell).queryByRole('link')).not.toBeInTheDocument();
      });
    });
  });

  describe('Observe column', () => {
    it('renders Observe column with Kiali link when Kiali is discovered', async () => {
      const results = [makeSearchResult('cluster-a', 'default')];
      const enriched = [makeEnrichedCP()];
      rstest.mocked(useFleetSearchPoll).mockReturnValue([results, true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([enriched, true, true, null]);
      const kiali: DiscoveredKiali = {
        cluster: 'cluster-a',
        crName: 'kiali',
        crNamespace: 'istio-system',
        deploymentNamespace: 'istio-system',
        instanceName: 'kiali',
        routeHost: 'kiali.apps.example.com'
      };
      rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [kiali], loaded: true, ossmcs: [] });
      render(<ControlPlanesPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Kiali' })).toHaveAttribute('href', 'https://kiali.apps.example.com');
      });
    });

    it('shows dash in Observe column when no Kiali is discovered for the CP', async () => {
      const results = [makeSearchResult('cluster-a', 'default')];
      const enriched = [makeEnrichedCP()];
      rstest.mocked(useFleetSearchPoll).mockReturnValue([results, true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([enriched, true, true, null]);
      rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [], loaded: true, ossmcs: [] });
      render(<ControlPlanesPage />);
      await waitFor(() => {
        expect(screen.getByText('cluster-a')).toBeInTheDocument();
      });
      expect(screen.queryByRole('link', { name: 'Kiali' })).not.toBeInTheDocument();
    });
  });

  describe('Type column', () => {
    it('shows Managed type for CPs with managedBy', () => {
      const cp = makeEnrichedCP({
        managedBy: { name: 'my-mesh', namespace: 'mesh-system' },
        meshID: 'mesh-system-my-mesh'
      });
      rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([[cp], true, true, null]);
      render(<ControlPlanesPage />);
      expect(screen.getByText('Managed')).toBeInTheDocument();
    });

    it('shows Discovered type for CPs with meshID but no managedBy', () => {
      const cp = makeEnrichedCP({
        meshID: 'discovered-id'
      });
      rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([[cp], true, true, null]);
      render(<ControlPlanesPage />);
      expect(screen.getByText('Discovered')).toBeInTheDocument();
    });

    it('shows Standalone type for CPs with no meshID and no managedBy', () => {
      const cp = makeEnrichedCP();
      rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([[cp], true, true, null]);
      render(<ControlPlanesPage />);
      expect(screen.getByText('Standalone')).toBeInTheDocument();
    });

    it('links managed mesh ID to the managed mesh detail page', () => {
      const cp = makeEnrichedCP({
        managedBy: { name: 'my-mesh', namespace: 'mesh-system' },
        meshID: 'mesh-system-my-mesh'
      });
      rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([[cp], true, true, null]);
      render(<ControlPlanesPage />);
      expect(screen.getByRole('link', { name: 'mesh-system-my-mesh' })).toHaveAttribute(
        'href',
        '/fleet-mesh/meshes/managed/mesh-system/my-mesh'
      );
    });

    it('links discovered mesh ID to the discovered mesh detail page', () => {
      const cp = makeEnrichedCP({
        meshID: 'discovered-id'
      });
      rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, undefined, rstest.fn()]);
      rstest.mocked(useEnrichedControlPlanes).mockReturnValue([[cp], true, true, null]);
      render(<ControlPlanesPage />);
      expect(screen.getByRole('link', { name: 'discovered-id' })).toHaveAttribute(
        'href',
        '/fleet-mesh/meshes/discovered/discovered-id'
      );
    });
  });
});
