import { render, screen, waitFor } from '@testing-library/react';
import ControlPlaneDetailPage from '../ControlPlaneDetailPage';
import { useParams } from 'react-router-dom-v5-compat';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { fleetK8sGet } from '@stolostron/multicluster-sdk';
import { setInEnrichmentCache, __resetEnrichmentCache } from '../../hooks/useEnrichedControlPlanes';
import { useDiscoveredKialis } from '../../hooks/useDiscoveredKialis';
import { useManagedClusterMap } from '../../hooks/useManagedClusterMap';
import type { Istio } from '../../types/istio';
import type { DiscoveredKiali, DiscoveredOssmc } from '../../types/kiali';
import type { ManagedCluster } from '../../types/managedCluster';

rstest.mock('../../hooks/useDiscoveredKialis', { mock: true });
rstest.mock('../../hooks/useManagedClusterMap', { mock: true });

const makeIstio = (overrides: Partial<Istio> = {}): Istio => ({
  apiVersion: 'sailoperator.io/v1',
  kind: 'Istio',
  metadata: { name: 'default', creationTimestamp: '2026-06-22T12:00:00Z' },
  spec: {
    namespace: 'istio-system',
    version: 'v1.24.0',
    values: {
      global: {
        meshID: 'mesh1',
        multiCluster: { clusterName: 'cluster-a' },
        network: 'network1'
      }
    }
  },
  status: {
    conditions: [{ type: 'Ready', status: 'True' }]
  },
  ...overrides
});

afterEach(() => {
  rstest.clearAllMocks();
  __resetEnrichmentCache();
});

beforeEach(() => {
  rstest.mocked(useK8sWatchResource).mockReturnValue([[], true, null]);
  rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [], loaded: true, ossmcs: [] });
  rstest.mocked(useManagedClusterMap).mockReturnValue([new Map(), true, null]);
});

