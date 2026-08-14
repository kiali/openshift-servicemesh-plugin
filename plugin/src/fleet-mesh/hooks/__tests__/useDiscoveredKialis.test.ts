import { renderHook, waitFor } from '@testing-library/react';
import { useDiscoveredKialis, __resetKialiCaches } from '../useDiscoveredKialis';
import { fleetK8sGet, useFleetSearchPoll } from '@stolostron/multicluster-sdk';
import type { KialiCR, OssmConsoleCR, Route } from '../../types/kiali';

const makeKialiCR = (overrides: Partial<KialiCR> = {}): KialiCR => ({
  apiVersion: 'kiali.io/v1alpha1',
  kind: 'Kiali',
  metadata: { name: 'kiali', namespace: 'istio-system' },
  spec: {
    deployment: { namespace: 'istio-system', instance_name: 'kiali' }
  },
  ...overrides
});

const makeRoute = (host: string): Route => ({
  apiVersion: 'route.openshift.io/v1',
  kind: 'Route',
  metadata: { name: 'kiali', namespace: 'istio-system' },
  spec: { host }
});

const makeOssmcCR = (overrides: Partial<OssmConsoleCR> = {}): OssmConsoleCR => ({
  apiVersion: 'kiali.io/v1alpha1',
  kind: 'OSSMConsole',
  metadata: { name: 'ossmconsole', namespace: 'istio-system' },
  status: {
    kiali: { serviceName: 'kiali', serviceNamespace: 'istio-system' }
  },
  ...overrides
});

function makeFleetSearchResult(
  cluster: string,
  name: string,
  ns: string
): { apiVersion: string; cluster: string; kind: string; metadata: { name: string; namespace: string } } {
  return { cluster, metadata: { name, namespace: ns }, apiVersion: 'kiali.io/v1alpha1', kind: 'Kiali' };
}

function makeOssmcSearchResult(
  cluster: string,
  name: string,
  ns: string
): { apiVersion: string; cluster: string; kind: string; metadata: { name: string; namespace: string } } {
  return { cluster, metadata: { name, namespace: ns }, apiVersion: 'kiali.io/v1alpha1', kind: 'OSSMConsole' };
}

afterEach(() => {
  rstest.clearAllMocks();
  __resetKialiCaches();
});

