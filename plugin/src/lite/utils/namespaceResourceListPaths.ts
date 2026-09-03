/** Console path to the Secret list for a namespace (or all namespaces when unset). */
export function getNamespaceSecretsListPath(namespace: string): string {
  const trimmed = namespace.trim();
  if (!trimmed) {
    return '/k8s/all-namespaces/secrets';
  }
  return `/k8s/ns/${encodeURIComponent(trimmed)}/secrets`;
}
