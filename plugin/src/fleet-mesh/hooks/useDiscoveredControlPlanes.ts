import { useMemo } from 'react';
import { useFleetSearchPoll } from '@stolostron/multicluster-sdk';
import type { FleetIstio, Istio } from '../types/istio';
import { istioGroupVersionKind } from '../types/istio';

type RawFleetIstio = Istio & { cluster?: string };

/** Discovers Istio CRs across all managed clusters via ACM Search polling. */
export function useDiscoveredControlPlanes(): {
  readonly error: unknown;
  readonly loaded: boolean;
  readonly refetch: (() => void) | undefined;
  readonly results: FleetIstio[];
} {
  const [data, loaded, error, refetch] = useFleetSearchPoll<RawFleetIstio[]>({
    groupVersionKind: istioGroupVersionKind,
    isList: true,
    namespaced: false
  });

  const results = useMemo(
    () => (data ?? []).filter((r): r is FleetIstio => Boolean(r.cluster && r.metadata?.name)),
    [data]
  );

  return { error, loaded, refetch, results } as const;
}
