import { useMemo } from 'react';
import { useFleetSearchPoll } from '@stolostron/multicluster-sdk';
import type { K8sGroupVersionKind, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { operatorDeploymentLabel } from '../utils/operatorPresence';
import type { OperatorStatus, OperatorStatusByCluster } from '../utils/operatorPresence';

const deploymentGroupVersionKind: K8sGroupVersionKind = {
  group: 'apps',
  kind: 'Deployment',
  version: 'v1'
};

// `default` is one of the namespaces Kubernetes itself creates on every
// cluster, so a Search row for it proves that cluster's own collector is
// reporting. The operator query alone cannot distinguish "no operator on
// this cluster" from "Search cannot see this cluster": a cluster whose
// collector is down simply has no rows, and the hub-side query still
// succeeds, so no error surfaces. Because `Missing` is a diagnosis that
// tells the user to install the operator, it may only be reported for
// clusters Search demonstrably sees; clusters absent from the roster are
// `Unknown`. The query returns one row per cluster, and an empty result
// (no cluster reporting at all) is a Search outage, which must not look
// like a fleet-wide operator problem.
const canaryGroupVersionKind: K8sGroupVersionKind = {
  group: '',
  kind: 'Namespace',
  version: 'v1'
};

type ClusteredResource = K8sResourceCommon & { cluster?: string };

export interface UseOperatorPresenceResult {
  readonly loaded: boolean;
  /** null while loading or when Search data is unavailable. */
  readonly statusByCluster: OperatorStatusByCluster;
}

/**
 * Fleet-wide OSSM operator presence per managed cluster, derived from ACM
 * Search: the operator's Deployment, matched by the label both operator
 * distributions carry (covering OLM, Helm, and source installs). Both
 * queries are exact-match; the roster returns one row per cluster Search
 * sees, and the Deployment query one row per matching operator Deployment
 * (a cluster running both distributions returns two — the result map
 * deduplicates by cluster). A cluster is only reported Missing when the
 * default-namespace roster proves Search sees it; see canaryGroupVersionKind.
 * Pass enabled=false on pages with no managed meshes to skip the queries
 * entirely.
 */
export function useOperatorPresence(enabled = true): UseOperatorPresenceResult {
  // An undefined groupVersionKind makes useFleetSearchPoll skip the query,
  // so pages with no managed meshes do not poll for operator presence.
  const deploymentOptions = enabled
    ? { groupVersionKind: deploymentGroupVersionKind, isList: true, namespaced: false }
    : undefined;
  const canaryOptions = enabled
    ? { groupVersionKind: canaryGroupVersionKind, isList: true, name: 'default', namespaced: false }
    : undefined;

  const [deployments, deploymentsLoaded, deploymentsError] = useFleetSearchPoll<ClusteredResource[]>(
    deploymentOptions,
    [{ property: 'label', values: [operatorDeploymentLabel] }]
  );
  const [canary, canaryLoaded, canaryError] = useFleetSearchPoll<ClusteredResource[]>(canaryOptions);

  const statusByCluster = useMemo<OperatorStatusByCluster>(() => {
    if (!deploymentsLoaded || !canaryLoaded) return null;
    // Roster empty or errored = Search outage; see canaryGroupVersionKind
    // for why the negative verdict needs the roster at all.
    if (deploymentsError || canaryError || (canary ?? []).length === 0) return null;

    const map = new Map<string, OperatorStatus>();
    for (const ns of canary ?? []) {
      if (ns.cluster) map.set(ns.cluster, 'missing');
    }
    for (const deployment of deployments ?? []) {
      if (deployment.cluster) map.set(deployment.cluster, 'installed');
    }
    return map;
  }, [deployments, deploymentsLoaded, deploymentsError, canary, canaryLoaded, canaryError]);

  return { loaded: deploymentsLoaded && canaryLoaded, statusByCluster } as const;
}
