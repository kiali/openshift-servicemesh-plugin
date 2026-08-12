import { useEffect } from 'react';
import { probeWithRetry } from '../../openshift/utils/probeWithRetry';
import { ACM_HUB_MULTICLUSTERHUBS_URL, FLEET_MESH_AVAILABLE_FLAG } from './constants';

// True only when the Console is running on an ACM hub cluster. Managed spokes do not
// register the MultiClusterHub API, so a successful probe means hub; 404/403 means not hub.
//
// Registered as a console.flag/hookProvider (not console.flag): Console calls hookProvider
// handlers from within its own render tree, so the handler must itself follow the Rules of
// Hooks (hence the "use" name and the useEffect below) -- see the matching comment in
// kialiAvailableFlag.ts for the full rationale.
function useFleetMeshAvailableFlag(setFlag: (flag: string, value: boolean) => void): void {
  useEffect(() => {
    probeWithRetry(ACM_HUB_MULTICLUSTERHUBS_URL, FLEET_MESH_AVAILABLE_FLAG, setFlag);
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- one-shot probe on mount only
  }, []);
}

export default useFleetMeshAvailableFlag;
