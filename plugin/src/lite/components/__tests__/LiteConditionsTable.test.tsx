import { render, screen } from '@testing-library/react';
import { LiteConditionsTable } from '../LiteConditionsTable';
import type { K8sCondition } from '../../types/common';

const fullCondition: K8sCondition = {
  type: 'Ready',
  status: 'True',
  reason: 'AllReady',
  message: 'All components healthy',
  lastTransitionTime: '2026-06-22T12:00:00Z'
};

const minimalCondition: K8sCondition = {
  type: 'Degraded',
  status: 'False'
};

describe('LiteConditionsTable', () => {
  it('renders condition rows with Type, Status, Reason, Message, Last Transition columns', () => {
    render(<LiteConditionsTable conditions={[fullCondition]} />);

    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Last Transition')).toBeInTheDocument();

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('AllReady')).toBeInTheDocument();
    expect(screen.getByText('All components healthy')).toBeInTheDocument();
    expect(screen.getByTestId('timestamp')).toHaveTextContent('2026-06-22T12:00:00Z');
  });

  it('shows dash for missing reason/message', () => {
    render(<LiteConditionsTable conditions={[minimalCondition]} />);

    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Timestamp for lastTransitionTime', () => {
    render(<LiteConditionsTable conditions={[fullCondition]} />);

    expect(screen.getByTestId('timestamp')).toBeInTheDocument();
  });

  it('renders dash instead of Timestamp when lastTransitionTime is absent', () => {
    render(<LiteConditionsTable conditions={[minimalCondition]} />);

    expect(screen.queryByTestId('timestamp')).not.toBeInTheDocument();
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('renders empty tbody for empty conditions array', () => {
    const { container } = render(<LiteConditionsTable conditions={[]} />);

    const tbody = container.querySelector('tbody');
    expect(tbody).toBeInTheDocument();
    expect(tbody!.children).toHaveLength(0);
  });

  it('renders multiple conditions as separate rows', () => {
    render(<LiteConditionsTable conditions={[fullCondition, minimalCondition]} />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Degraded')).toBeInTheDocument();
  });
});
