import { useEffect, useMemo, useState } from 'react';
import { fleetK8sGet, useFleetSearchPoll } from '@stolostron/multicluster-sdk';
import type { FleetIstio, Istio, EnrichedControlPlane } from '../types/istio';
import { istioModel, istioGroupVersionKind } from '../types/istio';
import type { MultiClusterMesh } from '../types/multiClusterMesh';
import { buildMcmIndex, lookupMcm } from '../utils/correlateMCM';
import { toEnrichedControlPlane } from '../utils/enrichmentUtils';
import {
  CACHE_TTL_MS,
  getConcurrencyLimit,
  getFromEnrichmentCache,
  setInEnrichmentCache
} from './useEnrichedControlPlanes';

/**
 * Scoped enrichment hook for detail pages. Only discovers and enriches control
 * planes on the specified clusters, avoiding fleet-wide enrichment. Populates
 * the shared enrichment cache for bidirectional warming with list pages.
 */
export function useMeshControlPlanes(
  clusterNames: string[],
  mcms: MultiClusterMesh[]
): [EnrichedControlPlane[], boolean, unknown] {
  const [enrichmentVersion, setEnrichmentVersion] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [errorClusterKey, setErrorClusterKey] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [settledClusterKey, setSettledClusterKey] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setRefreshTick(v => v + 1), CACHE_TTL_MS);
    return () => clearInterval(id);
  }, []);

  const clusterKey = useMemo(() => [...clusterNames].sort().join(','), [clusterNames]);

  const [data, searchLoaded, searchError] = useFleetSearchPoll<FleetIstio[]>({
    groupVersionKind: istioGroupVersionKind,
    isList: true,
    namespaced: false
    // ACM Search does not expose a server-side cluster filter in the current SDK version,
    // so we fetch all Istio CRs fleet-wide and filter to clusterNames locally below.
    // On large fleets this may return more data than needed for a single mesh's detail view.
  });

  const scopedResults = useMemo(() => {
    if (!data || clusterNames.length === 0) return [];
    const clusterSet = new Set(clusterNames);
    return data.filter((r): r is FleetIstio => Boolean(r.cluster && r.metadata?.name && clusterSet.has(r.cluster)));
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- depend on clusterKey (stable string) instead of clusterNames (new array identity each render)
  }, [data, clusterKey]);

  const allCached =
    scopedResults.length === 0 ||
    scopedResults.every(r => getFromEnrichmentCache(r.cluster, r.metadata?.name ?? '') !== undefined);
  const enrichmentLoaded = allCached || settledClusterKey === clusterKey;
  const activeError = errorClusterKey === clusterKey ? error : null;

  useEffect(() => {
    let cancelled = false;

    const pending = scopedResults
      .filter(r => {
        const cached = getFromEnrichmentCache(r.cluster, r.metadata?.name ?? '');
        return !cached;
      })
      .map(r => ({ cluster: r.cluster, name: r.metadata?.name ?? '' }));

    if (pending.length === 0) {
      return;
    }

    (async () => {
      try {
        const chunkSize = getConcurrencyLimit(pending.length);
        for (let i = 0; i < pending.length; i += chunkSize) {
          if (cancelled) return;
          const chunk = pending.slice(i, i + chunkSize);
          const results = await Promise.allSettled(
            chunk.map(({ cluster, name }) =>
              fleetK8sGet<Istio>({ model: istioModel, name, cluster }).then(r => ({ cluster, name, data: r }))
            )
          );
          if (cancelled) return;
          for (const result of results) {
            if (result.status === 'fulfilled') {
              const { cluster, name, data: istioData } = result.value;
              setInEnrichmentCache(cluster, name, istioData);
            }
          }
        }
        if (!cancelled) {
          setEnrichmentVersion(v => v + 1);
          setSettledClusterKey(clusterKey);
        }
      } catch (e) {
        if (!cancelled) {
          setSettledClusterKey(clusterKey);
          setError(e);
          setErrorClusterKey(clusterKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scopedResults, refreshTick, clusterKey]);

  const mcmIndex = useMemo(() => buildMcmIndex(mcms), [mcms]);

  const enrichedPlanes = useMemo(() => {
    return scopedResults.map(r => {
      const cached = getFromEnrichmentCache(r.cluster, r.metadata?.name ?? '');
      const plane = toEnrichedControlPlane(r, cached);
      return {
        ...plane,
        managedBy: lookupMcm(mcmIndex, r.cluster, plane.controlPlaneNamespace)
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- enrichmentVersion is a bump counter that forces recompute after cache writes; it is not read in the callback
  }, [scopedResults, mcmIndex, enrichmentVersion]);

  return [enrichedPlanes, searchLoaded && enrichmentLoaded, activeError ?? searchError];
}
