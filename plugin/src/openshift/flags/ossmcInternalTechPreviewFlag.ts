import { useEffect, useRef } from 'react';
import { getPluginConfig } from '../utils/KialiIntegration';
import { OSSMC_INTERNAL_TECH_PREVIEW_FLAG } from './constants';

// True only when the OSSMConsole CR sets spec.internal.techPreview: true. Gates OSSMC-Lite off by
// default -- see the per-item gating in lite-extensions.ts.
//
// Registered as a console.flag/hookProvider (not console.flag): Console calls hookProvider
// handlers from within its own render tree, so the handler must itself follow the Rules of
// Hooks (hence the "use" name and the useEffect below) -- see the matching comment in
// kialiAvailableFlag.ts for the full rationale.
//
// Unlike KIALI_AVAILABLE, this does not use probeWithRetry: that helper only
// inspects HTTP status/content-type and never parses the response body, so it can't be used to
// read a nested config value. plugin-config.json is also a static file baked into the plugin pod
// (not a proxied, possibly-transiently-unavailable backend call), so a single fetch attempt here
// is sufficient -- no retry/backoff needed.
//
// Pessimistic default: queue false during the hook's first render so tech-preview nav/routes stay
// hidden until plugin-config.json confirms opt-in. Without this, Console can paint flag-gated
// extensions on first login before the async fetch resolves (see openshift/console#16922).
function useOssmcInternalTechPreviewFlag(setFlag: (flag: string, value: boolean) => void): void {
  const pessimisticDefaultAppliedRef = useRef(false);
  if (!pessimisticDefaultAppliedRef.current) {
    setFlag(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, false);
    pessimisticDefaultAppliedRef.current = true;
  }

  useEffect(() => {
    getPluginConfig()
      .then(config => setFlag(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, config.internal?.techPreview === true))
      .catch(() => setFlag(OSSMC_INTERNAL_TECH_PREVIEW_FLAG, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- one-shot fetch on mount only
  }, []);
}

export default useOssmcInternalTechPreviewFlag;
