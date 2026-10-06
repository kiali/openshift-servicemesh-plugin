import { clusterDetailLink, placementDetailLink } from '../linkUtils';

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

  it('produces the ACM Placement overview URL', () => {
    expect(placementDetailLink('mesh-system', 'demo-placement')).toBe(
      '/multicloud/infrastructure/clusters/placements/details/mesh-system/demo-placement/overview'
    );
  });

  it('encodes Placement namespace and name', () => {
    expect(placementDetailLink('mesh system', 'demo/placement')).toBe(
      '/multicloud/infrastructure/clusters/placements/details/mesh%20system/demo%2Fplacement/overview'
    );
  });
});
