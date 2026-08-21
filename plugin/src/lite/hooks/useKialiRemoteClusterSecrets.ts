import { useEffect, useState } from 'react';
import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import type { LiteKialiResource } from '../types/kiali';
import { kialiDeploymentModel, type KialiDeploymentLike } from '../utils/kialiDeployment';
import { getKialiServiceTarget } from '../utils/kialiServiceTarget';
import { resolveRemoteClusterSecretNames } from '../utils/resolveRemoteClusterSecrets';

/** Loads remote-cluster Secret names for the Kiali detail page via Deployment volume mounts. */
export function useKialiRemoteClusterSecrets(resource: LiteKialiResource | undefined): string[] {
  const [secretNames, setSecretNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!resource) {
      setSecretNames([]);
      return () => {
        cancelled = true;
      };
    }

    setSecretNames([]);

    (async () => {
      const { name, namespace } = getKialiServiceTarget(resource);
      let deployment: KialiDeploymentLike | undefined;
      if (name && namespace) {
        try {
          deployment = (await k8sGet({ model: kialiDeploymentModel, name, ns: namespace })) as KialiDeploymentLike;
        } catch {
          // Deployment lookup failure — keep explicit CR secret names only.
        }
      }

      if (!cancelled) {
        setSecretNames(resolveRemoteClusterSecretNames(resource, deployment));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resource]);

  return secretNames;
}
