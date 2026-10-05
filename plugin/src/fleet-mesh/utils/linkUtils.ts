export function clusterDetailLink(name: string): string {
  return `/multicloud/infrastructure/clusters/details/${encodeURIComponent(name)}/${encodeURIComponent(name)}/overview`;
}

export function placementDetailLink(namespace: string, name: string): string {
  return `/multicloud/infrastructure/clusters/placements/details/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/overview`;
}
