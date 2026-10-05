import { useMemo } from 'react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { Placement, PlacementDecision } from '../types/placement';
import { placementDecisionGroupVersionKind, placementGroupVersionKind } from '../types/placement';
import { aggregateDecisions } from '../utils/placementSelection';
import { isConditionStale } from '../utils/statusUtils';

export type SelectionState =
  'missingReference' | 'loading' | 'missing' | 'forbidden' | 'error' | 'waiting' | 'updating' | 'ready';

export interface MeshPlacementResult {
  decisionError: unknown;
  decisionLoaded: boolean;
  placement: Placement | null;
  placementError: unknown;
  placementLoaded: boolean;
  selectedNames: string[] | null;
  state: SelectionState;
}

function statusCode(error: unknown): number | undefined {
  const value = error as { code?: number; response?: { status?: number }; statusCode?: number } | null;
  return value?.code ?? value?.statusCode ?? value?.response?.status;
}

/** Watches the selection resources for one managed mesh in its hub namespace. */
export function useMeshPlacement(namespace: string, placementName: string | undefined): MeshPlacementResult {
  const enabled = !!namespace && !!placementName;
  const [placement, placementLoaded, placementError] = useK8sWatchResource<Placement>(
    enabled ? { groupVersionKind: placementGroupVersionKind, name: placementName, namespace } : null
  );
  const [decisions, decisionLoaded, decisionError] = useK8sWatchResource<PlacementDecision[]>(
    enabled
      ? {
          groupVersionKind: placementDecisionGroupVersionKind,
          isList: true,
          namespace,
          selector: { matchLabels: { 'cluster.open-cluster-management.io/placement': placementName } }
        }
      : null
  );

  const selection = useMemo(() => aggregateDecisions(decisions ?? []), [decisions]);
  let state: SelectionState;
  if (!enabled) state = 'missingReference';
  else if (placementError) {
    const code = statusCode(placementError);
    state = code === 404 ? 'missing' : code === 403 ? 'forbidden' : 'error';
  } else if (!placementLoaded) state = 'loading';
  else if (!placement) state = 'missing';
  else if (decisionError) state = statusCode(decisionError) === 403 ? 'forbidden' : 'error';
  else if (!decisionLoaded) state = 'loading';
  else if (
    selection.rawCount === 0 &&
    !placement.status?.numberOfSelectedClusters &&
    !placement.status?.conditions?.length
  )
    state = 'waiting';
  else if (
    !selection.valid ||
    placement.status?.conditions?.some(c => isConditionStale(c, placement.metadata?.generation)) ||
    placement.status?.numberOfSelectedClusters === undefined ||
    selection.rawCount !== placement.status.numberOfSelectedClusters
  )
    state = 'updating';
  else state = 'ready';

  return {
    decisionError,
    decisionLoaded,
    placement: placement ?? null,
    placementError,
    placementLoaded,
    selectedNames: state === 'ready' ? selection.selectedNames : null,
    state
  };
}
