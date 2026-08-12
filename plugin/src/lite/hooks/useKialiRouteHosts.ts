import { useEffect, useMemo, useState } from 'react';
import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import type { LiteKialiResource, Route } from '../types/kiali';
import { routeModel } from '../types/kiali';
import { getKialiServiceTarget } from '../utils/kialiServiceTarget';

const CACHE_TTL_MS = 150_000;
const CONCURRENCY = 15;

interface CacheEntry {
  fetchedAt: number;
  routeHost: string | undefined;
}

const routeHostCache = new Map<string, CacheEntry>();

export function __resetKialiRouteHostCache(): void {
  routeHostCache.clear();
}

// Skip the Route lookup entirely when ingress is
// explicitly disabled, or when web_fqdn is already set and should take priority.
function shouldSkipRouteFetch(resource: LiteKialiResource): boolean {
  if (resource.spec?.deployment?.ingress?.enabled === false) return true;
  if (resource.spec?.server?.web_fqdn?.trim()) return true;
  return false;
}

async function fetchRouteHost(name: string, namespace: string): Promise<string | undefined> {
  try {
    const route = await k8sGet<Route>({ model: routeModel, name, ns: namespace });
    return route.spec?.host || undefined;
  } catch {
    // Route may not exist (404), or the user may lack RBAC on routes -- graceful fallback.
    return undefined;
  }
}

/**
 * Best-effort discovery of the OpenShift Route host backing each Kiali resource, so the
 * Kialis table can link directly to the standalone Kiali UI even when spec.server.web_fqdn
 * is unset (the common case, since the operator creates the Route automatically).
 * Returns a map keyed by "serviceNamespace/serviceName" (see getKialiServiceTarget).
 */
export function useKialiRouteHosts(resources: LiteKialiResource[]): Map<string, string> {
  const [fetchedHosts, setFetchedHosts] = useState<Map<string, string>>(() => new Map());

  const targets = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ key: string; name: string; namespace: string }> = [];
    for (const resource of resources) {
      if (shouldSkipRouteFetch(resource)) continue;
      const { name, namespace } = getKialiServiceTarget(resource);
      if (!name || !namespace) continue;
      const key = `${namespace}/${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ key, name, namespace });
    }
    return result;
  }, [resources]);

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();

    const pending = targets.filter(t => {
      const entry = routeHostCache.get(t.key);
      return !entry || now - entry.fetchedAt > CACHE_TTL_MS;
    });

    if (pending.length === 0) return;

    (async () => {
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        if (cancelled) return;
        const chunk = pending.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(chunk.map(t => fetchRouteHost(t.name, t.namespace)));
        settled.forEach((result, idx) => {
          const routeHost = result.status === 'fulfilled' ? result.value : undefined;
          routeHostCache.set(chunk[idx].key, { fetchedAt: Date.now(), routeHost });
        });
        if (!cancelled) {
          setFetchedHosts(prev => {
            const next = new Map(prev);
            settled.forEach((result, idx) => {
              if (result.status === 'fulfilled' && result.value) {
                next.set(chunk[idx].key, result.value);
              }
            });
            return next;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targets]);

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const t of targets) {
      const cached = routeHostCache.get(t.key);
      if (cached?.routeHost) {
        map.set(t.key, cached.routeHost);
      }
      const fetched = fetchedHosts.get(t.key);
      if (fetched) map.set(t.key, fetched);
    }
    return map;
  }, [targets, fetchedHosts]);
}
