import type { K8sCondition } from '../types/common';

export type StatusColor = 'green' | 'grey' | 'orange' | 'red';

export function deriveStatus(
  conditions?: K8sCondition[],
  conditionType?: string
): { color: StatusColor; label: string } {
  if (!conditions || conditions.length === 0) {
    return { color: 'grey', label: 'Unknown' };
  }

  const targetType = conditionType ?? 'Ready';
  const target = conditions.find(c => c.type === targetType);
  if (target) {
    if (target.status === 'True') {
      if (targetType === 'Ready') {
        const hasDegradedSecondary = conditions.some(c => c.type !== targetType && c.status === 'False');
        if (hasDegradedSecondary) {
          return { color: 'orange', label: 'Degraded' };
        }
      }
      return { color: 'green', label: targetType };
    }
    if (target.status === 'Unknown') {
      return { color: 'grey', label: 'Unknown' };
    }
    const reason = target.reason ?? `Not ${targetType}`;
    return { color: 'red', label: reason };
  }

  const degraded = conditions.find(c => c.status !== 'True');
  if (degraded) {
    return { color: 'orange', label: degraded.reason ?? degraded.type ?? 'Degraded' };
  }

  return { color: 'green', label: 'Healthy' };
}

export function getStatusRank(conditions?: K8sCondition[], conditionType?: string): number {
  const { color } = deriveStatus(conditions, conditionType);
  if (color === 'green') return 0;
  if (color === 'grey') return 1;
  if (color === 'orange') return 2;
  return 3;
}
