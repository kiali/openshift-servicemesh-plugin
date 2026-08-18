import type { DiscoveredKiali, DiscoveredOssmc } from '../../types/kiali';
import type { EnrichedControlPlane } from '../../types/istio';
import type { ManagedCluster } from '../../types/managedCluster';
import {
  buildKialiLinkMap,
  buildLiteIstioPath,
  buildSpokeLiteIstioPath,
  controlPlaneLinkKey,
  findKialiLinks,
  getConsoleUrl,
  isLocalCluster,
  resolveControlPlaneObservabilityLink,
  toControlPlaneLinkTargets
} from '../kialiLinkUtils';

function makeKiali(overrides: Partial<DiscoveredKiali> = {}): DiscoveredKiali {
  return {
    cluster: 'cluster-a',
    crName: 'kiali',
    crNamespace: 'istio-system',
    deploymentNamespace: 'istio-system',
    instanceName: 'kiali',
    ...overrides
  };
}

function makeOssmc(overrides: Partial<DiscoveredOssmc> = {}): DiscoveredOssmc {
  return {
    cluster: 'cluster-a',
    crName: 'ossmconsole',
    crNamespace: 'istio-system',
    kialiServiceName: 'kiali',
    kialiServiceNamespace: 'istio-system',
    ...overrides
  };
}

function makeManagedCluster(
  name: string,
  labels?: Record<string, string>,
  claims?: Array<{ name: string; value: string }>
): ManagedCluster {
  return {
    apiVersion: 'cluster.open-cluster-management.io/v1',
    kind: 'ManagedCluster',
    metadata: { name, labels },
    status: claims
      ? ({ clusterClaims: claims } as ManagedCluster['status'] & {
          clusterClaims?: Array<{ name: string; value: string }>;
        })
      : undefined
  };
}

function makeClusterMap(...clusters: ManagedCluster[]): Map<string, ManagedCluster> {
  const map = new Map<string, ManagedCluster>();
  for (const c of clusters) map.set(c.metadata!.name!, c);
  return map;
}

function makeControlPlane(
  clusterName: string,
  istioCrName: string,
  controlPlaneNamespace = 'istio-system'
): EnrichedControlPlane {
  return {
    clusterName,
    controlPlaneNamespace,
    metadata: { name: istioCrName }
  };
}

describe('isLocalCluster', () => {
  it('returns true when local-cluster label is "true"', () => {
    const mc = makeManagedCluster('hub', { 'local-cluster': 'true' });
    expect(isLocalCluster(mc)).toBe(true);
  });

  it('returns false when label is absent', () => {
    const mc = makeManagedCluster('spoke');
    expect(isLocalCluster(mc)).toBe(false);
  });

  it('returns false for undefined cluster', () => {
    expect(isLocalCluster(undefined)).toBe(false);
  });
});

describe('getConsoleUrl', () => {
  it('extracts console URL from clusterClaims', () => {
    const mc = makeManagedCluster('spoke', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com' }
    ]);
    expect(getConsoleUrl(mc)).toBe('https://console.spoke.example.com');
  });

  it('returns undefined when claim is absent', () => {
    const mc = makeManagedCluster('spoke', {}, [{ name: 'other.claim', value: 'foo' }]);
    expect(getConsoleUrl(mc)).toBeUndefined();
  });

  it('returns undefined when status has no clusterClaims', () => {
    const mc = makeManagedCluster('spoke');
    expect(getConsoleUrl(mc)).toBeUndefined();
  });

  it('rejects a javascript: scheme reported by a compromised or misconfigured spoke', () => {
    const mc = makeManagedCluster('spoke', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'javascript:alert(1)' }
    ]);
    expect(getConsoleUrl(mc)).toBeUndefined();
  });

  it('rejects a data: scheme reported by a compromised or misconfigured spoke', () => {
    const mc = makeManagedCluster('spoke', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'data:text/html,<script>alert(1)</script>' }
    ]);
    expect(getConsoleUrl(mc)).toBeUndefined();
  });

  it('rejects a malformed URL value', () => {
    const mc = makeManagedCluster('spoke', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'not a url' }
    ]);
    expect(getConsoleUrl(mc)).toBeUndefined();
  });
});

describe('buildLiteIstioPath', () => {
  it('builds the Istios detail path for an Istio CR name', () => {
    expect(buildLiteIstioPath('default')).toBe('/ossmconsole/istios/default');
  });
});

describe('buildSpokeLiteIstioPath', () => {
  it('builds an absolute spoke console URL to the Istios detail page', () => {
    expect(buildSpokeLiteIstioPath('https://console.spoke.example.com', 'unsecure-cp')).toBe(
      'https://console.spoke.example.com/ossmconsole/istios/unsecure-cp'
    );
  });

  it('strips trailing slash from console URL before appending path', () => {
    expect(buildSpokeLiteIstioPath('https://console.spoke.example.com/', 'default')).toBe(
      'https://console.spoke.example.com/ossmconsole/istios/default'
    );
  });
});

