import { renderHook, waitFor } from '@testing-library/react';
import { probeWithRetry } from '../../../openshift/utils/probeWithRetry';
import useFleetMeshAvailableFlag from '../fleetMeshAvailableFlag';
import { ACM_HUB_MULTICLUSTERHUBS_URL, FLEET_MESH_AVAILABLE_FLAG } from '../constants';

rs.mock('../../../openshift/utils/probeWithRetry', () => ({
  probeWithRetry: rs.fn()
}));

describe('useFleetMeshAvailableFlag', () => {
  it('probes the MultiClusterHub API to detect an ACM hub cluster', async () => {
    const setFlag = rs.fn();
    renderHook(() => useFleetMeshAvailableFlag(setFlag));

    await waitFor(() => {
      expect(probeWithRetry).toHaveBeenCalledWith(ACM_HUB_MULTICLUSTERHUBS_URL, FLEET_MESH_AVAILABLE_FLAG, setFlag);
    });
  });
});
