import { renderHook } from '@testing-library/react';
import { useOperatorPresence } from '../useOperatorPresence';
import { getOperatorStatus } from '../../utils/operatorPresence';
import { useFleetSearchPoll } from '@stolostron/multicluster-sdk';

afterEach(() => rstest.clearAllMocks());

interface ClusteredItem {
  cluster: string;
  metadata: { name: string };
}

/** Branches the SDK mock on the queried kind so both hook queries can be set at once. */
function mockSearch(
  deployments: ClusteredItem[] | undefined,
  canary: ClusteredItem[] | undefined,
  error?: Error
): void {
  rstest
    .mocked(useFleetSearchPoll)
    .mockImplementation(((watchOptions?: { groupVersionKind?: { kind?: string } }) =>
      watchOptions?.groupVersionKind?.kind === 'Deployment'
        ? [deployments, true, error, rstest.fn()]
        : [canary, true, error, rstest.fn()]) as unknown as typeof useFleetSearchPoll);
}

/** The default-namespace roster: one row per cluster Search can see. */
const roster = (clusters: string[]): ClusteredItem[] =>
  clusters.map(cluster => ({ cluster, metadata: { name: 'default' } }));

describe('useOperatorPresence', () => {
  it('returns null status while search is loading', () => {
    rstest.mocked(useFleetSearchPoll).mockReturnValue([undefined, false, undefined, rstest.fn()]);
    const { result } = renderHook(() => useOperatorPresence());
    expect(result.current.loaded).toBe(false);
    expect(result.current.statusByCluster).toBeNull();
  });

  it('returns null status when the search queries error', () => {
    rstest.mocked(useFleetSearchPoll).mockReturnValue([undefined, true, new Error('search down'), rstest.fn()]);
    const { result } = renderHook(() => useOperatorPresence());
    expect(result.current.loaded).toBe(true);
    expect(result.current.statusByCluster).toBeNull();
    expect(getOperatorStatus(result.current.statusByCluster, 'cluster-a')).toBe('unknown');
  });

  it('returns null status when the roster comes back empty (no search data at all)', () => {
    mockSearch([], []);
    const { result } = renderHook(() => useOperatorPresence());
    expect(result.current.loaded).toBe(true);
    expect(result.current.statusByCluster).toBeNull();
  });

  it('marks a cluster installed when its operator deployment is found', () => {
    mockSearch(
      [{ cluster: 'cluster-a', metadata: { name: 'servicemesh-operator3' } }],
      roster(['cluster-a', 'cluster-b'])
    );
    const { result } = renderHook(() => useOperatorPresence());
    expect(getOperatorStatus(result.current.statusByCluster, 'cluster-a')).toBe('installed');
    expect(getOperatorStatus(result.current.statusByCluster, 'cluster-b')).toBe('missing');
  });

  it('marks a cluster missing when search sees the cluster but no operator deployment', () => {
    mockSearch([], roster(['cluster-a']));
    const { result } = renderHook(() => useOperatorPresence());
    expect(getOperatorStatus(result.current.statusByCluster, 'cluster-a')).toBe('missing');
  });

  it('reports unknown for a cluster search does not see, rather than missing', () => {
    mockSearch([{ cluster: 'cluster-a', metadata: { name: 'sail-operator' } }], roster(['cluster-a']));
    const { result } = renderHook(() => useOperatorPresence());
    expect(getOperatorStatus(result.current.statusByCluster, 'cluster-a')).toBe('installed');
    expect(getOperatorStatus(result.current.statusByCluster, 'cluster-not-indexed')).toBe('unknown');
  });

  it('skips the search queries when disabled', () => {
    const watchOptions: unknown[] = [];
    rstest.mocked(useFleetSearchPoll).mockImplementation(((options?: unknown) => {
      watchOptions.push(options);
      return [undefined, true, undefined, rstest.fn()];
    }) as unknown as typeof useFleetSearchPoll);
    renderHook(() => useOperatorPresence(false));
    // Both queries are skipped (undefined groupVersionKind), so pages with no
    // managed meshes do not poll for operator presence.
    expect(watchOptions).toHaveLength(2);
    expect(watchOptions.every(options => options === undefined)).toBe(true);
  });
});