describe('ControlPlaneDetailPage', () => {
  describe('invalid URL (missing params)', () => {
    it('shows Not Found when cluster and name are absent', () => {
      rstest.mocked(useParams).mockReturnValue({});
      render(<ControlPlaneDetailPage />);
      expect(screen.getByText('Not Found')).toBeInTheDocument();
      expect(
        screen.getByText('Invalid URL. Expected /fleet-mesh/control-planes/:type/:cluster/:name.')
      ).toBeInTheDocument();
    });

    it('shows Not Found when type param is invalid', () => {
      rstest.mocked(useParams).mockReturnValue({ type: 'bogus', cluster: 'cluster-a', name: 'default' });
      render(<ControlPlaneDetailPage />);
      expect(screen.getByText('Not Found')).toBeInTheDocument();
      expect(
        screen.getByText('Invalid URL. Expected /fleet-mesh/control-planes/:type/:cluster/:name.')
      ).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('shows spinner while fleetK8sGet is pending', () => {
      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-a', name: 'default' });
      rstest.mocked(fleetK8sGet).mockReturnValue(new Promise(() => {}));
      render(<ControlPlaneDetailPage />);
      expect(screen.getByLabelText('Loading control plane')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('shows generic error when fleetK8sGet rejects', async () => {
      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-a', name: 'default' });
      rstest.mocked(fleetK8sGet).mockRejectedValue(new Error('network timeout'));
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Error loading control plane')).toBeInTheDocument();
        expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
      });
    });

    it('shows not-found message for 404 errors', async () => {
      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-a', name: 'default' });
      const error404 = Object.assign(new Error('Not Found'), { code: 404 });
      rstest.mocked(fleetK8sGet).mockRejectedValue(error404);
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Control plane not found')).toBeInTheDocument();
        expect(screen.getByText('Istio "default" was not found on cluster "cluster-a".')).toBeInTheDocument();
      });
    });
  });

  describe('loaded state', () => {
    beforeEach(() => {
      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-a', name: 'default' });
    });

    it('renders the breadcrumb and name heading', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Control Planes' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'default' })).toBeInTheDocument();
      });
    });

    it('shows version in the overview card', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('v1.24.0')).toBeInTheDocument();
      });
    });

    it('shows meshID in the overview card', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getAllByText('mesh1')).toHaveLength(1);
      });
    });

    it('shows network in the overview card', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('network1')).toBeInTheDocument();
      });
    });

    it('links cluster name to ACM cluster detail page', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'cluster-a' })).toHaveAttribute(
          'href',
          '/multicloud/infrastructure/clusters/details/cluster-a/cluster-a/overview'
        );
      });
    });

    it('shows conditions table when conditions are present', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Conditions')).toBeInTheDocument();
      });
    });

    it('links mesh ID to managed mesh detail page when correlated to a MultiClusterMesh', async () => {
      const mcm = {
        metadata: { name: 'my-mesh', namespace: 'mesh-system' },
        spec: { clusterSet: 'global', controlPlane: { namespace: 'istio-system' } },
        status: { clusterStatus: [{ clusterName: 'cluster-a' }] }
      };
      rstest.mocked(useK8sWatchResource).mockReturnValue([[mcm], true, null]);
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'mesh1' })).toHaveAttribute(
          'href',
          '/fleet-mesh/meshes/managed/mesh-system/my-mesh'
        );
      });
    });

    it('shows discovered mesh link when not correlated to a managed mesh', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Mesh ID')).toBeInTheDocument();
      });
      expect(screen.queryByRole('link', { name: 'mesh1' })).toHaveAttribute(
        'href',
        '/fleet-mesh/meshes/discovered/mesh1'
      );
    });

    it('shows dash for mesh ID when CP has no meshID and no MCM', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(
        makeIstio({
          spec: { namespace: 'istio-system' }
        })
      );
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Mesh ID')).toBeInTheDocument();
      });
      expect(screen.queryByRole('link', { name: 'mesh1' })).not.toBeInTheDocument();
    });
  });

  describe('useEffect cancellation', () => {
    it('does not update state after unmount', async () => {
      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-a', name: 'default' });
      let resolvePromise!: (value: Istio) => void;
      rstest.mocked(fleetK8sGet).mockReturnValue(
        new Promise(resolve => {
          resolvePromise = resolve;
        })
      );
      const { unmount } = render(<ControlPlaneDetailPage />);
      unmount();
      resolvePromise!(makeIstio());
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByText('default')).not.toBeInTheDocument();
    });
  });

  describe('stale-while-revalidate', () => {
    beforeEach(() => {
      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-a', name: 'default' });
    });

    it('renders cached data immediately without waiting for network', () => {
      setInEnrichmentCache('cluster-a', 'default', makeIstio());
      rstest.mocked(fleetK8sGet).mockReturnValue(new Promise(() => {}));
      render(<ControlPlaneDetailPage />);
      expect(screen.getByRole('heading', { name: 'default' })).toBeInTheDocument();
      expect(screen.getByText('v1.24.0')).toBeInTheDocument();
      expect(screen.queryByLabelText('Loading control plane')).not.toBeInTheDocument();
    });

    it('shows spinner when cache has no entry for the requested CP', () => {
      rstest.mocked(fleetK8sGet).mockReturnValue(new Promise(() => {}));
      render(<ControlPlaneDetailPage />);
      expect(screen.getByLabelText('Loading control plane')).toBeInTheDocument();
    });

    it('shows refresh error banner when cached data is shown but background refresh fails', async () => {
      setInEnrichmentCache('cluster-a', 'default', makeIstio());
      rstest.mocked(fleetK8sGet).mockRejectedValue(new Error('network timeout'));
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Data may be stale — background refresh failed.')).toBeInTheDocument();
      });
      expect(screen.getByRole('heading', { name: 'default' })).toBeInTheDocument();
    });

    it('does not show refresh error banner when cache miss and refresh fails', async () => {
      rstest.mocked(fleetK8sGet).mockRejectedValue(new Error('network timeout'));
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Error loading control plane')).toBeInTheDocument();
      });
      expect(screen.queryByText('Data may be stale — background refresh failed.')).not.toBeInTheDocument();
    });

    it('updates data when background refresh succeeds after cache hit', async () => {
      const oldIstio = makeIstio({ spec: { namespace: 'istio-system', version: 'v1.23.0' } });
      setInEnrichmentCache('cluster-a', 'default', oldIstio);
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      render(<ControlPlaneDetailPage />);
      expect(screen.getByText('v1.23.0')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('v1.24.0')).toBeInTheDocument();
      });
    });

    it('clears stale data on route change when new CP has no cache entry', async () => {
      setInEnrichmentCache('cluster-a', 'default', makeIstio());
      rstest.mocked(fleetK8sGet).mockReturnValue(new Promise(() => {}));
      const { rerender } = render(<ControlPlaneDetailPage />);
      expect(screen.getByRole('heading', { name: 'default' })).toBeInTheDocument();

      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-b', name: 'other' });
      rstest.mocked(fleetK8sGet).mockReturnValue(new Promise(() => {}));
      rerender(<ControlPlaneDetailPage />);

      expect(screen.queryByText('v1.24.0')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Loading control plane')).toBeInTheDocument();
    });
  });

  describe('Kiali/OSSMC links', () => {
    beforeEach(() => {
      rstest.mocked(useParams).mockReturnValue({ type: 'discovered', cluster: 'cluster-a', name: 'default' });
    });

    it('shows a spinner in the Observability card while cluster and Kiali data are loading', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [], loaded: false, ossmcs: [] });
      rstest.mocked(useManagedClusterMap).mockReturnValue([new Map(), false, null]);
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
      });
      expect(screen.queryByText('Kiali not available')).not.toBeInTheDocument();
    });

    it('renders Kiali hostname link when a Kiali is discovered for that CP', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      const kiali: DiscoveredKiali = {
        cluster: 'cluster-a',
        crName: 'kiali',
        crNamespace: 'istio-system',
        deploymentNamespace: 'istio-system',
        instanceName: 'kiali',
        routeHost: 'kiali.apps.cluster-a.example.com'
      };
      rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [kiali], loaded: true, ossmcs: [] });
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /kiali\.apps\.cluster-a\.example\.com/ })).toHaveAttribute(
          'href',
          'https://kiali.apps.cluster-a.example.com'
        );
      });
    });

    it('renders Console link for hub OSSMC when an OSSMC is discovered', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      const kiali: DiscoveredKiali = {
        cluster: 'cluster-a',
        crName: 'kiali',
        crNamespace: 'istio-system',
        deploymentNamespace: 'istio-system',
        instanceName: 'kiali',
        routeHost: 'kiali.apps.cluster-a.example.com'
      };
      const ossmc: DiscoveredOssmc = {
        cluster: 'cluster-a',
        crName: 'ossmconsole',
        crNamespace: 'istio-system',
        kialiServiceName: 'kiali',
        kialiServiceNamespace: 'istio-system'
      };
      rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [kiali], loaded: true, ossmcs: [ossmc] });
      const hubCluster: ManagedCluster = {
        apiVersion: 'cluster.open-cluster-management.io/v1',
        kind: 'ManagedCluster',
        metadata: { name: 'cluster-a', labels: { 'local-cluster': 'true' } }
      };
      const clusterMap = new Map<string, ManagedCluster>([['cluster-a', hubCluster]]);
      rstest.mocked(useManagedClusterMap).mockReturnValue([clusterMap, true, null]);
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByRole('link', { name: 'Console' })).toHaveAttribute(
          'href',
          '/ossmconsole/kialis/istio-system/kiali'
        );
      });
    });

    it('renders Observability card with unavailable messages when no Kiali/OSSMC matches', async () => {
      rstest.mocked(fleetK8sGet).mockResolvedValue(makeIstio());
      rstest.mocked(useDiscoveredKialis).mockReturnValue({ kialis: [], loaded: true, ossmcs: [] });
      render(<ControlPlaneDetailPage />);
      await waitFor(() => {
        expect(screen.getByText('Observability')).toBeInTheDocument();
      });
      const observabilityCard = screen.getByText('Observability').closest('.pf-v6-c-card');
      expect(observabilityCard).not.toBeNull();
      expect(observabilityCard!.textContent).toContain('Kiali not available');
      expect(observabilityCard!.textContent).toContain('OSSMC not available');
      expect(observabilityCard!.querySelector('a')).toBeNull();
    });
  });
});
