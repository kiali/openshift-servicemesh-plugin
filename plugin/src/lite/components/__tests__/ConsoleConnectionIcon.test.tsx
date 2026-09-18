import { render, screen } from '@testing-library/react';
import { ConsoleConnectionIcon } from '../ConsoleConnectionIcon';

describe('ConsoleConnectionIcon', () => {
  it('shows a check icon when active', () => {
    render(<ConsoleConnectionIcon active />);
    expect(screen.getByLabelText('Connected to Console')).toBeInTheDocument();
  });

  it('shows dash when inactive', () => {
    render(<ConsoleConnectionIcon active={false} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows dash with tooltip when status is unknown', async () => {
    render(<ConsoleConnectionIcon active={false} statusUnknown />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
