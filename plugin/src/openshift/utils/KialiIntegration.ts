import { consoleFetchJSON } from '@openshift-console/dynamic-plugin-sdk';
import { useHistory } from 'react-router';
import { refForKialiIstio } from './IstioResources';

export const properties = {
  // This API is hardcoded but:
  // 'ossmconsole' is the name of the plugin, it can be considered "fixed" in the project
  // 'plugin-config.json' is a resource mounted from a ConfigMap, so, the UI app can read config from that file
  pluginConfig: '/api/plugins/ossmconsole/plugin-config.json'
};

// This PluginConfig type should be mapped with the 'plugin-config.json' file
export type PluginConfig = {
  graph: {
    impl: 'cy' | 'pf';
  };
};

// Get OSSMC plugin config from 'plugin-config.json' resource
export const getPluginConfig = async function (): Promise<PluginConfig> {
  return await new Promise((resolve, reject) => {
    consoleFetchJSON(properties.pluginConfig)
      .then(config => resolve(config))
      .catch(error => reject(error));
  });
};

// Global scope variable to hold the kiali listener
let kialiListener: (Event: MessageEvent) => void;

// This listener is responsible to receive the Kiali event that is sent inside the React page to the plugin
// When users "clicks" a link in Kiali, there is no navigation in the Kiali side; and event it's send to the parent
// And the "plugin" is responsible to "navigate" to the proper page in the OpenShift Console with the proper context.
export const useInitKialiListeners = () => {
  const history = useHistory();

  if (!kialiListener) {
    kialiListener = (ev: MessageEvent) => {
      const kialiAction = ev.data;

      if (typeof kialiAction !== 'string') {
        return;
      }

      const webParamsIndex = kialiAction.indexOf('?');

      // Transform Kiali domain messages into Plugin info that helps to navigate
      if (kialiAction.startsWith('/graph/namespaces')) {
        const servicemeshUrl = kialiAction.replace('graph/namespaces', 'ossmconsole/graph');
        history.push(servicemeshUrl);
      }

      if (kialiAction.startsWith('/istio')) {
        let istioConfigUrl = '/k8s';

        if (webParamsIndex > -1) {
          const nsParamIndex = kialiAction.indexOf('namespaces=', webParamsIndex);

          // Under the plugin it will be used for a single namespace
          let endNsParamIndex = kialiAction.indexOf('&', nsParamIndex);
          // In case that the 'namespaces=' is added alone as a param
          if (endNsParamIndex === -1) {
            endNsParamIndex = kialiAction.length;
          }

          const namespace = kialiAction.substring(nsParamIndex + 'namespaces='.length, endNsParamIndex);
          istioConfigUrl += '/ns/' + namespace + '/istio';
        } else {
          istioConfigUrl += '/all-namespaces/istio';
        }

        history.push(istioConfigUrl);
      }

      if (kialiAction.startsWith('/namespaces')) {
        const webParams = webParamsIndex > -1 ? kialiAction.substring(webParamsIndex) : '';

        const namespacesLength = '/namespaces/'.length;
        const namespace = kialiAction.substring(namespacesLength, kialiAction.indexOf('/', namespacesLength + 1));

        const detail = kialiAction.substring(
          namespacesLength + namespace.length,
          webParamsIndex > -1 ? webParamsIndex : kialiAction.length
        );

        let detailUrl = '';

        if (detail.startsWith('/applications')) {
          // OpenShift Console doesn't have an "application" concept
          // As the "app" concept is based on Pod "app" annotations, a start could be to show those pods
          // TBD a better link i.e. the "App" concept used for Developer preview
          const application = detail.substring('/applications/'.length);
          detailUrl = '/k8s/ns/' + namespace + '/pods?labels=app%3D' + application;
        }

        if (detail.startsWith('/workloads')) {
          // OpenShift Console doesn't have a "generic" workloads page
          // 99% of the cases there is a 1-to-1 mapping between Workload -> Deployment
          // YES, we have some old DeploymentConfig workloads there, but that can be addressed later
          const workload = detail.substring('/workloads'.length);
          detailUrl = '/k8s/ns/' + namespace + '/deployments' + workload + '/ossmconsole' + webParams;
        }

        if (detail.startsWith('/services')) {
          // OpenShift Console has a "services" list page
          detailUrl = '/k8s/ns/' + namespace + detail + '/ossmconsole' + webParams;
        }

        if (detail.startsWith('/istio')) {
          detailUrl = refForKialiIstio(detail);

          if (detailUrl.length === 0) {
            detailUrl = '/k8s/all-namespaces/istio';
          } else {
            detailUrl = '/k8s/ns/' + namespace + detailUrl;
          }
        }

        history.push(detailUrl);
      }
    };

    window.addEventListener('message', kialiListener);
  }
};
