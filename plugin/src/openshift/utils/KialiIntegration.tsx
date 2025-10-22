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
  // This API is hardcoded but:
  // 'ossmconsole' is the name of the plugin, it can be considered "fixed" in the project
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

// Global scope variable to hold the kiali listener
let kialiListener: (Event: MessageEvent) => void;

// This listener is responsible to receive the Kiali event that is sent inside the React page to the plugin
// When users "clicks" a link in Kiali, there is no navigation in the Kiali side; and event it's send to the parent
// And the "plugin" is responsible to "navigate" to the proper page in the OpenShift Console with the proper context.
export const useInitKialiListeners = (): void => {
  const navigate = useNavigate();

  if (!kialiListener) {
    kialiListener = (ev: MessageEvent) => {
      let kialiAction = ev.data;

      if (typeof kialiAction !== 'string') {
        return;
      }

      // When available, come URLs may ask to direct to the netobserv tab as opposed to the OSSMC tab
      const netobservPrefix = '/netobserv';
      let isNetobserv = false;
      if (kialiAction.startsWith(netobservPrefix)) {
        kialiAction = kialiAction.substring(netobservPrefix.length)
        isNetobserv = netobservPluginConfig && netobservPluginConfig.extensions.length > 0
      }

      const webParamsIndex = kialiAction.indexOf('?');

      let consoleUrl = '';
      // Transform Kiali domain messages into Plugin info that helps to navigate
      if (kialiAction.startsWith('/graph')) {
        consoleUrl = kialiAction
          .replace('graph/namespaces', `${OSSM_CONSOLE}/graph`)
          .replace('graph/node/namespaces', `${OSSM_CONSOLE}/graph/ns`);
      } else if (kialiAction.startsWith('/istio')) {
        consoleUrl = '/k8s';

        if (webParamsIndex > -1) {
          const nsParamIndex = kialiAction.indexOf('namespaces=', webParamsIndex);

          // Under the plugin it will be used for a single namespace
          let endNsParamIndex = kialiAction.indexOf('&', nsParamIndex);
          // In case that the 'namespaces=' is added alone as a param
          if (endNsParamIndex === -1) {
            endNsParamIndex = kialiAction.length;
          }

          const namespace = kialiAction.substring(nsParamIndex + 'namespaces='.length, endNsParamIndex);
          consoleUrl += `/ns/${namespace}/istio`;
        } else {
          consoleUrl += '/all-namespaces/istio';
        }
      } else if (kialiAction.startsWith('/namespaces')) {
        const webParams = webParamsIndex > -1 ? kialiAction.substring(webParamsIndex) : '';

        const namespacesLength = '/namespaces/'.length;
        const namespace = kialiAction.substring(namespacesLength, kialiAction.indexOf('/', namespacesLength + 1));

        const detail = kialiAction.substring(
          namespacesLength + namespace.length,
          webParamsIndex > -1 ? webParamsIndex : kialiAction.length
        );

        if (detail.startsWith('/applications')) {
          // OpenShift Console doesn't have an "application" concept
          // As the "app" concept is based on Pod "app" annotations, a start could be to show those pods
          // TBD a better link i.e. the "App" concept used for Developer preview
          const application = detail.substring('/applications/'.length);
          consoleUrl = `/k8s/ns/${namespace}/pods?labels=app%3D${application}`;
        }

        if (detail.startsWith('/workloads')) {
          // OpenShift Console doesn't have a "generic" workloads page
          // 99% of the cases there is a 1-to-1 mapping between Workload -> Deployment
          // YES, we have some old DeploymentConfig workloads there, but that can be addressed later
          const workload = detail.substring('/workloads'.length);
          const target = isNetobserv ? NETOBSERV : OSSM_CONSOLE;
          consoleUrl = `/k8s/ns/${namespace}/deployments${workload}/${target}${webParams}`;
        }

        if (detail.startsWith('/services')) {
          // OpenShift Console has a "services" list page
          const target = isNetobserv ? NETOBSERV : OSSM_CONSOLE;
          consoleUrl = `/k8s/ns/${namespace}${detail}/${target}${webParams}`;
        }

        if (detail.startsWith('/istio')) {
          const istioUrl = refForKialiIstio(detail);

          if (istioUrl.length === 0) {
            consoleUrl = '/k8s/all-namespaces/istio';
          } else {
            consoleUrl = `/k8s/ns/${namespace}${istioUrl}/${OSSM_CONSOLE}${webParams}`;
          }
        }
      } else if (kialiAction.startsWith('/tracing')) {
        if (distributedTracingPluginConfig && distributedTracingPluginConfig.extensions.length > 0 && pluginConfig) {
          const urlParams = new URLSearchParams(kialiAction.split('?')[1]);
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
              consoleUrl = `/observe/traces/${trace}?namespace=${observabilityData.namespace}&name=${observabilityData.instance}&tenant=${observabilityData.tenant}`;
            } else {
              consoleUrl = `/observe/traces?namespace=${observabilityData.namespace}&name=${observabilityData.instance}&tenant=${observabilityData.tenant}&q=%7B%7D&limit=20`;
            }
          }
        } else {
          const urlParams = new URLSearchParams(kialiAction.split('?')[1]);
          const url = urlParams.get('url');
          if (url) {
            window.location.href = url;
          }
        }
      }

      if (consoleUrl) {
        setTimeout(() => navigate(consoleUrl), 0);
      }
    };

    window.addEventListener('message', kialiListener);
  }
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
