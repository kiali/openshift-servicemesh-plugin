import type { DiscoveredKiali, DiscoveredOssmc, KialiLink } from '../types/kiali';
import type { ManagedCluster } from '../types/managedCluster';
import { buildSafeHttpsUrlFromHost, isSafeHttpUrl } from 'openshift/utils/safeUrlUtils';

const CONSOLE_URL_CLAIM = 'consoleurl.cluster.open-cluster-management.io';
const DEFAULT_CONTROL_PLANE_NAMESPACE = 'istio-system';
const LOCAL_CLUSTER_LABEL = 'local-cluster';
const OSSMC_OVERVIEW_PATH = '/ossmconsole/overview';

export interface ControlPlaneLinkTarget {
  clusterName: string;
  controlPlaneNamespace?: string;
  istioCrName: string;
}

export function getConsoleUrl(cluster: ManagedCluster | undefined): string | undefined {
  const claims = (cluster?.status as Record<string, unknown>)?.clusterClaims as
    Array<{ name: string; value: string }> | undefined;
  const value = claims?.find(c => c.name === CONSOLE_URL_CLAIM)?.value;
  return value && isSafeHttpUrl(value) ? value : undefined;
}

export function isLocalCluster(cluster: ManagedCluster | undefined): boolean {
  return cluster?.metadata?.labels?.[LOCAL_CLUSTER_LABEL] === 'true';
}

export function controlPlaneLinkKey(clusterName: string, istioCrName: string): string {
  return `${clusterName}/${istioCrName}`;
}

function resolveControlPlaneNamespace(controlPlaneNamespace: string | undefined): string {
  return controlPlaneNamespace ?? DEFAULT_CONTROL_PLANE_NAMESPACE;
}

// Kiali operator always configures TLS termination on Routes, so https:// is safe when the host is validated.
function buildStandaloneUrl(kiali: DiscoveredKiali): string | undefined {
  return buildSafeHttpsUrlFromHost(kiali.routeHost) ?? buildSafeHttpsUrlFromHost(kiali.webFqdn);
}

function buildLiteKialiPath(kialiNamespace: string, kialiName: string): string {
  return `/ossmconsole/kialis/${encodeURIComponent(kialiNamespace)}/${encodeURIComponent(kialiName)}`;
}

export function buildLiteIstioPath(istioCrName: string): string {
  return `/ossmconsole/istios/${encodeURIComponent(istioCrName)}`;
}

export function buildSpokeLiteIstioPath(consoleUrl: string, istioCrName: string): string {
  const base = consoleUrl.replace(/\/$/, '');
  return `${base}${buildLiteIstioPath(istioCrName)}`;
}

function resolveLiteKialiTarget(kiali: DiscoveredKiali | undefined): { name: string; namespace: string } | undefined {
  if (!kiali) {
    return undefined;
  }
  return { namespace: kiali.crNamespace, name: kiali.crName };
}

function hasMatchingKiali(cluster: string, controlPlaneNamespace: string, kialis: DiscoveredKiali[]): boolean {
  return kialis.some(k => k.cluster === cluster && k.deploymentNamespace === controlPlaneNamespace);
}

function hasOssmcOnCluster(cluster: string, ossmcs: DiscoveredOssmc[]): boolean {
  return ossmcs.some(o => o.cluster === cluster);
}

// Hub: Istios and Kialis list page in-console routes avoid KIALI_AVAILABLE when navigating from fleet perspective.
// Spoke: OSSMC overview requires a Kiali backend integrated for this control plane row.
function buildOssmcUrl(
  cluster: string,
  kiali: DiscoveredKiali,
  managedClusterMap: Map<string, ManagedCluster>
): string | undefined {
  const mc = managedClusterMap.get(cluster);
  if (isLocalCluster(mc)) {
    const target = resolveLiteKialiTarget(kiali);
    if (target) {
      return buildLiteKialiPath(target.namespace, target.name);
    }
    return undefined;
  }
  const consoleUrl = getConsoleUrl(mc);
  if (!consoleUrl) {
    return undefined;
  }
  const base = consoleUrl.replace(/\/$/, '');
  return `${base}${OSSMC_OVERVIEW_PATH}`;
}

