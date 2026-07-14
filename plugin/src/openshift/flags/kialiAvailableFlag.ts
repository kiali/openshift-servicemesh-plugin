import { probeWithRetry } from '../utils/probeWithRetry';

// Checks whether the Kiali backend is reachable through the OSSMC proxy.
// The Service Mesh nav section is hidden when Kiali is not deployed on the hub.
// Retries on transient network errors so a brief proxy blip at Console startup
// does not permanently hide the nav section.
export default (setFlag: (flag: string, value: boolean) => void): void => {
  const apiProxy = process.env.API_PROXY;
  if (!apiProxy) {
    setFlag('KIALI_AVAILABLE', false);
    return;
  }
  probeWithRetry(`${apiProxy}/api/status`, 'KIALI_AVAILABLE', setFlag, 3, 'application/json');
};
