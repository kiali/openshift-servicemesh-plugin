import { clusterDetailLink } from '../linkUtils';

describe('clusterDetailLink', () => {
  it('produces correct URL for a simple cluster name', () => {
    expect(clusterDetailLink('cluster-a')).toBe(
      '/multicloud/infrastructure/clusters/details/cluster-a/cluster-a/overview'
    );
  });

  it('encodes special characters with encodeURIComponent', () => {
    const name = 'cluster/with spaces&special';
    const encoded = encodeURIComponent(name);
    expect(clusterDetailLink(name)).toBe(`/multicloud/infrastructure/clusters/details/${encoded}/${encoded}/overview`);
  });
});
