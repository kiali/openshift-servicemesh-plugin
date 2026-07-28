import * as React from 'react';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

const KIALI_REACHABLE = 'KIALI_REACHABLE';
const KIALI_PROXY_URL = '/api/proxy/plugin/ossmconsole/kiali/api/config';

export const useKialiFlag: (setFlag: (flag: string, enabled: boolean) => void) => void = setFlag => {
  React.useEffect(() => {
    consoleFetch(KIALI_PROXY_URL)
      .then(response => setFlag(KIALI_REACHABLE, response.ok))
      .catch(() => setFlag(KIALI_REACHABLE, false));
  }, [setFlag]);
};
