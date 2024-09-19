import * as React from 'react';
import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import { NavigateFunction, useLocation, useNavigate } from 'react-router-dom-v5-compat';
import { refForKialiIstio } from './IstioResources';
import { setRouter } from 'app/History';

export const OSSM_CONSOLE = 'ossmconsole';

export const properties = {
  // This API is hardcoded but:
  // 'ossmconsole' is the name of the plugin, it can be considered "fixed" in the project
  // 'plugin-config.json' is a resource mounted from a ConfigMap, so, the UI app can read config from that file
  pluginConfig: `/api/plugins/${OSSM_CONSOLE}/plugin-config.json`
};

// This PluginConfig type should be mapped with the 'plugin-config.json' file
export type PluginConfig = {
  graph: {
    impl: 'cy' | 'pf';
  };
};

// Get OSSMC plugin config from 'plugin-config.json' resource
export const getPluginConfig = async (): Promise<PluginConfig> => {
  return await new Promise((resolve, reject) => {
    consoleFetchJSON(properties.pluginConfig)
      .then(config => resolve(config))
      .catch(error => reject(error));
  });
};

// Set the router basename where OSSMC page is loaded
export const setRouterBasename = (pathname: string): void => {
  const ossmConsoleIndex = pathname.indexOf(`/${OSSM_CONSOLE}`);
  const basename = pathname.substring(0, ossmConsoleIndex);

  setRouter([{ element: <></> }], basename);
};

// Navigates to the proper OpenShift Console page
// If the Kiali event comes from an OSSMC page, add the new entry to the history.
// Otherwise, last history entry is invalid and has to be replaced with the new one.
const navigateToConsoleUrl = (pathname: string, navigate: NavigateFunction, url: string): void => {
  if (pathname.startsWith(`/${OSSM_CONSOLE}`)) {
    navigate(url);
  } else {
    navigate(url, { replace: true });
  }
};

// Global scope variable to hold the kiali listener
let kialiListener: (Event: MessageEvent) => void;

// This listener is responsible to receive the Kiali event that is sent inside the React page to the plugin
// When users "clicks" a link in Kiali, there is no navigation in the Kiali side; and event it's send to the parent
// And the "plugin" is responsible to "navigate" to the proper page in the OpenShift Console with the proper context.
export const useInitKialiListeners = (): void => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  if (!kialiListener) {
    kialiListener = (ev: MessageEvent) => {
      const kialiAction = ev.data;

      if (typeof kialiAction !== 'string') {
        return;
      }

      const webParamsIndex = kialiAction.indexOf('?');

      let consoleUrl = '';

      // Transform Kiali domain messages into Plugin info that helps to navigate
      if (kialiAction.startsWith('/graph')) {
        consoleUrl = kialiAction
          .replace('graph/namespaces', `${OSSM_CONSOLE}/graph`)
          .replace('graphpf/namespaces', `${OSSM_CONSOLE}/graph`)
          .replace('graph/node/namespaces', `${OSSM_CONSOLE}/graph/ns`)
          .replace('graphpf/node/namespaces', `${OSSM_CONSOLE}/graph/ns`);
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
          consoleUrl = `/k8s/ns/${namespace}/deployments${workload}/${OSSM_CONSOLE}${webParams}`;
        }

        if (detail.startsWith('/services')) {
          // OpenShift Console has a "services" list page
          consoleUrl = `/k8s/ns/${namespace}${detail}/${OSSM_CONSOLE}${webParams}`;
        }

        if (detail.startsWith('/istio')) {
          const istioUrl = refForKialiIstio(detail);

          if (istioUrl.length === 0) {
            consoleUrl = '/k8s/all-namespaces/istio';
          } else {
            consoleUrl = `/k8s/ns/${namespace}${istioUrl}/${OSSM_CONSOLE}${webParams}`;
          }
        }
      }

      if (consoleUrl) {
        setTimeout(() => navigateToConsoleUrl(pathname, navigate, consoleUrl), 0);
      }
    };

    window.addEventListener('message', kialiListener);
  }
};
