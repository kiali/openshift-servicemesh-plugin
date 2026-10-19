import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrustStatusCard } from '../TrustStatusCard';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { Certificate } from '../../types/certManager';
import type { ClusterMeshStatus } from '../../types/multiClusterMesh';
import type { K8sCondition } from '../../types/common';

const CLUSTER_NAME_LABEL = 'mesh.open-cluster-management.io/cluster-name';
const MESH_NAME_LABEL = 'mesh.open-cluster-management.io/mesh-name';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

const makeCondition = (type: string, status: 'True' | 'False' | 'Unknown', reason?: string): K8sCondition => ({
  type,
  status,
  reason
});

const makeCluster = (
  name: string,
  trust?: { reason?: string; status: 'True' | 'False' | 'Unknown' }
): ClusterMeshStatus => ({
  clusterName: name,
  conditions: trust ? [makeCondition('TrustDistributed', trust.status, trust.reason)] : []
});

const makeCert = (clusterName: string, timestamps?: { notAfter?: string; renewalTime?: string }): Certificate => ({
  apiVersion: 'cert-manager.io/v1',
  kind: 'Certificate',
  metadata: {
    name: `cert-${clusterName}`,
    namespace: 'mesh-system',
    labels: {
      [CLUSTER_NAME_LABEL]: clusterName,
      [MESH_NAME_LABEL]: 'test-mesh'
    }
  },
  status: {
    conditions: [makeCondition('Ready', 'True')],
    ...timestamps
  }
});

// Convenience: set up the mock implementation for the Certificate watch (the
// only watch the card starts). Re-renders (from filter/search interactions)
// keep getting the right data without exhausting a once-queue.
const setupWatches = (certs: Certificate[], opts?: { certsError?: unknown; certsLoaded?: boolean }): void => {
  const { certsLoaded = true, certsError = null } = opts ?? {};
  rstest.mocked(useK8sWatchResource).mockImplementation((params: { groupVersionKind?: { kind?: string } } | null) => {
    if (params?.groupVersionKind?.kind === 'Certificate') return [certs, certsLoaded, certsError];
    return [null, false, null];
  });
};

const defaultProps = {
  meshName: 'test-mesh',
  meshNamespace: 'mesh-system',
  issuerName: 'root-ca',
  clusterStatuses: [makeCluster('cluster-a')]
};

afterEach(() => rstest.clearAllMocks());

// ---------------------------------------------------------------------------
// No issuer configured
// ---------------------------------------------------------------------------

describe('TrustStatusCard — no issuer', () => {
  it('renders the not-configured message and does not start any watches', () => {
    render(<TrustStatusCard {...defaultProps} issuerName="" clusterStatuses={[]} />);
    expect(screen.getByText('Trust Status')).toBeInTheDocument();
    // The Trans mock renders the i18nKey as flat text, so the <code> tags appear literally.
    expect(
      screen.getByText(
        'Trust is not configured for this mesh. Set <code>spec.security.trust.certManager.issuerRef</code> on the MultiClusterMesh to enable CA trust distribution.'
      )
    ).toBeInTheDocument();
    // Hooks must always be called (rules of hooks), but the watch is passed null — no real watch started.
    expect(rstest.mocked(useK8sWatchResource)).not.toHaveBeenCalledWith(
      expect.objectContaining({ groupVersionKind: expect.anything() })
    );
  });
});

// ---------------------------------------------------------------------------
// Loading states
// ---------------------------------------------------------------------------

