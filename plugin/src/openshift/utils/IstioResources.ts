import {
  getGroupVersionKindForResource,
  K8sGroupVersionKind,
  K8sResourceCommon
} from '@openshift-console/dynamic-plugin-sdk';

export type IstioResourceType = K8sGroupVersionKind & {
  id: string;
  objectType: string;
  title?: string;
};

// List of Istio resources that the OpenShift Console watches for building the Istio Config page in a "native" way
export const istioResources: IstioResourceType[] = [
  {
    id: 'authorization_policy',
    group: 'security.istio.io',
    version: 'v1',
    kind: 'AuthorizationPolicy',
    objectType: 'authorizationpolicies'
  },
  {
    id: 'destination_rule',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'DestinationRule',
    objectType: 'destinationrules'
  },
  {
    id: 'envoy_filter',
    group: 'networking.istio.io',
    version: 'v1alpha3',
    kind: 'EnvoyFilter',
    objectType: 'envoyfilters'
  },
  {
    id: 'gateway',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'Gateway',
    objectType: 'gateways'
  },
  {
    id: 'k8s_gateway',
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'Gateway',
    title: 'Gateway (K8s)',
    objectType: 'k8sgateways'
  },
  {
    id: 'k8s_grpc_route',
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'GRPCRoute',
    title: 'GRPCRoute (K8s)',
    objectType: 'k8sgrpcroutes'
  },
  {
    id: 'k8s_http_route',
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'HTTPRoute',
    title: 'HTTPRoute (K8s)',
    objectType: 'k8shttproutes'
  },
  {
    id: 'k8s_reference_grant',
    group: 'gateway.networking.k8s.io',
    version: 'v1beta1',
    kind: 'ReferenceGrant',
    title: 'ReferenceGrant (K8s)',
    objectType: 'k8sreferencegrants'
  },
  {
    id: 'k8s_tcp_route',
    group: 'gateway.networking.k8s.io',
    version: 'v1alpha2',
    kind: 'TCPRoute',
    title: 'TCPRoute (K8s)',
    objectType: 'k8stcproutes'
  },
  {
    id: 'k8s_tls_route',
    group: 'gateway.networking.k8s.io',
    version: 'v1alpha2',
    kind: 'TLSRoute',
    title: 'TLSRoute (K8s)',
    objectType: 'k8stlsroutes'
  },
  {
    id: 'peer_authentication',
    group: 'security.istio.io',
    version: 'v1',
    kind: 'PeerAuthentication',
    objectType: 'peerauthentications'
  },
  {
    id: 'proxy_config',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'ProxyConfig',
    objectType: 'proxyconfigs'
  },
  {
    id: 'request_authentication',
    group: 'security.istio.io',
    version: 'v1',
    kind: 'RequestAuthentication',
    objectType: 'requestauthentications'
  },
  {
    id: 'service_entry',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'ServiceEntry',
    objectType: 'serviceentries'
  },
  {
    id: 'sidecar',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'Sidecar',
    objectType: 'sidecars'
  },
  {
    id: 'telemetry',
    group: 'telemetry.istio.io',
    version: 'v1',
    kind: 'Telemetry',
    objectType: 'telemetries'
  },
  {
    id: 'virtual_service',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'VirtualService',
    objectType: 'virtualservices'
  },
  {
    id: 'workload_entry',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'WorkloadEntry',
    objectType: 'workloadentries'
  },
  {
    id: 'workload_group',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'WorkloadGroup',
    objectType: 'workloadgroups'
  },
  {
    id: 'wasm_plugin',
    group: 'extensions.istio.io',
    version: 'v1alpha1',
    kind: 'WasmPlugin',
    objectType: 'wasmplugins'
  }
];

export type ResourceURLPathProps = {
  name: string;
  ns: string;
  plural: string;
};

export const referenceFor = (groupVersionKind: K8sGroupVersionKind): string => {
  return `${groupVersionKind.group}~${groupVersionKind.version}~${groupVersionKind.kind}`;
};

export const referenceForObj = (obj: K8sResourceCommon): string => {
  const groupVersionKind = getGroupVersionKindForResource(obj);
  return referenceFor(groupVersionKind);
};

// This helper would translate Istio Kiali format
// i.e. /istio/destinationrules/reviews
// Into the regular format used for resources in OpenShift
// i.e. /networking.istio.io~v1beta1~DestinationRule/reviews
export const refForKialiIstio = (kialiIstioUrl: string): string => {
  const kialiIstioResource = istioResources.find(item => kialiIstioUrl.startsWith(`/istio/${item.objectType}`));

  if (kialiIstioResource) {
    const url = `/istio/${kialiIstioResource.objectType}`;

    return `/${referenceFor(kialiIstioResource)}${kialiIstioUrl.substring(url.length)}`;
  }

  return '';
};
