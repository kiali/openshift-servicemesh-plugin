/** Resolves the istiod Deployment name from the Istio CR active revision (matches operator naming). */
export function resolveIstiodDeploymentName(activeRevisionName: string | undefined): string {
  const revision = activeRevisionName?.trim();
  if (!revision || revision === 'default') {
    return 'istiod';
  }
  return `istiod-${revision}`;
}