function resolveSpokeLiteIstioUrl(
  cluster: string,
  istioCrName: string,
  managedClusterMap: Map<string, ManagedCluster>
): string | undefined {
  const consoleUrl = getConsoleUrl(managedClusterMap.get(cluster));
  if (!consoleUrl) {
    return undefined;
  }
  return buildSpokeLiteIstioPath(consoleUrl, istioCrName);
}

/**
 * Finds all Kiali instances that observe the given control plane.
 * Correlation: a Kiali on the same cluster whose deploymentNamespace matches
 * the control plane namespace is considered to be observing that control plane.
 */
export function findKialiLinks(
  cluster: string,
  controlPlaneNamespace: string,
  kialis: DiscoveredKiali[],
  ossmcs: DiscoveredOssmc[],
  managedClusterMap: Map<string, ManagedCluster>
): KialiLink[] {
  const matchingKialis = kialis.filter(k => k.cluster === cluster && k.deploymentNamespace === controlPlaneNamespace);
  if (matchingKialis.length === 0) {
    return [];
  }

  return matchingKialis.map(kiali => {
    const standaloneUrl = buildStandaloneUrl(kiali);
    const hasMatchingOssmc = ossmcs.some(
      o => o.cluster === cluster && o.kialiServiceNamespace === kiali.deploymentNamespace
    );
    const ossmcUrl = hasMatchingOssmc ? buildOssmcUrl(cluster, kiali, managedClusterMap) : undefined;
    return { cluster, controlPlaneNamespace, ossmcUrl, standaloneUrl };
  });
}

/** Resolves the observability link for one control plane row, including hub and spoke Istios and Kialis detail pages. */
export function resolveControlPlaneObservabilityLink(
  target: ControlPlaneLinkTarget,
  kialis: DiscoveredKiali[],
  ossmcs: DiscoveredOssmc[],
  managedClusterMap: Map<string, ManagedCluster>
): KialiLink {
  const controlPlaneNamespace = resolveControlPlaneNamespace(target.controlPlaneNamespace);
  const links = findKialiLinks(target.clusterName, controlPlaneNamespace, kialis, ossmcs, managedClusterMap);
  const primary = links[0];
  if (primary?.standaloneUrl || primary?.ossmcUrl) {
    return primary;
  }
  const mc = managedClusterMap.get(target.clusterName);
  if (isLocalCluster(mc) && !hasMatchingKiali(target.clusterName, controlPlaneNamespace, kialis)) {
    return {
      cluster: target.clusterName,
      controlPlaneNamespace,
      ossmcUrl: buildLiteIstioPath(target.istioCrName)
    };
  }
  if (mc && !isLocalCluster(mc) && hasOssmcOnCluster(target.clusterName, ossmcs)) {
    const ossmcUrl = resolveSpokeLiteIstioUrl(target.clusterName, target.istioCrName, managedClusterMap);
    if (ossmcUrl) {
      return {
        cluster: target.clusterName,
        controlPlaneNamespace,
        ossmcUrl
      };
    }
  }
  return {
    cluster: target.clusterName,
    controlPlaneNamespace
  };
}

export function toControlPlaneLinkTargets(
  controlPlanes: Array<{ clusterName: string; controlPlaneNamespace?: string; metadata: { name: string } }>
): ControlPlaneLinkTarget[] {
  return controlPlanes.map(cp => ({
    clusterName: cp.clusterName,
    controlPlaneNamespace: cp.controlPlaneNamespace,
    istioCrName: cp.metadata.name
  }));
}

/**
 * Used by list pages that need links for many control planes at once.
 */
export function buildKialiLinkMap(
  kialis: DiscoveredKiali[],
  ossmcs: DiscoveredOssmc[],
  managedClusterMap: Map<string, ManagedCluster>,
  controlPlanes: ControlPlaneLinkTarget[]
): Map<string, KialiLink[]> {
  const map = new Map<string, KialiLink[]>();
  for (const cp of controlPlanes) {
    const link = resolveControlPlaneObservabilityLink(cp, kialis, ossmcs, managedClusterMap);
    if (link.standaloneUrl || link.ossmcUrl) {
      map.set(controlPlaneLinkKey(cp.clusterName, cp.istioCrName), [link]);
    }
  }
  return map;
}

export { buildLiteKialiPath };
