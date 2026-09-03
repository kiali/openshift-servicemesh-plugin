import type { LiteKialiResource } from '../types/kiali';
import type { KialiDeploymentLike } from './kialiDeployment';

// Remote cluster secrets shown on the Kiali detail page are resolved here without reading Secrets
// directly. OpenShift Console blocks Secret API access from dynamic plugins (k8sGet/k8sList return
// 404 even when oc/kubectl can read them), and pod exec is not available to inspect mount contents.
//
// Supported:
// - spec.clustering.clusters[].secret_name on the Kiali CR (explicit configuration).
// - Operator autodetected secrets mounted as required (non-optional) secret volumes on the Kiali
//   Deployment under /kiali-remote-cluster-secrets/<secret-name> (e.g. secrets labeled
//   kiali.io/multiCluster=true that the operator actually wired up).
//
// Not supported:
// - kiali-multi-cluster-secret from the operator's fixed optional mount alone: that volume is always
//   templated with optional: true whether or not the Secret exists, so including it caused false
//   positives (links to Secrets that are not there). It is listed only when named explicitly in the CR.
// - Any secret not reflected in the CR or as a required Deployment volume mount.
const REMOTE_CLUSTER_SECRETS_MOUNT_PREFIX = '/kiali-remote-cluster-secrets/';

/** Reads remote-cluster secret names from required secret volumes on the Kiali Deployment. */
export function extractRemoteClusterSecretNamesFromDeployment(deployment: KialiDeploymentLike): string[] {
  const volumes = deployment.spec?.template?.spec?.volumes ?? [];
  const volumeByName = new Map(volumes.flatMap(volume => (volume.name ? [[volume.name, volume] as const] : [])));
  const containers = deployment.spec?.template?.spec?.containers ?? [];
  const kialiContainer = containers.find(container => container.name === 'kiali') ?? containers[0];
  const names = new Set<string>();

  for (const mount of kialiContainer?.volumeMounts ?? []) {
    const mountPath = mount.mountPath?.trim();
    if (!mountPath?.startsWith(REMOTE_CLUSTER_SECRETS_MOUNT_PREFIX)) {
      continue;
    }

    const volume = mount.name ? volumeByName.get(mount.name) : undefined;
    const secretName = volume?.secret?.secretName?.trim();
    if (!secretName || volume?.secret?.optional === true) {
      continue;
    }

    names.add(secretName);
  }

  return [...names];
}

/** Mirrors operator remote-cluster secret resolution via Deployment mounts and explicit CR entries. */
export function resolveRemoteClusterSecretNames(
  resource: LiteKialiResource,
  deployment: KialiDeploymentLike | undefined
): string[] {
  const names = new Set<string>();

  for (const cluster of resource.spec?.clustering?.clusters ?? []) {
    const secretName = cluster.secret_name?.trim();
    if (secretName) {
      names.add(secretName);
    }
  }

  if (deployment) {
    for (const secretName of extractRemoteClusterSecretNamesFromDeployment(deployment)) {
      names.add(secretName);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}
