import { useEffect } from 'react';
import { probeWithRetry } from '../utils/probeWithRetry';

// Checks whether the Kiali backend is reachable through the OSSMC proxy. Gates full-OSSMC routes
// and nav items (Overview, Graph, etc.) but not the top-level "Service Mesh" section header.
// Retries on transient network errors so a brief proxy blip at Console startup does not
// permanently hide those Kiali-backed entries.
//
// Registered as a console.flag/hookProvider (not console.flag): Console calls hookProvider
// handlers from within its own render tree, so the handler must itself follow the Rules of
// Hooks (hence the "use" name and the useEffect below) -- this is the pattern the Console
// team recommends for flags whose value is derived from async data, instead of a bare
// side-effecting function called outside any component.
//
// KNOWN CONSOLE BUG: even though setFlag(true) above is called almost immediately (this probe
// typically resolves in well under a second), Console does not actually make the flag-gated
// route/nav items usable until up to ~10-15 seconds later -- until then, the OSSMC route 404s
// and the nav items are simply missing, with no user-visible activity in between. This is not
// caused by anything in this plugin: it is Console core waiting for the next tick of one of its
// own fixed-interval background polls (e.g. PollConsoleUpdates, which batch-refetches every
// enabled plugin's plugin-manifest.json every 15s) before it re-evaluates flag-gated extensions,
// rather than reacting to the flag change directly. There is no workaround on the plugin side.
// See https://github.com/openshift/console/issues/16922
function useKialiAvailableFlag(setFlag: (flag: string, value: boolean) => void): void {
  useEffect(() => {
    const apiProxy = process.env.API_PROXY;
    if (!apiProxy) {
      setFlag('KIALI_AVAILABLE', false);
      return;
    }
    probeWithRetry(`${apiProxy}/api/status`, 'KIALI_AVAILABLE', setFlag, 3, 'application/json');
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- one-shot probe on mount only
  }, []);
}

export default useKialiAvailableFlag;