describe('controlPlaneLinkKey', () => {
  it('keys links by cluster and Istio CR name', () => {
    expect(controlPlaneLinkKey('hub', 'default')).toBe('hub/default');
  });
});

describe('findKialiLinks', () => {
  it('correlates a Kiali to a CP by (cluster, deploymentNamespace) match', () => {
    const kialis = [makeKiali({ routeHost: 'kiali.apps.cluster-a.example.com' })];
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, [], makeClusterMap());
    expect(links).toHaveLength(1);
    expect(links[0].standaloneUrl).toBe('https://kiali.apps.cluster-a.example.com');
  });

  it('returns empty array when no Kiali matches the given cluster/namespace', () => {
    const kialis = [makeKiali({ cluster: 'cluster-b' })];
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, [], makeClusterMap());
    expect(links).toHaveLength(0);
  });

  it('returns multiple links when multiple Kialis exist in the same namespace', () => {
    const kialis = [
      makeKiali({ crName: 'kiali-1', instanceName: 'kiali-1', routeHost: 'k1.example.com' }),
      makeKiali({ crName: 'kiali-2', instanceName: 'kiali-2', routeHost: 'k2.example.com' })
    ];
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, [], makeClusterMap());
    expect(links).toHaveLength(2);
    expect(links[0].standaloneUrl).toBe('https://k1.example.com');
    expect(links[1].standaloneUrl).toBe('https://k2.example.com');
  });

  it('falls back to webFqdn when routeHost is absent', () => {
    const kialis = [makeKiali({ webFqdn: 'kiali.custom.example.com' })];
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, [], makeClusterMap());
    expect(links[0].standaloneUrl).toBe('https://kiali.custom.example.com');
  });

  it('returns no standaloneUrl when both routeHost and webFqdn are absent', () => {
    const kialis = [makeKiali()];
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, [], makeClusterMap());
    expect(links[0].standaloneUrl).toBeUndefined();
  });

  it('rejects malicious standalone hosts', () => {
    for (const host of ['//evil.com', 'evil.com/path', 'user@evil.com']) {
      const kialis = [makeKiali({ routeHost: host })];
      const links = findKialiLinks('cluster-a', 'istio-system', kialis, [], makeClusterMap());
      expect(links[0].standaloneUrl).toBeUndefined();
    }
  });

  it('builds hub-cluster Kialis detail link as internal path', () => {
    const kialis = [makeKiali({ routeHost: 'kiali.example.com' })];
    const ossmcs = [makeOssmc()];
    const hub = makeManagedCluster('cluster-a', { 'local-cluster': 'true' });
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, ossmcs, makeClusterMap(hub));
    expect(links[0].ossmcUrl).toBe('/ossmconsole/kialis/istio-system/kiali');
  });

  it('builds spoke-cluster OSSMC link to overview on that cluster console', () => {
    const kialis = [makeKiali({ routeHost: 'kiali.example.com' })];
    const ossmcs = [makeOssmc()];
    const spoke = makeManagedCluster('cluster-a', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com' }
    ]);
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, ossmcs, makeClusterMap(spoke));
    expect(links[0].ossmcUrl).toBe('https://console.spoke.example.com/ossmconsole/overview');
  });

  it('returns no OSSMC link when console URL claim is missing for spoke', () => {
    const kialis = [makeKiali({ routeHost: 'kiali.example.com' })];
    const ossmcs = [makeOssmc()];
    const spoke = makeManagedCluster('cluster-a');
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, ossmcs, makeClusterMap(spoke));
    expect(links[0].ossmcUrl).toBeUndefined();
  });

  it('strips trailing slash from console URL before appending OSSMC overview path', () => {
    const kialis = [makeKiali({ routeHost: 'kiali.example.com' })];
    const ossmcs = [makeOssmc()];
    const spoke = makeManagedCluster('cluster-a', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com/' }
    ]);
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, ossmcs, makeClusterMap(spoke));
    expect(links[0].ossmcUrl).toBe('https://console.spoke.example.com/ossmconsole/overview');
  });

  it('does not fall back to OSSMC crNamespace when kialiServiceNamespace is unset', () => {
    const kialis = [makeKiali({ routeHost: 'kiali.example.com' })];
    const ossmcs = [makeOssmc({ kialiServiceNamespace: undefined })];
    const hub = makeManagedCluster('cluster-a', { 'local-cluster': 'true' });
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, ossmcs, makeClusterMap(hub));
    expect(links[0].ossmcUrl).toBeUndefined();
  });

  it('uses Kiali CR identity when both Kiali and OSSMC are present', () => {
    const kialis = [makeKiali({ crName: 'my-kiali', routeHost: 'kiali.example.com' })];
    const ossmcs = [makeOssmc({ kialiServiceName: 'kiali' })];
    const hub = makeManagedCluster('cluster-a', { 'local-cluster': 'true' });
    const links = findKialiLinks('cluster-a', 'istio-system', kialis, ossmcs, makeClusterMap(hub));
    expect(links[0].ossmcUrl).toBe('/ossmconsole/kialis/istio-system/my-kiali');
  });

  it('uses Kiali CR namespace for hub Kialis detail link when CR and deployment namespaces differ', () => {
    const kialis = [
      makeKiali({
        crName: 'kiali',
        crNamespace: 'kiali-operator',
        deploymentNamespace: 'secure-ns',
        routeHost: 'kiali.example.com'
      })
    ];
    const ossmcs = [makeOssmc({ kialiServiceNamespace: 'secure-ns' })];
    const hub = makeManagedCluster('cluster-a', { 'local-cluster': 'true' });
    const links = findKialiLinks('cluster-a', 'secure-ns', kialis, ossmcs, makeClusterMap(hub));
    expect(links[0].ossmcUrl).toBe('/ossmconsole/kialis/kiali-operator/kiali');
  });

  it('returns no links without a matching Kiali CR even when OSSMC is integrated for the CP namespace', () => {
    const ossmcs = [makeOssmc({ cluster: 'cluster-b', kialiServiceNamespace: 'istio-system' })];
    const hub = makeManagedCluster('cluster-b', { 'local-cluster': 'true' });
    const links = findKialiLinks('cluster-b', 'istio-system', [], ossmcs, makeClusterMap(hub));
    expect(links).toHaveLength(0);
  });

  it('returns no links on spoke without a matching Kiali CR even when OSSMC is present', () => {
    const ossmcs = [makeOssmc({ cluster: 'cluster-b', kialiServiceNamespace: 'istio-system' })];
    const spoke = makeManagedCluster('cluster-b', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com' }
    ]);
    const links = findKialiLinks('cluster-b', 'istio-system', [], ossmcs, makeClusterMap(spoke));
    expect(links).toHaveLength(0);
  });

  it('ignores OSSMC crNamespace entirely -- only kialiServiceNamespace can correlate it to a control plane', () => {
    const ossmcs = [
      makeOssmc({ cluster: 'cluster-b', crNamespace: 'istio-system', kialiServiceNamespace: 'other-ns' })
    ];
    const spoke = makeManagedCluster('cluster-b', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com' }
    ]);
    const links = findKialiLinks('cluster-b', 'istio-system', [], ossmcs, makeClusterMap(spoke));
    expect(links).toHaveLength(0);
  });
});

