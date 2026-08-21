import { renderHook, waitFor } from '@testing-library/react';
import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import { useKialiDetailVersion } from '../useKialiDetailVersion';
import { makeKialiResource } from '../../__fixtures__/testFactories';
import { fetchKialiApiVersion } from '../../utils/fetchKialiApiVersion';

rs.mock('../../utils/fetchKialiApiVersion', () => ({
  fetchKialiApiVersion: rs.fn()
}));

describe('useKialiDetailVersion', () => {
  afterEach(() => rstest.clearAllMocks());

  it('prefers /api version when available', async () => {
    rstest.mocked(fetchKialiApiVersion).mockResolvedValue('v2.31.0-SNAPSHOT');
    const resource = makeKialiResource();

    const { result } = renderHook(() => useKialiDetailVersion(resource, true));

    await waitFor(() => {
      expect(result.current.loaded).toBe(true);
    });
    expect(result.current.version).toBe('v2.31.0-SNAPSHOT');
    expect(k8sGet).not.toHaveBeenCalled();
  });

  it('falls back to deployment image version when /api fails', async () => {
    rstest.mocked(fetchKialiApiVersion).mockResolvedValue(undefined);
    rstest.mocked(k8sGet).mockResolvedValue({
      spec: { template: { spec: { containers: [{ name: 'kiali', image: 'quay.io/kiali/kiali:v2.13.0' }] } } }
    });
    const resource = makeKialiResource();

    const { result } = renderHook(() => useKialiDetailVersion(resource, true));

    await waitFor(() => {
      expect(result.current.version).toBe('v2.13.0');
    });
  });

  it('uses deployment image version when not connected to Console', async () => {
    rstest.mocked(k8sGet).mockResolvedValue({
      spec: { template: { spec: { containers: [{ name: 'kiali', image: 'quay.io/kiali/kiali:v2.13.0' }] } } }
    });
    const resource = makeKialiResource();

    const { result } = renderHook(() => useKialiDetailVersion(resource, false));

    await waitFor(() => {
      expect(result.current.version).toBe('v2.13.0');
    });
    expect(fetchKialiApiVersion).not.toHaveBeenCalled();
  });
});
