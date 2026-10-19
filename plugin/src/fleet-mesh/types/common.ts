export interface K8sCondition {
  lastTransitionTime?: string;
  message?: string;
  observedGeneration?: number;
  reason?: string;
  status: 'True' | 'False' | 'Unknown';
  type: string;
}
