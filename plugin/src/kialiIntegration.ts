import { refForKialiIstio } from './utils/resources';
import { consoleFetch } from '@openshift-console/dynamic-plugin-sdk';
import {
  CertsInfo,
  ComputedServerConfig,
  PromisesRegistry,
  TLSStatus,
  API,
  setServerConfig,
  StatusState,
  serverConfig,
  history
} from '@kiali/types';

export const INITIAL_STATUS_STATE: StatusState = {
  status: {},
  externalServices: [],
  warningMessages: [],
  istioEnvironment: {
    isMaistra: false,
    istioAPIEnabled: true
  }
};

export const properties = {
  // This API is hardcoded but:
  // 'ossmconsole' is the name of the plugin, it can be considered "fixed" in the project
  // 'plugin-config.json' is a resource mounted from a ConfigMap, so, the UI app can read config from that file
  pluginConfig: '/api/plugins/ossmconsole/plugin-config.json'
};

// This Config type should be mapped with the 'plugin-config.json' file
export type Config = {
  kialiUrl: string;
};

export type KialiUrl = {
  baseUrl: string;
  token: string;
};

// ServerConfig
export type KialiConfig = {
  server: ComputedServerConfig;
  status: StatusState;
  istioCerts: CertsInfo[];
  meshTLSStatus: TLSStatus;
};

const kialiConfig: KialiConfig = {
  server: serverConfig,
  status: INITIAL_STATUS_STATE,
  istioCerts: [],
  meshTLSStatus: { status: '', autoMTLSEnabled: false, minTLS: '' }
};

let loadedConfig = false;

// Loader of ServerConfig, proxy and status

export const getKialiConfig = async (): Promise<KialiConfig> => {
  try {
    if (!loadedConfig) {
      const promises = new PromisesRegistry();
      const getStatusPromise = promises
        .register('getStatus', API.getStatus())
        .then(response => (kialiConfig.status = response.data))
        .catch(error => {
          console.error('Could not connect to Kiali API Status', error);
        });
      const getConfigPromise = promises
        .register('getServerConfig', API.getServerConfig())
        .then(response => {
          setServerConfig(response.data);
        })
        .catch(error => {
          console.error('Could not connect to Kiali API Config', error);
        });
      const getIstioCertsPromise = promises
        .register('getIstioCertsInfo', API.getIstioCertsInfo())
        .then(response => (kialiConfig.istioCerts = response.data))
        .catch(error => {
          console.error('Could not connect to Kiali API Istio Certs', error);
        });
      const getMeshTlsPromise = promises
        .register('getMeshTls', API.getMeshTls())
        .then(response => (kialiConfig.meshTLSStatus = response.data))
        .catch(error => {
          console.error('Could not connect to Kiali API Istio Certs', error);
        });
      await Promise.all([getStatusPromise, getConfigPromise, getIstioCertsPromise, getMeshTlsPromise]);
      loadedConfig = true;
    }
    return kialiConfig;
  } catch (err) {
    console.error('Error loading Kiali config & status', err);
  }
};

// The iframes used by the plugin require a public Kiali Url.
// This url is in a different domain from the OpenShift Console and it would require a token propagation.
export const getKialiUrl = async function (): Promise<KialiUrl> {
  const kialiToken = 'oauth_token=';
  const kialiUrl = {
    baseUrl: '',
    token: ''
  };
  let headerOauthToken = '';

  return await new Promise((resolve, reject) => {
    consoleFetch(properties.pluginConfig)
      .then(response => {
        headerOauthToken = response.headers.get('oauth_token');
        return response.json();
      })
      .then(json => {
        kialiUrl.baseUrl = json.kialiUrl;
        // Kiali uses OpenShift Authentication on these scenarios
        // The url used in iFrames requires a token to propagate this authentication
        // This token is already present in the browser once is logged, but we will use the plugin nginx
        // response to re-use the same token
        //
        // This requires the entry:
        //      ...
        //      add_header oauth_token "$http_Authorization";
        //      ...
        // in the nginx configuration managed by the operator.
        kialiUrl.token =
          kialiToken +
          (headerOauthToken && headerOauthToken.startsWith('Bearer ')
            ? headerOauthToken.substring('Bearer '.length)
            : '');
        resolve(kialiUrl);
      })
      .catch(e => reject(e));
  });
};

// Kiali expects a "kiosk" web parameter to render the "embedded" mode of the pages
// When the "kiosk" parameter is populated with the parent "host", then Kiali enables iframe "parent-child" communication
export const kioskUrl = () => {
  let kiosk = 'kiosk=' + window.location.protocol + '//' + window.location.host;
  // We assume that the url web params are in a format that can be added to a Kiali URL passed to the iframe
  if (window.location.search.indexOf('?') > -1) {
    kiosk = kiosk + '&' + window.location.search.substring(1);
  }
  return kiosk;
};

// Global scope variable to hold the kiali listener
let kialiListener = undefined;

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
export const initKialiListeners = () => {
  if (!kialiListener) {
    kialiListener = ev => {
      const kialiAction = ev.data;

      if (typeof kialiAction !== 'string') {
        return;
      }
      console.log('ServiceMesh Listener: ' + kialiAction);

      const webParamsIndex = kialiAction.indexOf('?');

      // const osConsole = window.location.protocol + '//' + window.location.host;
      // Transform Kiali domain messages into Plugin info that helps to navigate
      if (kialiAction.startsWith('/graph/namespaces')) {
        const servicemeshUrl = kialiAction.replace('graph/namespaces', 'ossmconsolegraph');
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
