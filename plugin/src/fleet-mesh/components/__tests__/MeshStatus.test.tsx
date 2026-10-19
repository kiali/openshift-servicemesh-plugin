import { render, screen } from '@testing-library/react';
import { MeshStatus } from '../MeshStatus';
import { getStatusRank } from '../../utils/statusUtils';
import type { K8sCondition } from '../../types/common';

// i18n is mocked in setupTests.ts: t(key) returns the key (pass-through)

const ready: K8sCondition = { type: 'Ready', status: 'True' };
const readyFalse: K8sCondition = { type: 'Ready', status: 'False' };
const readyUnknown: K8sCondition = { type: 'Ready', status: 'Unknown' };
const trustDistributed: K8sCondition = { type: 'TrustDistributed', status: 'True' };
const trustPending: K8sCondition = { type: 'TrustDistributed', status: 'False', reason: 'ReconcileError' };

describe('MeshStatus', () => {
  describe('with no conditions', () => {
    it('shows Unknown when no conditions provided', () => {
      render(<MeshStatus />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('Ready condition', () => {
    it('shows Ready when Ready=True', () => {
      render(<MeshStatus conditions={[ready]} />);
      expect(screen.getByText('Ready')).toBeInTheDocument();
    });

    it('shows Not Ready when Ready=False with no reason', () => {
      render(<MeshStatus conditions={[readyFalse]} />);
      expect(screen.getByText('Not Ready')).toBeInTheDocument();
    });

    it('shows Unknown for Ready=Unknown', () => {
      render(<MeshStatus conditions={[readyUnknown]} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('friendly reason codes', () => {
    const cases: [string, string][] = [
      ['CacertsPending', 'Trust Pending'],
      ['ClustersNotReady', 'Clusters Not Ready'],
      ['MissingProductClaim', 'Missing Product Claim'],
      ['ReconcileError', 'Reconcile Error']
    ];

    test.each(cases)('maps reason %s to "%s"', (reason, label) => {
      const condition: K8sCondition = { type: 'Ready', status: 'False', reason };
      render(<MeshStatus conditions={[condition]} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('passes unknown reason codes through unchanged', () => {
    const condition: K8sCondition = { type: 'Ready', status: 'False', reason: 'SomeUnknownReason' };
    render(<MeshStatus conditions={[condition]} />);
    expect(screen.getByText('SomeUnknownReason')).toBeInTheDocument();
  });

  describe('custom conditionType', () => {
    it('shows Distributed when TrustDistributed=True', () => {
      render(<MeshStatus conditions={[trustDistributed]} conditionType="TrustDistributed" />);
      expect(screen.getByText('Distributed')).toBeInTheDocument();
    });

    it('shows friendly reason for TrustDistributed=False', () => {
      render(<MeshStatus conditions={[trustPending]} conditionType="TrustDistributed" />);
      expect(screen.getByText('Reconcile Error')).toBeInTheDocument();
    });

    it('renders an orange label for the transient CacertsPending reason', () => {
      const condition: K8sCondition = { type: 'TrustDistributed', status: 'False', reason: 'CacertsPending' };
      render(<MeshStatus conditions={[condition]} conditionType="TrustDistributed" />);
      expect(screen.getByText('Trust Pending').closest('.pf-v6-c-label')).toHaveClass('pf-m-orange');
    });
  });

  it('shows Degraded when Ready=True but a secondary condition is False', () => {
    const conditions: K8sCondition[] = [
      { type: 'Ready', status: 'True' },
      { type: 'DependenciesHealthy', status: 'False', reason: 'IstioCNINotFound' }
    ];
    render(<MeshStatus conditions={conditions} />);
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('does not show Degraded when Ready=True and secondary condition is Unknown', () => {
    const conditions: K8sCondition[] = [
      { type: 'Ready', status: 'True' },
      { type: 'Progressing', status: 'Unknown' }
    ];
    render(<MeshStatus conditions={conditions} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('does not show Degraded for non-Ready conditionType even when secondary is False', () => {
    const conditions: K8sCondition[] = [
      { type: 'TrustDistributed', status: 'True' },
      { type: 'Other', status: 'False' }
    ];
    render(<MeshStatus conditions={conditions} conditionType="TrustDistributed" />);
    expect(screen.getByText('Distributed')).toBeInTheDocument();
  });

  it('shows Healthy when all non-target conditions are True', () => {
    const conditions: K8sCondition[] = [{ type: 'SomeOther', status: 'True' }];
    render(<MeshStatus conditions={conditions} conditionType="Ready" />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('falls back to degraded condition reason when target type is absent', () => {
    const conditions: K8sCondition[] = [{ type: 'Degraded', status: 'False', reason: 'NetworkIssue' }];
    render(<MeshStatus conditions={conditions} conditionType="Ready" />);
    expect(screen.getByText('NetworkIssue')).toBeInTheDocument();
  });
});

describe('getStatusRank', () => {
  it('ranks green (True) as 0', () => {
    expect(getStatusRank([ready])).toBe(0);
  });

  it('ranks grey (no conditions) as 1', () => {
    expect(getStatusRank(undefined)).toBe(1);
    expect(getStatusRank([])).toBe(1);
  });

  it('ranks orange (degraded non-target) as 2', () => {
    const conditions: K8sCondition[] = [{ type: 'Other', status: 'False', reason: 'X' }];
    expect(getStatusRank(conditions, 'Ready')).toBe(2);
  });

  it('ranks red (False) as 3', () => {
    expect(getStatusRank([readyFalse])).toBe(3);
  });

  it('uses provided conditionType for ranking', () => {
    expect(getStatusRank([trustDistributed], 'TrustDistributed')).toBe(0);
    expect(getStatusRank([trustPending], 'TrustDistributed')).toBe(3);
  });
});
