import * as React from 'react';
import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import { useNavigate } from 'react-router-dom-v5-compat';
import { refForKialiIstio } from './IstioResources';
import { setRouter } from 'app/History';

import { distributedTracingPluginConfig, netobservPluginConfig, pluginConfig } from '../components/KialiController';
import { store } from 'store/ConfigStore';

export const NETOBSERV = 'netflow';
export const OSSM_CONSOLE = 'ossmconsole';

export const properties = {
  // 'plugin-config.json' is a resource mounted from a ConfigMap, so, the UI app can read config from that file
  pluginConfig: `/api/plugins/${OSSM_CONSOLE}/plugin-config.json`,
  // External
  distributedTracingPluginConfig: `/api/plugins/distributed-tracing-console-plugin/plugin-manifest.json`,
  netobservPluginConfig: `/api/plugins/netobserv-plugin/plugin-manifest.json`
};

type Observability = {
  instance: string;
  namespace: string;
  tenant?: string;
};
// This PluginConfig type should be mapped with the 'plugin-config.json' file
export type PluginConfig = {
  observability?: Observability;
};

interface PluginExtension {
  properties: Record<string, any>;
  type: string;
}

export interface OpenShiftPluginConfig {
  dependencies: Record<string, string>;
  description: string;
  displayName: string;
  extensions: PluginExtension[];
  name: string;
  version: string;
}

// Get OSSMC plugin config from 'plugin-config.json' resource
export const getPluginConfig = async (): Promise<PluginConfig> => {
  return await new Promise((resolve, reject) => {
    consoleFetchJSON(properties.pluginConfig)
      .then(config => resolve(config))
      .catch(error => reject(error));
  });
};

export const getDistributedTracingPluginManifest = async (): Promise<OpenShiftPluginConfig> => {
  return await new Promise((resolve, reject) => {
    consoleFetchJSON(properties.distributedTracingPluginConfig)
      .then(config => {
        resolve(config);
      })
      .catch(error => reject(error));
  });
};

export const getNetobservPluginManifest = async (): Promise<OpenShiftPluginConfig> => {
  return await new Promise((resolve, reject) => {
    consoleFetchJSON(properties.netobservPluginConfig)
      .then(config => {
        resolve(config);
      })
      .catch(error => {
        reject(error);
      });
  });
};

// Set the router basename where OSSMC page is loaded
export const setRouterBasename = (pathname: string): void => {
  const ossmConsoleIndex = pathname.indexOf(`/${OSSM_CONSOLE}`);
  const basename = pathname.substring(0, ossmConsoleIndex);

  setRouter([{ element: <></> }], basename);
};

interface RouteContext {
  isNetobserv: boolean;
  path: string;
  urlParams: URLSearchParams;
  webParams: string;
}

const parseRouteContext = (kialiAction: string): RouteContext => {
  const netobservPrefix = '/netobserv';
  let action = kialiAction;
  let isNetobserv = false;

  if (action.startsWith(netobservPrefix)) {
    action = action.substring(netobservPrefix.length);
    isNetobserv = netobservPluginConfig && netobservPluginConfig.extensions.length > 0;
  }

  // Split action into path and query components
  // e.g. "/namespaces/my-ns/workloads/foo?tab=info" becomes:
  //   path: "/namespaces/my-ns/workloads/foo"
  //   webParams: "?tab=info" (includes '?' for appending to URLs)
  //   urlParams: URLSearchParams for easy param access
  const queryIndex = action.indexOf('?');
  const path = queryIndex > -1 ? action.substring(0, queryIndex) : action;
  const webParams = queryIndex > -1 ? action.substring(queryIndex) : '';
  const urlParams = new URLSearchParams(queryIndex > -1 ? action.substring(queryIndex + 1) : '');

  return { path, webParams, urlParams, isNetobserv };
};

const handleGraphRoute = ({ path, webParams }: RouteContext): string => {
  return (
    path
      .replace(/^\/graph\/node\/namespaces/, `/${OSSM_CONSOLE}/graph/ns`)
      .replace(/^\/graph\/namespaces/, `/${OSSM_CONSOLE}/graph`) + webParams
  );
};

const handleMeshRoute = ({ path, webParams }: RouteContext): string => {
  return path.replace(/^\/mesh/, `/${OSSM_CONSOLE}/mesh`) + webParams;
};

const handleApplicationsRoute = ({ path, webParams }: RouteContext): string => {
  return path.replace(/^\/applications/, `/${OSSM_CONSOLE}/applications`) + webParams;
};

const handleServicesRoute = (): string => `/k8s/all-namespaces/services`;

const handleIstioRoute = ({ urlParams }: RouteContext): string => {
  const namespaces = urlParams.get('namespaces');

  if (namespaces && !namespaces.includes(',')) {
    return `/k8s/ns/${namespaces}/istio`;
  }
  return '/k8s/all-namespaces/istio';
};

