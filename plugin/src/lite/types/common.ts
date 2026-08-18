export interface K8sCondition {
  lastTransitionTime?: string;
  message?: string;
  reason?: string;
  status?: string;
  type?: string;
}
