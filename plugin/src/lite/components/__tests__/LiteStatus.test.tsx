import { render, screen } from '@testing-library/react';
import { LiteStatus } from '../LiteStatus';
import type { K8sCondition } from '../../types/common';

function makeCondition(type: string, status: 'True' | 'False' | 'Unknown'): K8sCondition {
  return { status, type };
}

describe('LiteStatus', () => {
  it('renders Ready/green when Ready condition is True', () => {
    render(<LiteStatus conditions={[makeCondition('Ready', 'True')]} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders Unknown/grey when conditions are undefined', () => {
    render(<LiteStatus />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders Not Ready/red when Ready condition is False', () => {
    render(<LiteStatus conditions={[makeCondition('Ready', 'False')]} />);
    expect(screen.getByText('Not Ready')).toBeInTheDocument();
  });

  it('renders Degraded/orange when Ready is True but secondary is False', () => {
    render(<LiteStatus conditions={[makeCondition('Ready', 'True'), makeCondition('InUse', 'False')]} />);
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });

  it('renders Unknown/grey when Ready condition is Unknown', () => {
    render(<LiteStatus conditions={[makeCondition('Ready', 'Unknown')]} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders with compact mode when isCompact is true', () => {
    const { container } = render(<LiteStatus conditions={[makeCondition('Ready', 'True')]} isCompact />);
    expect(container.querySelector('.pf-m-compact')).toBeInTheDocument();
  });
});
