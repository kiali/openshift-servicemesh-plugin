import { getGroupVersionKindForResource } from '@openshift-console/dynamic-plugin-sdk';
import { referenceFor, referenceForObj, refForKialiIstio, istioResources } from '../IstioResources';

const mockedGetGVK = getGroupVersionKindForResource as jest.Mock;

describe('referenceFor', () => {
  it('should join group~version~kind for an Istio networking resource', () => {
    expect(referenceFor({ group: 'networking.istio.io', version: 'v1', kind: 'VirtualService' })).toBe(
      'networking.istio.io~v1~VirtualService'
    );
  });

  it('should join group~version~kind for an Istio security resource', () => {
    expect(referenceFor({ group: 'security.istio.io', version: 'v1', kind: 'AuthorizationPolicy' })).toBe(
      'security.istio.io~v1~AuthorizationPolicy'
    );
  });

  it('should join group~version~kind for a Gateway API resource', () => {
    expect(referenceFor({ group: 'gateway.networking.k8s.io', version: 'v1', kind: 'HTTPRoute' })).toBe(
      'gateway.networking.k8s.io~v1~HTTPRoute'
    );
  });

  it('should handle alpha versions', () => {
    expect(referenceFor({ group: 'extensions.istio.io', version: 'v1alpha1', kind: 'WasmPlugin' })).toBe(
      'extensions.istio.io~v1alpha1~WasmPlugin'
    );
  });
});

describe('referenceForObj', () => {
  it('should resolve a K8s resource object to group~version~kind', () => {
    const obj = { apiVersion: 'networking.istio.io/v1', kind: 'DestinationRule', metadata: { name: 'dr1' } };
    mockedGetGVK.mockReturnValue({ group: 'networking.istio.io', version: 'v1', kind: 'DestinationRule' });

    expect(referenceForObj(obj)).toBe('networking.istio.io~v1~DestinationRule');
    expect(mockedGetGVK).toHaveBeenCalledWith(obj);
  });
});

describe('refForKialiIstio', () => {
  it('should convert a Kiali Istio URL to OpenShift reference format', () => {
    expect(refForKialiIstio('/istio/networking.istio.io/v1/DestinationRule/reviews')).toBe(
      '/networking.istio.io~v1~DestinationRule/reviews'
    );
  });

  it('should handle security group resources', () => {
    expect(refForKialiIstio('/istio/security.istio.io/v1/PeerAuthentication/default')).toBe(
      '/security.istio.io~v1~PeerAuthentication/default'
    );
  });

  it('should handle Gateway API resources', () => {
    expect(refForKialiIstio('/istio/gateway.networking.k8s.io/v1/HTTPRoute/my-route')).toBe(
      '/gateway.networking.k8s.io~v1~HTTPRoute/my-route'
    );
  });

  it('should handle alpha version resources', () => {
    expect(refForKialiIstio('/istio/extensions.istio.io/v1alpha1/WasmPlugin/my-plugin')).toBe(
      '/extensions.istio.io~v1alpha1~WasmPlugin/my-plugin'
    );
  });
});

describe('istioResources', () => {
  it('should contain all expected Istio and Gateway API resource types', () => {
    const expectedIds = [
      'authorizationPolicy', 'destinationRule', 'envoyFilter', 'gateway', 'k8sGateway',
      'k8sGRPCRoute', 'k8sHTTPRoute', 'k8sReferenceGrant', 'k8sTCProute', 'k8sTLSroute',
      'peerAuthentication', 'proxyConfig', 'requestAuthentication', 'serviceEntry',
      'sidecar', 'telemetry', 'virtualService', 'workloadEntry', 'workloadGroup', 'wasmPlugin'
    ];
    expect(istioResources.map(r => r.id).sort()).toEqual(expectedIds.sort());
  });

  it('should have unique ids', () => {
    const ids = istioResources.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should include both Istio Gateway and K8s Gateway', () => {
    const gateways = istioResources.filter(r => r.kind === 'Gateway');
    expect(gateways).toHaveLength(2);
    expect(gateways.map(g => g.group).sort()).toEqual(['gateway.networking.k8s.io', 'networking.istio.io']);
  });
});
