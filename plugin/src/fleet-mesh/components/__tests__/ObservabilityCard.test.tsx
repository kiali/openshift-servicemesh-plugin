import { render, screen } from '@testing-library/react';
import ObservabilityCard from '../ObservabilityCard';
import type { KialiLink } from '../../types/kiali';

describe('ObservabilityCard', () => {
  it('always renders the Observability card title', () => {
    render(<ObservabilityCard links={[]} />);
    expect(screen.getByText('Observability')).toBeInTheDocument();
  });

  it('shows a spinner while observability data is loading', () => {
    render(<ObservabilityCard links={[]} loaded={false} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Kiali not available')).not.toBeInTheDocument();
  });

  it('shows unavailable messages when no links are available', () => {
    render(<ObservabilityCard links={[]} />);
    expect(screen.getByText('Kiali not available')).toBeInTheDocument();
    expect(screen.getByText('OSSMC not available')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders horizontal Kiali and OSSMC rows when both URLs exist', () => {
    const links: KialiLink[] = [
      {
        cluster: 'cluster-a',
        controlPlaneNamespace: 'istio-system',
        ossmcUrl: '/ossmconsole/kialis/istio-system/kiali',
        standaloneUrl: 'https://kiali.example.com'
      }
    ];
    render(<ObservabilityCard links={links} />);

    expect(screen.getByText('Kiali:')).toBeInTheDocument();
    expect(screen.getByText('OSSMC:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /kiali\.example\.com/ })).toHaveAttribute(
      'href',
      'https://kiali.example.com'
    );
    expect(screen.getByRole('link', { name: 'Console' })).toHaveAttribute(
      'href',
      '/ossmconsole/kialis/istio-system/kiali'
    );
  });

  it('shows OSSMC not available when only Kiali is available', () => {
    const links: KialiLink[] = [
      {
        cluster: 'cluster-a',
        controlPlaneNamespace: 'istio-system',
        standaloneUrl: 'https://kiali.example.com'
      }
    ];
    render(<ObservabilityCard links={links} />);

    expect(screen.getByRole('link', { name: /kiali\.example\.com/ })).toBeInTheDocument();
    expect(screen.getByText('OSSMC not available')).toBeInTheDocument();
  });

  it('shows Kiali not available when only OSSMC is available', () => {
    const links: KialiLink[] = [
      {
        cluster: 'cluster-a',
        controlPlaneNamespace: 'istio-system',
        ossmcUrl: 'https://console.spoke.example.com/ossmconsole/overview'
      }
    ];
    render(<ObservabilityCard links={links} />);

    expect(screen.getByRole('link', { name: /console\.spoke\.example\.com/ })).toBeInTheDocument();
    expect(screen.getByText('Kiali not available')).toBeInTheDocument();
  });
});
