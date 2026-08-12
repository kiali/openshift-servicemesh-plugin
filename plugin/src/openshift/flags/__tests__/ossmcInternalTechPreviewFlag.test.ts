import { renderHook, waitFor } from '@testing-library/react';
import { getPluginConfig } from '../../utils/KialiIntegration';
import useOssmcInternalTechPreviewFlag from '../ossmcInternalTechPreviewFlag';
import { OSSMC_INTERNAL_TECH_PREVIEW_FLAG } from '../constants';

rs.mock('../../utils/KialiIntegration', () => ({
  getPluginConfig: rs.fn()
}));

describe('useOssmcInternalTechPreviewFlag', () => {
  it('queues a pessimistic false default before the config fetch resolves', async () => {
    (getPluginConfig as ReturnType<typeof rs.fn>).mockResolvedValue({ internal: { techPreview: true } });
    const setFlag = rs.fn();

    renderHook(() => useOssmcInternalTechPreviewFlag(setFlag));

    expect(setFlag).toHaveBeenCalledWith(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, false);
  });

  it('sets the flag to true when internal.techPreview is true', async () => {
    (getPluginConfig as ReturnType<typeof rs.fn>).mockResolvedValue({ internal: { techPreview: true } });
    const setFlag = rs.fn();

    renderHook(() => useOssmcInternalTechPreviewFlag(setFlag));

    await waitFor(() => {
      expect(setFlag).toHaveBeenCalledWith(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, true);
    });
  });

  it('sets the flag to false when internal.techPreview is false', async () => {
    (getPluginConfig as ReturnType<typeof rs.fn>).mockResolvedValue({ internal: { techPreview: false } });
    const setFlag = rs.fn();

    renderHook(() => useOssmcInternalTechPreviewFlag(setFlag));

    await waitFor(() => {
      expect(setFlag).toHaveBeenCalledWith(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, false);
    });
    expect(setFlag).toHaveBeenCalledTimes(2);
  });

  it('sets the flag to false when internal is missing from the config', async () => {
    (getPluginConfig as ReturnType<typeof rs.fn>).mockResolvedValue({});
    const setFlag = rs.fn();

    renderHook(() => useOssmcInternalTechPreviewFlag(setFlag));

    await waitFor(() => {
      expect(setFlag).toHaveBeenCalledWith(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, false);
    });
    expect(setFlag).toHaveBeenCalledTimes(2);
  });

  it('sets the flag to false when the fetch fails', async () => {
    (getPluginConfig as ReturnType<typeof rs.fn>).mockRejectedValue(new Error('network error'));
    const setFlag = rs.fn();

    renderHook(() => useOssmcInternalTechPreviewFlag(setFlag));

    await waitFor(() => {
      expect(setFlag).toHaveBeenCalledWith(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, false);
    });
    expect(setFlag).toHaveBeenCalledTimes(2);
  });
});