describe('TrustStatusCard — loading', () => {
  it('shows spinner when certs are not yet loaded', () => {
    setupWatches([], { certsLoaded: false });
    render(<TrustStatusCard {...defaultProps} />);
    expect(screen.getByLabelText('Loading trust status')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

describe('TrustStatusCard — errors', () => {
  it('shows certs error card when cert watch fails', () => {
    setupWatches([], { certsError: new Error('cert watch failed') });
    render(<TrustStatusCard {...defaultProps} />);
    expect(screen.getByText('Unable to load certificate data')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty states (after loading)
// ---------------------------------------------------------------------------

describe('TrustStatusCard — empty states', () => {
  it('shows no-clusters message when clusterStatuses is empty', () => {
    setupWatches([]);
    render(<TrustStatusCard {...defaultProps} clusterStatuses={[]} />);
    expect(screen.getByText('No clusters are part of this mesh yet.')).toBeInTheDocument();
  });

  it('renders trust status from the CR condition even when no certificates exist yet', () => {
    setupWatches([]);
    render(
      <TrustStatusCard
        {...defaultProps}
        clusterStatuses={[makeCluster('cluster-a', { status: 'False', reason: 'CacertsPending' })]}
      />
    );
    expect(screen.getByText('cluster-a')).toBeInTheDocument();
    expect(screen.getByText('Trust Pending')).toBeInTheDocument();
    // No certs yet: Expires and Renews show dashes.
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Row rendering — trust status from the CR condition, timestamps from certs
// ---------------------------------------------------------------------------

describe('TrustStatusCard — row status labels', () => {
  it('shows the TrustDistributed condition status and cert timestamps', () => {
    const certs = [
      makeCert('cluster-a', {
        notAfter: '2026-12-31T00:00:00Z',
        renewalTime: '2026-11-30T00:00:00Z'
      })
    ];
    setupWatches(certs);
    render(<TrustStatusCard {...defaultProps} clusterStatuses={[makeCluster('cluster-a', { status: 'True' })]} />);
    expect(screen.getByText('Distributed')).toBeInTheDocument();
    expect(screen.getByText('2026-12-31T00:00:00Z')).toBeInTheDocument();
    expect(screen.getByText('2026-11-30T00:00:00Z')).toBeInTheDocument();
  });

  it('shows dash in Expires and Renews columns when cert has no timestamp fields', () => {
    setupWatches([makeCert('cluster-a')]);
    render(<TrustStatusCard {...defaultProps} />);
    // Two dashes: one for Expires, one for Renews
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
  });

  it('shows Trust Pending when TrustDistributed is False with CacertsPending', () => {
    setupWatches([]);
    render(
      <TrustStatusCard
        {...defaultProps}
        clusterStatuses={[makeCluster('cluster-a', { status: 'False', reason: 'CacertsPending' })]}
      />
    );
    expect(screen.getByText('Trust Pending')).toBeInTheDocument();
  });

  it('shows the raw reason when TrustDistributed is False with an unknown reason', () => {
    setupWatches([]);
    render(
      <TrustStatusCard
        {...defaultProps}
        clusterStatuses={[makeCluster('cluster-a', { status: 'False', reason: 'SomeTrustError' })]}
      />
    );
    expect(screen.getByText('SomeTrustError')).toBeInTheDocument();
  });

  it('shows Unknown when the cluster has no TrustDistributed condition', () => {
    setupWatches([]);
    render(<TrustStatusCard {...defaultProps} clusterStatuses={[makeCluster('cluster-a')]} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Filter toggles
// ---------------------------------------------------------------------------

describe('TrustStatusCard — filters', () => {
  const clusters = [
    makeCluster('dist-cluster', { status: 'True' }),
    makeCluster('pending-cluster', { status: 'False', reason: 'CacertsPending' }),
    makeCluster('failed-cluster', { status: 'False', reason: 'SomeTrustError' })
  ];
  const certs = [makeCert('dist-cluster')];

  beforeEach(() => setupWatches(certs));

  it('filters to only Distributed clusters', async () => {
    const user = userEvent.setup();
    render(<TrustStatusCard {...defaultProps} clusterStatuses={clusters} />);
    await user.click(screen.getByText('Distributed (1)'));
    expect(screen.getByText('dist-cluster')).toBeInTheDocument();
    expect(screen.queryByText('pending-cluster')).not.toBeInTheDocument();
    expect(screen.queryByText('failed-cluster')).not.toBeInTheDocument();
  });

  it('filters to only Pending clusters', async () => {
    const user = userEvent.setup();
    render(<TrustStatusCard {...defaultProps} clusterStatuses={clusters} />);
    await user.click(screen.getByText('Pending (1)'));
    expect(screen.getByText('pending-cluster')).toBeInTheDocument();
    expect(screen.queryByText('dist-cluster')).not.toBeInTheDocument();
  });

  it('filters to only Failed clusters', async () => {
    const user = userEvent.setup();
    render(<TrustStatusCard {...defaultProps} clusterStatuses={clusters} />);
    await user.click(screen.getByText('Failed (1)'));
    expect(screen.getByText('failed-cluster')).toBeInTheDocument();
    expect(screen.queryByText('dist-cluster')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('TrustStatusCard — search', () => {
  const clusters = [makeCluster('alpha-cluster', { status: 'True' }), makeCluster('beta-cluster', { status: 'True' })];
  const certs = [makeCert('alpha-cluster'), makeCert('beta-cluster')];

  beforeEach(() => {
    setupWatches(certs);
    rstest.useFakeTimers();
  });
  afterEach(() => {
    rstest.useRealTimers();
  });

  it('narrows results to the matching cluster', () => {
    render(<TrustStatusCard {...defaultProps} clusterStatuses={clusters} />);
    fireEvent.change(screen.getByPlaceholderText('Filter by cluster name'), { target: { value: 'alpha' } });
    act(() => {
      rstest.advanceTimersByTime(200);
    });
    expect(screen.getByText('alpha-cluster')).toBeInTheDocument();
    expect(screen.queryByText('beta-cluster')).not.toBeInTheDocument();
  });

  it('shows no-match row when search has no results', () => {
    render(<TrustStatusCard {...defaultProps} clusterStatuses={clusters} />);
    fireEvent.change(screen.getByPlaceholderText('Filter by cluster name'), { target: { value: 'zzznomatch' } });
    act(() => {
      rstest.advanceTimersByTime(200);
    });
    expect(screen.getByText('No clusters match the current filter.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cluster links
// ---------------------------------------------------------------------------

describe('TrustStatusCard — cluster links', () => {
  it('links cluster names to ACM cluster detail pages', () => {
    setupWatches([makeCert('cluster-a')]);
    render(<TrustStatusCard {...defaultProps} />);
    expect(screen.getByRole('link', { name: 'cluster-a' })).toHaveAttribute(
      'href',
      '/multicloud/infrastructure/clusters/details/cluster-a/cluster-a/overview'
    );
  });
});
