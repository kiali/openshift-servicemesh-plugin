import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';

type KialiApiStatusResponse = {
  status?: Record<string, string>;
};

const KIALI_VERSION_KEY = 'Kiali version';

/** Best-effort fetch of the running Kiali version via the Console service proxy. */
export async function fetchKialiApiVersion(): Promise<string | undefined> {
  const apiProxy = process.env.API_PROXY;
  if (!apiProxy) {
    return undefined;
  }

  try {
    const normalized = apiProxy.replace(/\/$/, '');
    const response = await consoleFetch(`${normalized}/api`);
    if (!response.ok) {
      return undefined;
    }
    const json = (await response.json()) as KialiApiStatusResponse;
    const version = json.status?.[KIALI_VERSION_KEY]?.trim();
    return version || undefined;
  } catch {
    return undefined;
  }
}
