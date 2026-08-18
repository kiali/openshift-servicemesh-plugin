/** Console useK8sWatchResource reports this when the requested GVK is not registered. */
const MISSING_MODEL_MESSAGE = 'Model does not exist';

export function isMissingModelError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (typeof error === 'string') {
    return error.includes(MISSING_MODEL_MESSAGE);
  }
  if (error instanceof Error) {
    return error.message.includes(MISSING_MODEL_MESSAGE);
  }
  return String(error).includes(MISSING_MODEL_MESSAGE);
}

/** True when a Kubernetes API watch/list failed because the API group is not registered. */
export function isMissingKubernetesApiError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const err = error as { code?: number; response?: { status?: number }; statusCode?: number };
  return err.code === 404 || err.statusCode === 404 || err.response?.status === 404;
}

/** True when a GVK watch failed because the API is not registered on the cluster. */
export function isMissingKubernetesResourceError(error: unknown): boolean {
  return isMissingModelError(error) || isMissingKubernetesApiError(error);
}

/** True when the MultiClusterMesh API is unavailable because the OSSM-ACM addon is not installed. */
export function isOssmAcmAddonMissing(loaded: boolean, error: unknown): boolean {
  return loaded && isMissingKubernetesResourceError(error);
}
