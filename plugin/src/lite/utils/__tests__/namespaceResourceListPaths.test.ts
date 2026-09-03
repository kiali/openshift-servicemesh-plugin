import { getNamespaceSecretsListPath } from '../namespaceResourceListPaths';

describe('getNamespaceSecretsListPath', () => {
  it('returns the namespace Secret list path', () => {
    expect(getNamespaceSecretsListPath('istio-system')).toBe('/k8s/ns/istio-system/secrets');
  });

  it('encodes namespace path segments', () => {
    expect(getNamespaceSecretsListPath('team/a')).toBe('/k8s/ns/team%2Fa/secrets');
  });

  it('falls back to all-namespaces when namespace is empty', () => {
    expect(getNamespaceSecretsListPath('')).toBe('/k8s/all-namespaces/secrets');
    expect(getNamespaceSecretsListPath('   ')).toBe('/k8s/all-namespaces/secrets');
  });
});
