import { findKialisForControlPlaneNamespace } from '../kialiControlPlaneMatch';
import { makeKialiResource } from '../../__fixtures__/testFactories';

describe('findKialisForControlPlaneNamespace', () => {
  it('returns Kialis whose deployment namespace matches the control plane namespace', () => {
    const matching = makeKialiResource({
      metadata: { name: 'kiali-a', namespace: 'kiali-operator' },
      spec: { deployment: { instance_name: 'kiali', namespace: 'istio-system' } }
    });
    const other = makeKialiResource({
      metadata: { name: 'kiali-b', namespace: 'other' },
      spec: { deployment: { instance_name: 'kiali', namespace: 'other-ns' } }
    });
    expect(findKialisForControlPlaneNamespace([matching, other], 'istio-system')).toEqual([matching]);
  });

  it('returns empty when control plane namespace is missing', () => {
    expect(findKialisForControlPlaneNamespace([makeKialiResource()], undefined)).toEqual([]);
  });
});
