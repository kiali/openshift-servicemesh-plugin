import { deriveStatus, getStatusRank } from '../statusUtils';
import type { K8sCondition } from '../../types/common';

function makeCondition(type: string, status: 'True' | 'False' | 'Unknown', reason?: string): K8sCondition {
  return { lastTransitionTime: undefined, message: undefined, reason, status, type };
}

describe('deriveStatus', () => {
  it('returns Unknown/grey when conditions are undefined', () => {
    expect(deriveStatus(undefined)).toEqual({ color: 'grey', label: 'Unknown' });
  });

  it('returns Unknown/grey when conditions array is empty', () => {
    expect(deriveStatus([])).toEqual({ color: 'grey', label: 'Unknown' });
  });

  it('returns green when Ready is True with no secondary failures', () => {
    expect(deriveStatus([makeCondition('Ready', 'True')])).toEqual({ color: 'green', label: 'Ready' });
  });

  it('returns Degraded/orange when Ready is True but a secondary condition is False', () => {
    expect(deriveStatus([makeCondition('Ready', 'True'), makeCondition('SomeOther', 'False')])).toEqual({
      color: 'orange',
      label: 'Degraded'
    });
  });

  it('returns Unknown/grey when Ready is Unknown', () => {
    expect(deriveStatus([makeCondition('Ready', 'Unknown')])).toEqual({ color: 'grey', label: 'Unknown' });
  });

  it('returns raw reason when Ready is False with a reason', () => {
    expect(deriveStatus([makeCondition('Ready', 'False', 'ReconcileError')])).toEqual({
      color: 'red',
      label: 'ReconcileError'
    });
  });

  it('falls back to Not <type> when reason is absent', () => {
    expect(deriveStatus([makeCondition('Ready', 'False')])).toEqual({ color: 'red', label: 'Not Ready' });
  });

  it('returns Healthy/green when all conditions are True and Ready is absent', () => {
    expect(deriveStatus([makeCondition('Reconciled', 'True')])).toEqual({ color: 'green', label: 'Healthy' });
  });

  it('returns the condition status for a custom conditionType', () => {
    expect(deriveStatus([makeCondition('Installed', 'True')], 'Installed')).toEqual({
      color: 'green',
      label: 'Installed'
    });
  });

  it('returns orange with degraded condition type when Ready is absent and a condition is not True', () => {
    expect(deriveStatus([makeCondition('Reconciled', 'True'), makeCondition('InUse', 'False', 'NotInUse')])).toEqual({
      color: 'orange',
      label: 'NotInUse'
    });
  });
});

describe('getStatusRank', () => {
  it('returns 0 for green (healthy)', () => {
    expect(getStatusRank([makeCondition('Ready', 'True')])).toBe(0);
  });

  it('returns 1 for grey (unknown)', () => {
    expect(getStatusRank([makeCondition('Ready', 'Unknown')])).toBe(1);
  });

  it('returns 2 for orange (degraded)', () => {
    expect(getStatusRank([makeCondition('Ready', 'True'), makeCondition('Secondary', 'False')])).toBe(2);
  });

  it('returns 3 for red (not ready)', () => {
    expect(getStatusRank([makeCondition('Ready', 'False')])).toBe(3);
  });

  it('returns 1 for undefined conditions', () => {
    expect(getStatusRank(undefined)).toBe(1);
  });
});
