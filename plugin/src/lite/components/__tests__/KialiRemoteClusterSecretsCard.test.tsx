import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KialiRemoteClusterSecretsCard, VISIBLE_REMOTE_CLUSTER_SECRET_ROWS } from '../KialiRemoteClusterSecretsCard';

describe('KialiRemoteClusterSecretsCard', () => {
  it('renders secret names with a count in the title and a namespace secrets list link', () => {
    render(
      <KialiRemoteClusterSecretsCard namespace="istio-system" secretNames={['cluster-a-secret', 'cluster-b-secret']} />
    );
    expect(screen.getByText('Remote Cluster Secrets (2)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all secrets' })).toHaveAttribute(
      'href',
      '/k8s/ns/istio-system/secrets'
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('cluster-a-secret')).toBeInTheDocument();
    expect(screen.getByText('cluster-b-secret')).toBeInTheDocument();
  });

  it('sorts secret names when the Name column header is clicked', async () => {
    const user = userEvent.setup();
    render(
      <KialiRemoteClusterSecretsCard namespace="istio-system" secretNames={['cluster-z-secret', 'cluster-a-secret']} />
    );

    const rows = (): (string | undefined)[] =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map(row => row.textContent?.trim());
    expect(rows()).toEqual(['cluster-a-secret', 'cluster-z-secret']);

    await user.click(screen.getByRole('button', { name: /Name/i }));
    expect(rows()).toEqual(['cluster-z-secret', 'cluster-a-secret']);
  });

  it('wraps the table in a scroll container when the secret count exceeds the visible row limit', () => {
    const secretNames = Array.from({ length: VISIBLE_REMOTE_CLUSTER_SECRET_ROWS + 1 }, (_, index) => `secret-${index}`);
    render(<KialiRemoteClusterSecretsCard namespace="istio-system" secretNames={secretNames} />);

    expect(screen.getByTestId('remote-cluster-secrets-scroll')).toHaveStyle({
      maxHeight: `${VISIBLE_REMOTE_CLUSTER_SECRET_ROWS * 33}px`
    });
    expect(screen.getByText(`Remote Cluster Secrets (${secretNames.length})`)).toBeInTheDocument();
  });

  it('does not use a scroll container when the secret count is within the visible row limit', () => {
    const secretNames = Array.from({ length: VISIBLE_REMOTE_CLUSTER_SECRET_ROWS }, (_, index) => `secret-${index}`);
    render(<KialiRemoteClusterSecretsCard namespace="istio-system" secretNames={secretNames} />);

    expect(screen.queryByTestId('remote-cluster-secrets-scroll')).not.toBeInTheDocument();
  });

  it('renders nothing when there are no secrets', () => {
    const { container } = render(<KialiRemoteClusterSecretsCard namespace="istio-system" secretNames={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