describe('useDiscoveredKialis', () => {
  it('returns empty state when ACM Search returns no Kiali CRs', () => {
    rstest.mocked(useFleetSearchPoll).mockReturnValue([[], true, undefined, rstest.fn()]);
    const { result } = renderHook(() => useDiscoveredKialis());
    expect(result.current.kialis).toHaveLength(0);
    expect(result.current.ossmcs).toHaveLength(0);
  });

  it('enriches Kiali CRs with spec via fleetK8sGet', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(makeKialiCR());
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
      expect(result.current.kialis).toHaveLength(1);
    });
    expect(result.current.kialis[0].deploymentNamespace).toBe('istio-system');
    expect(result.current.kialis[0].instanceName).toBe('kiali');
  });

  it('fetches Route for each enriched Kiali and sets routeHost', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(makeKialiCR());
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.kialis[0]?.routeHost).toBe('kiali.apps.example.com');
    });
  });

  it('skips Route fetch when spec.deployment.ingress.enabled is false', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    const kialiCR = makeKialiCR({ spec: { deployment: { namespace: 'istio-system', ingress: { enabled: false } } } });
    rstest.mocked(fleetK8sGet).mockResolvedValue(kialiCR);

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    const routeCalls = rstest
      .mocked(fleetK8sGet)
      .mock.calls.filter((c: [{ model?: { kind?: string } }]) => c[0]?.model?.kind === 'Route');
    expect(routeCalls).toHaveLength(0);
  });

  it('skips Route fetch when spec.server.web_fqdn is already set', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    const kialiCR = makeKialiCR({
      spec: { deployment: { namespace: 'istio-system' }, server: { web_fqdn: 'kiali.custom.com' } }
    });
    rstest.mocked(fleetK8sGet).mockResolvedValue(kialiCR);

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.kialis[0]?.webFqdn).toBe('kiali.custom.com');
    });
    const routeCalls = rstest
      .mocked(fleetK8sGet)
      .mock.calls.filter((c: [{ model?: { kind?: string } }]) => c[0]?.model?.kind === 'Route');
    expect(routeCalls).toHaveLength(0);
  });

  it('handles Route fetch 404 gracefully', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(makeKialiCR());
      if (model.kind === 'Route') return Promise.reject(new Error('404 Not Found'));
      return Promise.reject(new Error('unexpected'));
    });

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
      expect(result.current.kialis).toHaveLength(1);
    });
    expect(result.current.kialis[0].routeHost).toBeUndefined();
  });

  it('respects scope filter -- enriches all Kialis on scoped clusters', async () => {
    const searchResults = [
      makeFleetSearchResult('cluster-a', 'kiali', 'istio-system'),
      makeFleetSearchResult('cluster-b', 'kiali', 'istio-system')
    ];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(makeKialiCR());
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const scope = [{ cluster: 'cluster-a', namespace: 'istio-system' }];
    const { result } = renderHook(() => useDiscoveredKialis(scope));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    // Only cluster-a should be enriched (1 Kiali GET + 1 Route GET = 2 calls)
    expect(rstest.mocked(fleetK8sGet).mock.calls.length).toBe(2);
  });

  it('enriches Kiali when CR namespace differs from deployment namespace in scope filter', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'kiali-operator')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    const kialiCR = makeKialiCR({
      metadata: { name: 'kiali', namespace: 'kiali-operator' },
      spec: { deployment: { namespace: 'secure-ns', instance_name: 'kiali' } }
    });
    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(kialiCR);
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const scope = [{ cluster: 'cluster-a', namespace: 'secure-ns' }];
    const { result } = renderHook(() => useDiscoveredKialis(scope));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
      expect(result.current.kialis).toHaveLength(1);
    });
    expect(result.current.kialis[0].crNamespace).toBe('kiali-operator');
    expect(result.current.kialis[0].deploymentNamespace).toBe('secure-ns');
  });

  it('respects scope filter for OSSMC enrichment -- only enriches OSSMC on scoped clusters', async () => {
    const ossmcResults = [
      makeOssmcSearchResult('cluster-a', 'ossmconsole-a', 'istio-system'),
      makeOssmcSearchResult('cluster-b', 'ossmconsole-b', 'istio-system')
    ];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'OSSMConsole') return [ossmcResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'OSSMConsole') return Promise.resolve(makeOssmcCR());
      return Promise.reject(new Error('unexpected'));
    });

    const scope = [{ cluster: 'cluster-a', namespace: 'istio-system' }];
    const { result } = renderHook(() => useDiscoveredKialis(scope));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(rstest.mocked(fleetK8sGet).mock.calls).toHaveLength(1);
    expect(result.current.ossmcs).toHaveLength(1);
    expect(result.current.ossmcs[0].cluster).toBe('cluster-a');
  });

  it('uses module-level cache -- second mount reads from cache without re-fetching', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(makeKialiCR());
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const { result, unmount } = renderHook(() => useDiscoveredKialis());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const callsAfterFirst = rstest.mocked(fleetK8sGet).mock.calls.length;

    unmount();

    const { result: result2 } = renderHook(() => useDiscoveredKialis());
    await waitFor(() => expect(result2.current.loaded).toBe(true));
    expect(rstest.mocked(fleetK8sGet).mock.calls.length).toBe(callsAfterFirst);
    expect(result2.current.kialis[0].routeHost).toBe('kiali.apps.example.com');
  });

  it('discovers OSSMConsole CRs and enriches with status', async () => {
    const kialiResults = [makeFleetSearchResult('cluster-a', 'kiali', 'istio-system')];
    const ossmcResults = [makeOssmcSearchResult('cluster-a', 'ossmconsole', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [kialiResults, true, undefined, rstest.fn()];
        if (groupVersionKind.kind === 'OSSMConsole') return [ossmcResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(makeKialiCR());
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      if (model.kind === 'OSSMConsole') return Promise.resolve(makeOssmcCR());
      return Promise.reject(new Error('unexpected'));
    });

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.ossmcs).toHaveLength(1);
    });
    expect(result.current.ossmcs[0].kialiServiceNamespace).toBe('istio-system');
    expect(result.current.ossmcs[0].kialiServiceName).toBe('kiali');
  });

  it('uses deploymentNamespace fallback to metadata.namespace when spec.deployment.namespace is unset', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'kiali', 'custom-ns')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    const kialiCR = makeKialiCR({
      metadata: { name: 'kiali', namespace: 'custom-ns' },
      spec: { deployment: {} }
    });
    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(kialiCR);
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.kialis[0]?.deploymentNamespace).toBe('custom-ns');
    });
  });

  it('uses instanceName fallback chain: instance_name > metadata.name > "kiali"', async () => {
    const searchResults = [makeFleetSearchResult('cluster-a', 'my-kiali', 'istio-system')];
    rstest
      .mocked(useFleetSearchPoll)
      .mockImplementation(({ groupVersionKind }: { groupVersionKind: { kind?: string } }) => {
        if (groupVersionKind.kind === 'Kiali') return [searchResults, true, undefined, rstest.fn()];
        return [[], true, undefined, rstest.fn()];
      });

    const kialiCR = makeKialiCR({
      metadata: { name: 'my-kiali', namespace: 'istio-system' },
      spec: { deployment: { namespace: 'istio-system' } }
    });
    rstest.mocked(fleetK8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Kiali') return Promise.resolve(kialiCR);
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const { result } = renderHook(() => useDiscoveredKialis());

    await waitFor(() => {
      expect(result.current.kialis[0]?.instanceName).toBe('my-kiali');
    });
  });
});
