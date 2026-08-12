import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsoleConnectionStatus } from '../ConsoleConnectionStatus';

describe('ConsoleConnectionStatus', () => {
  it('renders a green Active label when active', () => {
    render(<ConsoleConnectionStatus active />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders a grey Inactive label when inactive', async () => {
    render(<ConsoleConnectionStatus active={false} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    await userEvent.hover(screen.getByText('Inactive'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'not configured as the backend for the Service Mesh Console plugin'
    );
  });

  it('renders Unknown when console integration status cannot be determined', () => {
    render(<ConsoleConnectionStatus active={false} statusUnknown />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
