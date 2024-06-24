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
    id: 'authorizationPolicy',
    group: 'security.istio.io',
    version: 'v1',
    kind: 'AuthorizationPolicy',
    objectType: 'authorizationpolicies'
  },
  {
    id: 'destinationRule',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'DestinationRule',
    objectType: 'destinationrules'
  },
  {
    id: 'envoyFilter',
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
    id: 'k8sGateway',
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'Gateway',
    title: 'Gateway (K8s)',
    objectType: 'k8sgateways'
  },
  {
    id: 'k8sGRPCRoute',
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'GRPCRoute',
    title: 'GRPCRoute (K8s)',
    objectType: 'k8sgrpcroutes'
  },
  {
    id: 'k8sHTTPRoute',
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    kind: 'HTTPRoute',
    title: 'HTTPRoute (K8s)',
    objectType: 'k8shttproutes'
  },
  {
    id: 'k8sReferenceGrant',
    group: 'gateway.networking.k8s.io',
    version: 'v1beta1',
    kind: 'ReferenceGrant',
    title: 'ReferenceGrant (K8s)',
    objectType: 'k8sreferencegrants'
  },
  {
    id: 'k8sTCProute',
    group: 'gateway.networking.k8s.io',
    version: 'v1alpha2',
    kind: 'TCPRoute',
    title: 'TCPRoute (K8s)',
    objectType: 'k8stcproutes'
  },
  {
    id: 'k8sTLSroute',
    group: 'gateway.networking.k8s.io',
    version: 'v1alpha2',
    kind: 'TLSRoute',
    title: 'TLSRoute (K8s)',
    objectType: 'k8stlsroutes'
  },
  {
    id: 'peerAuthentication',
    group: 'security.istio.io',
    version: 'v1',
    kind: 'PeerAuthentication',
    objectType: 'peerauthentications'
  },
  {
    id: 'proxyConfig',
    group: 'networking.istio.io',
    version: 'v1beta1',
    kind: 'ProxyConfig',
    objectType: 'proxyconfigs'
  },
  {
    id: 'requestAuthentication',
    group: 'security.istio.io',
    version: 'v1',
    kind: 'RequestAuthentication',
    objectType: 'requestauthentications'
  },
  {
    id: 'serviceEntry',
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
    id: 'virtualService',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'VirtualService',
    objectType: 'virtualservices'
  },
  {
    id: 'workloadEntry',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'WorkloadEntry',
    objectType: 'workloadentries'
  },
  {
    id: 'workloadGroup',
    group: 'networking.istio.io',
    version: 'v1',
    kind: 'WorkloadGroup',
    objectType: 'workloadgroups'
  },
  {
    id: 'wasmPlugin',
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
