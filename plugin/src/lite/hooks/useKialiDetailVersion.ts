import { useEffect, useState } from 'react';
import { k8sGet } from '@openshift-console/dynamic-plugin-sdk';
import type { LiteKialiResource } from '../types/kiali';
import { parseContainerImageVersion } from '../utils/containerImageVersion';
import { fetchKialiApiVersion } from '../utils/fetchKialiApiVersion';
import { kialiDeploymentModel, type KialiDeploymentLike } from '../utils/kialiDeployment';
import { getKialiServiceTarget } from '../utils/kialiServiceTarget';

async function fetchDeploymentImageVersion(name: string, namespace: string): Promise<string | undefined> {
  try {
    const deployment = (await k8sGet({ model: kialiDeploymentModel, name, ns: namespace })) as KialiDeploymentLike;
    const containers = deployment.spec?.template?.spec?.containers ?? [];
    const kialiContainer = containers.find(c => c.name === 'kiali') ?? containers[0];
    return parseContainerImageVersion(kialiContainer?.image);
  } catch {
    return undefined;
  }
}

/** Resolves the running Kiali version: proxied /api when connected, else Deployment image. */
export function useKialiDetailVersion(
  resource: LiteKialiResource | undefined,
  useConsoleProxy: boolean
): { loaded: boolean; version: string | undefined } {
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!resource) {
      setVersion(undefined);
      setLoaded(false);
      return () => {
        cancelled = true;
      };
    }

    setLoaded(false);
    setVersion(undefined);

    (async () => {
      let resolved: string | undefined;
      if (useConsoleProxy) {
        resolved = await fetchKialiApiVersion();
      }
      if (!resolved) {
        const { name, namespace } = getKialiServiceTarget(resource);
        if (name && namespace) {
          resolved = await fetchDeploymentImageVersion(name, namespace);
        }
      }
      if (!cancelled) {
        setVersion(resolved);
        setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resource, useConsoleProxy]);

  return { loaded, version };
}