describe('resolveControlPlaneObservabilityLink', () => {
  it('returns hub Istios detail page when no Kiali CR exists on the hub', () => {
    const hub = makeManagedCluster('hub', { 'local-cluster': 'true' });
    const link = resolveControlPlaneObservabilityLink(
      { clusterName: 'hub', controlPlaneNamespace: 'istio-system', istioCrName: 'default' },
      [],
      [],
      makeClusterMap(hub)
    );
    expect(link.ossmcUrl).toBe('/ossmconsole/istios/default');
  });

  it('prefers standalone Kiali over hub istios detail', () => {
    const hub = makeManagedCluster('hub', { 'local-cluster': 'true' });
    const kialis = [makeKiali({ cluster: 'hub', routeHost: 'kiali.example.com' })];
    const link = resolveControlPlaneObservabilityLink(
      { clusterName: 'hub', controlPlaneNamespace: 'istio-system', istioCrName: 'default' },
      kialis,
      [],
      makeClusterMap(hub)
    );
    expect(link.standaloneUrl).toBe('https://kiali.example.com');
    expect(link.ossmcUrl).toBeUndefined();
  });

  it('does not use hub istios detail when a matching Kiali CR exists but has no URLs', () => {
    const hub = makeManagedCluster('hub', { 'local-cluster': 'true' });
    const kialis = [makeKiali({ cluster: 'hub' })];
    const link = resolveControlPlaneObservabilityLink(
      { clusterName: 'hub', controlPlaneNamespace: 'istio-system', istioCrName: 'default' },
      kialis,
      [],
      makeClusterMap(hub)
    );
    expect(link.standaloneUrl).toBeUndefined();
    expect(link.ossmcUrl).toBeUndefined();
  });

  it('returns spoke Istios detail page when OSSMC is installed but no Kiali CR matches', () => {
    const ossmcs = [makeOssmc({ cluster: 'spoke', kialiServiceNamespace: 'secure-ns' })];
    const spoke = makeManagedCluster('spoke', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com' }
    ]);
    const link = resolveControlPlaneObservabilityLink(
      { clusterName: 'spoke', controlPlaneNamespace: 'unsecure-ns', istioCrName: 'unsecure-cp' },
      [],
      ossmcs,
      makeClusterMap(spoke)
    );
    expect(link.ossmcUrl).toBe('https://console.spoke.example.com/ossmconsole/istios/unsecure-cp');
  });

  it('returns no spoke link when OSSMC is installed but console URL is unknown', () => {
    const ossmcs = [makeOssmc({ cluster: 'spoke', kialiServiceNamespace: 'secure-ns' })];
    const spoke = makeManagedCluster('spoke');
    const link = resolveControlPlaneObservabilityLink(
      { clusterName: 'spoke', controlPlaneNamespace: 'unsecure-ns', istioCrName: 'unsecure-cp' },
      [],
      ossmcs,
      makeClusterMap(spoke)
    );
    expect(link.ossmcUrl).toBeUndefined();
  });

  it('returns spoke Istios detail page when matching Kiali CR has no URL and OSSMC is not integrated', () => {
    const kialis = [makeKiali({ cluster: 'spoke', deploymentNamespace: 'unsecure-ns' })];
    const ossmcs = [makeOssmc({ cluster: 'spoke', kialiServiceNamespace: 'secure-ns' })];
    const spoke = makeManagedCluster('spoke', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com' }
    ]);
    const link = resolveControlPlaneObservabilityLink(
      { clusterName: 'spoke', controlPlaneNamespace: 'unsecure-ns', istioCrName: 'unsecure-cp' },
      kialis,
      ossmcs,
      makeClusterMap(spoke)
    );
    expect(link.standaloneUrl).toBeUndefined();
    expect(link.ossmcUrl).toBe('https://console.spoke.example.com/ossmconsole/istios/unsecure-cp');
  });
});

