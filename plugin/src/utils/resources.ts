import { getGroupVersionKindForResource, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

// List of Istio resources that the OpenShift Console watches for building the Istio Config page in a "native" way
export const istioResources = [
  {
    id: 'wasm_plugin',
    group: 'extensions.istio.io',
    version: 'v1alpha1',
    kind: 'WasmPlugin'
  },
  {
    id: 'k8s_gateway',
    group: 'gateway.networking.k8s.io',
    version: 'v1beta1',
    kind: 'Gateway',
    title: 'Gateway (K8s)'
  },
  {
    id: 'http_route',
    group: 'gateway.networking.k8s.io',
    version: 'v1beta1',
    kind: 'HTTPRoute',
    title: 'HTTPRoute (K8s)'
  },
  {
    id: 'envoy_filter',
    group: 'networking.istio.io',
    version: 'v1alpha3',
    kind: 'EnvoyFilter'
  },
  {
    id: 'destination_rule',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'DestinationRule'
  },
  {
    id: 'gateway',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'Gateway'
  },
  {
    id: 'proxy_config',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'ProxyConfig'
  },
  {
    id: 'service_entry',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'ServiceEntry'
  },
  {
    id: 'sidecar',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'Sidecar'
  },
  {
    id: 'virtual_service',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'VirtualService'
  },
  {
    id: 'workload_entry',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'WorkloadEntry'
  },
  {
    id: 'workload_group',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'WorkloadGroup'
  },
  {
    id: 'authorization_policy',
    group: 'security.istio.io',
    version: 'v1beta1',
    kind: 'AuthorizationPolicy'
  },
  {
    id: 'peer_authentication',
    group: 'security.istio.io',
    version: 'v1beta1',
    kind: 'PeerAuthentication'
  },
  {
    id: 'request_authentication',
    group: 'security.istio.io',
    version: 'v1beta1',
    kind: 'RequestAuthentication'
  },
  {
    id: 'telemetry',
    group: 'telemetry.istio.io',
    version: 'v1alpha1',
    kind: 'Telemetry'
  }
];

export const kialiIstioResources = {
  '/istio/wasmplugins': '/extensions.istio.io~v1alpha1~WasmPlugin',
  '/istio/k8sgateways': '/gateway.networking.k8s.io~v1alpha2~Gateway',
  '/istio/k8shttproutes': '/gateway.networking.k8s.io~v1alpha2~HTTPRoute',
  '/istio/envoyfilters': '/networking.istio.io~v1alpha3~EnvoyFilter',
  '/istio/destinationrules': '/networking.istio.io~v1beta1~DestinationRule',
  '/istio/gateways': '/networking.istio.io~v1beta1~Gateway',
  '/istio/proxyconfigs': '/networking.istio.io~v1beta1~ProxyConfig',
  '/istio/serviceentries': '/networking.istio.io~v1beta1~ServiceEntry',
  '/istio/sidecars': '/networking.istio.io~v1beta1~Sidecar',
  '/istio/virtualservices': '/networking.istio.io~v1beta1~VirtualService',
  '/istio/workloadentries': '/networking.istio.io~v1beta1~WorkloadEntry',
  '/istio/workloadgroups': '/networking.istio.io~v1beta1~WorkloadGroup',
  '/istio/authorizationpolicies': '/security.istio.io~v1beta1~AuthorizationPolicy',
  '/istio/peerauthentications': '/security.istio.io~v1beta1~PeerAuthentication',
  '/istio/requestauthentications': '/security.istio.io~v1beta1~RequestAuthentication',
  '/istio/telemetries': '/telemetry.istio.io~v1alpha1~Telemetry'
};

export const referenceFor = (group: string, version: string, kind: string) => `${group}~${version}~${kind}`;

export const referenceForObj = (obj: K8sResourceCommon) => {
  const { group, version, kind } = getGroupVersionKindForResource(obj);
  return referenceFor(group, version, kind);
};

export const referenceForRsc = (obj: K8sResourceCommon) => {
  return (
    referenceForObj(obj) + '-' + obj.metadata.namespace + '-' + obj.metadata.name + '-' + obj.metadata.resourceVersion
  );
};

// This helper would translate Istio Kiali format
// i.e. /istio/destinationrules/reviews
// Into the regular format used for resources in OpenShift
// i.e. /networking.istio.io~v1beta1~DestinationRule/reviews
export const refForKialiIstio = (kialiIstioUrl: string): string => {
  for (const key in kialiIstioResources) {
    if (kialiIstioUrl.startsWith(key)) {
      return kialiIstioResources[key] + kialiIstioUrl.substring(key.length);
    }
  }
  return '';
};
