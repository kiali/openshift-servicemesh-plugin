import { renderHook, waitFor } from '@testing-library/react';
import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import { useKialiRouteHosts, __resetKialiRouteHostCache } from '../useKialiRouteHosts';
import { makeKialiResource } from '../../__fixtures__/testFactories';
import type { Route } from '../../types/kiali';

const makeRoute = (host: string): Route => ({
  apiVersion: 'route.openshift.io/v1',
  kind: 'Route',
  metadata: { name: 'kiali', namespace: 'istio-system' },
  spec: { host }
});

afterEach(() => {
  rstest.clearAllMocks();
  __resetKialiRouteHostCache();
});

describe('useKialiRouteHosts', () => {
  it('returns an empty map when there are no Kiali resources', () => {
    const { result } = renderHook(() => useKialiRouteHosts([]));
    expect(result.current.size).toBe(0);
  });

  it('fetches the Route for a Kiali resource and keys the result by service namespace/name', async () => {
    rstest.mocked(k8sGet).mockImplementation(({ model }: { model: { kind?: string } }) => {
      if (model.kind === 'Route') return Promise.resolve(makeRoute('kiali.apps.example.com'));
      return Promise.reject(new Error('unexpected'));
    });

    const { result } = renderHook(() => useKialiRouteHosts([makeKialiResource()]));

    await waitFor(() => {
      expect(result.current.get('istio-system/kiali')).toBe('kiali.apps.example.com');
    });
  });

  it('skips the Route fetch when spec.server.web_fqdn is already set', async () => {
    rstest.mocked(k8sGet).mockResolvedValue(makeRoute('kiali.apps.example.com'));

    const resource = makeKialiResource({ spec: { server: { web_fqdn: 'kiali.custom.com' } } });
    const { result } = renderHook(() => useKialiRouteHosts([resource]));

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.current.size).toBe(0);
    expect(k8sGet).not.toHaveBeenCalled();
  });

  it('skips the Route fetch when spec.deployment.ingress.enabled is false', async () => {
    rstest.mocked(k8sGet).mockResolvedValue(makeRoute('kiali.apps.example.com'));

    const resource = makeKialiResource({
      spec: { deployment: { instance_name: 'kiali', ingress: { enabled: false }, namespace: 'istio-system' } }
    });
    const { result } = renderHook(() => useKialiRouteHosts([resource]));

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.current.size).toBe(0);
    expect(k8sGet).not.toHaveBeenCalled();
  });

  it('handles a Route fetch failure gracefully', async () => {
    rstest.mocked(k8sGet).mockRejectedValue(new Error('404 Not Found'));

    const { result } = renderHook(() => useKialiRouteHosts([makeKialiResource()]));

    await waitFor(() => {
      expect(k8sGet).toHaveBeenCalled();
    });
    expect(result.current.size).toBe(0);
  });

  it('deduplicates resources that resolve to the same service namespace/name', async () => {
    rstest.mocked(k8sGet).mockResolvedValue(makeRoute('kiali.apps.example.com'));

    const resources = [makeKialiResource(), makeKialiResource({ metadata: { name: 'kiali' } })];
    renderHook(() => useKialiRouteHosts(resources));

    await waitFor(() => {
      expect(k8sGet).toHaveBeenCalledTimes(1);
    });
  });

  it('uses a module-level cache -- a second mount does not re-fetch', async () => {
    rstest.mocked(k8sGet).mockResolvedValue(makeRoute('kiali.apps.example.com'));

    const { result, unmount } = renderHook(() => useKialiRouteHosts([makeKialiResource()]));
    await waitFor(() => expect(result.current.get('istio-system/kiali')).toBe('kiali.apps.example.com'));
    unmount();

    const { result: result2 } = renderHook(() => useKialiRouteHosts([makeKialiResource()]));
    await waitFor(() => expect(result2.current.get('istio-system/kiali')).toBe('kiali.apps.example.com'));
    expect(k8sGet).toHaveBeenCalledTimes(1);
  });
});