describe('buildKialiLinkMap', () => {
  it('builds a map keyed by cluster and Istio CR name', () => {
    const kialis = [
      makeKiali({ cluster: 'cluster-a', deploymentNamespace: 'istio-system', routeHost: 'k.a.example.com' }),
      makeKiali({ cluster: 'cluster-b', deploymentNamespace: 'mesh-ns', routeHost: 'k.b.example.com' })
    ];
    const controlPlanes = [
      makeControlPlane('cluster-a', 'default', 'istio-system'),
      makeControlPlane('cluster-b', 'mesh', 'mesh-ns')
    ];
    const map = buildKialiLinkMap(kialis, [], makeClusterMap(), toControlPlaneLinkTargets(controlPlanes));
    expect(map.size).toBe(2);
    expect(map.get('cluster-a/default')?.[0].standaloneUrl).toBe('https://k.a.example.com');
    expect(map.get('cluster-b/mesh')?.[0].standaloneUrl).toBe('https://k.b.example.com');
  });

  it('returns empty map when no control planes are provided', () => {
    const map = buildKialiLinkMap([], [], makeClusterMap(), []);
    expect(map.size).toBe(0);
  });

  it('includes hub Istios detail page links when no Kiali CR exists', () => {
    const hub = makeManagedCluster('hub', { 'local-cluster': 'true' });
    const controlPlanes = [makeControlPlane('hub', 'default')];
    const map = buildKialiLinkMap([], [], makeClusterMap(hub), toControlPlaneLinkTargets(controlPlanes));
    expect(map.size).toBe(1);
    expect(map.get('hub/default')?.[0].ossmcUrl).toBe('/ossmconsole/istios/default');
  });

  it('includes spoke Istios detail page links when OSSMC is installed', () => {
    const ossmcs = [makeOssmc({ cluster: 'spoke', kialiServiceNamespace: 'secure-ns' })];
    const spoke = makeManagedCluster('spoke', {}, [
      { name: 'consoleurl.cluster.open-cluster-management.io', value: 'https://console.spoke.example.com' }
    ]);
    const controlPlanes = [makeControlPlane('spoke', 'discovered-spoke-istio', 'discovered-spoke-ns')];
    const map = buildKialiLinkMap([], ossmcs, makeClusterMap(spoke), toControlPlaneLinkTargets(controlPlanes));
    expect(map.size).toBe(1);
    expect(map.get('spoke/discovered-spoke-istio')?.[0].ossmcUrl).toBe(
      'https://console.spoke.example.com/ossmconsole/istios/discovered-spoke-istio'
    );
  });

  it('does not add a map entry for spokes with no OSSMC installed', () => {
    const controlPlanes = [makeControlPlane('spoke', 'default')];
    const map = buildKialiLinkMap([], [], makeClusterMap(), toControlPlaneLinkTargets(controlPlanes));
    expect(map.size).toBe(0);
  });
});