const handleNamespacesRoute = ({ path, webParams, isNetobserv }: RouteContext): string => {
  const pathSegments = path.split('/');
  const namespace = pathSegments[2] ?? '';
  const detail = pathSegments.length > 3 ? `/${pathSegments.slice(3).join('/')}` : '';

  if (detail.startsWith('/applications')) {
    const application = detail.substring('/applications/'.length);
    return `/k8s/ns/${namespace}/pods?labels=app%3D${application}`;
  }

  if (detail.startsWith('/workloads')) {
    const workload = detail.substring('/workloads'.length);
    const target = isNetobserv ? NETOBSERV : OSSM_CONSOLE;
    return `/k8s/ns/${namespace}/deployments${workload}/${target}${webParams}`;
  }

  if (detail.startsWith('/services')) {
    return `/k8s/ns/${namespace}${detail}/${OSSM_CONSOLE}${webParams}`;
  }

  if (detail.startsWith('/istio')) {
    const istioUrl = refForKialiIstio(detail);
    if (istioUrl.length === 0) {
      return '/k8s/all-namespaces/istio';
    }
    return `/k8s/ns/${namespace}${istioUrl}/${OSSM_CONSOLE}${webParams}`;
  }

  return path.replace(/^\/namespaces/, `/${OSSM_CONSOLE}/namespaces`) + webParams;
};

const handleTracingRoute = ({ urlParams }: RouteContext): string | null => {
  if (distributedTracingPluginConfig && distributedTracingPluginConfig.extensions.length > 0 && pluginConfig) {
    let observabilityData: Observability | null = null;

    if (pluginConfig.observability) {
      observabilityData = {
        instance: pluginConfig.observability.instance,
        namespace: pluginConfig.observability.namespace,
        tenant: pluginConfig.observability.tenant
      };
    } else {
      const tracingInfo = store.getState().tracingState.info;
      if (tracingInfo) {
        observabilityData = parseTempoUrl(tracingInfo.internalURL);
      }
    }

    if (observabilityData) {
      const trace = urlParams.get('trace');
      if (trace && trace !== 'undefined') {
        return `/observe/traces/${trace}?namespace=${observabilityData.namespace}&name=${observabilityData.instance}&tenant=${observabilityData.tenant}`;
      }
      return `/observe/traces?namespace=${observabilityData.namespace}&name=${observabilityData.instance}&tenant=${observabilityData.tenant}&q=%7B%7D&limit=20`;
    }
  } else {
    const url = urlParams.get('url');
    if (url) {
      window.location.href = url;
    }
  }
  return null;
};

type RouteHandler = (ctx: RouteContext) => string | null;

const routeHandlers: Array<{ handler: RouteHandler; prefix: string }> = [
  { prefix: '/graph', handler: handleGraphRoute },
  { prefix: '/mesh', handler: handleMeshRoute },
  { prefix: '/applications', handler: handleApplicationsRoute },
  { prefix: '/services', handler: handleServicesRoute },
  { prefix: '/istio', handler: handleIstioRoute },
  { prefix: '/namespaces', handler: handleNamespacesRoute },
  { prefix: '/tracing', handler: handleTracingRoute }
];

export const resolveConsoleUrl = (kialiAction: string): string | null => {
  const context = parseRouteContext(kialiAction);

  for (const { prefix, handler } of routeHandlers) {
    if (context.path.startsWith(prefix)) {
      return handler(context);
    }
  }
  return null;
};

// This listener is responsible to receive the Kiali event that is sent inside the React page to the plugin.
// When users "click" a link in Kiali, there is no navigation in the Kiali side; an event is sent to the parent.
// The "plugin" is responsible to "navigate" to the proper page in the OpenShift Console with the proper context.
export const useInitKialiListeners = (): void => {
  const navigate = useNavigate();

  React.useEffect(() => {
    const kialiListener = (ev: MessageEvent): void => {
      if (typeof ev.data !== 'string') {
        return;
      }

      const consoleUrl = resolveConsoleUrl(ev.data);

      if (consoleUrl) {
        setTimeout(() => navigate(consoleUrl), 0);
      }
    };

    window.addEventListener('message', kialiListener);
    return () => window.removeEventListener('message', kialiListener);
  }, [navigate]);
};

export function parseTempoUrl(url: string): Observability | null {
  const regex = /https?:\/\/tempo-([a-zA-Z0-9-]+?)(?:-gateway)?\.([a-zA-Z0-9-]+)\..*\/api\/traces\/v1(?:\/([^/]+))?/;
  const match = url.match(regex);

  if (!match) {
    // Try non tenants
    const regexT = /https?:\/\/tempo-([a-zA-Z0-9-]+?)(?:-query-frontend)?\.([a-zA-Z0-9-]+)\..*(?:\/([^/]+))?/;
    const matchT = url.match(regexT);

    if (!matchT) return null;
    return {
      instance: matchT[1],
      namespace: matchT[2]
    };
  }

  return {
    instance: match[1],
    namespace: match[2],
    tenant: match[3]
  };
}
