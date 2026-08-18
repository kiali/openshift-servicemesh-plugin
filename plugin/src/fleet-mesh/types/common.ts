export interface K8sCondition {
  lastTransitionTime?: string;
  message?: string;
  reason?: string;
  status: 'True' | 'False' | 'Unknown';
  type: string;
}
