import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

// List of Istio resources that the OpenShift Console watches for building the Istio Config page in a "native" way
export const istioResources = [
  {
    group: 'extensions.istio.io',
    version: 'v1alpha1',
    kind: 'WasmPlugin',
  },
  {
    group: 'networking.istio.io',
    version: 'v1alpha3',
    kind: 'EnvoyFilter',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'DestinationRule',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'Gateway',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'ProxyConfig',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'ServiceEntry',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'Sidecar',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'VirtualService',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'WorkloadEntry',
  },
  {
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'WorkloadGroup',
  },
  {
    group: 'security.istio.io',
    version: 'v1beta1',
    kind: 'AuthorizationPolicy',
  },
  {
    group: 'security.istio.io',
    version: 'v1beta1',
    kind: 'PeerAuthentication',
  },
  {
    group: 'security.istio.io',
    version: 'v1beta1',
    kind: 'RequestAuthentication',
  },
  {
    group: 'telemetry.istio.io',
    version: 'v1alpha1',
    kind: 'Telemetry',
  },
];

export const kialiIstioResources = {
  '/istio/wasmplugins':             '/extensions.istio.io~v1alpha1~WasmPlugin',
  '/istio/envoyfilters':            '/networking.istio.io~v1alpha3~EnvoyFilter',
  '/istio/destinationrules':        '/networking.istio.io~v1beta1~DestinationRule',
  '/istio/gateways':                '/networking.istio.io~v1beta1~Gateway',
  '/istio/proxyconfigs':            '/networking.istio.io~v1beta1~ProxyConfig',
  '/istio/serviceentries':          '/networking.istio.io~v1beta1~ServiceEntry',
  '/istio/sidecars':                '/networking.istio.io~v1beta1~Sidecar',
  '/istio/virtualservices':         '/networking.istio.io~v1beta1~VirtualService',
  '/istio/workloadentries':         '/networking.istio.io~v1beta1~WorkloadEntry',
  '/istio/workloadgroups':          '/networking.istio.io~v1beta1~WorkloadGroup',
  '/istio/authorizationpolicies':   '/security.istio.io~v1beta1~AuthorizationPolicy',
  '/istio/peerauthentications':     '/security.istio.io~v1beta1~PeerAuthentication',
  '/istio/requestauthentications':  '/security.istio.io~v1beta1~RequestAuthentication',
  '/istio/telemetries':             '/telemetry.istio.io~v1alpha1~Telemetry',
};

export const referenceFor = (group: string, version: string, kind: string) =>
  `${group}~${version}~${kind}`;

const groupVersionKindForObj = (obj: K8sResourceCommon) => {
  const [group, version] = obj.apiVersion.split('/');
  return { group, version, kind: obj.kind };
};

export const referenceForObj = (obj: K8sResourceCommon) => {
  const { group, version, kind } = groupVersionKindForObj(obj);
  return referenceFor(group, version, kind);
};

export const referenceForRsc = (obj: K8sResourceCommon) => {
  return referenceForObj(obj) + '-' + obj.metadata.namespace + '-' + obj.metadata.name + '-' + obj.metadata.resourceVersion;
};

// This helper would translate Istio Kiali format
// i.e. /istio/destinationrules/reviews
// Into the regular format used for resources in OpenShift
// i.e. /networking.istio.io~v1beta1~DestinationRule/reviews
export const refForKialiIstio = (kialiIstioUrl: string): string => {
  for(let key in kialiIstioResources) {
      if (kialiIstioUrl.startsWith(key)) {
        return kialiIstioResources[key] + kialiIstioUrl.substring(key.length);
      }
  }
  return '';
}