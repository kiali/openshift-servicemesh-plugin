import { getGroupVersionKindForResource } from '@openshift-console/dynamic-plugin-sdk';
import { referenceFor, referenceForObj, refForKialiIstio, istioResources } from '../IstioResources';

const mockedGetGVK = getGroupVersionKindForResource as jest.Mock;

describe('referenceFor', () => {
  test('should join group~version~kind for an Istio networking resource', () => {
    expect(referenceFor({ group: 'networking.istio.io', version: 'v1', kind: 'VirtualService' })).toBe(
      'networking.istio.io~v1~VirtualService'
    );
  });

  test('should join group~version~kind for an Istio security resource', () => {
    expect(referenceFor({ group: 'security.istio.io', version: 'v1', kind: 'AuthorizationPolicy' })).toBe(
      'security.istio.io~v1~AuthorizationPolicy'
    );
  });

  test('should join group~version~kind for a Gateway API resource', () => {
    expect(referenceFor({ group: 'gateway.networking.k8s.io', version: 'v1', kind: 'HTTPRoute' })).toBe(
      'gateway.networking.k8s.io~v1~HTTPRoute'
    );
  });

  test('should handle alpha versions', () => {
    expect(referenceFor({ group: 'extensions.istio.io', version: 'v1alpha1', kind: 'WasmPlugin' })).toBe(
      'extensions.istio.io~v1alpha1~WasmPlugin'
    );
  });
});

describe('referenceForObj', () => {
  beforeEach(() => {
    mockedGetGVK.mockReset();
  });

  test('should resolve a K8s resource object to group~version~kind', () => {
    const obj = { apiVersion: 'networking.istio.io/v1', kind: 'DestinationRule', metadata: { name: 'dr1' } };
    mockedGetGVK.mockReturnValue({ group: 'networking.istio.io', version: 'v1', kind: 'DestinationRule' });

    expect(referenceForObj(obj)).toBe('networking.istio.io~v1~DestinationRule');
    expect(mockedGetGVK).toHaveBeenCalledWith(obj);
  });
});

describe('refForKialiIstio', () => {
  test('should convert a Kiali Istio URL to OpenShift reference format', () => {
    expect(refForKialiIstio('/istio/networking.istio.io/v1/DestinationRule/reviews')).toBe(
      '/networking.istio.io~v1~DestinationRule/reviews'
    );
  });

  test('should handle security group resources', () => {
    expect(refForKialiIstio('/istio/security.istio.io/v1/PeerAuthentication/default')).toBe(
      '/security.istio.io~v1~PeerAuthentication/default'
    );
  });

  test('should handle Gateway API resources', () => {
    expect(refForKialiIstio('/istio/gateway.networking.k8s.io/v1/HTTPRoute/my-route')).toBe(
      '/gateway.networking.k8s.io~v1~HTTPRoute/my-route'
    );
  });

  test('should handle alpha version resources', () => {
    expect(refForKialiIstio('/istio/extensions.istio.io/v1alpha1/WasmPlugin/my-plugin')).toBe(
      '/extensions.istio.io~v1alpha1~WasmPlugin/my-plugin'
    );
  });
});

describe('istioResources', () => {
  test('should contain the expected number of resource types', () => {
    expect(istioResources).toHaveLength(20);
  });

  test('should have unique ids', () => {
    const ids = istioResources.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('should include both Istio Gateway and K8s Gateway', () => {
    const gateways = istioResources.filter(r => r.kind === 'Gateway');
    expect(gateways).toHaveLength(2);
    expect(gateways.map(g => g.group).sort()).toEqual(['gateway.networking.k8s.io', 'networking.istio.io']);
  });

  test('should include critical Istio resource types', () => {
    const ids = istioResources.map(r => r.id);
    expect(ids).toContain('virtualService');
    expect(ids).toContain('destinationRule');
    expect(ids).toContain('authorizationPolicy');
    expect(ids).toContain('peerAuthentication');
  });
});
