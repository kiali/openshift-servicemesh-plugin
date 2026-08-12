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
