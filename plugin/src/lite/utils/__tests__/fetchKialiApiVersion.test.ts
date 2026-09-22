import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import { fetchKialiApiVersion } from '../fetchKialiApiVersion';

describe('fetchKialiApiVersion', () => {
  const originalApiProxy = process.env.API_PROXY;

  beforeEach(() => {
    process.env.API_PROXY = '/api/proxy/plugin/ossmconsole/kiali';
  });

  afterEach(() => {
    process.env.API_PROXY = originalApiProxy;
    rstest.clearAllMocks();
  });

  it('returns status Kiali version from the console proxy /api endpoint', async () => {
    rstest.mocked(consoleFetch).mockResolvedValue({
      json: async () => ({ status: { 'Kiali version': 'v2.31.0-SNAPSHOT' } }),
      ok: true
    } as Response);

    await expect(fetchKialiApiVersion()).resolves.toBe('v2.31.0-SNAPSHOT');
    expect(consoleFetch).toHaveBeenCalledWith('/api/proxy/plugin/ossmconsole/kiali/api');
  });

  it('returns undefined when API_PROXY is unset', async () => {
    delete process.env.API_PROXY;
    await expect(fetchKialiApiVersion()).resolves.toBeUndefined();
    expect(consoleFetch).not.toHaveBeenCalled();
  });

  it('returns undefined on non-2xx responses', async () => {
    rstest.mocked(consoleFetch).mockResolvedValue({ ok: false } as Response);
    await expect(fetchKialiApiVersion()).resolves.toBeUndefined();
  });

  it('returns undefined on network failure', async () => {
    rstest.mocked(consoleFetch).mockRejectedValue(new Error('network'));
    await expect(fetchKialiApiVersion()).resolves.toBeUndefined();
  });
});
