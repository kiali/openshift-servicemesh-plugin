// Strips Kubernetes-generated suffixes (ReplicaSet hash, pod hash, DaemonSet pod ID)
// from a pod name to recover the owning workload name.
export const parseWorkloadName = (podName: string): string => {
  const parts = podName.split('-');

  if (parts.length >= 3) {
    // More than 2 segments -> likely Deployment / ReplicaSet
    // e.g. details-v1-77b775f46-c7vjb -> details-v1
    // e.g. istiod-866fd6ccd7-7v8p5 -> istiod
    return parts.slice(0, -2).join('-');
  }

  if (parts.length === 2) {
    // Two segments only -> likely DaemonSet or normal name
    // e.g. ztunnel-f94gp -> ztunnel
    return parts.slice(0, -1).join('-');
  }

  // Single segment or no parsing needed
  return podName;
};
