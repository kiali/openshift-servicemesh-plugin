import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KialiVersionDisplay } from '../KialiVersionDisplay';
import { truncateMiddle } from '../../utils/truncateMiddle';

describe('KialiVersionDisplay', () => {
  it('shows short versions without truncation', () => {
    render(<KialiVersionDisplay notSpecifiedLabel="Not specified" value="v2.31.0-SNAPSHOT" />);
    expect(screen.getByText('v2.31.0-SNAPSHOT')).toBeInTheDocument();
  });

  it('truncates long digests and shows full value in tooltip', async () => {
    const digest = 'sha256:abc1234567890def1234567890abc1234567890abc1234567890def1234567890';
    render(<KialiVersionDisplay notSpecifiedLabel="Not specified" value={digest} />);
    expect(screen.getByTestId('kiali-version-display')).toHaveTextContent(truncateMiddle(digest));
    await userEvent.hover(screen.getByTestId('kiali-version-display'));
    expect(await screen.findByText(digest)).toBeInTheDocument();
  });
});
