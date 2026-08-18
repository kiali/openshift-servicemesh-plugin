import { renderHook } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { probeWithRetry } from '../../utils/probeWithRetry';
import useKialiAvailableFlag from '../kialiAvailableFlag';
import { makeOssmConsoleResource } from '../../../lite/__fixtures__/testFactories';

rs.mock('../../utils/probeWithRetry', () => ({
  probeWithRetry: rs.fn()
}));

describe('useKialiAvailableFlag', () => {
  const originalApiProxy = process.env.API_PROXY;

  beforeEach(() => {
    process.env.API_PROXY = 'https://proxy.example/api/proxy/plugin/ossmconsole/';
  });

  afterEach(() => {
    process.env.API_PROXY = originalApiProxy;
    rstest.clearAllMocks();
  });

  it('sets KIALI_AVAILABLE to false when API_PROXY is unset', () => {
    delete process.env.API_PROXY;
    const setFlag = rs.fn();
    rstest.mocked(useK8sWatchResource).mockReturnValue([[], true, null]);

    renderHook(() => useKialiAvailableFlag(setFlag));

    expect(setFlag).toHaveBeenCalledWith('KIALI_AVAILABLE', false);
    expect(probeWithRetry).not.toHaveBeenCalled();
  });

  it('probes Kiali on mount', () => {
    const setFlag = rs.fn();
    rstest.mocked(useK8sWatchResource).mockReturnValue([[makeOssmConsoleResource()], true, null]);

    renderHook(() => useKialiAvailableFlag(setFlag));

    expect(probeWithRetry).toHaveBeenCalledWith(
      'https://proxy.example/api/proxy/plugin/ossmconsole//api/status',
      'KIALI_AVAILABLE',
      setFlag,
      3,
      'application/json'
    );
  });

  it('re-probes when OSSMConsole status.kiali changes', () => {
    const setFlag = rs.fn();
    let ossmConsoles = [makeOssmConsoleResource()];
    rstest.mocked(useK8sWatchResource).mockImplementation(() => [ossmConsoles, true, null]);

    const { rerender } = renderHook(() => useKialiAvailableFlag(setFlag));
    expect(probeWithRetry).toHaveBeenCalledTimes(1);

    ossmConsoles = [
      makeOssmConsoleResource({
        status: { kiali: { available: true, serviceName: 'kiali', serviceNamespace: 'istio-system' } }
      })
    ];
    rerender();
    expect(probeWithRetry).toHaveBeenCalledTimes(2);
  });
});
