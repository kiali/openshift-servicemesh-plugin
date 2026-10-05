export function clusterDetailLink(name: string): string {
  return `/multicloud/infrastructure/clusters/details/${encodeURIComponent(name)}/${encodeURIComponent(name)}/overview`;
}
