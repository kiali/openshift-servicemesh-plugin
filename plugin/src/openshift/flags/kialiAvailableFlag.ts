import { useEffect, useMemo } from 'react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { ossmConsoleGVK } from '../types/ossmconsole';
import type { OssmConsoleResource } from '../types/ossmconsole';
import { findActiveOssmConsole, getKialiStatusProbeKey } from '../utils/ossmConsoleUtils';
import { probeWithRetry } from '../utils/probeWithRetry';

const KIALI_AVAILABLE_FLAG = 'KIALI_AVAILABLE';
const PROMOTED_UNAVAILABLE_PROBE_INTERVAL_MS = 15_000;

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
// caused by anything in this plugin: Console was queuing setFeatureFlag into a ref and only
// flushing on the next render, so async hookProvider updates waited on an unrelated re-render.
// See Console bug: https://github.com/openshift/console/issues/16922
// Fix is in Console PR: https://github.com/openshift/console/pull/16949
function useKialiAvailableFlag(setFlag: (flag: string, value: boolean) => void): void {
  const [ossmConsoles, ossmConsolesLoaded] = useK8sWatchResource<OssmConsoleResource[]>({
    groupVersionKind: ossmConsoleGVK,
    isList: true,
    namespaced: true
  });

  const kialiStatusKey = useMemo(
    () => getKialiStatusProbeKey(ossmConsoles, ossmConsolesLoaded),
    [ossmConsoles, ossmConsolesLoaded]
  );

  const kialiMarkedAvailable = useMemo(() => {
    if (!ossmConsolesLoaded || !Array.isArray(ossmConsoles)) {
      return false;
    }
    return findActiveOssmConsole(ossmConsoles)?.status?.kiali?.available === true;
  }, [ossmConsoles, ossmConsolesLoaded]);

  useEffect(() => {
    const apiProxy = process.env.API_PROXY;
    if (!apiProxy) {
      setFlag(KIALI_AVAILABLE_FLAG, false);
      return;
    }
    probeWithRetry(`${apiProxy}/api/status`, KIALI_AVAILABLE_FLAG, setFlag, 3, 'application/json');
  }, [kialiStatusKey, setFlag]);

  useEffect(() => {
    const apiProxy = process.env.API_PROXY;
    if (!apiProxy || !kialiMarkedAvailable) {
      return;
    }
    const interval = window.setInterval(() => {
      probeWithRetry(`${apiProxy}/api/status`, KIALI_AVAILABLE_FLAG, setFlag, 3, 'application/json');
    }, PROMOTED_UNAVAILABLE_PROBE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [kialiMarkedAvailable, setFlag]);
}

export default useKialiAvailableFlag;
