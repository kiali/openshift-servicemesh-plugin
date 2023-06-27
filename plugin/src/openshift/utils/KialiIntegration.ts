import { useHistory } from 'react-router';
import { refForKialiIstio } from './IstioResources';

// Global scope variable to hold the kiali listener
let kialiListener: (Event: MessageEvent) => void;

// Use to keep the time props between pages
// Should be imported if required in other new pages
const userProps = {
  duration: '',
  refresh: '',
  timeRange: ''
};
export default userProps;

// This listener is responsible to receive the Kiali event that is sent inside the iframe page to the plugin
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
      console.log('ServiceMesh Listener: ' + kialiAction);

      const webParamsIndex = kialiAction.indexOf('?');

      // const osConsole = window.location.protocol + '//' + window.location.host;
      // Transform Kiali domain messages into Plugin info that helps to navigate
      if (kialiAction.startsWith('/graph/namespaces')) {
        const servicemeshUrl = kialiAction.replace('graph/namespaces', 'ossmconsole/graph');
        history.push(servicemeshUrl);
      }
      if (kialiAction.startsWith('/istio')) {
        let istioConfigUrl = '/k8s';
        if (webParamsIndex > -1) {
          const nsParamIndex = kialiAction.indexOf('namespaces=', webParamsIndex);
          // It assumes that the 'namespaces=' will not be added alone as a param
          // Under the plugin it will be used for a single namespace
          // TODO additional validations should be added to this parsing logic
          const endNsParamIndex = kialiAction.indexOf('&', nsParamIndex);
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
          detailUrl = '/k8s/ns/' + namespace + '/deployments' + detail.substring('/workloads'.length) + '/ossmconsole';
          detailUrl += webParamsIndex > -1 ? webParams : '';
        }
        if (detail.startsWith('/services')) {
          // OpenShift Console has a "services" list page
          detailUrl = '/k8s/ns/' + namespace + detail + '/ossmconsole';
          detailUrl += webParamsIndex > -1 ? webParams : '';
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
      if (kialiAction.startsWith('duration')) {
        const duration = kialiAction.split('=');
        userProps.duration = duration[1];
      }
      if (kialiAction.startsWith('refresh')) {
        const refresh = kialiAction.split('=');
        userProps.refresh = refresh[1];
      }
      if (kialiAction.startsWith('timeRange')) {
        const timeRange = kialiAction.split('=');
        userProps.timeRange = timeRange[1];
      }
    };

    window.addEventListener('message', kialiListener);
  }
};
