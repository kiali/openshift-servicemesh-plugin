export function isObservabilityDataReady(managedClustersLoaded: boolean, discoveredKialisLoaded: boolean): boolean {
  return managedClustersLoaded && discoveredKialisLoaded;
}
