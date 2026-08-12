import { useEffect, useMemo, useRef, useState } from 'react';
import { fleetK8sGet, useFleetSearchPoll } from '@stolostron/multicluster-sdk';
import type {
  DiscoveredKiali,
  DiscoveredOssmc,
  FleetKialiCR,
  FleetOssmConsoleCR,
  KialiCR,
  OssmConsoleCR,
  Route
} from '../types/kiali';
import {
  kialiGroupVersionKind,
  kialiModel,
  ossmConsoleGroupVersionKind,
  ossmConsoleModel,
  routeModel
} from '../types/kiali';

interface ScopeFilter {
  cluster: string;
  namespace: string;
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CACHE_TTL_MS = 150_000;
const CONCURRENCY = 15;
const DEFAULT_DEPLOYMENT_NAMESPACE = 'istio-system';
const DEFAULT_INSTANCE_NAME = 'kiali';

const kialiCache = new Map<string, CacheEntry<DiscoveredKiali>>();
const ossmcCache = new Map<string, CacheEntry<DiscoveredOssmc>>();

export function __resetKialiCaches(): void {
  kialiCache.clear();
  ossmcCache.clear();
}

function cacheKey(cluster: string, name: string, ns: string): string {
  return `${cluster}/${ns}/${name}`;
}

function resolveDeploymentNamespace(cr: KialiCR): string {
  return cr.spec?.deployment?.namespace?.trim() || cr.metadata?.namespace || DEFAULT_DEPLOYMENT_NAMESPACE;
}

function resolveInstanceName(cr: KialiCR): string {
  return cr.spec?.deployment?.instance_name?.trim() || cr.metadata?.name?.trim() || DEFAULT_INSTANCE_NAME;
}

function shouldSkipRouteFetch(cr: KialiCR): boolean {
  if (cr.spec?.deployment?.ingress?.enabled === false) return true;
  if (cr.spec?.server?.web_fqdn?.trim()) return true;
  return false;
}

async function enrichSingleKiali(cluster: string, name: string, ns: string): Promise<DiscoveredKiali> {
  const cr = await fleetK8sGet<KialiCR>({ model: kialiModel, name, ns, cluster });
  const deploymentNamespace = resolveDeploymentNamespace(cr);
  const instanceName = resolveInstanceName(cr);
  const webFqdn = cr.spec?.server?.web_fqdn?.trim() || undefined;

  let routeHost: string | undefined;
  if (!shouldSkipRouteFetch(cr)) {
    try {
      const route = await fleetK8sGet<Route>({
        model: routeModel,
        name: instanceName,
        ns: deploymentNamespace,
        cluster
      });
      routeHost = route.spec?.host || undefined;
    } catch {
      // Route may not exist (404) -- graceful fallback
    }
  }

  return {
    cluster,
    crName: name,
    crNamespace: ns,
    deploymentNamespace,
    instanceName,
    routeHost,
    webFqdn
  };
}

async function enrichSingleOssmc(cluster: string, name: string, ns: string): Promise<DiscoveredOssmc> {
  const cr = await fleetK8sGet<OssmConsoleCR>({ model: ossmConsoleModel, name, ns, cluster });
  return {
    cluster,
    crName: name,
    crNamespace: ns,
    kialiServiceName: cr.status?.kiali?.serviceName || undefined,
    kialiServiceNamespace: cr.status?.kiali?.serviceNamespace || undefined
  };
}

async function enrichInChunks<T>(
  items: Array<{ cluster: string; name: string; ns: string }>,
  enrichFn: (cluster: string, name: string, ns: string) => Promise<T>,
  isCancelled: () => boolean
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    if (isCancelled()) return results;
    const chunk = items.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map(({ cluster, name, ns }) => enrichFn(cluster, name, ns)));
    for (const result of settled) {
      if (result.status === 'fulfilled') results.push(result.value);
    }
  }
  return results;
}

function matchesScope(cluster: string, namespace: string, scope?: ScopeFilter[]): boolean {
  if (!scope || scope.length === 0) return true;
  return scope.some(s => s.cluster === cluster && s.namespace === namespace);
}

function matchesClusterScope(cluster: string, scope?: ScopeFilter[]): boolean {
  if (!scope || scope.length === 0) return true;
  return scope.some(s => s.cluster === cluster);
}

/**
 * Discovers Kiali and OSSMConsole instances across the fleet via ACM Search,
 * enriches them with spec/status details, and resolves Route URLs.
 *
 * @param scopeFilter - When provided, limits results to Kiali CRs whose
 *   resolved deploymentNamespace matches one of the given (cluster, namespace)
 *   pairs. All Kiali CRs on scoped clusters are enriched (CR namespace may differ
 *   from deployment namespace); the post-enrichment filter is authoritative.
 */
export function useDiscoveredKialis(scopeFilter?: ScopeFilter[]): {
  kialis: DiscoveredKiali[];
  loaded: boolean;
  ossmcs: DiscoveredOssmc[];
} {
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const initialDone = useRef(false);

  const [kialiData] = useFleetSearchPoll<FleetKialiCR[]>({
    groupVersionKind: kialiGroupVersionKind,
    isList: true,
    namespaced: true
  });

  const [ossmcData] = useFleetSearchPoll<FleetOssmConsoleCR[]>({
    groupVersionKind: ossmConsoleGroupVersionKind,
    isList: true,
    namespaced: true
  });

  const kialiItems = useMemo(
    () =>
      (kialiData ?? []).filter((r): r is FleetKialiCR =>
        Boolean(r.cluster && r.metadata?.name && r.metadata?.namespace)
      ),
    [kialiData]
  );

  const ossmcItems = useMemo(
    () =>
      (ossmcData ?? []).filter((r): r is FleetOssmConsoleCR =>
        Boolean(r.cluster && r.metadata?.name && r.metadata?.namespace)
      ),
    [ossmcData]
  );

  const scopeKey = useMemo(
    () =>
      scopeFilter
        ?.map(s => `${s.cluster}/${s.namespace}`)
        .sort()
        .join(',') ?? '',
    [scopeFilter]
  );

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();

    if ((kialiItems.length > 0 || ossmcItems.length > 0) && !initialDone.current) {
      setLoaded(false);
    }

    const pendingKialis = kialiItems
      .filter(r => {
        const key = cacheKey(r.cluster, r.metadata!.name!, r.metadata!.namespace!);
        const entry = kialiCache.get(key);
        if (entry && now - entry.fetchedAt <= CACHE_TTL_MS) return false;
        return matchesClusterScope(r.cluster, scopeFilter);
      })
      .map(r => ({ cluster: r.cluster, name: r.metadata!.name!, ns: r.metadata!.namespace! }));

    const pendingOssmcs = ossmcItems
      .filter(r => {
        const key = cacheKey(r.cluster, r.metadata!.name!, r.metadata!.namespace!);
        const entry = ossmcCache.get(key);
        return !entry || now - entry.fetchedAt > CACHE_TTL_MS;
      })
      .map(r => ({ cluster: r.cluster, name: r.metadata!.name!, ns: r.metadata!.namespace! }));

    if (pendingKialis.length === 0 && pendingOssmcs.length === 0) {
      setLoaded(true);
      initialDone.current = true;
      return;
    }

    (async () => {
      const [enrichedKialis, enrichedOssmcs] = await Promise.all([
        enrichInChunks(pendingKialis, enrichSingleKiali, () => cancelled),
        enrichInChunks(pendingOssmcs, enrichSingleOssmc, () => cancelled)
      ]);

      if (cancelled) return;

      for (const k of enrichedKialis) {
        kialiCache.set(cacheKey(k.cluster, k.crName, k.crNamespace), { data: k, fetchedAt: Date.now() });
      }
      for (const o of enrichedOssmcs) {
        ossmcCache.set(cacheKey(o.cluster, o.crName, o.crNamespace), { data: o, fetchedAt: Date.now() });
      }

      setVersion(v => v + 1);
      setLoaded(true);
      initialDone.current = true;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kialiItems, ossmcItems, scopeKey]);

  const kialis = useMemo(() => {
    const results: DiscoveredKiali[] = [];
    for (const r of kialiItems) {
      const entry = kialiCache.get(cacheKey(r.cluster, r.metadata!.name!, r.metadata!.namespace!));
      if (entry) {
        if (matchesScope(entry.data.cluster, entry.data.deploymentNamespace, scopeFilter)) {
          results.push(entry.data);
        }
      }
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kialiItems, version, scopeKey]);

  const ossmcs = useMemo(() => {
    const results: DiscoveredOssmc[] = [];
    for (const r of ossmcItems) {
      const entry = ossmcCache.get(cacheKey(r.cluster, r.metadata!.name!, r.metadata!.namespace!));
      if (entry) results.push(entry.data);
    }
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ossmcItems, version]);

  return { kialis, loaded, ossmcs };
}
